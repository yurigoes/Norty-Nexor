# 07 — Contratos de API

Base: `https://chamados.norty.com.br/api/v1`

A API não tem host próprio: vive sob `/api` no mesmo domínio do
aplicativo. Ver `docs/11-infra.md`, seção 4.
Tipos: `packages/shared/src/api.ts` (consumidos por web e API).

---

## 1. Convenções

| | |
|---|---|
| Autenticação | `Authorization: Bearer <access token>` (JWT, 15 min) |
| Renovação | cookie `httpOnly` com refresh token, rotacionado a cada uso |
| Integração | `Authorization: Bearer <ApiKey>` nas rotas `/intake` |
| Organização | vem do token; **nunca** do corpo ou da query |
| Paginação | cursor: `?limit=50&cursor=<opaco>` |
| Ordenação | `?sort=-priority,createdAt` (`-` inverte) |
| Erro | RFC 7807 (`application/problem+json`) |
| Corpo desconhecido | 400 — `forbidNonWhitelisted`, campo estranho é erro |
| Idempotência | `Idempotency-Key` nas rotas de criação |

Nada de `session_token`, nada de `searchOption: 12`
(`docs/02-gap-analysis.md`, item 17).

### Formato de erro

```json
{
  "type": "https://chamados.norty.com.br/erros/sla-nao-encontrado",
  "title": "Acordo de nível de serviço não encontrado",
  "status": 404,
  "detail": "O acordo 8f2c... não pertence a esta organização.",
  "instance": "/v1/tickets/1042"
}
```

Em produção, erro inesperado devolve mensagem genérica — stack trace e
texto do Postgres não saem para o cliente.

---

## 2. Autenticação

```
POST   /v1/auth/login              { email, password }  → { accessToken, user, organizations }
POST   /v1/auth/refresh            (cookie)             → { accessToken }
POST   /v1/auth/logout
POST   /v1/auth/organizacao-ativa  { organizationId }   → { accessToken }
GET    /v1/auth/me                                      → { user, membership, permissions }
POST   /v1/auth/trocar-senha       { atual, nova }
```

Login devolve mensagem idêntica para e-mail inexistente e senha errada.
`GET /me` devolve as permissões já resolvidas — o aplicativo não
recalcula a matriz.

---

## 3. Chamados

### Listar

```
GET /v1/tickets
    ?status=NOVO,ATRIBUIDO
    &assignedTeamId=<uuid>
    &assignedUserId=me
    &requesterId=<uuid>
    &categoryId=<uuid>
    &priority=4,5
    &channel=WHATSAPP
    &slaBreached=true
    &slaDueBefore=2026-09-10T12:00:00Z
    &q=impressora
    &sort=-priority,createdAt
    &limit=50&cursor=<opaco>
```

O escopo de leitura do perfil é aplicado **sempre**, por cima do filtro
(`docs/04-rbac.md`, seção 3).

```json
{
  "data": [{
    "id": "8f2c...", "number": 1042,
    "subject": "Impressora do 3º andar não imprime",
    "type": "INCIDENTE", "status": "ATRIBUIDO",
    "urgency": 4, "impact": 3, "priority": 4,
    "originChannel": "WHATSAPP",
    "category": { "id": "...", "name": "Hardware > Impressora" },
    "requester": { "kind": "CONTACT", "id": "...", "name": "Fulano" },
    "assignedTeam": { "id": "...", "name": "Suporte N1" },
    "assignedUser": null,
    "commitments": [
      { "kind": "SLA", "target": "TTR", "dueAt": "2026-09-09T18:00:00Z",
        "achievedAt": null, "breachedAt": null, "remainingSeconds": 7200 }
    ],
    "createdAt": "2026-09-09T09:12:00Z",
    "updatedAt": "2026-09-09T10:30:00Z"
  }],
  "nextCursor": "eyJpZCI6..."
}
```

### Detalhe, timeline, criação

```
GET    /v1/tickets/:id
GET    /v1/tickets/:id/eventos?limit=50&cursor=...
POST   /v1/tickets
PATCH  /v1/tickets/:id
```

`POST /v1/tickets`:

```json
{
  "subject": "Impressora do 3º andar não imprime",
  "description": "Fica piscando luz laranja desde ontem.",
  "type": "INCIDENTE",
  "urgency": 4,
  "impact": 3,
  "categoryId": "...",
  "requester": { "kind": "USER", "id": "..." },
  "observers": [{ "kind": "CONTACT", "id": "..." }],
  "customFields": { "andar": "3", "patrimonio": "NB-0412" }
}
```

`priority` **não é aceito** — é derivado (`CLAUDE.md`, regra 7). Mandá-lo
é 400.

### Ações

```
POST /v1/tickets/:id/responder      { body, visibility, channel? }
POST /v1/tickets/:id/atribuir       { teamId?, userId? }
POST /v1/tickets/:id/classificar    { categoryId?, urgency?, impact?, type? }
POST /v1/tickets/:id/pausar         { pendingReasonId, body? }
POST /v1/tickets/:id/retomar
POST /v1/tickets/:id/resolver       { body, solutionTypeId? }
POST /v1/tickets/:id/fechar
POST /v1/tickets/:id/reabrir        { body }
POST /v1/tickets/:id/vincular       { targetTicketId, type }
POST /v1/tickets/:id/atores         { role, kind, id }
DELETE /v1/tickets/:id/atores/:actorId
POST /v1/tickets/lote               { ids: [], acao: {...} }
```

`responder` sem `channel` responde pelo `originChannel` do chamado.
`visibility: "INTERNA"` nunca sai por canal externo, em nenhuma
circunstância.

### Tarefas e aprovações

```
POST  /v1/tickets/:id/tarefas       { body, assigneeId?, plannedStart?, plannedEnd? }
PATCH /v1/tickets/:id/tarefas/:eventId { done?, spentSeconds? }
POST  /v1/tickets/:id/aprovacoes    { step, quorum, approverIds: [] }
POST  /v1/aprovacoes/:id/decidir    { decision: "APROVADO"|"RECUSADO", comment? }
GET   /v1/aprovacoes?status=AGUARDANDO
```

---

## 4. Anexos

```
POST   /v1/tickets/:id/anexos          multipart/form-data
GET    /v1/tickets/:id/anexos
GET    /v1/anexos/:id                  → 302 para URL assinada (15 min)
DELETE /v1/anexos/:id
```

`POST` aceita `file` e um `eventId` opcional (para anexar a um evento
existente em vez de criar um evento `ANEXO` novo). Devolve:

```json
{ "id": "...", "filename": "erro.png", "contentType": "image/png",
  "sizeBytes": 184320, "checksum": "sha256:...", "eventId": "..." }
```

Limite padrão: 25 MB no web e no e-mail, 16 MB no WhatsApp (limite do
próprio WhatsApp). Configurável por canal.

---

## 5. Canais — **os endpoints de e-mail e WhatsApp**

### 5.1 E-mail

```
POST /v1/channels/email/inbound/:channelAccountId
Content-Type: application/json | message/rfc822
X-Desk-Signature: <HMAC-SHA256 do corpo>
```

Aceita o RFC822 cru ou o formato normalizado:

```json
{
  "messageId": "<CAJ8x...@mail.gmail.com>",
  "inReplyTo": "<Norty_Desk_Ticket_8f2c..._a1b2@chamados.norty.com.br>",
  "references": ["<...>"],
  "from": { "email": "fulano@cliente.com.br", "name": "Fulano" },
  "to": [{ "email": "suporte@norty.com.br" }],
  "cc": [],
  "subject": "Re: [Norty Desk #1042] Impressora do 3º andar",
  "text": "Ainda não resolveu.",
  "html": "<p>Ainda não resolveu.</p>",
  "attachments": [
    { "filename": "foto.jpg", "contentType": "image/jpeg", "content": "<base64>" }
  ],
  "receivedAt": "2026-09-09T10:30:00Z"
}
```

Respostas:

| Código | Quando |
|---|---|
| 202 | aceito e enfileirado |
| 200 | duplicata (`messageId` já visto) — não é erro |
| 401 | assinatura inválida |
| 413 | anexo acima do limite |
| 422 | remetente bloqueado por `IntakeRule` |

```
GET  /v1/channels/email/accounts
POST /v1/channels/email/accounts
POST /v1/channels/email/accounts/:id/testar     → testa IMAP/SMTP
POST /v1/channels/email/accounts/:id/coletar    → força um poll
```

### 5.2 WhatsApp pela Evolution

```
POST /v1/channels/whatsapp/inbound/:channelAccountId
X-Evolution-Signature: <HMAC-SHA256 do corpo>
```

Recebe o corpo da Evolution sem transformação (`messages.upsert`,
`messages.update`). Mesmas respostas do e-mail.

A conta é criada e testada pelas rotas comuns de conta de canal (5.3),
com `kind: WHATSAPP_EVOLUTION` — não há rotas `/channels/whatsapp/*`
para isso.

### 5.2-b WhatsApp pela API oficial da Meta

```
GET  /v1/channels/meta/inbound/:channelAccountId   → o aperto de mão
POST /v1/channels/meta/inbound/:channelAccountId
X-Hub-Signature-256: sha256=<HMAC do corpo cru>
```

Convive com a Evolution de propósito: migrar um número real não acontece
num sábado, e durante a migração as duas contas existem lado a lado.
Quem decide por onde a resposta sai é a **conta ativa da organização**, e
não uma variável de ambiente — a oficial ganha quando as duas existem, e
a Evolution fica para o que ainda não migrou.

**O `GET` é o aperto de mão, e acontece uma vez.** Ao salvar a URL no
painel da Meta, ela chama com um desafio e espera o desafio de volta em
**texto puro**. Devolver JSON — que é o padrão desta API — reprova a
configuração com uma mensagem que não explica nada. O `hub.verify_token`
é comparado em tempo constante, pela mesma razão da assinatura.

**A assinatura é sobre os bytes, não sobre o objeto.** A Meta assina o
corpo exato que mandou; reserializar o JSON já parseado dá outros bytes
— a ordem das chaves e o escape de acento mudam — e aí a assinatura de
**toda** entrega legítima falharia. A aplicação sobe com `rawBody: true`
e a conferência é sobre `request.rawBody`. O canal da Evolution
reserializa e funciona porque quem assina lá somos nós; aqui quem assina
é outra empresa.

**Sem `appSecret` configurado a entrega é recusada.** Esta URL é
pública, e aceitar sem conferir deixaria qualquer um abrir chamado em
nome de qualquer telefone.

**A rota só grava; o processamento é do job.** A Meta reentrega o que
não recebeu 200 em poucos segundos, com o mesmo `wamid` — a unicidade de
`externalId` absorve a reentrega, e processar aqui dentro faria a
entrega demorar e a Meta reentregar a mesma mensagem já em
processamento.

Entrega só com recibo (`statuses`, sem `messages`) não é erro: responde
`DESCARTADO`. Recibo de **falha** marca a linha da fila de saída como
`FALHOU` — um `ENVIADO` que nunca chegou ao aparelho é pior que um
`FALHOU`, porque encerra a investigação no lugar errado.

#### A janela de 24 horas

Decidida **antes** de tentar enviar, e não deixando a Meta recusar:
quatro tentativas com backoff não passariam — o que falta não é rede, é
permissão — e o diagnóstico ficaria com um "131047" que não conta nada a
quem for investigar. Fora da janela, a saída falha com o motivo em
português.

A última entrada da pessoa sai de `InboundMessage`, que já grava o fato;
uma coluna à parte com a mesma verdade seria um segundo lugar para ela
ficar errada.

#### Identificar quem escreveu

Pelo telefone. Uma empresa só, o chamado sai identificado sem perguntar
nada; mais de uma, a pessoa recebe a **lista de toque** com as empresas
e escolhe. A escolha escrita também vale, para quem não recebe lista
interativa. Tocar numa empresa sem vínculo com aquele número é recusado.

Mídia sai por `media_id` — nunca por `link`, que exporia um endereço
nosso ao servidor da Meta. A legenda vai no **primeiro** arquivo e não
em todos: repetida, "Segue o arquivo" aparece embaixo de cada foto.
Áudio gravado no navegador chega como `audio/webm`, que a Meta não
aceita como `audio`, e vai como documento — chega tocável no aparelho,
em vez de não chegar.

### 5.3 Contas de canal

Todas exigem `config:canais`, que só o administrador tem: configurar
canal é mexer em credencial da empresa inteira.

```
GET    /v1/channels/accounts
POST   /v1/channels/accounts            { kind, name, config, defaultTeamId? }
PATCH  /v1/channels/accounts/:id
DELETE /v1/channels/accounts/:id        → desativa; não exclui
POST   /v1/channels/accounts/:id/testar
POST   /v1/channels/accounts/:id/coletar
```

`kind` é `EMAIL_IMAP`, `EMAIL_SMTP`, `EMAIL_WEBHOOK`,
`WHATSAPP_EVOLUTION` ou `WHATSAPP_META`, e decide quais campos `config`
aceita.

