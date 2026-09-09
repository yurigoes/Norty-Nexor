# 07 — Contratos de API

Base: `https://api-desk.norty.com.br/v1`
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

### 5.3 Diagnóstico (comum aos dois)

```
GET /v1/channels/inbound?processed=false&limit=50
GET /v1/channels/inbound/:id            → mensagem original íntegra
POST /v1/channels/inbound/:id/reprocessar
GET /v1/channels/outbound?status=FALHOU
POST /v1/channels/outbound/:id/reenviar
```

Esta é a tela que o GLPI não tem: **quando um e-mail não virou chamado,
dá para ver por quê.**

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
GET  /v1/articles?q=...&public=true
GET  /v1/articles/:id
POST /v1/articles
PATCH /v1/articles/:id
GET  /v1/articles/:id/revisoes
POST /v1/tickets/:id/artigos-sugeridos    → busca por similaridade do assunto
```

---

## 9. Painéis

```
GET /v1/dashboards/agente
GET /v1/dashboards/time?teamId=...&periodo=30d
GET /v1/dashboards/organizacao?periodo=30d
GET /v1/reports/sla?de=...&ate=...&formato=json|csv
GET /v1/reports/volume?agrupar=categoria|canal|time|dia
```

O relatório de SLA lê `achievedAt` / `breachedAt` gravados no momento do
fato — nunca recalcula prazo histórico (`docs/05-sla.md`, seção 7).

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
