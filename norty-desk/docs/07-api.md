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
GET|POST|PATCH|DELETE /v1/agreements          (SLA e OLA)
GET|POST|PATCH|DELETE /v1/agreements/:id/niveis
GET|POST|PATCH|DELETE /v1/calendars
GET|POST|PATCH|DELETE /v1/calendars/:id/segmentos
GET|POST|PATCH|DELETE /v1/calendars/:id/feriados
GET|POST|PATCH|DELETE /v1/pending-reasons
GET|POST|PATCH|DELETE /v1/intake-rules
GET|POST|PATCH|DELETE /v1/teams
GET|POST|PATCH|DELETE /v1/users
GET|POST|PATCH|DELETE /v1/webhooks
GET|POST|DELETE       /v1/api-keys
GET                   /v1/audit-logs
```

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

Eventos assináveis:

```
ticket.criado          ticket.atualizado      ticket.atribuido
ticket.respondido      ticket.resolvido       ticket.fechado
ticket.reaberto        sla.violado            sla.perto-do-vencimento
aprovacao.solicitada   aprovacao.decidida
```

Entrega:

```
POST <url>
X-Desk-Event: ticket.criado
X-Desk-Delivery: <uuid>
X-Desk-Signature: sha256=<HMAC do corpo com o segredo>
```

Retentativa com backoff (1 min, 5 min, 15 min, 1 h, 6 h). Log
consultável em `GET /v1/webhooks/:id/entregas`.

---

## 11. Saúde

```
GET /v1/health        → { status, uptime }
GET /v1/health/ready  → verifica Postgres, Redis, MinIO e Evolution
```