**O segredo nunca sai.** `password`, `apiKey`, `webhookSecret`, `secret`,
`token`, `appSecret` e `verifyToken` são cifrados em AES-256-GCM antes
de gravar, no formato
`v1:<iv>:<tag>:<cifrado>` (base64url), com a chave em
`CHANNEL_SECRET_KEY`. Na resposta cada um desses campos vira `true` ou
`false`: a tela aprende **se** existe segredo, nunca **qual** é.

Devolver esse booleano no `PATCH` significa "não mexi nisso", e a API
preserva o valor guardado. Sem essa regra, salvar só o nome do canal
apagaria a senha do IMAP.

`DELETE` desativa em vez de excluir: as mensagens recebidas apontam para
a conta, e o diagnóstico precisa dela para explicar o passado.

`testar` responde `{ ok, detalhe }` — a conexão com a Evolution para
WhatsApp, uma coleta para IMAP, e "nada a testar daqui" para webhook.
Existe porque a alternativa é o operador salvar, ir embora e descobrir
dois dias depois — pelo cliente reclamando — que a senha estava errada.

### 5.4 Diagnóstico (comum aos dois)

```
GET /v1/channels/inbound?processed=false&limit=50
GET /v1/channels/inbound?processed=descartadas
GET /v1/channels/inbound/:id            → mensagem original íntegra
POST /v1/channels/inbound/:id/reprocessar
GET /v1/channels/outbound?status=FALHOU
POST /v1/channels/outbound/:id/reenviar
```

Esta é a tela que o GLPI não tem: **quando um e-mail não virou chamado,
dá para ver por quê.** A mensagem fica gravada com corpo e cabeçalhos,
o motivo do descarte aparece na lista, e `reprocessar` a roda de novo
depois de o operador corrigir a regra que a descartou errado.

`reenviar` passa pela mesma verificação de nota interna do despacho
normal: uma linha de saída que aponte para evento interno falha aqui
também.

---

## 5.5 Aprovação em etapas

```
GET  /v1/aprovacoes/minhas                 → o que espera decisão minha
GET  /v1/tickets/:id/aprovacoes
POST /v1/tickets/:id/aprovacoes            { approverIds, quorum?, step?, comment? }
POST /v1/aprovacoes/:id/decidir            { decision, comment? }
```

Substitui `glpi_ticketvalidations` + `glpi_validationsteps`. Uma linha
por validador por etapa; as etapas correm em sequência.

**O quórum é uma função pura em `packages/shared`** (`estadoDaEtapa`),
lida tanto pela API — que decide o status do chamado — quanto pelo
aplicativo, que desenha a etapa. No GLPI a interface calcula o desfecho
por conta própria, e é por isso que a tela e o relatório às vezes
discordam.

Duas condições encerram uma etapa, e a segunda o GLPI não tem:

1. **Quórum atingido** (`aprovados >= quorum`).
2. **Quórum tornou-se impossível.** Com 3 de 5 exigidos, a terceira
   recusa já garante que os 3 "sim" não virão; esperar as outras duas
   respostas deixaria o chamado parado em aprovação para sempre se essas
   pessoas nunca respondessem.

Uma recusa isolada **não** derruba a etapa enquanto o quórum ainda
couber nas respostas que faltam: "três de cinco" quer dizer isso mesmo.

Resolvida a última etapa, o chamado volta ao status que tinha antes de
entrar em aprovação — lido do `from` da mudança de status na linha do
tempo, não de uma coluna a mais que poderia divergir dela.

**Decidir é pessoal.** Nem supervisor decide no lugar de quem foi
designado: a permissão diz que a rota abre, e a checagem de
`approverId` diz de quem é a vez. Em compensação, ter sido designado
validador é autorização suficiente — um solicitante decide a aprovação
de um chamado que ele não pode ler, que é o caso de quem responde pelo
orçamento.

Os eventos de aprovação são **internos**: o cliente não acompanha a
aprovação interna de quem o atende.

---

## 6. Intake público (API de aplicação)

```
POST /v1/intake/tickets
Authorization: Bearer <ApiKey>
Idempotency-Key: <uuid do chamador>
```

```json
{
  "subject": "Falha no processamento noturno",
  "description": "Lote 2026-09-08 abortou no passo 3.",
  "type": "INCIDENTE",
  "urgency": 5, "impact": 4,
  "categoryPath": "Sistemas > Integração",
  "requester": { "email": "monitoramento@norty.com.br", "name": "Monitoramento" },
  "externalRef": "job-2026-09-08-lote-3"
}
```

```
GET  /v1/intake/tickets/:numberOrExternalRef
POST /v1/intake/tickets/:id/responder
POST /v1/intake/tickets/:id/anexos
```

`externalRef` mais `Idempotency-Key` garantem que um monitoramento em
laço não abra mil chamados do mesmo incidente.

### Escopos da chave

A chave é de **integração, não de administração**: a criação
(`POST /api-keys`) recusa qualquer escopo fora desta lista.

| Escopo | Para quê |
|---|---|
| `chamado:criar` | abrir chamado pela API |
| `chamado:ler:proprios` | consultar o que a própria chave abriu |
| `chamado:responder` | acompanhar o chamado |
| `anexo:enviar` | juntar arquivo |
| `inventario:enviar` | o agente de máquina (seção 20) |

`inventario:enviar` é escopo à parte e não um acréscimo ao de chamado:
a chave do agente vai junto com um executável instalado em dezenas de
máquinas de cliente — é a que mais tem chance de vazar, e quem a pegar
não pode abrir chamado em nome de ninguém.

A chave pode ser **de uma empresa-cliente** (`clientId` na criação). Aí
é ela que diz de quem é o chamado — ou de quem é o parque —, e o corpo
da requisição não tem como dizer outra coisa: quem tem o token diz por
si.

---

## 7. Configuração

```
GET|POST|PATCH|DELETE /v1/categories
GET|POST|PATCH|DELETE /v1/forms
GET|POST|PATCH|DELETE /v1/agreements          (SLA e OLA; DELETE desativa)
POST|DELETE           /v1/agreements/:id/niveis
GET|POST|PATCH        /v1/calendars
POST|DELETE           /v1/calendars/:id/feriados
GET|POST|PATCH|DELETE /v1/pending-reasons
GET|POST|PATCH|DELETE /v1/intake-rules
GET|POST|PATCH|DELETE /v1/teams
GET|POST|PATCH|DELETE /v1/users            (POST aceita `semAcesso`)
GET|POST|PATCH|DELETE /v1/webhooks
GET|POST|DELETE       /v1/api-keys
GET                   /v1/audit-logs?entity=&entityId=&actorId=&limit=
POST                  /v1/tickets/lote
```

### 7.0 Configuração de SLA

A configuração errada é recusada **na hora de salvar**, e não semanas
depois num prazo calculado errado:

- **Fuso desconhecido é 400.** `Intl.DateTimeFormat` com fuso inválido
  lança — e lançaria no cron de SLA, longe da causa.
- **Expediente que termina antes de começar é 400.**
- **Duas faixas sobrepostas no mesmo dia são 400.** Elas não quebram
  nada visivelmente: o prazo sai menor do que o real e ninguém liga o
  defeito à configuração. Duas faixas *separadas* passam — é o horário
  de almoço.
- **Nível de escalonamento sem ação é 400.** Ele não faria nada ao
  disparar.
- **Motivo de pendência com "resolver após N cobranças" e intervalo
  zero é 400.** Cobrar sem nunca resolver é insistir para sempre;
  resolver sem cobrar é encerrar sem avisar.

`PATCH /calendars/:id` **substitui os segmentos inteiros**. Editar
expediente item a item é como se acaba com duas faixas sobrepostas na
terça-feira.

`DELETE /agreements/:id` **desativa**: compromissos gravados apontam para
o acordo e o relatório histórico precisa do nome dele. Excluir apagaria
a explicação de um número que continua no relatório.

`DELETE /pending-reasons/:id` recusa (409) o motivo em uso: chamado
pausado aponta para ele, e excluí-lo deixaria a tela do chamado sem
explicar por que ele está parado.

**O prazo é `durationSeconds` na API e horas na tela.** É como se
contrata SLA ("resolução em 8 horas") e como o cálculo trabalha
(segundos); a conversão mora num arquivo só, porque duas conversões
espalhadas viram duas verdades sobre o mesmo prazo.

Mudar o prazo de um acordo entra na trilha de auditoria — é a alteração
que mais dói num relatório de SLA, e a trilha responde "quem afrouxou
isto" seis meses depois. Os compromissos já gravados não mudam
(`docs/05-sla.md`, seção 7).

### 7.1 Ação em lote

```
POST /v1/tickets/lote
{ "ticketIds": ["..."], "acao": { "tipo": "ATRIBUIR", "teamId": "..." } }
```

`tipo` é `ATRIBUIR`, `CLASSIFICAR` ou `MUDAR_STATUS`. Máximo de 200
chamados por requisição — acima disso a chamada estoura o tempo do
proxy e o agente fica sem saber o que passou.

**Cada item passa pelo caso de uso normal.** Nada de `updateMany`: um
`UPDATE` em massa pularia a matriz de prioridade, a linha do tempo, o
SLA e a saída por canal. O lote é laço, e é mais lento de propósito.

**O resultado vem por item**, com o motivo de cada falha:

```json
{
  "total": 3, "concluidos": 1, "falhas": 2,
  "itens": [
    { "ticketId": "…", "number": 41, "ok": true },
    { "ticketId": "…", "number": 42, "ok": false,
      "motivo": "Chamado fechado. Reabra antes de escrever nele." }
  ]
}
```

"23 de 40 concluídos" sem dizer quais 17 falharam obriga o agente a
conferir os quarenta à mão — e ele não vai conferir. Uma falha não
interrompe as outras 199.

O escopo de leitura do perfil vale aqui como em qualquer listagem: o
lote não é porta lateral para agir sobre chamado que não é seu.

### 7.2 Trilha de auditoria

Registra **o diff**, não a linha inteira: dois campos alterados numa
tabela de trinta é o que alguém lê seis meses depois ao perguntar "quem
afrouxou este SLA?". Guardar o registro completo antes e depois
transforma a trilha num backup que ninguém consulta.

**Campo com segredo nunca entra — nem o valor antigo.** O diff registra
`{ "de": "(oculto)", "para": "(alterado)" }`: quem lê a trilha precisa
saber que a senha do IMAP mudou, não qual ela era.

Registrar nunca lança. Falha de auditoria não pode desfazer a ação já
feita — isso deixaria o sistema pior do que sem trilha nenhuma.

---

### 7.3 Cadastro de uso: a pessoa existe, a credencial não

`POST /users` com `semAcesso: true` cria alguém que **não entra**:
`passwordHash` fica nulo, e nenhuma senha provisória é gerada.

É quem assina o termo de um equipamento, aparece no inventário e é quem
se procura quando o notebook some — e não precisa da central de
chamados. Obrigar essa pessoa a ter senha criaria credencial para quem
não pediu: conta a mais para vazar, e mais uma para alguém tentar
adivinhar. Inventar uma senha provisória seria pior ainda — não há o que
mostrar, e portanto não há o que esquecer num chat.

O login recusa quem não tem hash com **a mesma mensagem** de senha
errada, e pagando o mesmo custo de Argon2: responder rápido só para
essas contas diria a quem medisse quais delas não têm senha, e saber em
quais não insistir é meio caminho.

Antes disto o lugar do "sem senha" era a string vazia. Vazio não é nulo:
passava pelo `NOT NULL`, entrava no `argon2.verify` e falhava **rápido**.

A ação automática de troca de senha (seção 7.4) recusa o cadastro de
uso: sem essa cerca, bastava abrir um chamado em nome da pessoa para o
sistema mandar o link e dar acesso justamente a quem a organização
escolheu não dar — sem ninguém decidir de novo.

---

### 7.4 O que o sistema resolve sozinho

```
GET /v1/automacoes        → config:formularios
```

A ação automática é ligada num campo escondido dentro da edição de **um**
modelo de chamado. Sem esta rota, "o que este sistema faz sem passar por
ninguém?" só se responde abrindo modelo por modelo — e é exatamente a
pergunta que um auditor, um gestor novo ou o próprio dono daqui a seis
meses vai fazer. Automação que ninguém consegue enumerar é automação que
ninguém controla.

**Toda ação aparece, inclusive a que ninguém ligou.** Uma lista que só
mostra o que está ligado não responde "o que dá para automatizar?", que
é metade da pergunta de quem abre a tela.

Só leitura. Ligar e desligar continua na edição do modelo, onde está o
aviso de que o chamado vai se resolver sem passar por ninguém — um
segundo lugar para ligar seria um segundo lugar para esquecer o aviso.

