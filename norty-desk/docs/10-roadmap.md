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

## Fase 2 — Canais e prazos — **entregue**

O que diferencia o Desk do GLPI.

| Entrega | Detalhe | Situação |
|---|---|---|
| **E-mail entrada** | IMAP + webhook, threading, limpeza de citação | pronto |
| **E-mail saída** | fila, `Message-ID`, `In-Reply-To`, remetente do time | pronto |
| **WhatsApp entrada** | webhook da Evolution, janela de conversa, menu | pronto |
| **WhatsApp saída** | texto e mídia, retentativa com backoff | pronto |
| **Anexo por canal** | foto e PDF do WhatsApp, anexo de e-mail | pronto |
| Diagnóstico de canal | mensagem original, motivo do descarte, reprocessar | pronto |
| Configuração de canal | conta por tipo, segredo cifrado, testar e coletar | pronto |
| SLA e OLA | aplicação, pausa, retomada, cumprimento, violação | pronto |
| Escalonamento | níveis com critérios e ações, cron | pronto |
| Motivos de pendência | cobrança automática e resolução por inatividade | pronto |
| Regras de entrada | classificação automática na abertura | pronto |
| Intake público | `ApiKey` com escopos, `Idempotency-Key` | pronto |

**Pronto quando:** um cliente abre chamado por WhatsApp, manda uma foto,
recebe resposta no WhatsApp, e o SLA é medido corretamente com o
expediente do calendário. — **atingido.**

**Verificação:** 151 testes de ponta a ponta e de unidade contra
Postgres real. Cobrem o threading de e-mail, a janela de conversa do
WhatsApp, a cifragem dos segredos de canal, a idempotência da entrada, o
escalonamento e a cobrança de pendência. Dois deles existem só para
provar que nota interna não sai por canal externo — um pela fila normal,
outro forjando a linha de saída para exercitar a segunda verificação.

**Segredo de canal.** Senha de IMAP, chave da Evolution e segredo de
webhook são cifrados em AES-256-GCM (`v1:<iv>:<tag>:<cifrado>`) com
`CHANNEL_SECRET_KEY`. A API nunca devolve o valor: a tela recebe `true`
ou `false` — se existe, não qual é — e devolver o booleano ao salvar
preserva o que já estava lá. Sem isso, renomear um canal apagaria a
senha da caixa.

**O que ficou de fora e por quê:** a tela de configuração de regras de
entrada. O motor, a API e os testes existem; falta o construtor visual
de critérios, que pertence à mesma tela de configuração de categorias da
Fase 3. Até lá as regras se criam pela API.

---

## Fase 3 — Operação madura — **entregue**

O que faz a operação escalar.

| Entrega | Detalhe | Situação |
|---|---|---|
| Aprovações | etapas com quórum, decisão pelo portal | pronto |
| Base de conhecimento | artigos, revisões, sugestão por similaridade | pronto |
| Painéis | agente, time, organização | pronto |
| Relatório de SLA | cumprimento por período, categoria, time, acordo | pronto |
| Ativo simples | equipamento vinculável a chamado (sem CMDB) | pronto |
| Satisfação | pesquisa pós-fechamento, pelo canal de origem | pronto |
| Webhooks de saída | assinatura HMAC, retentativa, log | pronto |
| Ações em lote | atribuir, classificar, mudar status em massa | pronto |
| Auditoria | trilha de configuração | pronto |
| Transcrição de áudio | Ollama do CT 102 sobre áudio do WhatsApp | pronto |

**Verificação:** 255 testes contra Postgres real, mais passeios de
navegador em cada tela nova.

**As decisões que mais importam desta fase**

- **O quórum de aprovação encerra a etapa nas duas pontas**: quando os
  "sim" chegam, e quando eles se tornam impossíveis. Sem a segunda, um
  chamado esperaria para sempre por quem nunca respondesse.

- **Todo indicador do painel carrega o filtro que o reproduz.** Número
  sem caminho de volta para as linhas que o formaram é número que
  ninguém confere.

- **O ativo é raso de propósito.** O inventário do GLPI são 60 tabelas e
  um agente de coleta, e é por isso que o campo do chamado fica vazio.

- **A pesquisa de satisfação abre sem login.** Exigir senha de quem só
  quer dar uma nota é o jeito mais eficiente de não receber nota
  nenhuma.

- **Webhook não entrega para rede interna.** Sem essa recusa, quem
  tivesse `config:webhooks` transformaria a API num scanner da rede.

- **A trilha registra o diff, e segredo nunca entra nela** — nem o
  valor antigo.

**Também entrou nesta fase:** as telas de configuração de categorias,
acordos de SLA, calendários e motivos de pendência — as quatro que a
barra lateral mostrava apagadas desde a Fase 1. A API dos acordos,
calendários e motivos não existia: eles só se criavam por SQL, o que na
prática significa que ninguém os configurava.

**O que continua de fora:** a tela de pessoas e times (a API existe), e
o construtor visual de regras de entrada (o motor e a API existem).

---

## Fase 4 — ITIL completo

- **Problema** — causa raiz, chamados vinculados, base de erros
  conhecidos. ✅ *(entregue — `docs/07-api.md`, seção 11)*
- **Mudança** — aprovação, janela de execução, plano de recuo.
  ✅ *(entregue — `docs/07-api.md`, seção 12)*
- **Chamado recorrente** — manutenção preventiva em agenda.
  ✅ *(entregue — `docs/07-api.md`, seção 13)*
- **Formulário dinâmico por categoria** — o `TicketForm` que ficou da
  Fase 1, com a tela de configuração que o alimenta.
  ✅ *(entregue — `docs/07-api.md`, seção 14)*
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
