# 01 — Mapa do GLPI

Levantamento feito sobre o código-fonte do **GLPI 11.0.9-dev**
(`glpi-project/glpi`, commit `40269a5`). Os números abaixo são contagens
reais do repositório, não estimativas.

| Métrica | Valor |
|---|---|
| Tabelas no schema de instalação | **442** |
| Classes de domínio em `src/*.php` | **623** |
| Páginas em `front/*.php` | **315** |
| Colunas em `glpi_tickets` | **44** |
| Tabelas ligadas ao domínio ITIL | ~100 |

Um sistema onde a tabela central tem 44 colunas e o produto inteiro tem
442 tabelas não é um sistema mal feito — é um sistema que acumulou vinte
anos de casos de uso de terceiros. O trabalho aqui é separar o que é
domínio do que é sedimento.

---

## 1. O núcleo ITIL

Toda a hierarquia ITIL do GLPI desce de uma classe só:
`CommonITILObject` (`src/CommonITILObject.php`). `Ticket`, `Change` e
`Problem` herdam dela e compartilham status, atores, prioridade, SLA,
validação e timeline.

### 1.1 Status

Definidos como constantes em `CommonITILObject` (linhas 120-128):

| Constante | Valor | Significado | Usado por |
|---|---|---|---|
| `INCOMING` | 1 | Novo | Ticket, Change, Problem |
| `ASSIGNED` | 2 | Em atendimento (atribuído) | Ticket, Problem |
| `PLANNED` | 3 | Em atendimento (planejado) | todos |
| `WAITING` | 4 | Pendente | todos |
| `SOLVED` | 5 | Solucionado | todos |
| `CLOSED` | 6 | Fechado | todos |
| `ACCEPTED` | 7 | Aceito | Change |
| `OBSERVED` | 8 | Em observação | Problem |
| `APPROVAL` | 10 | Em aprovação | todos |
| `EVALUATION` | 9 | Avaliação | Change |
| `TEST` | 11 | Teste | Change |
| `QUALIFICATION` | 12 | Qualificação | Change |
| `REFUSED` | 13 | Recusado | Change |

Os números são gravados diretamente na coluna `status` (`int`). Não há
enum no banco: `status = 5` é solucionado por convenção do código PHP.

### 1.2 Tipo de chamado

`Ticket::INCIDENT_TYPE = 1` e `Ticket::DEMAND_TYPE = 2`. Incidente é
"quebrou"; requisição é "preciso de". A separação é ITIL clássica e vale
manter.

### 1.3 Prioridade derivada

`CommonITILObject::computePriority($urgency, $impact)` (linha 3364):

```php
return $CFG_GLPI[static::MATRIX_FIELD][$urgency][$impact]
    ?? (int) round(($urgency + $impact) / 2);
```

Urgência e impacto vão de 1 a 5. A matriz 5×5 é configurável em
`glpi_configs` (chaves `_matrix_{urgencia}_{impacto}`) e o fallback é a
média arredondada. **Esta é uma das melhores decisões do GLPI** e é
copiada inteira pelo Desk.

### 1.4 Atores

Três papéis por chamado, cada um em sua própria tabela de ligação, e
cada um duplicado para usuário, grupo e fornecedor:

- Requerente (requester)
- Observador (observer / watcher)
- Atribuído (assign)

Tabelas: `glpi_tickets_users`, `glpi_groups_tickets`,
`glpi_suppliers_tickets` — cada uma com uma coluna `type` que diz qual
dos três papéis. Nove combinações mantidas em três tabelas com uma
coluna discriminadora.

### 1.5 A timeline — e o problema dela

A tela de chamado do GLPI mostra uma linha do tempo única. O banco não
guarda uma. São quatro tabelas independentes:

| Tabela | O que guarda | Colunas |
|---|---|---|
| `glpi_itilfollowups` | mensagens / acompanhamentos | 14 |
| `glpi_tickettasks` | tarefas (com tempo gasto, agenda, técnico) | 21 |
| `glpi_itilsolutions` | soluções propostas e sua aprovação | 16 |
| `glpi_documents_items` | anexos | — |

As três primeiras carregam, cada uma, uma coluna `timeline_position`
(`tinyint`) — o GLPI grava em cada linha de cada tabela a posição dela
na timeline montada. Ordenar a timeline exige `UNION` de quatro
consultas e reconciliação em PHP. **Este é o defeito estrutural que o
Desk corrige** (ver `docs/02-gap-analysis.md`, item 4).

Note também `itilfollowups` e `itilsolutions` usando o par
`(itemtype, items_id)` — polimorfismo sem chave estrangeira. Nada no
banco impede um acompanhamento apontar para um id que não existe.

### 1.6 SLA e OLA

`SLA` (compromisso com o cliente) e `OLA` (compromisso interno) descem
ambas de `LevelAgreement`. Cada uma tem dois tipos:

- **TTO** (*time to own*): prazo para o primeiro atendimento.
- **TTR** (*time to resolve*): prazo para resolver.