Hoje a única ação é `RESET_DE_SENHA`, e o que ela faz é mandar um
**link**, nunca uma senha. As cercas são o que separa recurso útil de
porta dos fundos, e todas recusam com nota interna em português:

- **Só com identidade provada.** Chamado que chegou por e-mail ou
  WhatsApp não executa: a mensagem prova o endereço, não a pessoa. Vale
  para quem abriu logado ou pelo integrador.
- **Nunca conta de diretório.** A senha é do AD, e trocar aqui daria a
  impressão de ter funcionado sem mudar nada onde a pessoa entra.
- **Nunca cadastro de uso** (seção 7.3).
- **Limite de três por pessoa por hora.** Sem ele, abrir o mesmo chamado
  dez vezes vira dez mensagens no telefone de alguém — incômodo
  dirigido, e feito pelo próprio sistema.
- **O link não entra na linha do tempo.** O evento é público e diz que o
  envio aconteceu; o link vai só para quem pediu, porque a timeline é
  lida por quem atende, e o link troca a senha de quem pediu.

---

## 8. Base de conhecimento

```
GET   /v1/articles?q=...&categoryId=...&arquivados=true&limit=30
GET   /v1/articles/:id
GET   /v1/articles/:id/revisoes
POST  /v1/articles
PATCH /v1/articles/:id
GET   /v1/tickets/:id/artigos-sugeridos   → o que já foi escrito sobre este chamado
```

A sugestão é `GET`, não `POST` como esta seção dizia antes: é leitura,
sem efeito colateral.

### 8.1 Busca em português

A busca usa o índice do banco: uma coluna `busca` gerada sobre o título
(peso A) e o corpo (peso B), com índice GIN. Coluna gerada, e não índice
por expressão como o de `tickets`, porque aqui a fórmula tem peso e duas
origens — repeti-la em cada consulta é como o índice deixa de ser usado
sem ninguém perceber.

`plainto_tsquery` exigiria **todos** os termos, e com o assunto inteiro
de um chamado nunca casaria nada. Em vez disso os lexemas do texto viram
um `OR` e o `ts_rank` ordena: quem casa mais termos sobe. Os lexemas
saem do próprio `to_tsvector` e entram citados, então nenhum texto do
usuário chega cru ao `to_tsquery` — pontuação e aspas não derrubam a
consulta.

**As palavras-chave ficam fora do vetor**, de propósito:
`array_to_string` é `stable` e o Postgres recusa a coluna gerada;
`array_to_tsvector` guardaria o termo cru, sem radical, e "impressora"
deixaria de casar com a chave "impressoras". Etiqueta é busca exata, e
entra na consulta por sobreposição de array — é o que faz `0x0000011b`
encontrar o artigo em que esse código não aparece no texto.

### 8.2 Visibilidade

`isPublic` é o que separa o artigo do portal do artigo de quem atende.
Quem não tem `artigo:ler:interno` só enxerga o publicado — na lista, na
busca e pela URL direta (404, não 403: não confirmamos o que existe).

`artigo:escrever` escreve; **mudar o estado de publicação exige
`artigo:publicar` nos dois sentidos.** Tirar do ar o que a organização
decidiu mostrar ao cliente não é decisão menor do que colocar.

### 8.3 Revisões

A criação já grava a versão 1 — sem ela o histórico começaria na
primeira edição. Depois, **só a mudança de texto gera revisão**: trocar
categoria, etiqueta ou arquivar não é versão nova e encheria o
histórico de linhas idênticas.

---

## 9. Painéis e relatórios

```
GET /v1/dashboards/agente?periodo=7d|30d|90d|12m
GET /v1/dashboards/time?teamId=...&periodo=30d
GET /v1/dashboards/organizacao?periodo=30d
GET /v1/reports/sla?periodo=30d&agrupar=categoria|time|prioridade|acordo&formato=json|csv
GET /v1/reports/volume?periodo=30d&agrupar=categoria|canal|time|dia&formato=json|csv
```

**Todo indicador carrega o filtro que o reproduz.** `Em aberto agora`
volta com `filtro: "?assignedUserId=..."`, e a tela transforma o número
num link para a fila. Um número sem caminho de volta para as linhas que
o formaram é um número que ninguém confere — e o painel do GLPI é
exatamente isso.

**As medianas são medianas, não médias.** Um chamado esquecido por três
semanas desloca a média e some com a realidade dos outros duzentos. O
cálculo é `percentile_cont` no banco: trazer todas as linhas para o
Node funciona com duzentos chamados e para de funcionar com duzentos
mil.

**O dia é o dia local.** `createdAt` é UTC; recortar por `::date` direto
jogaria tudo que aconteceu depois das 21h de Brasília para o dia
seguinte, e o gráfico mentiria toda noite. O fuso padrão é o mesmo de
`Calendar.timezone`.

O relatório de SLA lê `achievedAt` / `breachedAt` gravados no momento do
fato — nunca recalcula prazo histórico (`docs/05-sla.md`, seção 7).
Afrouxar o acordo hoje não melhora o desempenho de ontem, e há teste
que prova isso.

**O que ainda corre não entra no percentual.** Ele aparece na coluna
`emAberto`: contá-lo como cumprido inflaria o número, e como violado o
depreciaria.

O CSV sai com `;` — é o separador que o Excel em pt-BR abre sem
perguntar — e o aplicativo prefixa o BOM, sem o qual "Solução" chega
como "SoluÃ§Ã£o".

---

## 9.1 Ativos

```
GET    /v1/assets?q=...&kind=...&status=...&userId=...
                 &clientId=...&semCliente=true&parentAssetId=...
GET    /v1/assets/:id
GET    /v1/assets/:id/chamados      → o histórico do equipamento
POST   /v1/assets
PATCH  /v1/assets/:id

GET    /v1/tickets/:id/ativos
POST   /v1/tickets/:id/ativos       { assetId }
DELETE /v1/tickets/:id/ativos/:assetId
```

**De quem é o equipamento.** `clientId` diz de qual empresa-cliente ele
é; nulo é **da casa** — o notebook de empréstimo, a impressora do
escritório. A Norty administra parque alheio, e sem esta coluna tudo que
o agente de inventário encontra cai num parque só: "quantas máquinas a
empresa do João tem?" deixa de ter resposta. `semCliente=true` filtra o
que é nosso.

`semCliente` vem por `Transform`, e não por `Type(() => Boolean)`:
`Boolean('false')` é `true`, e seria um filtro devolvendo o contrário do
pedido.

**Periférico é ativo, com pai.** Teclado, mouse e headset têm
`kind = PERIFERICO` e `parentAssetId` apontando para a máquina. São
ativos e não `AssetComponent` porque têm série, termo de compromisso
assinado e caminho de troca próprio; componente é o que está parafusado
dentro e não vai a lugar nenhum sozinho. **Um nível só** — o serviço
recusa pendurar num ativo que já tem pai, e o banco recusa ser pai de si
mesmo por `CHECK`. Apagar a máquina solta o periférico (`SET NULL`) em
vez de levá-lo junto.

**`userId` saiu do corpo de escrita.** Quem está com o equipamento muda
pela entrega (seção 19), e não por um `PATCH`: um `salvar` trocava o
nome e apagava a única resposta que existia para "quem estava com ele
antes?". O campo continua no `AssetView` e no filtro da busca — é
derivado da posse aberta, e só `entregar`/`devolver` escrevem nele
(regra 7 do CLAUDE.md).

**Nada disso pode se contradizer.** Periférico não pendura em máquina de
outro cliente, equipamento de um cliente não vai para o funcionário de
outro, e trocar a empresa é recusado quando há periférico alheio
pendurado ou alguém de outra empresa com ele. A regra é uma só,
`deClientesDiferentes` (`packages/shared`): **da casa combina com todo
mundo**, nos dois sentidos — o notebook de empréstimo vai para o
funcionário do cliente, e o técnico da casa leva a máquina do cliente
para o conserto. Só a combinação "cliente A × cliente B" é recusada; as
outras são atendimento normal, e recusá-las empurraria o gesto para fora
do sistema.

**Os campos do agente de inventário** — `deviceUuid`, `hostname`,
`osName`, `osVersion`, `lastSeenAt`, `agentVersion` — são só leitura por
aqui. Quem os escreve é a seção 20.

**Não é CMDB, e é de propósito.** O inventário do GLPI são 60 tabelas e
um agente de coleta — e é por isso que o campo do chamado fica vazio. A
pergunta que o suporte faz é "qual máquina é essa?", e ela se responde
com nome, patrimônio, série, dono e local. O inventário completo entra
por importação na Fase 6.

Patrimônio e número de série são únicos por organização: dois registros
do mesmo equipamento são a origem de metade da sujeira de inventário. A
API traduz a colisão para uma mensagem que diz **qual campo** repetiu,
não o nome da restrição. Etiqueta em branco vira `NULL` — string vazia
colidiria no índice único.

A busca é `contains`, não busca de texto: o suporte procura por pedaço
de patrimônio ("...4721") e por série incompleta, e nenhum dos dois é
palavra que o `to_tsvector` reconheça.

`GET /assets/:id/chamados` respeita o escopo de leitura do perfil: o
histórico do equipamento não é porta lateral para ler chamado alheio.
**Vincular exige `ativo:ler`**, não `ativo:gerenciar` — quem atende
precisa dizer qual máquina é; mudar o cadastro dela é outra conversa.

### Como se chega na máquina

```
GET   /v1/assets/:id/acesso-remoto
PATCH /v1/assets/:id/acesso-remoto
POST  /v1/assets/:id/acesso-remoto/revelar   → 200, a senha em claro
```

`ativo:acesso-remoto`, e não `ativo:ler`: "que máquina é essa" é
inventário, "como eu entro nela agora" é chave de casa. Tailscale, VPN e
o identificador do programa de acesso saem só para quem tem a permissão,
**nunca em listagem** e nunca para cliente.

A senha é cifrada (AES-256-GCM) e não vem no `GET`: existe rota própria
para revelá-la, que grava na auditoria quem revelou e quando. Em texto
claro, um dump do banco entregaria o acesso remoto do parque inteiro de
uma vez.

---

## 9.2 Pesquisa de satisfação

```
GET  /v1/pesquisa/:token            → público, sem sessão
POST /v1/pesquisa/:token            { score, comment? }
GET  /v1/surveys?respondidas=true
GET  /v1/reports/satisfacao?periodo=30d
```

**A pesquisa sai no fechamento, não na solução.** Entre "resolvido" e
"fechado" o cliente ainda pode reabrir; perguntar antes disso é
perguntar cedo demais.

**Sai pelo canal de origem**: quem abriu por WhatsApp responde no
WhatsApp. Mandar e-mail para quem nunca usou e-mail com a gente é como
a taxa de resposta do GLPI fica no que fica.

**O link abre sem login.** Exigir senha de quem só quer dar uma nota é o
jeito mais eficiente de não receber nota nenhuma. A autorização é o
token: 24 bytes aleatórios, único, com 15 dias de validade. A página
pública devolve só número, assunto e nome da organização — nada de
conversa ou nota interna, porque e-mail encaminhado é coisa que
acontece.

Uma pesquisa por chamado (`@unique` em `ticketId`): fechar, reabrir e
fechar de novo não pede a mesma nota duas vezes. Responder de novo troca
a nota — a pessoa mudou de ideia, e recusar seria discutir com quem se
dispôs a avaliar.

O resumo traz média **e** CSAT (percentual de 4 e 5 menos percentual de
1 e 2). Uma média 3,0 pode ser "todo mundo achou mediano" ou "metade
amou e metade odiou", e são problemas diferentes.

O banco guarda a regra que a aplicação não pode burlar: `CHECK` que
exige nota entre 1 e 5 **e** data de resposta juntas — nota sem data é
nota que ninguém deu.

---

## 10. Webhooks de saída

```
GET    /v1/webhooks
GET    /v1/webhooks/eventos                  → a lista de eventos assináveis
POST   /v1/webhooks                          { name, url, secret, events }
PATCH  /v1/webhooks/:id
DELETE /v1/webhooks/:id                      → desativa; não exclui
GET    /v1/webhooks/:id/entregas?status=FALHOU
POST   /v1/webhooks/:id/testar
POST   /v1/webhooks/entregas/:id/reenviar
```

Eventos assináveis:

```
ticket.criado          ticket.atualizado      ticket.atribuido
ticket.respondido      ticket.resolvido       ticket.fechado
ticket.reaberto        sla.violado            sla.perto-do-vencimento
aprovacao.solicitada   aprovacao.decidida     satisfacao.respondida
```

Nome fora dessa lista é 400 no cadastro. Quem digita `ticket.criada` e
nunca recebe nada abre um chamado de suporte que ninguém consegue
diagnosticar.

### Entrega

```
POST <url>
Content-Type: application/json
X-Desk-Event: ticket.criado
X-Desk-Delivery: <uuid da entrega, estável entre as tentativas>
X-Desk-Timestamp: <epoch em segundos>
X-Desk-Signature: sha256=<HMAC-SHA256 de "<timestamp>.<corpo>">
```

