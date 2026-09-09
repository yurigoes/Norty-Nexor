# 08 — Design e telas

## 0. A referência: LICITA+

O sistema de design do Desk é o do **LICITA+** (`@nexor/licita-mais`),
adotado inteiro. Dois produtos da mesma casa não devem parecer de casas
diferentes.

Levantado do código em produção — CT 103 Vanaheim, `/opt/licita-mais`,
`licita-web` na porta 3500. Foram lidos os quatro arquivos:
`tokens.css`, `base.css`, `layout.css` e `components.css` (72 KB no
total). O Desk adota os quatro: os tokens, o reset, o shell e a
biblioteca de componentes.

| | LICITA+ |
|---|---|
| Fonte | Manrope 400–800, do Google Fonts |
| Institucional, sidebar | `--azul-900` `#071E3D`, com gradiente até `#061834` |
| Ação, navegação, ativo | `--azul-600` `#005CA9` |
| Dado, gráfico, interação | `--azul-500` `#1677E8` |
| Sucesso | `--verde-600` `#008C45` |
| Acento raro | `--amarelo` `#FFCC00` |
| Neutros | cinza com viés azul, `#F5F7FA` → `#10233F` |
| Raio | 8 a 16; sem pílula em superfície grande |
| Sombra | muito suave — a elevação vem da borda |
| Transição | 150–300 ms |
| Layout | sidebar 264/76, header 68, conteúdo 1440 |

### A regra do amarelo

`#FFCC00` rende **1.4:1** sobre branco. Ele nunca recebe texto por cima
nem carrega texto sozinho. Onde a cor precisa virar texto, entra
`--amarelo-texto` `#8A6200`.

Isso vale integralmente no Desk, e é o que decide dois pontos:

- **O botão primário é azul, não amarelo.** O amarelo não tem contraste
  para carregar rótulo.
- **O SLA "atenção" usa `--amarelo-texto` sobre `--amarelo-50`**, não o
  amarelo vivo.

O amarelo vivo aparece em duas formas puras — o ponto do canal API e o
traço de prioridade 4 — onde não há texto envolvido.

---

## 1. O que o Desk acrescenta

Quatro grupos de token, marcados com `[DESK]` no arquivo. Todos derivam
das mesmas rampas: **nenhum hex novo foi inventado.** São escalas que um
catálogo de licitações não precisa e uma central de serviços não vive
sem.

### Prioridade — escala ordinal de 5 passos

```
--prio-1  cinza-400     --prio-4  amarelo-500  (traço)
--prio-2  azul-400      --prio-4-texto  amarelo-texto
--prio-3  azul-600      --prio-5  vermelho-600
```

Segue a convenção que o LICITA+ já usa nas faixas de compatibilidade: **o
traço usa o tom vivo, o texto usa o tom escuro.** E, como lá, a
prioridade também aparece por extenso ("Alta") na tela de chamado — a
informação nunca depende só da cor.

A forma é um **traço de 3px**, não uma bolha. Cinco bolhas coloridas por
linha transformam a fila num carnaval e param de comunicar.

### SLA — três estados

```
--sla-ok         verde-600      no prazo
--sla-atencao    amarelo-texto  menos de 1 hora
--sla-estourado  vermelho-600   prazo vencido (tempo em negativo)
```

Três estados e nada mais. Uma barra de progresso contínua não ajuda
ninguém a decidir o que fazer agora.

### Canal — categórico

```
--canal-web       cinza-500     mais comum → mais mudo
--canal-email     azul-600
--canal-whatsapp  verde-500
--canal-api       amarelo-500   mais raro → o acento
--canal-sistema   cinza-300     ruído de fundo
```

O mais comum recebe o tom mais mudo e o mais raro recebe o acento — que
segue raro, como o sistema manda. É um ponto de 7px na fila e na
timeline: o agente vê de onde veio a mensagem sem ler o rótulo.

### Métrica da fila

```
--fila-linha-alt  46px    a fila é onde o agente passa o dia
```

