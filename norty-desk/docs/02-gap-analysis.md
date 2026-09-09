# 02 — O que muda, o que melhora, o que corta

Este é o documento que responde à pergunta do projeto. Cada item diz o
que o GLPI faz hoje, o que o Desk faz, e **por quê**. Onde a mudança tem
custo, o custo está escrito.

Legenda: **=** mantém como está · **≠** muda a implementação ·
**+** melhora ou acrescenta · **−** corta

---

## A. Modelo de dados

### 1. ≠ Status vira enum nomeado, não inteiro mágico

**Hoje:** `glpi_tickets.status` é `int`. `5` é solucionado porque uma
constante PHP diz que sim. Um `UPDATE` errado por SQL deixa o chamado
num estado que não existe.

**Desk:** `enum TicketStatus { NOVO, ATRIBUIDO, PLANEJADO, PENDENTE,
EM_APROVACAO, SOLUCIONADO, FECHADO }` no Postgres. O banco recusa valor
inválido.

**Ganho:** consulta legível (`WHERE status = 'PENDENTE'`), erro
impossível, e o mesmo tipo em TypeScript nos dois lados.

**Custo:** a migração precisa mapear inteiro → enum. Está em
`docs/09-migracao.md`.

### 2. ≠ Prioridade continua derivada, mas passa a ser calculada em um lugar só

**Hoje:** `computePriority()` existe, mas a coluna `priority` é
gravável de fora e vários caminhos escrevem nela.

**Desk:** a matriz é a mesma (5×5, configurável por organização, fallback
na média). A diferença é de disciplina: só `TicketPriorityService`
escreve em `priority`; DTO de entrada não aceita o campo. Está na regra
7 do `CLAUDE.md`.

**Ganho:** prioridade nunca diverge de urgência × impacto.

### 3. − Corta o polimorfismo `(itemtype, items_id)` sem chave estrangeira

**Hoje:** `glpi_itilfollowups` e `glpi_itilsolutions` apontam para
qualquer objeto por um par `varchar` + `int`. O banco não valida nada.
Registro órfão é rotina em base antiga de GLPI.

**Desk:** chave estrangeira de verdade para `Ticket`. Quando Mudança e
Problema entrarem (Fase 4), entram como colunas nulas distintas com
`CHECK` de exclusividade — não como string de itemtype.

**Ganho:** integridade referencial. `ON DELETE CASCADE` funciona.

### 4. + **Uma timeline, não quatro tabelas** — a maior mudança estrutural

**Hoje:** acompanhamento, tarefa, solução e anexo vivem em quatro
tabelas, cada uma com sua coluna `timeline_position`. Montar a tela do
chamado é `UNION` de quatro consultas mais reconciliação em PHP. Cada
novo tipo de evento (uma mensagem de WhatsApp, por exemplo) exigiria uma
quinta tabela e uma quinta consulta.

**Desk:** uma tabela `TicketEvent`, com `type` (enum), `authorId`,
`visibility` (PUBLICA / INTERNA), `body`, `payload` (JSONB para o que é
específico do tipo) e `channel` (WEB / EMAIL / WHATSAPP / API /
SISTEMA). Tarefa continua tendo seus campos próprios — em `payload`
tipado no shared, não em colunas soltas.

Tipos de evento: `MENSAGEM`, `NOTA_INTERNA`, `TAREFA`, `SOLUCAO`,
`APROVACAO`, `ANEXO`, `MUDANCA_STATUS`, `MUDANCA_ATRIBUICAO`,
`PAUSA_SLA`, `ENTRADA_CANAL`, `SAIDA_CANAL`.

**Ganho:**
- A tela de chamado é um `SELECT ... ORDER BY createdAt`.
- Canal novo é um valor de enum, não uma tabela nova.
- A resposta ao WhatsApp e a resposta ao e-mail são o mesmo evento.
- Auditoria do chamado vem de graça: a timeline *é* o log.

**Custo:** `payload` em JSONB não é validado pelo banco. Mitigação: o
tipo discriminado mora em `packages/shared/src/domain.ts` e é validado
na fronteira por Zod. É uma troca consciente — flexibilidade de canal
vale mais aqui que validação de coluna.

### 5. ≠ SLA sai de 17 colunas denormalizadas para uma tabela de compromisso

**Hoje:** 17 das 44 colunas de `glpi_tickets` são estado de SLA/OLA.
Adicionar um terceiro tipo de prazo significa `ALTER TABLE`.

**Desk:** tabela `SlaCommitment`, uma linha por (chamado, tipo de
acordo, tipo de prazo):

```
ticketId · agreementId · kind (SLA|OLA) · target (TTO|TTR)
dueAt · pausedSeconds · achievedAt · breachedAt · escalationLevel
```