**O timestamp entra dentro do que se assina** — mesmo formato do Stripe
e do GitHub, e pelo mesmo motivo. Assinar só o corpo deixaria a entrega
válida para sempre: quem a interceptasse uma vez poderia reenviá-la
amanhã com a assinatura ainda conferindo. A tolerância recomendada do
lado de quem recebe é de 5 minutos.

`X-Desk-Delivery` é estável entre as tentativas: é por ele que o
assinante descarta a repetição de uma entrega que chegou mas cuja
resposta se perdeu.

### Retentativa

Backoff de 1 min, 5 min, 15 min, 1 h e 6 h — cinco tentativas e para.
Depois de seis horas fora do ar o problema é do assinante, e a entrega
fica no log de onde ele a reenvia quando voltar.

**4xx não é retentado**, exceto 408 e 429: repetir cinco vezes não
conserta um payload que o assinante recusa por contrato. 5xx, timeout e
erro de rede são retentados.

O destino tem de ser `https` e **não pode ser endereço de rede
interna** (laço, 10/8, 172.16/12, 192.168/16, 169.254/16, `.internal`).
Sem essa recusa, quem tivesse `config:webhooks` transformaria a API num
scanner da rede — inclusive do endpoint de metadados da nuvem.

O segredo é cifrado em repouso pelo mesmo AES-256-GCM dos canais e nunca
volta pela API: a listagem devolve `hasSecret`.

Entregas terminadas com mais de `WEBHOOK_RETENCAO_DIAS` (padrão 30) são
podadas de madrugada. As pendentes nunca — entrega que ainda não saiu
não é lixo.

---

## 11. Problema e erro conhecido

```
GET    /v1/problems?q=...&status=...&abertos=true&isKnownError=true
GET    /v1/problems/erros-conhecidos?q=...   → a base, buscável
GET    /v1/problems/:id
GET    /v1/problems/:id/eventos              → a linha do tempo do problema
POST   /v1/problems                          { title, description, ticketIds? }
PATCH  /v1/problems/:id
POST   /v1/problems/:id/notas                { body }

POST   /v1/problems/:id/tickets              { ticketId }
DELETE /v1/problems/:id/tickets/:ticketId

GET    /v1/tickets/:id/erros-conhecidos      → "isso já é conhecido?"
```

**O que o GLPI chama de problema é um chamado com outra tabela**: mesmos
status, mesma tela, e a causa raiz num campo de texto que ninguém
preenche. O que falta lá é justamente o que faz gestão de problema valer
a pena — o **erro conhecido**.

Por isso aqui o status conta a investigação:

```
NOVO → INVESTIGANDO → CAUSA_IDENTIFICADA → CONTORNO_PUBLICADO
                                         → RESOLVIDO → FECHADO
```

`CONTORNO_PUBLICADO` é o estado que o GLPI não tem e que mais vale no dia
a dia: a causa pode continuar de pé por semanas, mas o atendimento já
sabe o que fazer no décimo chamado igual. Transição fora do mapa
(`ALLOWED_PROBLEM_TRANSITIONS`) é 409 — publicar contorno de um problema
que ninguém olhou não é um estado que se queira poder alcançar.
`INVESTIGANDO` é alcançável de qualquer estado, inclusive de `FECHADO`:
a causa que se julgava removida reaparece, e abrir outro registro
perderia os chamados já pendurados.

**`isKnownError` só liga com causa raiz e contorno preenchidos.** A regra
é uma função pura em `packages/shared` (`podeSerErroConhecido`), o
`CHECK problems_erro_conhecido` no banco, e o que desabilita o
interruptor na tela — três lugares, uma definição. A validação lê o
estado **depois** da edição: quem escreve os três campos na mesma
requisição não é recusado pelo estado anterior. Para apagar o contorno de
um erro publicado, desmarque `isKnownError` na mesma edição — e a
mensagem de erro diz isso.

`knownErrorAt` não é reescrito em edição posterior: é por ele que a base
ordena, e um erro documentado em janeiro não deve parecer descoberto
hoje. `resolvedAt` sobrevive ao fechamento — apagá-lo ali faria o tempo
médio de resolução perder justamente os problemas que chegaram ao fim.

**Prioridade é derivada**, pela mesma matriz da organização que o chamado
usa (`common/prioridade.ts`): um problema de urgência 5 e impacto 5 sai
com a prioridade do chamado equivalente.

**Vincular exige `problema:ler`**, não `problema:gerenciar` — a mesma
decisão do ativo: quem atende diz "este chamado é aquele problema";
escrever a causa raiz é outra conversa. O escopo de leitura do chamado
vale no vínculo: ele não é porta lateral para descobrir número e assunto
de chamado alheio. O `TicketDetail` passa a carregar `problem`, e é dele
que a tela sabe que já vinculou.

`GET /tickets/:id/erros-conhecidos` busca o texto do chamado contra
título e descrição dos problemas publicados, com os lexemas em `OU` e
`ts_rank` — a mesma técnica da base de conhecimento, pelo mesmo motivo:
`plainto_tsquery` exigiria todos os termos e um assunto de chamado
inteiro não casaria nada.

A linha do tempo do problema são registros de `TicketEvent` com
`problemId` no lugar de `ticketId` — colunas nulas distintas com `CHECK`
de exclusividade, nunca `(itemtype, items_id)` em texto
(`docs/03-modelo-de-dados.md`, seção 6). A mudança de status do problema
tem tipo próprio, `MUDANCA_STATUS_PROBLEMA`: alargar `MUDANCA_STATUS`
para aceitar `ProblemStatus` faria toda leitura de status de chamado
conviver com valores que um chamado nunca tem.

Eventos de webhook: `problema.criado` e `problema.erro-conhecido` — o
segundo é o que vale rebroadcast, porque é quando o contorno passa a
existir.

---

## 12. Mudança

```
GET    /v1/changes?q=...&status=...&kind=...&abertas=true&de=...&ate=...
GET    /v1/changes/:id
GET    /v1/changes/:id/eventos
POST   /v1/changes                  { title, description, kind?, risk?, ticketIds? }
PATCH  /v1/changes/:id
POST   /v1/changes/:id/aprovacoes   { approverIds, quorum?, step?, comment? }
POST   /v1/changes/:id/executar     { acao: INICIAR|CONCLUIR|REVERTER, outcome? }
POST   /v1/changes/:id/notas        { body }

POST   /v1/changes/:id/tickets      { ticketId }
DELETE /v1/changes/:id/tickets/:ticketId
```

**O GLPI tem a tabela e a tela; o que ele não tem é a regra.** Lá, uma
mudança sem plano de recuo entra em produção do mesmo jeito que uma com
— e a diferença entre as duas é justamente o que a gestão de mudança
existe para garantir. Três regras sustentam isso aqui:

1. **Sem plano de implementação e de recuo, não sai do rascunho.**
   Cobrado ao sair, não na criação: rascunho existe para o plano ser
   escrito aos poucos. Cancelar continua possível — desistir não exige
   plano. A regra é `podeSairDoRascunho` em `packages/shared`, e é ela
   que acende o selo "pronta para pedir aval" na tela.

2. **Mudança normal não executa sem aval.** A `PADRAO` é pré-aprovada
   por definição — trocar um teclado não vai a comitê. A `EMERGENCIAL`
   executa primeiro e o aval vem depois, registrado: é o registro da
   aprovação atrasada que impede "emergencial" de virar o caminho de
   fuga de todo mundo. Por isso a lista mostra o tipo em coluna fixa —
   uma fila de emergenciais é o sinal de que o processo virou fachada.

3. **Agendada exige janela.** "Agendada para quando?" precisa de
   resposta antes de virar status. `windowEnd > windowStart` é `CHECK`
   no banco (`changes_janela`); a API recusa antes, com uma frase em
   português em vez do nome da restrição.

O ciclo:

```
RASCUNHO → EM_APROVACAO → APROVADA → AGENDADA → EM_EXECUCAO → CONCLUIDA
                       ↘ RECUSADA                           ↘ REVERTIDA
```

`CONCLUIDA → REVERTIDA` existe porque o recuo quase sempre acontece
depois de alguém declarar sucesso: é de madrugada, no dia seguinte,
quando o efeito aparece. Fechar a porta ali obrigaria a abrir outra
mudança para desfazer esta, e o histórico perderia o vínculo. `RECUSADA`
e `CANCELADA` voltam a `RASCUNHO`: refazer o plano e pedir de novo é o
caminho normal, e abrir outro registro perderia a discussão que levou à
recusa.

**Executar é rota própria, e permissão própria** (`mudanca:executar`).
Os três atos carimbam horário e escrevem o desfecho — três efeitos que um
`PATCH` de status genérico não deve poder disparar por descuido. E a
permissão é outra de propósito: quem passa a madrugada aplicando a
mudança é quem sabe dizer se ela deu certo, e obrigar um supervisor a
marcar "concluída" às três da manhã só produz registro atrasado. O aval
continua sendo de outro. Concluir e reverter exigem `outcome` escrito: é
o registro que a próxima mudança parecida vai ler, e o campo em branco é
justamente o que o GLPI aceita.

**A aprovação é a mesma máquina do chamado.** `Approval` ganhou
`changeId` ao lado de `ticketId`, com o mesmo `CHECK` de exclusividade, e
`ApprovalView` passou a carregar `alvo` — uma união discriminada
`CHAMADO | MUDANCA` no lugar do campo `ticket` obrigatório. Foi o que
permitiu `/aprovacoes/minhas` listar as duas coisas juntas: são as duas
que esperam a mesma pessoa, e separá-las em duas telas faria uma delas
ser a que ninguém abre. O quórum, a ordem das etapas e o desfecho vêm das
mesmas funções puras de `packages/shared`.

Onde chamado e mudança diferem: o chamado **volta** para o status de
onde saiu quando a aprovação se resolve; a mudança **é** o objeto em
aprovação, e o desfecho é o próximo estado dela — `APROVADA` ou
`RECUSADA`.

`TicketDetail` carrega `change` além de `problem`: a janela da mudança é
o que responde "quando isso vai ser resolvido?" sem sair da tela do
chamado.

Eventos de webhook: `mudanca.executada` e `mudanca.revertida` — o recuo é
o que a operação quer saber na hora.

---

## 13. Chamado recorrente

```
GET    /v1/recorrencias
GET    /v1/recorrencias/:id
GET    /v1/recorrencias/:id/chamados   → o que a agenda já abriu
POST   /v1/recorrencias
PATCH  /v1/recorrencias/:id
DELETE /v1/recorrencias/:id
```

Substitui `glpi_ticketrecurrents`. Duas diferenças que importam.

**A agenda descreve o calendário, não o intervalo.** O GLPI guarda
periodicidade em **segundos** (mais `MONTH` e `YEAR` como casos
especiais). Segundos não conseguem dizer "toda segunda e quinta" nem
"todo dia 1º": um intervalo de 604800s a partir de uma data derrapa para
outro dia da semana assim que alguém edita a agenda, e ninguém entende
por quê. Aqui o descritor mora em `packages/shared`:

```ts
type Recorrencia =
  | { tipo: 'DIARIA';  hora; minuto }
  | { tipo: 'SEMANAL'; diasDaSemana: number[]; hora; minuto }
  | { tipo: 'MENSAL';  diaDoMes; hora; minuto }
  | { tipo: 'ANUAL';   mes; diaDoMes; hora; minuto }
```

Pequeno de propósito. Cron resolveria tudo e seria impossível de
configurar sem errar — e errar aqui significa abrir chamado de
manutenção no dia errado, todo mês, até alguém reparar. `descreverRecorrencia`
devolve a frase em português que a tela mostra na prévia **e** que vai
na nota interna do chamado: uma definição, dois lugares.

Mês que não tem o dia usa o último — "todo dia 31" quer dizer "no fim do
mês", e pular fevereiro seria pior que antecipar um dia.

**A próxima ocorrência é coluna, não conta de tela.** `nextRunAt` é
gravada ao salvar e recalculada a cada edição; o ciclo procura por ela e
a tela mostra a mesma data que o ciclo vai usar. No GLPI a tela
recalcula por conta própria e às vezes discorda do cron. A tela formata
`nextRunAt` **no fuso da agenda**, não no do navegador: a linha que diz
"toda sexta às 07:00" não pode ter 10:00 na coluna ao lado.

O cálculo (`modules/recorrencias/agenda.ts`) varre dia a dia no fuso da
agenda em vez de somar intervalos, reusando os mesmos `componentesNoFuso`
e `instanteLocal` do calendário de SLA. É o que faz a agenda sobreviver
ao horário de verão sem derrapar.

