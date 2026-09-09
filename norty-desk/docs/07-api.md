# 07 — Contratos de API

Base: `https://desk.norty.com.br/api/v1`

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
  "type": "https://desk.norty.com.br/erros/sla-nao-encontrado",
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
  "inReplyTo": "<Norty_Desk_Ticket_8f2c..._a1b2@desk.norty.com.br>",
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

### 5.2 WhatsApp (Evolution)

```
POST /v1/channels/whatsapp/inbound/:channelAccountId
X-Evolution-Signature: <HMAC-SHA256 do corpo>
```

Recebe o corpo da Evolution sem transformação (`messages.upsert`,
`messages.update`). Mesmas respostas do e-mail.

```
GET  /v1/channels/whatsapp/accounts
POST /v1/channels/whatsapp/accounts
POST /v1/channels/whatsapp/accounts/:id/testar   → GET instance/connectionState
POST /v1/channels/whatsapp/accounts/:id/qrcode   → pareia a instância
POST /v1/channels/whatsapp/enviar                → envio avulso (uso interno)
```

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

`kind` é `EMAIL_IMAP`, `EMAIL_SMTP`, `EMAIL_WEBHOOK` ou
`WHATSAPP_EVOLUTION`, e decide quais campos `config` aceita.

**O segredo nunca sai.** `password`, `apiKey`, `webhookSecret`, `secret`
e `token` são cifrados em AES-256-GCM antes de gravar, no formato
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
GET|POST|PATCH|DELETE /v1/users
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
GET    /v1/assets/:id
GET    /v1/assets/:id/chamados      → o histórico do equipamento
POST   /v1/assets
PATCH  /v1/assets/:id

GET    /v1/tickets/:id/ativos
POST   /v1/tickets/:id/ativos       { assetId }
DELETE /v1/tickets/:id/ativos/:assetId
```

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

## 19. Saúde

```
GET /v1/health        → { status, uptime }
GET /v1/health/ready  → verifica Postgres, Redis, MinIO e Evolution
```
