# 10 — Roadmap

Cinco fases. Cada uma termina em algo que dá para usar — não em algo que
dá para demonstrar.

---

## Fase 0 — Discovery e scaffold ✅ *(entregue)*

O que está neste repositório hoje.

- Mapa do GLPI 11.0.9 sobre o código-fonte (`docs/01`).
- Gap analysis completo (`docs/02`).
- Modelo de dados em Prisma, validado (`apps/api/prisma/schema.prisma`).
- Matriz de permissões nomeada, com testes (`packages/shared`).
- Cálculo de SLA sobre calendário, **implementado e com 12 testes
  passando** — fim de semana, feriado, horário de verão, 24×7.
- Contratos de API, incluindo os endpoints de e-mail e WhatsApp
  (`docs/07`).
- Adaptadores de canal com idempotência e threading
  (`apps/api/src/modules/channels`).
- Casca do aplicativo com tokens, fila e timeline (`apps/web`).

**Estado:** `npm run build` passa nos três pacotes; 23 testes verdes.

---

## Fase 1 — O chamado funciona ponta a ponta ✅ *(entregue)*

O menor sistema que substitui o GLPI para uma equipe pequena.

| Entrega | Estado |
|---|---|
| Autenticação — Argon2id, JWT de 15 min, refresh rotativo em cookie `httpOnly` | pronto |
| Organizações, pessoas, times e vínculos | pronto |
| Categorias em árvore, com time e acordos padrão | pronto |
| Abrir chamado (agente e portal) | pronto |
| Fila — filtros, visões, busca, ordenação, cursor | pronto |
| Chamado — conversa, responder, nota interna, atribuir, classificar | pronto |
| Transições de status validadas | pronto |
| Pausar e retomar, descontando o tempo parado | pronto |
| Anexos — porta de armazenamento, disco e MinIO | pronto |
| Portal do solicitante | pronto |
| Formulário dinâmico por categoria | **fica para a Fase 2** |

**Verificação:** 44 testes de ponta a ponta contra Postgres real, que
sobem a aplicação Nest inteira, mais 14 do domínio compartilhado e 12 do
cálculo de calendário. Um passeio de navegador (`npm run test:navegador
-w @norty-desk/web`) percorre o caminho do agente no Chromium e confere
que a nota interna não chega ao portal do solicitante.

**O que ficou de fora e por quê:** o formulário dinâmico por categoria
(`TicketForm`) tem schema e tipo, mas nenhuma tela o consome ainda. Ele
depende da tela de configuração de categorias, que é da Fase 2 — e
abrir chamado já funciona sem ele.

---

## Fase 2 — Canais e prazos

O que diferencia o Desk do GLPI.

| Entrega | Detalhe |
|---|---|
| **E-mail entrada** | IMAP + webhook, threading, limpeza de citação |
| **E-mail saída** | fila, `Message-ID`, `In-Reply-To`, remetente do time |
| **WhatsApp entrada** | webhook da Evolution, janela de conversa, menu |
| **WhatsApp saída** | texto e mídia, retentativa com backoff |
| **Anexo por canal** | foto e PDF do WhatsApp, anexo de e-mail |
| Diagnóstico de canal | mensagem original, motivo do descarte, reprocessar |
| SLA e OLA | aplicação, pausa, retomada, cumprimento, violação |
| Escalonamento | níveis com critérios e ações, cron |
| Motivos de pendência | cobrança automática e resolução por inatividade |
| Regras de entrada | classificação automática na abertura |
| Intake público | `ApiKey` com escopos, `Idempotency-Key` |

**Pronto quando:** um cliente abre chamado por WhatsApp, manda uma foto,
recebe resposta no WhatsApp, e o SLA é medido corretamente com o
expediente do calendário.

---

## Fase 3 — Operação madura

O que faz a operação escalar.

| Entrega | Detalhe |
|---|---|
| Aprovações | etapas com quórum, decisão pelo portal |
| Base de conhecimento | artigos, revisões, sugestão por similaridade |
| Painéis | agente, time, organização |
| Relatório de SLA | cumprimento por período, categoria, time |
| Ativo simples | equipamento vinculável a chamado (sem CMDB) |
| Satisfação | pesquisa pós-fechamento, pelo canal de origem |
| Webhooks de saída | assinatura HMAC, retentativa, log |
| Ações em lote | atribuir, classificar, fechar em massa |
| Auditoria | trilha de configuração |
| Transcrição de áudio | Ollama do CT 102 sobre áudio do WhatsApp |

---

## Fase 4 — ITIL completo

Só quando a operação pedir.

- **Problema** — causa raiz, chamados vinculados.
- **Mudança** — com aprovação, janela e plano de recuo.
- **Chamado recorrente** — manutenção preventiva em agenda.
- **Modelos de resposta e solução.**
- **Contratos e fornecedores.**

Problema e Mudança entram como colunas nulas distintas em `TicketEvent`
e `Attachment`, com `CHECK` de exclusividade — nunca como
`(itemtype, items_id)` em texto (`docs/03-modelo-de-dados.md`, seção 6).

---

## Fase 5 — Projetos e capacidade

- Projetos, tarefas de projeto, times, kanban.
- Planejamento de capacidade da equipe.
- Custo por chamado e por contrato.

---

## Migração

A migração do GLPI (`docs/09-migracao.md`) acontece **no fim da Fase 2**,
não antes. Migrar para um sistema que ainda não trata canal significa
migrar duas vezes.

---

## Ordem, e por que ela

A tentação é fazer todo o CRUD de configuração primeiro, porque é fácil.
A ordem aqui é outra: **chamado antes de configuração, canal antes de
relatório.** Uma tela de configuração de SLA sem chamado nenhum no
sistema não prova nada; um chamado que entra por WhatsApp e sai por
WhatsApp prova o produto inteiro.