**A agenda decide *quando*; o chamado nasce como qualquer outro.** Mesma
numeração por organização, mesma matriz de prioridade, mesmos acordos de
SLA da categoria. Canal de origem `SISTEMA` — ninguém escreveu este
chamado, e marcá-lo como `WEB` faria a resposta tentar sair por um canal
que nunca existiu. O requerente é um usuário, não um contato: manutenção
preventiva tem dono dentro de casa.

`createBeforeSeconds` é o `create_before` do GLPI: a manutenção é dia 20,
mas o chamado nasce dia 17 para dar tempo de preparar. A ocorrência
seguinte continua sendo a do calendário — a antecedência antecipa a
abertura, não desloca a agenda.

**Não duplica.** O ciclo avança `nextRunAt` **antes** de abrir o chamado,
com `updateMany` condicionado ao valor que leu. Se outro processo já
avançou, zero linhas são afetadas e a passada desiste. Trocar a ordem
abriria a porta para o contrário: dois chamados e um só avanço.

Apagar a agenda não apaga o histórico: `Ticket.recurringTicketId` é
`SET NULL`.

Permissão: `config:recorrencia`, como as demais telas de configuração.

---

## 14. Formulário dinâmico

```
GET    /v1/forms
GET    /v1/forms/resolver?categoryId=...   → o que vale para a categoria
GET    /v1/forms/:id
POST   /v1/forms
PATCH  /v1/forms/:id
DELETE /v1/forms/:id
```

Substitui as **doze** tabelas `tickettemplate*` do GLPI por um `Json`
validado. Lá, o que cada campo é, se é obrigatório, se está escondido e
qual o valor padrão vive em quatro tabelas de ligação distintas — e
nenhuma delas confere a resposta: o campo obrigatório do template é
cobrado na tela, e quem abre pela API passa por cima.

Aqui o schema é uma coisa só, e as duas regras são funções puras de
`packages/shared`:

- `validarSchema` roda ao salvar o formulário. Chave repetida grava uma
  resposta por cima da outra; seleção sem opções é um obrigatório
  impossível de preencher. Os dois são recusados na hora, não meses
  depois.
- `validarRespostas` roda no aplicativo **e** na API. A tela usa para
  dizer o que falta antes de enviar; a API usa porque é ela quem
  responde por isso. Devolve um erro **por campo** — não "requisição
  inválida".

Chave desconhecida é erro, pela mesma razão que `forbidNonWhitelisted`
recusa campo desconhecido no corpo. O caso em que isso aparece é o campo
que sumiu do formulário depois de respondido, e o silêncio ali
esconderia a resposta para sempre.

**O formulário vem da categoria, resolvido pela API.** `POST /tickets`
não aceita `formId`: aceitá-lo seria deixar alguém responder ao schema
de um formulário e gravar o resultado no chamado de outro. A resolução
sobe a árvore de categorias antes de cair no padrão da organização — é a
herança de template do GLPI, e é o que evita repetir o mesmo formulário
em cada subcategoria de "Hardware". `origem` diz de onde ele veio
(`CATEGORIA`, `CATEGORIA_ACIMA`, `PADRAO`, `NENHUM`), porque sem isso
"por que aparece este formulário aqui?" não tem resposta.

Categoria sem formulário **recusa** `customFields`: guardar resposta que
nada valida e nada lê seria JSON solto no banco.

**Campo `internal` é só de quem atende.** Quem não pode escrever nota
interna não vê o campo na tela e não consegue respondê-lo pela API — a
linha é a mesma que separa o portal do atendimento. O obrigatório
interno não bloqueia o portal: para o solicitante, ele não existe.

`TicketDetail` carrega `form` com o schema, porque `customFields` são
chaves: sem ele a tela mostraria `patrimonio: PAT-4721` em vez de
"Patrimônio", e `["mouse"]` em vez de "Mouse".

**Não há tipo `ARQUIVO`.** Anexo já é uma coisa inteira neste produto —
armazenamento abstraído, checksum, permissão de baixar e de remover. Um
"campo de arquivo" dentro do JSON de respostas seria um segundo caminho
de anexo, pior que o primeiro, e a tela de abertura já tem o de verdade.

Apagar formulário já respondido é 409: levaria junto o significado das
respostas gravadas. A saída é desvinculá-lo da categoria.

Permissão: `config:formularios` para configurar; `chamado:criar` para
resolver — quem abre chamado precisa saber o que responder.

---

## 15. Tarefa e modelos de texto

### 15.1 Tarefas do chamado

```
GET    /v1/tickets/:id/tarefas
POST   /v1/tickets/:id/tarefas            { body, assigneeId?, plannedStart?, spentSeconds? }
PATCH  /v1/tickets/:id/tarefas/:tarefaId  { done?, addSpentSeconds?, body?, assigneeId? }
DELETE /v1/tickets/:id/tarefas/:tarefaId
```

**Uma tarefa é um `TicketEvent` do tipo `TAREFA`**, com os campos
próprios em `payload` — não uma tabela à parte. É a regra 8 do
CLAUDE.md e a correção do maior defeito estrutural do GLPI: lá,
acompanhamento, tarefa e solução vivem em três tabelas, e a tela do
chamado costura as três em ordem cronológica na mão
(`docs/02-gap-analysis.md`, item 4).

Tarefa é sempre **interna**: "conferir o log do servidor" é organização
do atendimento, não conversa com quem pediu.

`Ticket.spentSeconds` é a **soma** dos apontamentos, recalculada a cada
mudança. Guardar um contador e incrementá-lo custa nada e diverge na
primeira tarefa apagada — e ninguém descobre, porque o número continua
parecendo plausível.

**Apontar tempo acrescenta** (`addSpentSeconds`), não substitui: quem
trabalhou mais meia hora informa a meia hora, e não o total que teria de
calcular na cabeça — que é onde o número deixa de bater. Teto de 24h por
apontamento: mais que isso é engano de unidade.

Ler as tarefas é `chamado:ler:proprios` — quem abre a tela do chamado vê
o que já foi feito nele. Criar e apagar é `tarefa:criar`; concluir e
apontar, `tarefa:concluir`.

### 15.2 Modelos

```
GET    /v1/modelos?kind=RESPOSTA&categoryId=...&q=...
POST   /v1/modelos
PATCH  /v1/modelos/:id
DELETE /v1/modelos/:id
POST   /v1/modelos/:id/uso                → conta o uso
```

O GLPI tem **três tabelas** quase idênticas —
`glpi_itilfollowuptemplates`, `glpi_solutiontemplates`,
`glpi_tasktemplates` —, cada uma com sua tela e seu CRUD. São a mesma
coisa (um texto pronto) usada em três lugares. Aqui é um modelo com
discriminador: uma tela, uma busca, e o `kind` diz onde ele aparece.

Os marcadores são uma **lista fechada** (`CAMPOS_DO_MODELO`). Um motor
de expressões dentro do texto seria mais uma linguagem para manter, e o
que o atendimento precisa é o nome de quem pediu e o número do chamado.
Marcador inventado é recusado **ao salvar**: errar ali é barato, e uma
resposta que sai com `{{requerente.apelido}}` no meio da frase não é.
Marcador conhecido que o chamado não tem fica visível no texto em vez de
virar vazio — a frase com um buraco é pior que a frase com o marcador.

**O texto é preenchido no aplicativo**, no momento em que o agente
escolhe o modelo: ele ainda vai editar antes de enviar. Preencher no
servidor devolveria o mesmo texto com uma ida a mais e uma chance a mais
de chegar diferente do que ele viu. `preencherModelo` é função pura de
`packages/shared`, e é a mesma que faz a prévia da tela de configuração.

A lista vem **ordenada pelo mais usado** e filtrada pela categoria do
chamado — trazendo também os modelos sem categoria, porque o "bom dia,
já estamos olhando" serve para todo mundo. Sem isso, escolher entre
sessenta modelos custa mais do que escrever a frase.

`isInternal` só existe em modelo de `RESPOSTA` — nota interna é conceito
de resposta, e a regra é `CHECK` no banco além de 400 na API. Escolher um
modelo interno já marca a resposta como nota interna.

Listar é `chamado:responder`: modelo existe para ser usado por quem
atende, e exigir a permissão de configuração para *ler* a lista o
deixaria inalcançável de dentro da tela do chamado. Configurar é
`config:modelos`.

---

## 16. Contrato, orçamento e custo

```
GET    /v1/suppliers
POST   /v1/suppliers

GET    /v1/contracts?vencendoEm=30&kind=...&q=...
GET    /v1/contracts/:id
GET    /v1/contracts/:id/ativos          → o que o contrato cobre
POST   /v1/contracts
PATCH  /v1/contracts/:id
POST   /v1/contracts/:id/ativos          { assetId }
DELETE /v1/contracts/:id/ativos/:assetId

GET    /v1/budgets
POST   /v1/budgets

GET    /v1/tickets/:id/custos
POST   /v1/tickets/:id/custos            { kind, label, hours?, hourlyRate?, amount?, budgetId? }
DELETE /v1/tickets/:id/custos/:custoId
GET    /v1/reports/custo?de=...&ate=...
```

Cobre `glpi_contracts`, `glpi_suppliers`, `glpi_contracts_items`,
`glpi_budgets`, `glpi_contractcosts` e `glpi_ticketcosts`.

**Dinheiro é `Decimal(12,2)`, nunca `Float`** (CLAUDE.md, regra 5), e o
Decimal vira `number` **uma vez só**, no serializador deste módulo.
Deixar o cliente converter espalharia `Number(x)` por dez telas — e a
décima primeira esqueceria.

**O aviso de vencimento é consultável.** No GLPI a antecedência
(`notice`) é coluna e nada a lê: o contrato vence e alguém descobre pela
fatura. Aqui `?vencendoEm=` é a pergunta que a tela faz, e
`precisaAvisar` — função pura de `packages/shared` — decide o selo.
Contrato por prazo indeterminado **não** entra no recorte: ele não
vence, e listá-lo ali seria ruído. Renovação automática não dispensa o
aviso: ali ele é a última chance de **não** renovar, e a tela diz isso.

`custoMensal` normaliza a cobrança para poder somar um contrato anual
com um mensal sem mentir. `UNICO` devolve `null`, não zero: pagamento
único não tem custo mensal, e fingir que tem zero faria a soma da
carteira parecer menor do que é.

**O custo do chamado é a soma das linhas.** `glpi_ticketcosts` tem três
pares de colunas (`cost_time`, `cost_fixed`, `cost_material`) e duas
sempre vêm zeradas; aqui é um discriminador. Não há total gravado no
chamado — um total gravado diverge da primeira linha corrigida.

Linha de `TEMPO` exige horas **e** valor-hora, com `CHECK` no banco:
sem os dois, "2 horas" entraria como custo zero, que é o que o GLPI
aceita. O produto é **gravado**, não recalculado na leitura — é o que
preserva o histórico quando o valor-hora muda no ano seguinte.

Custo negativo é recusado por `CHECK`: estorno é outra conversa, e
aceitá-lo aqui faria o total do chamado poder diminuir sem que nada
explicasse.

O **`Infocom`** do GLPI — valor de compra, fornecedor, nota fiscal,
amortização — virou cinco colunas em `Asset`. Lá é tabela à parte porque
é polimórfica sobre sessenta tipos de item; aqui o ativo é um modelo só,
e cinco colunas custam menos que uma tabela 1-1 que todo `include` teria
de lembrar.

`GET /reports/custo` responde "quanto custou atender", por categoria e
por tipo de lançamento. É o número que faz o resto disto valer a pena — e
o que o GLPI só entrega a quem exportar `glpi_ticketcosts` para uma
planilha.

Permissões: `contrato:ler` / `contrato:gerenciar` para a carteira;
`custo:ler` / `custo:lancar` para o dinheiro do chamado. O agente lança
custo mas não vê o contrato do fornecedor: quem trocou a peça sabe
quanto ela custou, e lançar na hora é a diferença entre ter o número e
reconstruí-lo no fim do mês. O solicitante não vê nem lança.

---

## 17. Catálogo do ativo

```
GET    /v1/locations                → árvore de localizações, com o caminho pronto
POST   /v1/locations                → { name, parentId?, notes?, isActive? }
PATCH  /v1/locations/:id
DELETE /v1/locations/:id

GET    /v1/manufacturers            → { id, name, modelCount, assetCount }
POST   /v1/manufacturers            → { name }
PATCH  /v1/manufacturers/:id        → { name }
DELETE /v1/manufacturers/:id

GET    /v1/asset-models             → { id, name, kind, manufacturer, assetCount }
POST   /v1/asset-models             → { name, kind?, manufacturerId? }
PATCH  /v1/asset-models/:id
DELETE /v1/asset-models/:id
```

Localização, fabricante e modelo eram texto livre dentro do ativo. Texto
livre é a origem da sujeira de inventário: "HP", "hp" e
"Hewlett-Packard" são três fabricantes para quem conta e um só para quem
olha. A migração `20260909230000_catalogo_do_ativo` agrupa o que já
existia por `lower(trim(...))`, cria uma linha por grupo e liga os
ativos — sem `initcap`, que transformaria "HP" em "Hp" e "IBM" em "Ibm".

