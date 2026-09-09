# 03 — Modelo de dados

O schema vive em `apps/api/prisma/schema.prisma` e é a fonte de verdade.
Este documento explica as decisões e rastreia cada entidade até o que ela
substitui no GLPI.

**Estado:** validado com `prisma validate` (Prisma 5.22).

---

## 1. Rastreabilidade GLPI → Desk

| Desk | Substitui no GLPI | Mudança |
|---|---|---|
| `Organization` | `glpi_entities` | plana, sem herança recursiva |
| `User` | `glpi_users` | senha Argon2id, hash nunca serializado |
| `Membership` | `glpi_profiles_users` | sem `is_recursive` |
| `Team` | `glpi_groups` | grupo de atendimento; sem árvore |
| `TeamMember` | `glpi_groups_users` | igual |
| `Contact` | — (novo) | pessoa externa conhecida por telefone/e-mail antes do cadastro |
| `Supplier` | `glpi_suppliers` | recorte mínimo |
| `Category` | `glpi_itilcategories` | mantém a árvore (rasa e útil) |
| `TicketForm` | `glpi_tickettemplates` + 4 tabelas de campo | 5 tabelas → 1 com JSONB |
| `Ticket` | `glpi_tickets` | 44 colunas → 18 |
| `TicketActor` | `glpi_tickets_users` + `glpi_groups_tickets` + `glpi_suppliers_tickets` | 3 tabelas → 1 |
| `TicketEvent` | `glpi_itilfollowups` + `glpi_tickettasks` + `glpi_itilsolutions` + `glpi_documents_items` | 4 tabelas → 1 |
| `TicketLink` | `glpi_tickets_tickets` | enum de tipo nomeado |
| `Attachment` | `glpi_documents` + `glpi_documents_items` + `glpi_documenttypes` + `glpi_documentcategories` | 4 → 1, arquivo no MinIO |
| `Agreement` | `glpi_slas` + `glpi_olas` | 2 → 1 com `kind` |
| `EscalationLevel` | `glpi_slalevels` + `glpi_olalevels` + `*criterias` + `*actions` | 6 → 1 com JSONB |
| `SlaCommitment` | 17 colunas de `glpi_tickets` | colunas → linhas |
| `Calendar` / `CalendarSegment` / `Holiday` | `glpi_calendars` / `glpi_calendarsegments` / `glpi_holidays` | igual |
| `PendingReason` | `glpi_pendingreasons` | igual |
| `Approval` | `glpi_ticketvalidations` + `glpi_validationsteps` | 2 → 1 com `step` e `quorum` |
| `Article` / `ArticleRevision` | `glpi_knowbaseitems` + revisões + categorias + traduções | recorte |
| `ChannelAccount` | `glpi_mailcollectors` | generalizado para WhatsApp |
| `InboundMessage` | — (novo) | idempotência de entrada |
| `OutboundMessage` | `glpi_queuednotifications` | generalizado para WhatsApp |
| `IntakeRule` | `RuleTicket` + `RuleMailCollector` + critérios + ações | 5 → 1 com JSONB |
| `OutboundWebhook` / `WebhookDelivery` | `glpi_webhooks` / `glpi_queuedwebhooks` | assinatura HMAC + log |
| `ApiKey` | `glpi_apiclients` | escopo por permissão nomeada |
| `AuditLog` | `glpi_logs` | só configuração; chamado é auditado pela timeline |

**Não portados:** `Device*`, `Item_Device*`, `Rack`, `PDU`, `Enclosure`,
`Cable`, `NetworkPort*`, `IPAddress`, `Vlan`, `Software*`, `Cartridge*`,
`Consumable*`, `Reservation`, `RuleDictionnary*`, `Impact*`.
Justificativa em `docs/02-gap-analysis.md`, seção F.

---

## 2. As cinco decisões que sustentam o modelo

### 2.1 `TicketEvent` é a timeline

Um chamado tem `description` (o texto de abertura) e uma lista de
eventos. Tudo o mais é evento: mensagem, nota interna, tarefa, solução,
aprovação, anexo, mudança de status, pausa de SLA, entrada e saída de
canal.

Três colunas fazem o trabalho pesado:

- `type` — o discriminador (enum de 13 valores).
- `visibility` — `PUBLICA` aparece no portal e sai pelo canal do
  solicitante; `INTERNA` fica entre agentes. É o `is_private` do GLPI,
  promovido a conceito de primeira classe.
- `channel` — por onde o evento entrou ou saiu.

O que é específico do tipo mora em `payload` (JSONB), tipado como união
discriminada em `packages/shared/src/domain.ts`:

```ts
type EventPayload =
  | { type: 'TAREFA'; assigneeId?: string; spentSeconds: number;
      plannedStart?: string; plannedEnd?: string; done: boolean }
  | { type: 'SOLUCAO'; solutionTypeId?: string; accepted: boolean }
  | { type: 'MUDANCA_STATUS'; from: TicketStatus; to: TicketStatus }
  | { type: 'MUDANCA_ATRIBUICAO'; fromTeamId?: string; toTeamId?: string;
      fromUserId?: string; toUserId?: string }
  | { type: 'APROVACAO'; approvalId: string; decision: ApprovalStatus }
  | { type: 'PAUSA_SLA'; pendingReasonId: string }
  // ...
```

