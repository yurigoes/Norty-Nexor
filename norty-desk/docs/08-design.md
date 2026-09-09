# 08 — Design e telas

## 0. A referência: LICITA+

O sistema de design do Desk é o do **LICITA+** (`@nexor/licita-mais`),
adotado inteiro. Dois produtos da mesma casa não devem parecer de casas
diferentes.

Levantado do código em produção — CT 103 Vanaheim, `/opt/licita-mais`,
`licita-web` na porta 3500. A fonte de verdade lá é
`src/styles/tokens.css`, e a cascata é `tokens → base → layout →
components`. O Desk copia as duas coisas.

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
--painel-larg     340px   o painel é referência; quem rola é a timeline
```

O header de 68px do LICITA+ fica; a linha de tabela é do Desk, e é baixa
de propósito. Respiro generoso na fila custa contexto por tela.

---

## 2. Princípios

1. **Densidade é funcionalidade.** Linha de 46px, fonte de 13px
   (`--t-label`), oito colunas visíveis.
2. **Cor comunica ou não existe.** Estado nunca é comunicado só por cor:
   status tem rótulo, prioridade tem número e nome, SLA tem tempo.
3. **A elevação vem da borda.** Sombra é para o que flutua de verdade —
   modal, menu. Cartão e tabela usam `--borda`.
4. **Nota interna é visualmente inconfundível.** Fundo `--amarelo-50`,
   borda `--amarelo-100` e a etiqueta escrita. Três sinais, nenhum deles
   só de cor. Confundir nota interna com resposta pública é o pior erro
   que este produto pode cometer.
5. **Evento de sistema é ruído de fundo.** Borda tracejada, fundo
   transparente, texto menor: registra sem interromper a leitura da
   conversa.

---

## 3. Arquivos

Mesma divisão do LICITA+, mesma ordem de cascata:

```
src/styles/tokens.css       cor, tipo, espaço, raio, sombra, camada, transição
src/styles/base.css         reset, tipografia, foco, pular-para-conteúdo
src/styles/layout.css       casca, sidebar, cabeçalho, conteúdo, grade do chamado
src/styles/components.css   campo, botão, etiqueta, fila, timeline, painel
```

`portal.css` entra na Fase 2, ocupando o lugar que o `publico.css` ocupa
no LICITA+.

**Verificação automática:** 138 tokens definidos, nenhum componente
usando token inexistente, nenhum hex literal fora de `tokens.css`.

---

## 4. Onde o Desk diverge do LICITA+, e por quê

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

## 5. Layout do aplicativo

```
┌──────────────────┬──────────────────────────────────────────┐
│                  │  busca                    [Novo chamado] │ 68px
│  Norty Desk.     ├──────────────────────────────────────────┤
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

Sidebar com o gradiente `--grad-sidebar` do LICITA+. O item ativo é
`--azul-600` sólido — o mesmo azul da ação. As visões de fila vêm
primeiro, com contador: é a primeira coisa que o agente olha ao chegar.
Configuração fica no fim.

---

## 6. As telas

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

## 7. A fila

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

## 8. A tela de chamado

Duas colunas: timeline à esquerda, painel de propriedades à direita
(340px, grudado no topo). Abaixo de 1100px vira uma coluna só.

A caixa de resposta é fixa no fim da timeline, com dois seletores:

- **Visibilidade** — Resposta pública / Nota interna.
- **Canal de saída** — "Canal de origem" (padrão) / E-mail / WhatsApp.

O padrão responder pelo canal de origem é o que impede o agente de
mandar e-mail para quem falou por WhatsApp.

---

## 9. Acessibilidade

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

## 10. O que ainda falta do LICITA+

Tenho o `tokens.css` inteiro. **Faltam `base.css`, `layout.css` e
`components.css`** — eles estão no pacote que o coletor gerou
(`/tmp/licita-design-*/css/`) mas não foram lidos aqui.

Com eles eu fecho o alinhamento de componente: altura exata de campo e
botão, padding de célula, estilo de aba, tratamento de estado
`:disabled`, e o formato dos avisos. Hoje esses detalhes são coerentes
com os tokens, mas foram decididos por mim, não copiados.

Duas capturas de tela do LICITA+ — uma listagem e uma tela de detalhe —
resolveriam o resto: proporção, densidade real e hierarquia visual são
coisas que o CSS não mostra.