**Ganho:** `glpi_tickets` com 44 colunas vira `Ticket` com 18. Relatório
de SLA é `GROUP BY` numa tabela, não leitura de 17 colunas. Um terceiro
prazo (tempo até primeira resposta, por exemplo) é uma linha, não um
`ALTER TABLE`.

**=** O **cálculo** não muda: mesmo percurso de calendário com faixas de
horário e feriados, mesmo desconto de tempo em pendência. Ver
`docs/05-sla.md`.

### 6. ≠ Atores: três tabelas com coluna discriminadora viram uma

**Hoje:** `glpi_tickets_users`, `glpi_groups_tickets`,
`glpi_suppliers_tickets`, cada uma com `type` ∈ {requerente, observador,
atribuído}.

**Desk:** `TicketActor` com `role` (enum) e exatamente um de
`userId` / `teamId` / `supplierId` preenchido, com `CHECK`.

**Ganho:** "quem está neste chamado" é uma consulta.

### 7. ≠ Entidade em árvore vira organização plana

**Hoje:** `Entity` é `CommonTreeDropdown` com herança recursiva de
configuração e de visibilidade. `Profile_User` carrega `is_recursive`.
É o mecanismo que mais gera chamado de suporte em implantação de GLPI:
ninguém consegue prever o que um usuário enxerga.

**Desk:** `Organization` plana. Um usuário pertence a uma ou mais
organizações com um perfil em cada (`Membership`). Sem herança, sem
recursividade.

**Ganho:** "o que este usuário vê" é resolvível de cabeça, e é
resolvido uma vez no `JwtAuthGuard` (regra 3 do `CLAUDE.md`).

**Custo assumido:** cliente com matriz e filiais que hoje usa a árvore
perde a herança automática de configuração. Mitigação: `Team` (grupo)
faz o recorte interno, e configuração é copiável entre organizações no
painel. Se um cliente real precisar de árvore, isso volta como
`parentId` opcional — mas só quando existir o cliente, não antes.

### 8. − Corta 12 tabelas de modelo de formulário

**Hoje:** `TicketTemplate` + `hiddenfields` + `mandatoryfields` +
`predefinedfields` + `readonlyfields`, replicado para Change e Problem.

**Desk:** `TicketForm` com um JSONB `schema` descrevendo campos,
obrigatoriedade, visibilidade e valor padrão — um formulário dinâmico
declarado, não quatro tabelas de exceção.

---

## B. Interface e experiência

### 9. + Portal do solicitante separado do aplicativo do agente

**Hoje:** o GLPI tem "interface simplificada" e "interface padrão" no
mesmo aplicativo, com o mesmo layout denso. O solicitante vê um
formulário de trinta campos.

**Desk:** duas superfícies distintas.
- **Portal** (`/portal`): abrir chamado em três campos, acompanhar,
  responder, anexar. Nada mais.
- **Aplicativo** (`/desk`): fila, chamado, painéis, configuração.

### 10. + Fila de trabalho, não tela de busca

**Hoje:** a lista de chamados é a tela genérica de busca do GLPI, com
`searchOption` numerado.

