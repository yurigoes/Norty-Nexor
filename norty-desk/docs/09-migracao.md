# 09 — Migração do GLPI

Migrar do MySQL do GLPI para o Postgres do Desk. Escrito para ser
executado uma vez, com validação, e com caminho de volta.

---

## 1. O que precisa ser levantado antes

A sessão que produziu este projeto não teve acesso ao
`desk.norty.com.br` para inventariar a base real. Antes de escrever o
script de carga, colete:

```sql
-- Versão do GLPI
SELECT value FROM glpi_configs WHERE name = 'version';

-- Volume
SELECT COUNT(*) FROM glpi_tickets;
SELECT COUNT(*) FROM glpi_tickets WHERE is_deleted = 0;
SELECT COUNT(*) FROM glpi_itilfollowups;
SELECT COUNT(*) FROM glpi_tickettasks;
SELECT COUNT(*) FROM glpi_itilsolutions;
SELECT COUNT(*) FROM glpi_documents;
SELECT COUNT(*) FROM glpi_users WHERE is_active = 1;

-- Estrutura em uso
SELECT id, name, level FROM glpi_entities;
SELECT COUNT(*) FROM glpi_itilcategories;
SELECT COUNT(*) FROM glpi_slas;
SELECT COUNT(*) FROM glpi_olas;
SELECT COUNT(*) FROM glpi_knowbaseitems;

-- Plugins (o que pode ter esquema fora do padrão)
SELECT directory, name, version, state FROM glpi_plugins;
```

**A árvore de entidades é a resposta mais importante.** Se
`glpi_entities` tiver só a raiz e um nível, a migração para
`Organization` plana é direta. Se tiver três níveis com
`is_recursive = 1` espalhado, é preciso decidir organização por
organização — e isso é conversa, não script.

## 2. Ordem de carga

As dependências mandam. Nesta ordem, nenhuma etapa espera por outra:

```
1. Organization      ← glpi_entities
2. User              ← glpi_users
3. Team              ← glpi_groups
4. TeamMember        ← glpi_groups_users
5. Membership        ← glpi_profiles_users  (com mapa de perfil)
6. Contact           ← remetentes de e-mail sem conta
7. Calendar/Segment/Holiday ← glpi_calendars/segments/holidays
8. Agreement         ← glpi_slas + glpi_olas
9. EscalationLevel   ← glpi_slalevels + glpi_olalevels
10. PendingReason    ← glpi_pendingreasons
11. Category         ← glpi_itilcategories  (árvore, pais antes)
12. Ticket           ← glpi_tickets
13. TicketActor      ← 3 tabelas de ator
14. TicketEvent      ← 4 tabelas de timeline  ← a etapa mais delicada
15. Attachment       ← glpi_documents + arquivos para o MinIO
16. SlaCommitment    ← 17 colunas de glpi_tickets
17. Approval         ← glpi_ticketvalidations
18. Article          ← glpi_knowbaseitems
```

## 3. Mapas de conversão

### 3.1 Status

```
1 INCOMING  → NOVO
2 ASSIGNED  → ATRIBUIDO
3 PLANNED   → PLANEJADO
4 WAITING   → PENDENTE
5 SOLVED    → SOLUCIONADO
6 CLOSED    → FECHADO
10 APPROVAL → EM_APROVACAO
```

Status 7 (`ACCEPTED`), 8 (`OBSERVED`), 9, 11, 12, 13 só aparecem em
Change e Problem, que não entram na Fase 1.

### 3.2 Tipo, ator, validação

```
type: 1 → INCIDENTE, 2 → REQUISICAO
glpi_tickets_users.type: 1 → REQUERENTE, 2 → ATRIBUIDO, 3 → OBSERVADOR
validation: 1 → (sem aprovação), 2 → AGUARDANDO, 3 → APROVADO, 4 → RECUSADO
```

### 3.3 Perfil

Não há mapa automático: o GLPI guarda bitmask por itemtype, o Desk
guarda perfil nomeado. A conversão é uma tabela escrita à mão a partir
dos perfis que a Norty realmente usa:

```sql
SELECT p.id, p.name, COUNT(pu.id) AS usuarios
FROM glpi_profiles p
LEFT JOIN glpi_profiles_users pu ON pu.profiles_id = p.id
GROUP BY p.id, p.name ORDER BY usuarios DESC;
```

Regra prática, a validar com o levantamento: `Super-Admin` e `Admin` →
`ADMINISTRADOR`; `Supervisor` → `SUPERVISOR`; `Technician` → `AGENTE`;
`Observer` → `GESTOR`; `Self-Service` → `SOLICITANTE`.

### 3.4 A timeline — a parte que exige cuidado

Quatro tabelas viram uma, e a ordem tem de ficar correta:

| Origem | `type` | `visibility` | `payload` |
|---|---|---|---|
| `glpi_itilfollowups` | `MENSAGEM` ou `NOTA_INTERNA` conforme `is_private` | idem | — |
| `glpi_tickettasks` | `TAREFA` | conforme `is_private` | `{ spentSeconds: actiontime, plannedStart: begin, plannedEnd: end, done: state = 2 }` |
| `glpi_itilsolutions` | `SOLUCAO` | `PUBLICA` | `{ accepted: status = 3 }` |
| `glpi_documents_items` | `ANEXO` | `PUBLICA` | — |