O cálculo é `LevelAgreement::computeExecutionDate()` (linha 810), que
percorre um `Calendar` com `CalendarSegment` (faixas de horário por dia
da semana) e `Calendar_Holiday`, descontando o tempo fora do
expediente. Escalonamento vem de `SlaLevel` / `OlaLevel`, com critérios
(`SlaLevelCriteria`) e ações (`SlaLevelAction`) — um mini motor de
regras por nível.

O preço disso aparece em `glpi_tickets`: **17 das 44 colunas** são SLA e
OLA denormalizados:

```
slas_id_ttr, slas_id_tto, slalevels_id_ttr, time_to_resolve, time_to_own,
begin_waiting_date, sla_waiting_duration, ola_waiting_duration,
olas_id_tto, olas_id_ttr, olalevels_id_ttr, ola_tto_begin_date,
ola_ttr_begin_date, internal_time_to_resolve, internal_time_to_own,
waiting_duration, takeintoaccount_delay_stat
```

Mais três colunas de estatística pré-calculada (`close_delay_stat`,
`solve_delay_stat`, `actiontime`).

### 1.7 Pendência (pending reasons)

`PendingReason` é um acerto pouco conhecido do GLPI: ao colocar um
chamado em espera, escolhe-se um motivo que carrega **frequência de
cobrança automática** e **número de cobranças antes de resolver
sozinho**. O `PendingReasonCron` reabre ou resolve o chamado conforme a
política. Resolve o problema real de chamado parado esperando o
cliente. O Desk mantém.

### 1.8 Validação / aprovação

`CommonITILValidation` com quatro estados: `NONE = 1`, `WAITING = 2`,
`ACCEPTED = 3`, `REFUSED = 4`. O GLPI 11 introduziu **etapas de
validação** (`ValidationStep`, `ITIL_ValidationStep`,
`TicketValidationStep`), permitindo aprovação em fases com quórum.
O agregado fica em `glpi_tickets.global_validation`.

### 1.9 Recorrência e modelos

- `TicketRecurrent` / `RecurrentChange`: chamado que nasce sozinho em
  agenda (manutenção preventiva).
- `TicketTemplate` + quatro tabelas satélites por tipo de campo
  (`hiddenfields`, `mandatoryfields`, `predefinedfields`,
  `readonlyfields`) — e o mesmo conjunto replicado para Change e
  Problem. Doze tabelas para dizer "neste formulário, este campo é
  obrigatório".

### 1.10 Motor de regras

`RuleCommonITILObject` (`getCriterias()` linha 661, `getActions()` linha
843) é o motor que classifica chamado na entrada: dado um conjunto de
critérios (categoria, requerente, conteúdo, entidade), aplica ações
(atribuir grupo, definir urgência, definir SLA). Existem variantes para
importação de ativo, atribuição de entidade, direitos LDAP e
dicionários. **Conceito excelente, interface terrível.**

---

## 2. Canais de entrada

### 2.1 Coletor de e-mail

`MailCollector` (2.300 linhas) faz poll IMAP e transforma mensagem em
chamado. O núcleo interessante é `getItemFromHeaders()` (linha 2224),
que decide se um e-mail é chamado novo ou resposta a um existente:

1. Se a mensagem é resposta a notificação de *outro* GLPI, ignora.
2. Procura nos cabeçalhos `In-Reply-To` e `References` um `Message-ID`
   no formato do GLPI, do qual extrai `itemtype` e `items_id`.
3. Se não achou, procura no assunto o padrão `[...#123]` por regex:
   ```php
   preg_match('/\[.+#(\d+)\]/', $subject, $matches)
   ```
4. Se nada casou, é chamado novo.

Há ainda `isItilNotificationFromSelf()` para não criar chamado a partir
da própria notificação (loop de e-mail), `RuleMailCollector` para
descartar spam e `BlacklistedMailContent` para cortar assinaturas.

A estratégia de threading está certa. O que falta: nada garante
idempotência por `Message-ID` no banco — dois polls concorrentes podem
duplicar chamado.

### 2.2 Notificações de saída

`NotificationTemplate` + `NotificationTemplateTranslation` +
`NotificationTarget*` (uma classe por tipo de objeto notificável, ~25
classes) + `QueuedNotification` (fila) + `NotificationEventMailing`.
Arquitetura correta: template, alvo, fila, evento.

### 2.3 Webhooks

`Webhook` e `QueuedWebhook` existem no GLPI 11 — saída HTTP em eventos
de item, com fila e status. É recente e pouco explorado.

### 2.4 WhatsApp

**Não existe.**

---

## 3. Permissões

`Profile` + `ProfileRight` + `Profile_User`. Direito é **bitmask** por
itemtype: `READ = 1`, `UPDATE = 2`, `CREATE = 4`, `DELETE = 8`,
`PURGE = 16`, mais bits específicos por classe (por exemplo, em
`Ticket`: ler os meus, ler os do meu grupo, ler todos, atribuir a mim).

Um perfil é uma linha por itemtype com um inteiro de bits. Flexível e
ilegível. Depurar "por que o fulano não vê este chamado" no GLPI é
arqueologia.