**Desk:** fila com visões salvas ("meus", "do meu time", "sem
atribuição", "SLA estourando em 2h"), filtro por campo nomeado, seleção
múltipla com ações em lote, e atalho de teclado. Densidade alta e
deliberada — é a tela onde o agente passa o dia.

### 11. + Tela de chamado em duas colunas com timeline no centro

Timeline à esquerda (o que aconteceu, em ordem, com o canal marcado em
cada evento), propriedades à direita (status, atribuição, SLA com
contagem regressiva, categoria, anexos). Responder é uma caixa fixa no
rodapé com um seletor de visibilidade (público / nota interna) e de
canal de saída.

### 12. − Corta as abas que recarregam a página

Navegação sem recarga. Estado do chamado atualiza por revalidação, não
por `F5`.

---

## C. Canais — onde está a maior parte do valor novo

### 13. + WhatsApp pela Evolution API (não existe no GLPI)

Abrir chamado, consultar status, mandar foto ou PDF e receber resposta
do agente, tudo por WhatsApp. A infra da Norty já roda Evolution em
`192.168.15.72:8080`. Especificação completa em `docs/06-canais.md`.

**Por que importa:** é o canal em que o cliente da Norty já fala. Um
chamado que hoje vira mensagem solta no WhatsApp de alguém passa a ter
número, SLA e histórico.

### 14. ≠ E-mail: mesma estratégia de threading, com idempotência de verdade

**=** Mantém o algoritmo do `MailCollector::getItemFromHeaders()`:
`In-Reply-To` → `References` → `[#id]` no assunto → chamado novo. É a
estratégia certa e está validada por vinte anos de uso.

**≠** Duas correções:
- **Idempotência no banco.** `@@unique` em `(organizationId, messageId)`
  na tabela de mensagens recebidas. O GLPI não tem isso: dois polls
  concorrentes duplicam chamado.
- **Webhook além de poll.** IMAP continua disponível, mas provedor que
  entrega por HTTP entra direto, sem esperar o ciclo do cron.

### 15. + Um chamado, o canal de origem lembrado

O evento guarda o canal. A resposta do agente sai pelo canal em que o
solicitante falou, salvo escolha explícita. Ninguém responde e-mail no
WhatsApp por engano.

### 16. + Anexo unificado no MinIO

**Hoje:** `glpi_documents` + `glpi_documents_items` + tipo de documento +
categoria, arquivo em disco local do servidor.

**Desk:** `Attachment` com armazenamento no MinIO do CT 102
(`192.168.15.72:9000`), URL assinada com validade curta, e o mesmo
caminho para arquivo vindo do navegador, do e-mail ou do WhatsApp.
Anexar é um evento na timeline.

---

## D. API e integração

### 17. ≠ API sem sessão, com campos nomeados

| | GLPI | Desk |
|---|---|---|
| Autenticação | `initSession` → `session_token` | JWT (15 min) + refresh em cookie `httpOnly` |
| Estado | sessão no servidor | sem estado |
| Escrita | trava a sessão, uma por vez | concorrente |
| Campos | `searchOption: 12` | `assignee.name` |
| Paginação | `range: 0-49` | cursor |
| Erro | HTML ou array | RFC 7807 |

### 18. + Webhooks de saída como recurso de primeira classe

O GLPI 11 tem `Webhook` e `QueuedWebhook`, mas mal expostos. O Desk
entrega assinatura HMAC, retentativa com backoff, e um log consultável
de entregas.

---

## E. Permissões

### 19. ≠ Bitmask vira matriz de permissões nomeadas

**Hoje:** `ProfileRight` guarda um inteiro de bits por itemtype.
Descobrir por que alguém não vê um chamado é arqueologia.

**Desk:** `Permission` é string nomeada (`chamado:ler:todos`,
`chamado:atribuir`, `sla:configurar`) e `ROLE_PERMISSIONS` em
`packages/shared/src/permissions.ts` é a fonte única — a mesma que
esconde o menu no aplicativo e alimenta o `PermissionsGuard` da API.

**=** Mantém a granularidade que o GLPI acertou: ler os meus / ler os do
meu time / ler todos são permissões distintas.

---

## F. O que corta

Fora do escopo do Desk. Nenhuma dessas áreas é usada pela Norty hoje, e
cada uma delas custa esquema, tela e manutenção.

| Área | Classes GLPI | Por quê |
|---|---|---|
| Componentes de hardware (`Device*`, `Item_Device*`) | ~60 | Inventário de peça não é serviço |
| Datacenter (rack, PDU, cabo, sala, estêncil) | ~25 | A Norty não vende colocation |
| Rede (`NetworkPort*`, IP, VLAN, FQDN) | ~30 | Fora do domínio |
| Software e licenças | ~10 | Fora do domínio |
| Consumíveis e cartuchos | ~8 | Fora do domínio |
| Reservas de equipamento | 2 | Não usado |
| Dicionários de regra (`RuleDictionnary*`) | ~40 | Só fazem sentido com inventário automático |
| Agente de inventário nativo | ~10 | Fora do domínio |
| Impacto / análise de impacto em grafo | ~6 | Complexidade sem demanda |

**Fica para depois, não cortado:** Mudança e Problema (Fase 4), Projetos
(Fase 5), inventário simples de ativo vinculável a chamado (Fase 3 — só
o suficiente para dizer "este chamado é sobre este equipamento").

---

## G. Resumo em uma tabela

| Dimensão | GLPI 11 | Norty Desk |
|---|---|---|
| Tabelas | 442 | ~40 na Fase 3 |
| Classes de domínio | 623 | ~60 |
| Colunas no chamado | 44 | 18 + tabelas satélite |
| Telas | 315 | ~30 |
| Timeline | 4 tabelas + `UNION` | 1 tabela |
| Canais de entrada | web, e-mail | web, e-mail, **WhatsApp**, API |
| Multi-tenant | árvore com herança recursiva | organização plana |
| Permissão | bitmask por itemtype | permissão nomeada em matriz |
| API | sessão com estado, campos numerados | JWT sem estado, campos nomeados |
| Stack | PHP 8 + MySQL + Twig | React + NestJS + Postgres + Prisma |
| Prioridade | matriz urgência × impacto | **igual** |
| SLA / OLA | TTO e TTR sobre calendário | **igual**, em tabela própria |
| Pendência com cobrança | sim | **igual** |