Um token só. O trilho de propriedades do chamado **não** ganhou token
próprio: usa os 336px do `.grade-conteudo-trilho` do LICITA+ — a mesma
grade que lá serve a "edital + resumo" serve aqui a "conversa +
propriedades". Um token a mais para repetir medida existente seria
divergência disfarçada de configuração.

O header de 68px fica como está. A linha de tabela é do Desk e é baixa
de propósito: o padrão de 16px de padding daria ~56px por linha e
custaria três chamados por dobra. Entrou como `.tabela.-densa` —
modificador, não alteração do padrão.

---

## 2. Princípios

1. **Densidade é funcionalidade.** Linha de 46px, fonte de 13px
   (`--t-label`), oito colunas visíveis.
2. **Cor comunica ou não existe.** Estado nunca é comunicado só por cor:
   status tem rótulo, prioridade tem número e nome, SLA tem tempo.
3. **A elevação vem da borda.** Sombra é para o que flutua de verdade —
   modal, menu. Cartão e tabela usam `--borda`.
4. **Nota interna é visualmente inconfundível.** Fundo `--amarelo-50`,
   borda `--amarelo-100` e o selo escrito. Três sinais, nenhum deles
   só de cor. Confundir nota interna com resposta pública é o pior erro
   que este produto pode cometer.
5. **Evento de sistema é ruído de fundo.** Borda tracejada, fundo
   transparente, texto menor: registra sem interromper a leitura da
   conversa.

---

## 3. Convenção de nomes

Do LICITA+, e vale para todo componente novo:

```
.componente          o bloco
.componente-parte    as partes
.-modificador        a variante
```

O traço inicial do modificador evita colisão com nome de bloco na
cascata: `.btn.-primario`, `.selo.-aviso`, `.tabela.-densa`.

Duas consequências práticas no Desk:

- **Modificador de prioridade é palavra, não número.** `.prio.-alta`,
  não `.prio.-4` — `.-4` é identificador CSS inválido, e a palavra é o
  que o usuário lê de qualquer forma.
- **Modificador de canal é minúsculo.** O domínio usa `WHATSAPP`; o CSS
  usa `.-whatsapp`. A tradução mora em `modificadorCanal()`, num lugar
  só.

## 4. Arquivos

Mesma divisão do LICITA+, mesma ordem de cascata:

```
src/styles/tokens.css       cor, tipo, espaço, raio, sombra, camada, transição
src/styles/base.css         reset, tipografia, foco, rolagem, pular-para-conteúdo
src/styles/layout.css       shell, sidebar, header, conteúdo, grades, gaveta mobile
src/styles/components.css   a biblioteca
```

`portal.css` entra na Fase 2, ocupando o lugar que o `publico.css` ocupa
no LICITA+.

## 5. O que veio, o que não veio, o que o Desk somou

**Adotados sem alteração** (33 componentes): `.btn` e variantes,
`.btn-icone`, `.btn-link`, `.campo`/`.input`/`.select`/`.textarea`,
`.busca`, `.check`, `.switch`, `.campo-grupo`, `.divisor-texto`,
`.card`, `.selo`, `.stat`, `.tabela` e o par
`.tabela-caixa`/`.tabela-rolagem`, `.abas`, `.progresso-trilho`,
`.avatar`, `.modal`, `.gaveta`, `.dropdown`, `.tip`, `.toast`,
`.alerta-bloco`, `.faixa-demo`, `.vazio`, `.sk`, `.filtro-pill`,
`.filtro-chip`, `.gr-*`, `.notif`, `.paginacao`, `.aparece`.

**Não vieram**, porque são do domínio ou da marca do LICITA+:
`.score` (compatibilidade), `.oport` (cartão de oportunidade),
`.razoes`, `.geo` (geometria decorativa), a tela de carregamento
`.lm-*` e o losango de fundo da sidebar. Repetir a forma de outro
produto seria empréstimo, não sistema.

**Somados pelo Desk**, na mesma convenção:

| Componente | Para quê | Modelado em |
|---|---|---|
| `.prio` | prioridade, com ponto e palavra | `.score-pill` |
| `.sla` / `.sla-selo` | prazo em três estados | — |
| `.canal` | ponto de origem da mensagem | — |
| `.conversa` / `.conversa-evento` | a linha do tempo do chamado | — |
| `.responder` | caixa de resposta com visibilidade e canal | — |
| `.chamado-card` | a fila abaixo de 760px | `.oport` |
| `.tabela.-densa` | linha de 46px na fila | modificador |
| `.aba-contagem` | contador na aba de visão | `.nav-item-contagem` |
| `.nav-item-contagem.-alerta` | SLA estourando na navegação | modificador |
| `.timeline.-recusado` | etapa de aprovação recusada | modificador |

**Uma colisão de nome resolvida com cuidado:** `.timeline` no sistema é
a linha de **etapas** — ponto, conector, `-feito`/`-agora`. No Desk ela
serve à **aprovação em etapas**, que é exatamente esse desenho. A linha
do tempo do chamado é outra coisa e chama-se `.conversa`. Manter o nome
com o significado de origem evita que os dois produtos divirjam
silenciosamente no mesmo seletor.

**Verificação automática:** 134 tokens definidos, nenhum token
indefinido em uso, nenhum hex literal fora de `tokens.css`, nenhuma
classe usada na marcação sem regra no CSS.

## 6. Onde o Desk diverge do LICITA+, e por quê

| | LICITA+ | Desk | Motivo |
|---|---|---|---|
| Front-end | JS puro em ESM, servidor próprio (`scripts/servidor.mjs`) | React + Vite | A timeline do chamado é estado vivo — evento chegando por canal externo, SLA em contagem regressiva, resposta otimista. É onde um framework paga o próprio custo. Num catálogo majoritariamente de leitura, não paga. |
| API | NestJS em `servidor/` | NestJS em `apps/api` | **Igual**, só o caminho muda |
| Domínio | `compartilhado/` | `packages/shared` | **Igual**, só o caminho muda |
| Pasta única | API dentro do front, para não criar bind-mount novo no CT 103 | monorepo com workspaces | O Desk vai para o **CT 105**, onde o bind-mount é por fase (`/srv/apps-fase3 → /opt/fase3`) e uma pasta nova não exige reiniciar o container |

A divergência de front-end é a única que vale discutir. Se a preferência
for paridade estrita com o LICITA+, o custo de trocar é real mas
contido: o CSS já está pronto e é o mesmo, a marcação é quase a mesma, e
o que se perde é a reatividade da timeline — que passaria a exigir
recarga manual ou código de sincronização escrito à mão.

---

## 7. Layout do aplicativo

```
┌──────────────────┬──────────────────────────────────────────┐
│                  │  busca                    [Novo chamado] │ 68px
│  ND  Norty Desk  ├──────────────────────────────────────────┤
│                  │                                          │
│  FILA            │                                          │
│  Meus         4  │              conteúdo                    │
│  Do meu time 12  │              (máx. 1440)                 │
│  Sem atribuição 3│                                          │
│  SLA estourando 1│                                          │
│                  │                                          │
│  TRABALHO        │                                          │
│  Aprovações      │                                          │
│  Minhas tarefas  │                                          │
│  Base de conh.   │                                          │
│  Painéis         │                                          │
│                  │                                          │
│  CONFIGURAÇÃO    │                                          │
│  …               │                                          │
└──────────────────┴──────────────────────────────────────────┘
       264px
```

Sidebar com o `--grad-sidebar` do LICITA+, `position: sticky` em altura
cheia. O item ativo recebe o `--grad-tecnologico` com sombra azul, como
lá. As visões de fila vêm primeiro, com contador: é a primeira coisa que
o agente olha ao chegar. Configuração fica no fim, e o rodapé traz a
conta.

Uma contagem pode gritar, e só uma: **SLA estourando** troca o cinza
translúcido por `--vermelho-500` (`.nav-item-contagem.-alerta`). É o
único vermelho da navegação, e é por isso que ele funciona.

Abaixo de 1024px a sidebar colapsa para 76px (só ícones); abaixo de
760px vira gaveta e a `.barra-inferior` assume — tudo herdado do
`layout.css` do LICITA+.