Multi-tenant vem de `Entity`, uma **árvore** (`CommonTreeDropdown`) com
herança recursiva de configuração e visibilidade. `Profile_User` liga
usuário + perfil + entidade + `is_recursive`.

---

## 4. Módulos além do ITIL

| Área | Classes | Usa na Norty? |
|---|---|---|
| Base de conhecimento (`KnowbaseItem`, categorias, revisões, comentários, tradução) | ~12 | **Sim** |
| Projetos (`Project`, `ProjectTask`, times, custos, kanban) | ~15 | Talvez |
| Inventário de ativos (`Computer`, `Monitor`, `Printer`, `Phone`, `NetworkEquipment`, `Peripheral`) | ~30 | Parcial |
| Componentes (`Device*`, `Item_Device*`) | ~60 | **Não** |
| Datacenter (`Rack`, `PDU`, `Enclosure`, `Cable`, `DCRoom`, `Stencil`) | ~25 | **Não** |
| Software e licenças | ~10 | **Não** |
| Consumíveis e cartuchos | ~8 | **Não** |
| Rede (`NetworkPort*`, `IPAddress`, `Vlan`, `FQDN`) | ~30 | **Não** |
| Contratos, fornecedores, orçamento, `Infocom` | ~15 | Parcial |
| Reservas (`Reservation`) | 2 | **Não** |
| Agenda (`Planning`, eventos externos, lembretes) | ~8 | Parcial |
| Regras e dicionários | ~70 | Conceito sim |
| Autenticação (LDAP, SSO, OAuth, e-mail) | ~8 | Parcial |
| Relatórios e estatísticas (`Stat`, `SavedSearch`, dashboards) | ~10 | **Sim** |

Somando: das 623 classes, a Norty usa o equivalente a **cerca de 90**.

---

## 5. A API REST

Documentada em `apirest.md`. O fluxo:

1. `initSession` com login/senha ou `user_token` → devolve `session_token`.
2. Todas as demais chamadas mandam `Session-Token` no cabeçalho.
3. Opcionalmente um `App-Token` identifica a aplicação cliente.
4. **A sessão é somente leitura por padrão.** Para escrever é preciso
   `session_write=true`, e aí *a sessão trava*: o cliente precisa esperar
   uma chamada terminar antes de começar a próxima.
5. Busca usa `searchOption`: colunas identificadas por número inteiro
   (`1 -> id`, `2 -> name`, ...), consultados num endpoint à parte.

Ou seja: estado no servidor, serialização de escrita e campos sem nome.
É uma API de 2013. **Reescrever isso é metade do valor do projeto.**

---

## 6. Inventário de páginas

315 páginas em `front/`. O padrão é `<objeto>.php` (lista) e
`<objeto>.form.php` (formulário). As que importam para o Desk:

**Atendimento** — `ticket.php`, `ticket.form.php`, `itilfollowup.form.php`,
`tickettask.form.php`, `itilsolution.form.php`, `ticketvalidation.form.php`,
`ticket_user.form.php`, `group_ticket.form.php`, `ticket_ticket.form.php`,
`problem.form.php`, `change.form.php`

**Configuração de serviço** — `slalevel.form.php`, `olalevel.form.php`,
`ruleticket.php`, `ruleticket.form.php`, `rulemailcollector.php`,
`tickettemplate*.form.php` (4 páginas)

**Conhecimento** — `knowbaseitem.php`, `knowbaseitem.form.php`,
`knowbaseitem_comment.form.php`, `knowbaseitemtranslation.form.php`

**Notificação** — `notification.form.php`, `notificationtemplate.form.php`,
`notificationtemplatetranslation.form.php`, `notification.tags.php`,
`notificationmailingsetting.form.php`

**Pessoas e acesso** — `user.form.php`, `group.form.php`,
`group_user.form.php`, `profile.form.php`, `profile_user.form.php`

**Painéis e relatórios** — `dashboard_helpdesk.php`, `dashboard_assets.php`,
`stat.php`, `stat.global.php`, `stat.graph.php`, `stat.item.php`,
`stat.tracking.php`, `stat.location.php`

**Agenda e documentos** — `planning.php`, `planning.form.php`,
`document.form.php`, `document.send.php`, `reminder.form.php`

O Desk cobre esse conjunto em **cerca de 30 telas** — a consolidação
está em `docs/08-design.md`.

---

## 7. Resumo do que vale a pena copiar

Em ordem de valor:

1. A matriz urgência × impacto → prioridade.
2. A separação SLA (cliente) / OLA (interno), com TTO e TTR, sobre
   calendário com feriados.
3. `PendingReason` com cobrança automática e resolução por inatividade.
4. Incidente vs. requisição.
5. Os três papéis de ator (requerente, observador, atribuído).
6. O threading de e-mail por `In-Reply-To` / `References` e por `[#id]`
   no assunto.
7. O motor de regras de classificação na entrada.
8. Validação em etapas com quórum.
9. Recorrência de chamado para manutenção preventiva.
10. Base de conhecimento com revisão e vínculo a chamado.