`createdAt` vem de `date` (ou `date_creation` quando `date` é nulo — em
base antiga acontece). `channel` vira `WEB` quando não houver como
saber, exceto quando `requesttypes_id` apontar para o tipo "E-mail", aí
vira `EMAIL`.

**A coluna `timeline_position` do GLPI é descartada.** Ela existia para
ordenar o que não estava numa tabela só; com uma tabela só, `createdAt`
resolve.

### 3.5 SLA

As 17 colunas viram até quatro linhas por chamado:

```
time_to_own      + slas_id_tto → SlaCommitment(SLA, TTO)
time_to_resolve  + slas_id_ttr → SlaCommitment(SLA, TTR)
internal_time_to_own     + olas_id_tto → SlaCommitment(OLA, TTO)
internal_time_to_resolve + olas_id_ttr → SlaCommitment(OLA, TTR)

pausedSeconds ← sla_waiting_duration / ola_waiting_duration
achievedAt    ← takeintoaccountdate (TTO) / solvedate (TTR)
breachedAt    ← dueAt quando dueAt < achievedAt, ou dueAt já passado
```

**Não recalcular prazo histórico.** `dueAt` vem do que estava gravado.
Recalcular com os acordos de hoje reescreveria o desempenho de ontem
(`docs/05-sla.md`, seção 7).

### 3.6 Anexos

`glpi_documents.filepath` aponta para `files/` no servidor do GLPI. Para
cada documento: ler o arquivo, calcular SHA-256, enviar ao MinIO em
`{organizationId}/{ticketId}/{uuid}-{filename}`, gravar `Attachment`.

Documento sem arquivo no disco (acontece em base antiga) vira
`Attachment` marcado, não erro de migração: a lista de faltantes é
entregue no relatório.

## 4. Restrições que Prisma não expressa

Entram como SQL na migração inicial:

```sql
-- Exatamente um alvo por ator (docs/03-modelo-de-dados.md, 2.3)
ALTER TABLE ticket_actors ADD CONSTRAINT ticket_actors_alvo_unico CHECK (
  ("userId" IS NOT NULL)::int + ("teamId" IS NOT NULL)::int +
  ("supplierId" IS NOT NULL)::int + ("contactId" IS NOT NULL)::int = 1
);

-- Escala 1..5
ALTER TABLE tickets ADD CONSTRAINT tickets_escala CHECK (
  urgency BETWEEN 1 AND 5 AND impact BETWEEN 1 AND 5 AND priority BETWEEN 1 AND 5
);

-- Vínculo de chamado não aponta para si mesmo
ALTER TABLE ticket_links ADD CONSTRAINT ticket_links_sem_auto CHECK ("sourceId" <> "targetId");

-- Faixa de expediente com duração positiva
ALTER TABLE calendar_segments ADD CONSTRAINT calendar_segments_ordem CHECK (
  "startMinute" < "endMinute" AND "startMinute" >= 0 AND "endMinute" <= 1440
);

-- Busca textual na fila
CREATE INDEX tickets_busca ON tickets
  USING gin (to_tsvector('portuguese', subject || ' ' || description));
```

## 5. Validação

Depois da carga, antes de virar a chave:

```sql
-- Contagens batem
SELECT COUNT(*) FROM tickets;                                   -- = glpi_tickets WHERE is_deleted = 0
SELECT COUNT(*) FROM ticket_events;                             -- = soma das 4 tabelas
SELECT COUNT(*) FROM attachments;                               -- = glpi_documents_items

-- Nenhum chamado sem requerente
SELECT COUNT(*) FROM tickets t WHERE NOT EXISTS (
  SELECT 1 FROM ticket_actors a WHERE a."ticketId" = t.id AND a.role = 'REQUERENTE');

-- Nenhuma numeração repetida ou furada
SELECT "organizationId", COUNT(*), COUNT(DISTINCT number) FROM tickets GROUP BY 1;

-- Prioridade coerente com a matriz
SELECT COUNT(*) FROM tickets WHERE priority NOT BETWEEN 1 AND 5;
```

Mais uma conferência manual: **dez chamados sorteados**, comparados lado
a lado com o GLPI. Contagem certa não garante conteúdo certo.

## 6. Virada

1. **Ensaio.** Migração completa em ambiente separado, com cópia da base.
   Mede o tempo e produz o relatório de inconsistências.
2. **Congelamento.** GLPI em somente leitura por algumas horas.
3. **Carga final.** Delta desde o ensaio, ou carga inteira se couber na
   janela.
4. **Redirecionamento.** Caddy aponta `desk.norty.com.br` para o Desk.
   Caixa de e-mail e webhook da Evolution repontados.
5. **GLPI em somente leitura por 90 dias**, em `glpi-legado.norty.com.br`.
   É o caminho de volta: qualquer dúvida sobre um chamado antigo se
   resolve olhando o original.

## 7. O que não é migrado

Inventário de ativos, componentes, datacenter, rede, software, licenças,
consumíveis, reservas e dicionários de regra
(`docs/02-gap-analysis.md`, seção F). Continuam legíveis no GLPI de
legado pelos 90 dias; se algum for necessário depois, vira exportação
CSV pontual, não módulo.