**Toda resposta de escrita devolve a coleção inteira, não o item.** A
tela de configuração é uma lista pequena que se relê a cada mudança; um
`POST` que devolve o objeto obrigaria a um `GET` logo depois, e as
contagens (`assetCount`, `modelCount`) mudam de qualquer jeito.

**O caminho é montado na leitura, não guardado.** `path` sai
`"Matriz > 2º andar > Sala 201"`, e a lista já vem ordenada por ele: a
sublocalização aparece logo abaixo do lugar que a contém sem a tela
montar árvore nenhuma. Renomear o prédio corrige o caminho de todas as
filhas na mesma requisição — se o caminho fosse coluna, seria uma
varredura recursiva que alguém esqueceria de rodar.

**Um `AssetModel` com discriminador, não seis tabelas.** O GLPI tem
`computermodels`, `monitormodels`, `printermodels` e mais três, todas
com as mesmas quatro colunas — e cada tela nova precisa saber em qual
olhar. Aqui `kind` é uma coluna.

**Unicidade entre irmãos é checada na aplicação, sem olhar caixa.** O
`@@unique([organizationId, parentId, name])` do banco não cobre dois
casos que a tela produz sem esforço: `parentId` nulo, porque para o
Postgres dois `NULL` são distintos e duas "Matriz" convivem no nível
mais alto; e a diferença de caixa, que é exatamente o problema que este
catálogo existe para resolver. O `mode: 'insensitive'` do Prisma não
serve: vira `ILIKE`, que dobra a caixa pela *collation* do banco, e na
nossa "RECEPÇÃO" e "Recepção" passavam como nomes diferentes — a dobra é
`toLocaleLowerCase('pt-BR')`, em JavaScript. O índice continua sendo a
rede contra duas requisições simultâneas com o nome idêntico.

**Apagar não apaga ativo.** As três relações são `SET NULL`: some o
local, o equipamento fica sem local. O que é recusado é o que deixaria
órfão — localização com sublocalização, fabricante com modelo. Um
"Master D" sem fabricante não diz de quem é.

Permissões: ler o catálogo é `ativo:ler`, porque quem cadastra o ativo
precisa das opções; mexer nele é `ativo:catalogo`. O agente escolhe a
sala, não inventa uma.

---

## 18. Componentes do ativo

```
GET    /v1/assets/:id                       → o ativo com os componentes juntos
GET    /v1/assets/:id/components
POST   /v1/assets/:id/components            → { kind, name, manufacturerId?, serialNumber?,
                                                attributes?, notes? }
PATCH  /v1/assets/:id/components/:componentId
DELETE /v1/assets/:id/components/:componentId
```

No GLPI cada tipo de peça é **duas** tabelas: `glpi_deviceprocessors`
mais `glpi_items_deviceprocessors`, `glpi_devicememories` mais
`glpi_items_devicememories`, e assim por diante — perto de sessenta ao
todo, com o mesmo desenho repetido. Toda tela nova precisa saber em qual
delas olhar, e "quanta memória a frota tem" é uma união de dezessete
`SELECT`. Aqui é **uma** tabela com um discriminador.

**Uma linha é uma peça — não há campo de quantidade.** Dois pentes de
8 GB são duas linhas, porque cada um tem o seu número de série e o seu
slot, e porque "16 GB" tem de sair de uma soma e não de uma
multiplicação que ninguém revisa. `resumoDoHardware`, em
`packages/shared`, faz essa soma; é a mesma função que escreve a linha
"16 GB de memória · 1 TB de disco · 6 núcleos" na tela de detalhe.

**Os atributos por tipo são ficha, não schema.** `attributes` é `Json`,
e o que vale nele está declarado em `ATRIBUTOS_DO_COMPONENTE`
(`packages/shared`): memória tem capacidade, tecnologia, frequência e
slot; disco tem capacidade, tecnologia, interface e rotação. A validação
é `validarAtributos`, que é `validarRespostas` — **o mesmo validador do
formulário dinâmico**. Um formulário é um formulário, e ter dois
validadores seria ter dois comportamentos para a mesma pergunta. Por
isso o 400 vem com o nome do campo (`"Capacidade" é obrigatório.`) e não
com um `attributes inválido` que não diz nada. A tela desenha a ficha
com o mesmo `CampoDinamico` do formulário do chamado.

A diferença para o formulário dinâmico é que **esta ficha não se edita
pela tela**: um pente DDR4 tem os campos que tem, e deixar o
administrador inventar "capacidade2" produziria inventário que não soma.

**Trocar o `kind` troca a ficha inteira.** Guardar os atributos antigos
"por via das dúvidas" deixaria uma frequência de memória escondida
dentro de um disco. Um `PATCH` que só muda o tipo passa a cobrar o
obrigatório do tipo novo.

**Série de peça é única na organização.** Duas linhas com a mesma série
são a mesma peça contada duas vezes — é assim que a memória da frota
dobra sozinha quando alguém troca um pente de máquina sem apagar a linha
antiga. Apagar o ativo leva os componentes junto (`CASCADE`); apagar o
fabricante não (`SET NULL`).

**O que não copiamos do GLPI:** ele guarda o PIN e o PUK do chip em
coluna de texto, na tabela do SIM. Inventário não é cofre.

Permissões: ler é `ativo:ler`, escrever é `ativo:gerenciar` — as mesmas
do ativo, porque a peça é parte dele.

---

## 19. Posse, termo e troca de equipamento

```
GET    /v1/assets/:id/posses            → por quantas mãos passou
POST   /v1/assets/:id/posse             → entregar a alguém
POST   /v1/assets/:id/devolver          → o equipamento volta
POST   /v1/tickets/:id/troca            → sai um, entra outro
GET    /v1/termos/:termId/pdf           → o papel assinado

GET    /v1/config/termos                → a redação que a casa usa
PUT    /v1/config/termos/:kind          { body }
DELETE /v1/config/termos/:kind          → volta ao texto de fábrica
```

Ler é `ativo:ler`; entregar, devolver e trocar são `ativo:gerenciar`. A
redação dos termos é `config:modelos` — é política da casa, como o
modelo de resposta, e quem mexe nela é quem responde por texto que vai
para fora, não quem cadastra equipamento.

### Por que posse é tabela, e não um campo no ativo

`Asset.userId` respondia "quem está com ele hoje" e esquecia o resto. A
pergunta que aparece quando some um notebook é outra: **quem estava com
ele, desde quando, e assinou o quê** — e um `UPDATE` no campo apagava a
única resposta que existia.

O campo continua, porque a listagem filtra e ordena por ele, mas virou
derivado: quem escreve é `entregar`/`devolver`, na mesma transação que
abre ou fecha a posse, e o `PATCH` do ativo perdeu o `userId`. Uma
porta, e a porta registra.

**A posse aberta é única, e isso mora no banco.** `AssetHolding.isCurrent`
é coluna **gerada** (`true` enquanto `endedAt` é nulo, `NULL` depois), e
`@@unique([assetId, isCurrent])` deixa passar quantas encerradas
quiserem — `NULL` não colide com `NULL` — e recusa a segunda aberta.
Duas entregas simultâneas leem "está livre" antes de qualquer uma
gravar; nenhuma validação na aplicação as separa, e o índice separa.

`returnedTo` guarda para onde o equipamento foi ao voltar — guardar ou
descarte — **na posse**, e não só no ativo: o que está baixado hoje pode
ter voltado ao estoque na época, e o histórico tem de dizer o que era
verdade quando aconteceu.

A chave estrangeira da pessoa é `RESTRICT`: apagar o cadastro não pode
apagar a prova de quem estava com o equipamento. O caminho de saída
continua sendo `isActive: false`.

### O termo

```json
POST /v1/assets/:id/posse
{ "userId": "...", "notes": "...", "signature": "data:image/png;base64,...",
  "signedByName": "Ana Lima" }
```

`AssetTerm` guarda o papel, e guarda o texto **renderizado no instante
da assinatura**, com os marcadores já trocados. Não é um ponteiro para o
modelo: a casa vai ajustar a redação, o jurídico vai pedir outra
cláusula, e um termo que apontasse para o modelo passaria a afirmar que
a pessoa assinou o texto de hoje. Ela não assinou.

São dois tipos — `COMPROMISSO` na entrega, `QUEBRA` na devolução com
dano —, e por isso uma linha por termo em vez de colunas na posse: a
mesma posse produz os dois em momentos diferentes.

Os marcadores são lista fechada (`CAMPOS_DO_TERMO`, em
`packages/shared`) e usam o mesmo motor do modelo de resposta, com
vocabulários separados: um termo não aceita `{{chamado.numero}}`, que
renderizaria vazio no papel assinado. Marcador inventado é recusado ao
salvar o modelo — no papel impresso ele sairia cru, com a pessoa
esperando para assinar.

**Não há marcador para o CPF de quem assina:** `User` não guarda
documento, e um marcador que sempre renderiza vazio é pior que marcador
nenhum — deixa a lacuna no papel e a impressão de que o dado está lá.

**Entrega sem termo vale**, e fica marcada como tal. Recusá-la
empurraria a entrega para fora do sistema: o equipamento sai na mesma, e
aí some do inventário também.

O PDF traz o texto e o traço. O traço sozinho não é o documento — o que
vale é o que estava escrito embaixo dele.

### A quebra

```json
POST /v1/assets/:id/devolver
{ "returnedTo": "BAIXADO", "comQuebra": true,
  "notes": "Caiu da mesa e a tela trincou.", "signature": "..." }
```

`comQuebra` é separado de `returnedTo` de propósito: nem todo descarte é
quebra — equipamento velho também sai do parque —, e nem toda quebra
vira descarte, que é o caso do conserto. A descrição é **obrigatória**
quando há quebra: é ela que entra no papel, e um termo de ocorrência sem
a ocorrência não serve.

### A troca

```json
POST /v1/tickets/:id/troca
{ "saiAssetId": "...", "entraAssetId": "...", "returnedTo": "EM_ESTOQUE",
  "comQuebra": false, "notes": "...", "signature": "..." }
```

A tela poderia devolver um e entregar o outro. O que ela não consegue é
fazer as duas caberem numa transação: se a entrega falhasse depois da
devolução — porque alguém pegou o equipamento de reserva no meio —, a
pessoa ficaria sem nada e o chamado sem o registro do porquê. Aqui as
duas são um `$transaction` só: **ou o equipamento trocou de mão, ou nada
aconteceu**.

A pessoa é a mesma dos dois lados. Trocar para outra não é troca — são
uma devolução e uma entrega, que já existem separadas —, e o serviço
recusa em vez de adivinhar qual leitura era a intenção. O que entra tem
de estar livre (409 se já está com alguém), o que sai tem de estar na
mão de alguém (409 se não está).

**Uma assinatura para os dois papéis**: quem devolve e quem recebe é a
mesma pessoa, no mesmo instante, com o mesmo dedo na tela.

O chamado recebe um evento `TROCA_DE_ATIVO` **público**, com os nomes
gravados na hora — renomear o equipamento meses depois não pode
reescrever o que o chamado disse que aconteceu. Nota interna deixaria o
histórico dizendo que nada houve, num atendimento em que a máquina que
trocou de mão é a coisa mais concreta que existe. Os dois equipamentos
ficam vinculados ao chamado.

Para quem **tem** `ativo:gerenciar` e não enxerga o chamado, a resposta
é **404** e não 403: 403 confirmaria que ele existe. (Sem a permissão da
rota o guard responde 403 antes, e isso não diz nada sobre o chamado.)

---

## 20. Inventário automático

```
POST /v1/intake/inventario        → chave de aplicação, escopo inventario:enviar
```

```json
{ "uuid": "4c4c4544-0039-...", "hostname": "NB-FIN-03",
  "serialNumber": "9SR0123", "manufacturer": "Dell Inc.",
  "model": "Latitude 5420", "kind": "COMPUTADOR",
  "os": { "name": "Microsoft Windows 11 Pro", "version": "10.0.22631" },
  "agente": { "versao": "1.0.0" },
  "processadores": [{ "name": "...", "nucleos": 4, "threads": 8,
                      "frequencia": 2400, "arquitetura": "x86_64" }],
  "memorias": [{ "name": "Kingston", "serialNumber": "E1A2B3C4",
                 "capacidade": 8192, "tecnologia": "DDR4", "slot": "DIMM A" }],
  "discos": [{ "name": "Samsung 980", "serialNumber": "S64...",
               "capacidade": 512, "tecnologia": "NVMe", "interface": "NVMe" }] }
```

Resposta:

```json
{ "assetId": "...", "criado": true, "reconhecidoPor": "NOVO",
  "componentes": { "criados": 3, "atualizados": 0, "removidos": 0 } }
```

