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

- **Problema** — causa raiz, chamados vinculados, base de erros conhecidos.
- **Mudança** — aprovação, janela de execução, plano de recuo.
- **Chamado recorrente** — manutenção preventiva em agenda.
- **Formulário dinâmico por categoria** — o `TicketForm` que ficou da
  Fase 1, com a tela de configuração que o alimenta.
- **Modelos** de resposta, de solução e de tarefa.
- **Contratos, fornecedores, orçamento e `Infocom`** — custo e vigência.

Problema e Mudança entram como colunas nulas distintas em `TicketEvent`
e `Attachment`, com `CHECK` de exclusividade — nunca como
`(itemtype, items_id)` em texto (`docs/03-modelo-de-dados.md`, seção 6).

---

## Fase 5 — Ativos

O inventário que o chamado referencia.

- **Ativo** com tipo: computador, monitor, impressora, telefone,
  periférico, equipamento de rede. Um modelo com discriminador, não seis
  tabelas paralelas.
- **Componentes** — memória, disco, processador, placa. No GLPI são
  sessenta tabelas (`Device*` mais `Item_Device*`); aqui é **um** modelo
  de componente com tipo e atributos por tipo.
- **Vínculo com chamado** — "este chamado é sobre este equipamento",
  com histórico.
- **Localização** em árvore, estado do ativo, fabricante e modelo.

---

## Fase 6 — Software, consumíveis e rede

- **Software**, versões e **licenças**, com contagem de uso.
- **Consumíveis e cartuchos**, com estoque e alerta de mínimo.
- **Rede**: portas, conexões, IP, faixa, VLAN, FQDN.

---

## Fase 7 — Datacenter e automação de inventário

- **Rack, PDU, sala, cabo, gabinete**, com desenho de ocupação.
- **Dicionários de regra** — o mesmo motor da Fase 2, com o catálogo de
  alvos que normaliza fabricante, modelo e sistema operacional.
- **Inventário automático** — recepção do que o agente do GLPI já
  coleta, com regras de importação e de atribuição de entidade.

---

## Fase 8 — Projetos e o que resta

- **Projetos**, tarefas, times, custos e kanban.
- **Reservas** de equipamento.
- **Análise de impacto** em grafo.
- Planejamento de capacidade e custo por chamado.

---

## Sobre a ordem

A paridade com o GLPI é requisito (`docs/02-gap-analysis.md`, seção F).
O que a ordem acima assume é que **cobrir por uso rende mais que cobrir
por índice do manual**: as fases 1 a 4 são o que uma central de serviços
faz todo dia, e as 5 a 8 são inventário e periferia — muito esquema,
muita tela de cadastro, pouco uso por dia trabalhado.

Dois pontos que podem reordenar tudo, e valem ser resolvidos antes da
Fase 5:

1. **O que a base real tem.** `scripts/coletar-glpi.sh` conta as linhas
   de cada área. Se `glpi_racks` estiver vazia, a Fase 7 é cadastro que
   ninguém vai preencher, e o esforço rende mais adiantando a Fase 6.
2. **Onde o inventário nasce.** Se o agente de inventário do GLPI
   continuar rodando, a Fase 7 é receber o que ele manda; se não, é
   cadastro manual, e o desenho muda.

A migração (`docs/09-migracao.md`) acontece no **fim da Fase 2**, não no
fim da paridade. Enquanto uma área não estiver coberta, ela continua
consultável no GLPI de legado — que é justamente o que torna possível
migrar antes de cobrir tudo.

A tentação continua sendo fazer todo o CRUD de configuração primeiro,
porque é fácil. A regra que ordenou a Fase 1 vale para as demais:
**chamado antes de configuração, canal antes de relatório, uso antes de
catálogo.**