---

## 8. As telas

Trinta telas cobrem o que o GLPI faz em 315 páginas. A consolidação vem
de três decisões: uma timeline em vez de quatro abas, um formulário
declarado em vez de quatro tabelas de exceção, e o corte dos módulos de
inventário.

### Portal do solicitante (`/portal`) — 5 telas

| Tela | O que faz |
|---|---|
| Meus chamados | lista dos próprios, com status e prazo |
| Abrir chamado | três campos e um anexo. Nada mais |
| Chamado | timeline pública, caixa de resposta, anexos |
| Base de conhecimento | artigos marcados como públicos |
| Aprovações pendentes | aprovar ou recusar, com comentário |

### Aplicativo do agente (`/desk`) — 25 telas

**Atendimento (6)** — Fila · Chamado · Novo chamado · Aprovações ·
Minhas tarefas · Busca avançada

**Conhecimento (3)** — Artigos · Artigo · Editor com revisões

**Painéis (4)** — Meu painel · Painel do time · Painel da organização ·
Relatório de SLA

**Configuração (12)** — Categorias · Formulários · Acordos (SLA e OLA) ·
Níveis de escalonamento · Calendários · Feriados · Motivos de pendência ·
Regras de entrada · **Canais** · **Diagnóstico de canal** · Times e
pessoas · Chaves de API e webhooks

A tela de **diagnóstico de canal** não existe no GLPI e é uma das mais
importantes: quando um e-mail não vira chamado, ela mostra a mensagem
original, o motivo do descarte e um botão de reprocessar.

---

## 9. A fila

```
Nº     Assunto                       Status      Prio  Solicitante  Atribuído   SLA      Atualizado
#1042  ● Impressora do 3º andar…     Atribuído   ▌4    Marina A.    Suporte N1  36min    09/09 10:30
#1051  ● Acesso ao sistema de ponto  Novo        ▌2    Rafael N.    —           1h 48min 09/09 11:12
#1038  ● Lote noturno abortou…       Pendente    ▌5    Monitoramen  Camila D.   -42min   09/09 08:20
```

Visões salvas como abas: Todos · Meus · Sem atribuição · SLA estourando.
Seleção múltipla com ação em lote e atalhos de teclado (`j`/`k` navega,
`a` atribui, `e` responde).

---

## 10. A tela de chamado

Duas colunas: timeline à esquerda, painel de propriedades à direita
(340px, grudado no topo). Abaixo de 1100px vira uma coluna só.

A caixa de resposta é fixa no fim da timeline, com dois seletores:

- **Visibilidade** — Resposta pública / Nota interna.
- **Canal de saída** — "Canal de origem" (padrão) / E-mail / WhatsApp.

O padrão responder pelo canal de origem é o que impede o agente de
mandar e-mail para quem falou por WhatsApp.

---

## 11. Acessibilidade

Herdada do LICITA+ e mantida:

- `pular-para-conteudo` como primeira parada do Tab.
- Anel de foco `--sombra-foco` em todo elemento interativo, definido uma
  vez em `base.css` e não renegociado por componente.
- Contraste mínimo 4.5:1 em texto de corpo. O amarelo nunca carrega
  texto.
- Estado nunca comunicado só por cor.
- `prefers-reduced-motion` zera as três transições.
- Tabela com `<th scope="col">` e cabeçalho fixo; painel e navegação com
  `aria-label`.

---

## 12. O que ainda falta

O alinhamento de código está fechado: tokens, reset, shell e biblioteca
de componentes vieram do LICITA+ e estão em uso.

Falta o que o CSS não mostra: **duas capturas de tela** — uma listagem e
uma tela de detalhe. Proporção real, densidade percebida e hierarquia
visual só a imagem resolve. São elas que dizem se a fila do Desk está
apertada ou frouxa perto do que vocês já usam.

Um detalhe menor, quando houver: o `publico.css` do LICITA+ (12 KB) vira
a base do `portal.css` do solicitante, na Fase 2.