**O agente lê e manda; toda decisão é do servidor.** Ele não sabe se a
máquina já existe, não escolhe a empresa, não apaga nada. Código rodando
em duzentas máquinas de cliente não se corrige numa tarde — a regra que
vai mudar tem de ficar do lado que se testa. O agente é `agente/`, em
PowerShell, com o próprio README.

### Como a máquina é reconhecida

Pelo **UUID do SMBIOS** primeiro, pela série depois, e por último é
máquina nova (`reconhecidoPor`: `UUID` | `SERIE` | `NOVO`).

A ordem importa. Montadora de máquina branca preenche o campo de série
obrigatório com "To Be Filled By O.E.M.", e aceitá-lo faria duas
máquinas diferentes virarem uma. A lista desses textos de fábrica é
`serieUtil` (`packages/shared`): nulo é melhor que série errada, porque
a coluna aceita nulo repetido. O UUID sobrevive à troca de disco e à
reinstalação.

A série ainda serve para **adotar** a máquina que já estava cadastrada à
mão: sem isso, a primeira varredura criaria uma segunda linha para o
notebook que o técnico já tinha digitado, com patrimônio, local e dono
na linha errada.

### O que o agente escreve, e o que ele nunca toca

Escreve o que é da máquina: `hostname`, sistema operacional,
`lastSeenAt`, versão do agente, e as peças de três tipos —
`PROCESSADOR`, `MEMORIA`, `DISCO`.

Nunca toca em nome, patrimônio, situação, local, observações, empresa,
quem está com o equipamento, nem em que máquina o periférico pendura. E
**preenche o que está em branco** — série, fabricante, modelo — sem
sobrescrever o que já tem valor: quem apontou o ativo para o fabricante
"HP" do catálogo não pode vê-lo virar "Hewlett-Packard" na varredura da
madrugada, que é a sujeira que o catálogo existe para evitar. O catálogo
é procurado **sem diferenciar caixa** antes de criar, senão o agente
seria quem mais o multiplicaria: uma linha por máquina.

`lastSeenAt` é o que responde "esta máquina ainda existe?". Sem ele o
parque só cresce, e o que sumiu fica idêntico ao que está ligado agora.

### As peças

Peça que sumiu da varredura sai; peça que o agente **não enxerga**
fica — "não li" não é "não existe", e a fonte que alguém cadastrou à mão
continua ali. A peça é reconhecida pela série quando ela presta, e pelo
tipo mais nome mais slot quando não: dois pentes iguais em slots
diferentes são duas peças.

Disco que mudou de máquina **muda de dono** em vez de duplicar: é o que
de fato aconteceu, e é o que responde "para onde foi aquele SSD?".

A ficha é validada pela mesma `validarAtributos` do cadastro à mão.
Guardar valor fora da lista deixaria a peça no banco e a tela sem
conseguir desenhá-la — falha muda, descoberta meses depois por quem abre
o ativo.

### A chave

**Uma por empresa-cliente**, criada em `POST /api-keys` com o escopo
`inventario:enviar` (seção 6). É a chave que diz de quem é o parque — o
corpo não tem como dizer outra coisa, e `forbidNonWhitelisted` recusa um
`clientId` que apareça nele.

Cada chave escreve no parque que ela representa, por **igualdade
exata** — e não pela regra de `deClientesDiferentes` da seção 9.1.
Aquela diz que "da casa combina com todo mundo", e vale para quem segura
equipamento; aqui é uma credencial dizendo onde pode escrever, e o
coringa abriria nos dois sentidos: a chave de um cliente passaria a
escrever no equipamento da casa. Varredura no parque errado responde
**409** e não move a máquina de carteira — o que houve foi agente
instalado com a chave errada.

Escopo próprio porque a chave vai junto com um executável instalado em
dezenas de máquinas de cliente: é a que mais tem chance de vazar, e ela
não abre chamado em nome de ninguém.

**Sem idempotência por referência**, ao contrário do intake de chamados:
varrer de novo **é** a operação, e o servidor reconcilia. Duas
varreduras seguidas dão o mesmo resultado, que é o que a idempotência
queria garantir.

### O que ainda não entra

Rede — portas, MAC, IP. A reconciliação de IP com DHCP tem modos de
falhar próprios (endereço que troca de dono entre varreduras) e merece
passo à parte.

---

## 21. Cofre de senhas

```
GET    /v1/cofre/disponivel                        → cofre:usar
GET    /v1/cofre                                   → os meus e os que me deram
GET    /v1/cofre/todos                             → cofre:administrar
POST   /v1/cofre
PATCH  /v1/cofre/:id
DELETE /v1/cofre/:id
POST   /v1/cofre/:id/revelar                       → a senha, uma vez
GET    /v1/cofre/:id/leituras                      → quem abriu, quando, de onde
GET|POST /v1/cofre/:id/compartilhamentos
DELETE /v1/cofre/:id/compartilhamentos/:grantId
POST   /v1/cofre/:id/assumir                       → cofre:administrar
```

`cofre:usar` abre a porta; quem decide o que cada um vê lá dentro é o
**dono de cada segredo**. Esconder o botão é conveniência — a cerca é a
conferência de acesso no serviço.

**`POST` para revelar, e não `GET`**, pela mesma razão do acesso remoto
do ativo (seção 9.1): revelar é um **ato**, não uma leitura. `GET`
entraria no histórico do navegador, em log de proxy e num `prefetch` que
ninguém pediu — cada um uma cópia da senha fora daqui.

**Cada leitura fica registrada**, com quem, quando e de que IP, e o dono
do segredo a vê. Segredo compartilhado sem registro de leitura é segredo
que ninguém sabe quem levou.

O compartilhamento aceita **prazo** (`expiresAt`), e a listagem mostra
até quando o acesso de cada um vale. Sem prazo a concessão não vence — é
permitido, e é justamente o que vira acesso permanente que ninguém
lembra de revogar, então a tela mostra a data para que a escolha seja
consciente. Revogar tira na hora, independentemente do prazo.

`assumir` existe para o dia em que alguém sai da empresa com o cofre
dele. **Não é leitura** — a senha continua fechada até ser aberta, e aí
a abertura gera o próprio registro. O ato fica na trilha de auditoria.

`GET /cofre/disponivel` existe porque a tela pergunta antes de oferecer:
cofre sem chave configurada não guarda nada, e oferecer o que não
funciona é pior que não oferecer.

---

## 22. Chat ao vivo

```
POST /v1/chat/presenca                  { ticketId }
GET  /v1/chat/:ticketId/presenca        → quem está aqui, quem está digitando
GET  /v1/chat/:ticketId/fluxo           → text/event-stream
```

`chamado:ler:proprios` nas três: quem pode ler o chamado pode conversar
nele. O escopo de leitura decide o resto.

**Server-Sent Events, e não WebSocket.** O aplicativo lê com `fetch` e
um `ReadableStream` — não com `EventSource`, que não carrega cabeçalho
`Authorization` e obrigaria a pôr o token na URL, onde ele cairia em log
de acesso e no histórico do navegador. Com `fetch`, o token vai no
cabeçalho como em toda outra chamada, e o guard de sempre protege a
rota.

**A fonte é uma consulta ao banco a cada volta**, e não um barramento em
memória. A API roda em mais de um processo: uma mensagem gravada pelo
processo A precisa chegar a quem escuta no processo B, e um barramento
em memória não a entregaria. Uma consulta indexada por chamado a cada
dois segundos custa pouco no tamanho deste produto — dezenas de
conversas simultâneas, não milhares. **É aqui que se mexe** se um dia
forem milhares: `LISTEN/NOTIFY` do Postgres, ou o Redis que já está na
infraestrutura.

A conexão vive quinze minutos e o cliente reabre. Proxy e balanceador
cortam conexão parada, e reconectar de propósito é mais previsível que
descobrir o corte de cada intermediário. O cabeçalho
`X-Accel-Buffering: no` vai junto porque o nginx guarda resposta em
buffer por padrão, e fluxo em buffer não é fluxo: nada chega até o
buffer encher.

O fluxo **começa do agora**: o histórico já veio pela lista de eventos
do chamado, e reenviá-lo duplicaria a conversa na tela.

**Presença não tem "sair".** O aplicativo bate ponto a cada
`INTERVALO_DA_BATIDA`; quem fecha a aba para de bater e some sozinho.
`beforeunload` é um evento que o navegador entrega quando quer, e que
não chega quando a aba morre de vez.

---

## 23. Norty Copilot

```
GET  /v1/copilot/disponivel             → chamado:responder
POST /v1/tickets/:id/copilot            { intencao, rascunho? }
GET  /v1/config/copilot                 → config:copilot
PUT  /v1/config/copilot                 { provider, model, apiKey?, isActive? }
```

`intencao` é `REDIGIR` ou `SUGERIR`; `provider` é `GEMINI` ou `GROQ`.

**O Copilot nunca responde sozinho.** A rota devolve **texto**, e nada
além: quem envia é a pessoa, depois de ler e ajustar — e é no envio que
a resposta ganha a marca de IA. Uma IA que publica direto no chamado é
uma IA que erra em nome da casa.

**Com `rascunho`, o `REDIGIR` reescreve o que o técnico já digitou** em
vez de partir do chamado. É o pedido comum de quem sabe a resposta e
quer a forma; sem isso, a ferramenta só serve para quem não sabe o que
dizer, que é a minoria dos casos.

O limite do rascunho é generoso para uma resposta longa e curto o
bastante para que ninguém cole o manual inteiro e mande para fora sem
perceber.

**O Copilot não lê nota interna.** O que vai no contexto é o que o
cliente já poderia ver — mandar o que a equipe escreveu entre si para
fora é vazamento, mesmo que o texto volte só para a tela do técnico.

`GET /copilot/disponivel` existe porque a tela pergunta antes de mostrar
o botão: oferecer o que não responde é pior que não oferecer.

Na configuração, **omitir `apiKey` mantém a que está guardada** — assim
dá para trocar o modelo sem redigitar a chave. String vazia apaga, que é
como se desliga sem perder o resto. A chave é cifrada como as dos
canais, e a resposta diz **se** existe, nunca qual é.

---

## 24. Notificações fora da aba

```
GET    /v1/notificacoes?endpoint=...    → o estado, e qual aparelho é este
POST   /v1/notificacoes/aparelhos       { endpoint, keys }
DELETE /v1/notificacoes/aparelhos/:id?endpoint=...
PUT    /v1/notificacoes/preferencias    { silenciados }
```

**Sem `@RequirePermission`, de propósito:** não existe papel que possa
mexer no aviso de outra pessoa, e não existe papel que não possa mexer
no seu. Quem pode entrar pode escolher onde quer ser avisado.

Push da Web (VAPID), que é o que funciona no navegador e no aparelho sem
loja de aplicativo. O `endpoint` na consulta serve para a tela saber
qual da lista é o aparelho em que ela está rodando — sem isso, a pessoa
com três aparelhos não sabe qual desinscrever.

---

## 25. Software e licenças

```
GET|POST         /v1/software
GET|PATCH|DELETE /v1/software/:id            (DELETE 204)
POST             /v1/software/:id/versions
DELETE           /v1/software/:id/versions/:versionId

GET    /v1/licenses
POST   /v1/software/:id/licenses
PATCH  /v1/licenses/:id
DELETE /v1/licenses/:id
POST   /v1/licenses/:id/assignments          { assetId } ou { userId }, nunca os dois
DELETE /v1/licenses/:id/assignments/:assignmentId

GET    /v1/assets/:id/software
POST   /v1/assets/:id/software               { softwareId, version }
DELETE /v1/assets/:id/software/:installationId
```

Ler é `ativo:ler`, escrever é `ativo:gerenciar` — as mesmas do ativo.

`kind` da licença é `PERPETUA`, `ASSINATURA`, `OEM`, `VOLUME` ou
`GRATUITA`.

**A conformidade é por software, não por versão** — é a leitura que o
GLPI faz na prática. Uma instalação está coberta se o equipamento ocupa
um assento de alguma licença daquele software, **ou** se a pessoa que
usa o equipamento ocupa um assento nominal (o caso do Microsoft 365).
Contar por versão transformaria toda atualização numa falsa falta de
licença.

O assento é ocupado **por equipamento ou por pessoa** — nunca pelos
dois: `assetId` e `userId` são exclusivos, e o DTO recusa quem mandar os
dois ou nenhum.

A chave da licença é cifrada e só aparece para quem gerencia ativos.
Licença vencendo é a que expira dentro de 30 dias.

---

## 26. Consumíveis e cartuchos

```
GET|POST         /v1/consumables
GET|PATCH|DELETE /v1/consumables/:id         (DELETE 204)
POST             /v1/consumables/:id/movements   → consumivel:movimentar
GET              /v1/assets/:id/consumables
```

`kind` é `CONSUMIVEL` ou `TONER`; o movimento é `ENTRADA`, `SAIDA` ou
`AJUSTE`.