**A troca:** `payload` não é validado pelo Postgres. Em compensação, um
canal novo ou um tipo de evento novo não pede migração de schema. Para
um produto cuja aposta central é multicanal, a flexibilidade vale mais.
A validação acontece na fronteira, com Zod, a partir do mesmo tipo que o
front consome.

### 2.2 `SlaCommitment` transforma colunas em linhas

No GLPI, 17 colunas de `glpi_tickets` guardam estado de SLA e OLA. No
Desk, cada compromisso é uma linha:

```
(ticketId, kind, target) → dueAt, pausedSeconds, achievedAt, breachedAt
```

com `@@unique([ticketId, kind, target])`. Quatro combinações possíveis
hoje (SLA/OLA × TTO/TTR), e um quinto tipo de prazo amanhã é um valor de
enum.

O índice `@@index([dueAt, achievedAt])` é o que faz o cron de
escalonamento ser barato: "compromissos vencendo, ainda não cumpridos".

### 2.3 `TicketActor` com alvo exclusivo

Uma tabela, quatro alvos possíveis (`userId`, `teamId`, `supplierId`,
`contactId`), exatamente um preenchido. A exclusividade é garantida por
`CHECK` na migração:

```sql
ALTER TABLE ticket_actors ADD CONSTRAINT ticket_actors_alvo_unico CHECK (
  (userId IS NOT NULL)::int + (teamId IS NOT NULL)::int +
  (supplierId IS NOT NULL)::int + (contactId IS NOT NULL)::int = 1
);
```

Prisma não expressa `CHECK`; ele entra como SQL adicional na migração.
Está listado em `docs/09-migracao.md`.

### 2.4 `InboundMessage` é a fronteira de idempotência

Nenhuma mensagem externa vira evento direto. Ela primeiro é gravada em
`InboundMessage` com

```
@@unique([organizationId, channel, externalId])
```

Se dois polls IMAP concorrem, ou se a Evolution reentrega um webhook, o
segundo `INSERT` falha e o processamento para ali. Só depois o
processador cria o `TicketEvent` e preenche `eventId`.

**Isto é uma correção do GLPI**, que não tem essa unicidade e duplica
chamado sob concorrência.

### 2.5 Prioridade é derivada e ninguém mais escreve nela

`urgency` e `impact` (1..5) são entrada. `priority` é saída de
`Organization.priorityMatrix` (JSONB 5×5), com média arredondada como
padrão — a mesma fórmula de `CommonITILObject::computePriority()`.

A coluna existe porque índice e ordenação precisam dela. A disciplina
(regra 7 do `CLAUDE.md`) é que só `TicketPriorityService` escreve, e o
DTO de entrada não aceita o campo.

---

## 3. Escopo por organização

Toda tabela de negócio carrega `organizationId`. O `JwtAuthGuard`
resolve `request.organizationId` uma vez, validando o `Membership` do
usuário; nenhum service lê organização do corpo da requisição.

Índices compostos começam por `organizationId`:

```
@@index([organizationId, status])
@@index([organizationId, priority])
@@index([organizationId, createdAt])
```

A fila do agente filtra por organização e status; ordena por prioridade
e data. Os três índices cobrem as consultas quentes.

## 4. Numeração de chamado

`@@unique([organizationId, number])`. `number` é sequencial por
organização, alocado numa transação com `SELECT ... FOR UPDATE` sobre um
contador — não por `MAX(number) + 1`, que corre sob concorrência.

É o número que aparece em `[#123]` no assunto do e-mail e nas mensagens
de WhatsApp, e é por ele que o threading reconhece uma resposta
(`docs/06-canais.md`).

## 5. Tipos

| Coisa | Tipo | Por quê |
|---|---|---|
| Identificador | `uuid` | gerável no cliente, não vaza volume |
| Tempo de SLA, tempo gasto | `Int` (segundos) | soma sem erro de arredondamento |
| Dinheiro (fase futura) | `Decimal(12,2)` | `0.1 + 0.2` não fecha caixa |
| Data e hora | `DateTime` (UTC) | fuso mora no `Calendar` |
| Telefone | `String` em E.164 | `+5511999999999`, sem máscara |
| Texto longo | `String` (`text`) | sem limite artificial |
| Configuração variável | `Json` (JSONB) | com tipo espelhado em shared |

## 6. O que ainda não está no schema

Entra nas fases seguintes (`docs/10-roadmap.md`):

- `Asset` — ativo simples vinculável a chamado (Fase 3).
- `Change` e `Problem` — como colunas nulas distintas em `TicketEvent` e
  `Attachment`, com `CHECK` de exclusividade; nunca como
  `(itemtype, items_id)` em texto (Fase 4).
- `Satisfaction` — pesquisa de satisfação pós-fechamento (Fase 3).
- `RecurringTicket` — chamado que nasce em agenda (Fase 4).