**O estoque é a soma das movimentações**, não uma coluna de saldo. O
GLPI guarda uma linha por unidade — cada cartucho, com data de entrada e
de uso; aqui a soma responde as mesmas perguntas ("quanto tem?", "para
quem foi?", "quantos toners essa impressora comeu?") sem mil linhas para
cem caixas de papel.

**Saída não deixa o saldo negativo**, e a conferência corre com a linha
do item travada (`FOR UPDATE`): duas pessoas tirando o último toner ao
mesmo tempo não viram saldo −1. Validar só na aplicação deixaria as duas
passarem juntas.

`minStock` é o aviso de compra: no mínimo ou abaixo, a lista alerta.
Saída aponta para um equipamento **ou** uma pessoa, e é isso que
responde "quantos toners essa impressora comeu?".

`consumivel:movimentar` é permissão à parte de `ativo:gerenciar`, e vem
junto com ela: o agente registra a troca de toner sem poder mexer no
cadastro do parque.

Consumível com movimentação **não se exclui** — desative. Apagar levaria
o histórico junto, e o histórico é o estoque.

---

## 27. Rede

```
GET|POST         /v1/vlans
PATCH|DELETE     /v1/vlans/:id
GET|POST         /v1/ip-networks
GET              /v1/ip-networks/:id         → com os endereços e o próximo livre
PATCH|DELETE     /v1/ip-networks/:id         (DELETE 204)
POST             /v1/ip-addresses
PATCH|DELETE     /v1/ip-addresses/:id        (DELETE 204)

GET    /v1/assets/:id/network                → portas, conexões e IPs
POST   /v1/assets/:id/ports
PATCH  /v1/ports/:id
DELETE /v1/ports/:id
POST   /v1/ports/:id/connection              { outraId }
DELETE /v1/ports/:id/connection
```

Ler é `ativo:ler`, escrever é `ativo:gerenciar`.

**O Postgres faz o trabalho pesado.** O tipo `inet` valida e normaliza o
endereço, o índice único barra IP duplicado — e a mensagem de erro traz
**o dono do endereço**, que é o que resolve o conflito em vez de só
apontá-lo. O operador `<<=` responde "que sub-rede contém este IP?" em
IPv4 e IPv6 sem código nosso.

**O uso da sub-rede é por contenção, não pelo vínculo gravado.** IP
cadastrado antes de a sub-rede existir também conta; contar só o
vinculado mostraria uma faixa vazia que na verdade está cheia.

O cabo é gravado **dos dois lados, numa transação**: porta conectada só
de um lado é o desenho de rede que mente no dia em que alguém segue o
cabo.

---

## 28. Datacenter

```
GET|POST     /v1/dc-rooms
PATCH|DELETE /v1/dc-rooms/:id
GET|POST     /v1/racks
GET          /v1/racks/:id                   → com a ocupação e as faixas livres
PATCH|DELETE /v1/racks/:id                   (DELETE 204)
POST         /v1/racks/:id/items             { assetId, positionU, heightU, face }
PATCH|DELETE /v1/rack-items/:id
GET          /v1/assets/:id/rack             → em que rack e em que U está
```

Ler é `ativo:ler`, escrever é `ativo:gerenciar`.

A posição é em **U**, com face: `FRENTE`, `TRAS` ou `AMBAS`. Duas faces
se chocam se forem a mesma, ou se uma delas ocupa a profundidade
inteira — é o que permite pôr um patch panel na frente e um organizador
atrás no mesmo U, e o que impede empilhar dois servidores no mesmo lugar.

**Sobreposição é conferida com a linha do rack travada** (`FOR UPDATE`),
na mesma transação da gravação: duas pessoas montando o mesmo rack ao
mesmo tempo não põem dois equipamentos no U 12.

PDU e gabinete entram como equipamentos no rack; cabo é a conexão de
portas da seção 27.

---

## 29. Projetos e agenda

```
GET|POST         /v1/projects                → projeto:ler / projeto:gerenciar
GET|PATCH|DELETE /v1/projects/:id            (DELETE 204)
POST             /v1/projects/:id/tasks
PATCH            /v1/projects/:id/tasks/:taskId    → projeto:ler
DELETE           /v1/projects/:id/tasks/:taskId
POST|DELETE      /v1/projects/:id/tickets

GET          /v1/agenda?from=&to=&userIds=&teamId=    → agenda:usar
POST         /v1/agenda/events
PATCH|DELETE /v1/agenda/events/:id                    (DELETE 204)
```

**O percentual do projeto sai das tarefas** — ninguém o digita —,
ponderado pelas horas, e o custo é a soma dos custos dos chamados
vinculados. Os chamados passam pelo **mesmo escopo de leitura da fila**:
o projeto não é porta lateral para ler chamado alheio.

Mexer na própria tarefa é `projeto:ler`, e não `projeto:gerenciar`: quem
executa marca o andamento do que é seu sem poder reorganizar o projeto.

### A agenda junta três fontes, sem copiar nenhuma

Compromissos avulsos, tarefas de chamado com início previsto e tarefas
de projeto com datas. Copiar qualquer uma delas para uma tabela de
agenda criaria a cópia que envelhece: a tarefa remarcada no chamado
continuaria no horário velho aqui.

**Privacidade é a razão de o formato ser este.** Compromisso privado de
outra pessoa aparece só como "Ocupado"; tarefa de chamado alheia não
mostra o assunto a quem não lê todos os chamados. A agenda não é porta
lateral para a fila.

A janela é limitada a 62 dias e 50 pessoas por consulta — dois meses
bastam para qualquer visão, e o teto existe para que uma tela não peça o
ano inteiro da empresa inteira.

---

## 30. Ordem de serviço

```
GET    /v1/tickets/:id/ordens                → ordem:ler
POST   /v1/tickets/:id/ordens                → ordem:gerenciar
PATCH  /v1/ordens/:id
POST   /v1/ordens/:id/itens
PATCH  /v1/ordens/:id/itens/:itemId
DELETE /v1/ordens/:id/itens/:itemId
POST   /v1/ordens/:id/concluir               { signature, signedByName, signedByRole?, report? }
POST   /v1/ordens/:id/cancelar
GET    /v1/ordens/:id/pdf                    → ordem:ler
```

É o documento que o técnico leva, preenche na frente do cliente e assina
ali mesmo. **A regra que governa tudo aqui é uma só: depois de assinada,
não muda.** A assinatura atesta a lista de itens que estava na tela
naquele momento; deixar editá-la depois transformaria o documento numa
declaração de qualquer coisa — e é justamente ele que o cliente guarda
como prova do atendimento.

Concluir exige **ao menos um item marcado como realizado**: ordem
assinada sem nada feito é papel que não atesta nada. Quem não fez nada
cancela, que é outra coisa e fica registrada como tal.

A assinatura é o PNG do traço, limitado a 512 KB — um traço, não uma
foto. O PNG vai para o armazenamento, não para uma coluna em base64: o
traço de um dedo em tela de celular dá dezenas de kilobytes, e uma
listagem de ordens carregaria todos eles.

**O nome e o papel de quem assina são gravados na hora**, e não lidos do
cadastro ao emitir o PDF: o documento tem de dizer o que era verdade
quando foi assinado.

O rodapé do PDF traz o **protocolo do chamado** como código de
verificação — é ele que responde "este documento é mesmo da Norty?",
conferido na consulta pública da seção 31. Não é assinatura
criptográfica, e o documento não finge que é (`docs/13-carteira-e-campo.md`,
seção 6).

---

## 31. Portal público — abertura e protocolo

Sem sessão, todas. Quem usa não tem conta, e mandá-lo para o login seria
o mesmo que não ter a função. A autorização é o próprio código do
protocolo, e o que a sustenta é a **escada de bloqueio por IP** no
serviço.

```
GET  /v1/publico/empresas?q=...
GET  /v1/publico/empresas/:clientId/tipos
GET  /v1/publico/empresas/:clientId/modelos
GET  /v1/publico/empresas/:clientId/pessoa?q=...
POST /v1/publico/chamados
POST /v1/publico/chamados/:protocolo/anexos     (multipart)
GET  /v1/publico/protocolo/:codigo
GET  /v1/publico/protocolo/:codigo/pdf
GET  /v1/publico/definir-senha/:token
POST /v1/publico/definir-senha                  { token, nova }
```

**A empresa se acha por nome aproximado ou documento exato.** O nome
aceita erro de digitação e acento; o documento casa por dígitos, com ou
sem pontuação. Formas societárias ("ltda", "s/a") saem da comparação —
sem isso, digitar "ltda" casaria com a carteira inteira.

**`/pessoa` devolve uma pessoa ou `null`, nunca uma lista**, e só casa
com o e-mail inteiro ou o nome completo. Com prefixo, esta rota seria o
catálogo de funcionários da empresa aberto a quem digitou uma letra.

**O anexo é rota separada** do `POST /chamados`, de propósito: o corpo
do chamado é JSON, e misturar `multipart` ali faria toda abertura pagar
o preço de um formulário de arquivo para anexar nada. Quem anexa já tem
o protocolo — é ele a credencial, como na consulta.

O comprovante em PDF sai com `Cache-Control: no-store`: ele mostra o
andamento **do momento**, e guardado em cache mostraria o de ontem na
próxima consulta.

`GET /definir-senha/:token` existe porque a tela pergunta antes de pedir
a senha nova: digitar duas vezes uma senha e só então descobrir que o
link expirou é a forma mais irritante possível de dar essa notícia.

---

## 32. Marca

```
GET    /v1/brand                    → público
GET    /v1/brand/logo               → público
GET    /v1/brand/favicon            → público
PATCH  /v1/brand                    → organizacao:gerenciar
POST   /v1/brand/logo|favicon       → organizacao:gerenciar (multipart)
DELETE /v1/brand/logo|favicon       → organizacao:gerenciar
```

**As leituras são públicas de propósito:** a tela de entrada precisa da
marca antes de haver token. A rota não devolve nada além da marca.

A imagem sai com `X-Content-Type-Options: nosniff` e cache de um ano
como **imutável** — a URL carrega `?v=`, então trocar a logo muda a URL,
e o cache longo não atrapalha.

A URL é reescrita para o caminho que o navegador alcança (`/api/v1`).
Sem isso, a logo pedida em `/v1/...` cai no fallback da SPA e volta
HTML — imagem quebrada logo depois do upload.

---

## 33. Diretório (LDAP / Active Directory)

```
GET|POST     /v1/auth-sources        → config:autenticacao
PATCH|DELETE /v1/auth-sources/:id    (DELETE 204)
POST         /v1/auth-sources/:id/testar
```

A conta do AD entra pelo login normal (seção 2): o que muda é onde a
senha é conferida. Detalhes do fluxo, do `syncField` e da criação na
primeira entrada estão em `docs/13-autenticacao-ldap.md`.

A senha da conta de serviço é cifrada como as dos canais, e **não sai
por nenhuma rota**: é decifrada num lugar só, e vai direto para o bind.

`testar` existe pela mesma razão do `testar` dos canais: a alternativa é
o operador salvar, ir embora e descobrir dois dias depois — pelo usuário
que não entra — que o `baseDn` estava errado.

---

## 34. Carteira de clientes

```
GET|POST         /v1/clients              → cliente:ler / cliente:gerenciar
GET|PATCH|DELETE /v1/clients/:id          (DELETE 204)
POST             /v1/clients/:id/people
DELETE           /v1/clients/:id/people/:userId
POST             /v1/clients/:id/people/:userId/pin    { pin }
```

A empresa-cliente é quem a Norty atende. `emailDomain` é o que gera o
login das pessoas dela (`ana.lima@empresadojoao.com.br`), e por isso é
único por organização: dois clientes com o mesmo domínio produziriam
logins que colidem entre empresas diferentes.

**A pessoa nasce sem PIN e não entra até alguém definir um.** Quem opera
a carteira define o dela — `passwordHash` nulo até lá, e a listagem
marca `pinPendente` (ver a seção 7.3).

O PIN é de **seis dígitos**, e a API recusa os que não protegem nada:
dígito repetido seis vezes e sequência crescente ou decrescente são as
primeiras coisas que se tenta. O resto da cerca — bloqueio progressivo
por conta e por IP — está em `docs/13-carteira-e-campo.md`.

**Excluir empresa é recusado** enquanto houver pessoa, chamado ou
equipamento nela: desative. A mensagem diz quantos de cada, e as chaves
estrangeiras (`RESTRICT` no equipamento) são a cerca de baixo para quem
apagar por SQL.

A pessoa da empresa-cliente não sai do próprio cliente: o escopo de
leitura recorta por `clientId` **antes** de olhar quem é ator no
chamado. É o que impede o vazamento entre empresas da carteira, e por
isso está no escopo e não numa tela.

---

## 35. Saúde

```
GET /v1/health        → { status, uptime }
GET /v1/health/ready  → verifica Postgres, Redis, MinIO e Evolution
```
