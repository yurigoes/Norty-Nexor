# 08 — Design e telas

## 0. Uma ressalva honesta sobre a referência

A referência pedida foi **`licita.norty.com.br`**. A sessão que produziu
este projeto **não conseguiu acessá-la**: o container remoto não tem
Tailscale nem chave SSH para o `thor`, e o proxy de egresso bloqueia
`*.norty.com.br` (testado em `licita.norty.com.br`,
`desk.norty.com.br` e na porta 22 de `100.91.185.42`).

O que este documento define, então, é um sistema **derivado da
identidade Norty** — a mesma paleta preto + dourado do my Home, com a
densidade ajustada para ferramenta de trabalho. Tudo é token
(`apps/web/src/styles/tokens.css`), de propósito: quando as capturas do
licita chegarem, o realinhamento é **trocar valores em um arquivo**, não
reescrever componente.

O que precisa vir do licita para fechar o alinhamento:

1. Capturas da tela de listagem e de uma tela de detalhe.
2. A paleta em hex (fundo, superfície, texto, acento, semânticas).
3. A família tipográfica e os pesos usados.
4. Raio de canto, sombra e altura de linha de tabela.
5. Se a barra lateral é escura ou clara, fixa ou recolhível.

---

## 1. Princípios

1. **Densidade é funcionalidade.** A fila é onde o agente passa o dia.
   Linha de 44px, fonte de 13px, oito colunas visíveis. Respiro
   generoso custa chamados por tela.
2. **Cor comunica ou não existe.** Cinco níveis de prioridade não viram
   cinco bolhas coloridas — viram um traço de 3px numa escala do frio ao
   quente. Vermelho é alerta real.
3. **Sobre dourado, texto preto.** Branco sobre dourado não atinge
   contraste. Regra herdada da identidade Norty e não negociável.
4. **Ação primária é grafite, não dourado.** O dourado é acento de
   marca. Um botão dourado por tela deixa de ser destaque.
5. **Nota interna é visualmente inconfundível.** Fundo dourado claro,
   borda dourada, etiqueta explícita. Confundir nota interna com
   resposta pública é o pior erro que este produto pode cometer.

## 2. Tokens

Definidos em `apps/web/src/styles/tokens.css`. Grupos:

| Grupo | Exemplos |
|---|---|
| Marca | `--nd-ink`, `--nd-gold`, `--nd-black` |
| Superfícies | `--surface-app`, `--surface-card`, `--surface-inverse` |
| Texto | `--text-strong`, `--text-muted`, `--text-inverse` |
| Semântica | `--success`, `--warning`, `--danger`, `--info` |
| **Prioridade** | `--prio-1` … `--prio-5` |
| **SLA** | `--sla-ok`, `--sla-atencao`, `--sla-estourado` |
| **Canal** | `--canal-web`, `--canal-email`, `--canal-whatsapp`, `--canal-api` |
| Tipografia | `--text-xs` (11px) … `--text-2xl` (28px) |
| Espaçamento | escala de 4: `--space-1` … `--space-16` |
| Shell | `--sidebar-width`, `--topbar-height`, `--queue-row-height` |

Três grupos são específicos do Desk e não existiam no my Home:
prioridade, SLA e canal. O canal ter cor própria é o que permite o
agente ver de onde veio a mensagem sem ler o rótulo.

## 3. Layout do aplicativo

```
┌────────────┬──────────────────────────────────────────────┐
│            │  busca                        [Novo chamado] │  52px
│  Norty     ├──────────────────────────────────────────────┤
│  Desk      │                                              │
│            │                                              │
│  FILA      │              conteúdo                        │
│  Meus    4 │                                              │
│  Do time 12│                                              │
│  Sem atr. 3│                                              │
│  SLA      1│                                              │
│            │                                              │
│  TRABALHO  │                                              │
│  Base ...  │                                              │
│  Aprovações│                                              │
│  Painéis   │                                              │
│            │                                              │
│  CONFIG.   │                                              │
│  ...       │                                              │
└────────────┴──────────────────────────────────────────────┘
   232px
```

Barra lateral escura (`--surface-inverse`), fixa. As visões de fila vêm
primeiro, com contador — é a primeira coisa que o agente olha ao chegar.
Configuração fica no fim: entra-se lá uma vez por mês.

## 4. As telas

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

## 5. A fila

```
Nº     Assunto                        Status      Prio  Solicitante  Atribuído   SLA      Atualizado
#1042  ● Impressora do 3º andar…      Atribuído   ▌4    Marina A.    Suporte N1  36min    09/09 10:30
#1051  ● Acesso ao sistema de ponto   Novo        ▌2    Rafael N.    —           1h 48min 09/09 11:12
#1038  ● Lote noturno abortou…        Pendente    ▌5    Monitorament Camila D.   -42min   09/09 08:20
```

- **`●`** — cor do canal de origem. Verde é WhatsApp, azul-ardósia é
  e-mail, roxo é API.
- **`▌`** — traço de prioridade, na escala fria→quente.
- **SLA** — três estados. Verde no prazo, âmbar abaixo de 1 hora,
  vermelho estourado (com sinal negativo).

Visões salvas como abas: Todos · Meus · Sem atribuição · SLA estourando.
Seleção múltipla com ação em lote e atalhos de teclado
(`j`/`k` navega, `a` atribui, `e` responde).

## 6. A tela de chamado

Duas colunas: timeline à esquerda, propriedades à direita (340px,
grudada no topo ao rolar).

Cada evento da timeline mostra: ponto do canal, autor, canal por
extenso, data, e a etiqueta "Nota interna" quando for o caso. Eventos de
sistema (mudança de status, pausa de SLA) aparecem na mesma linha do
tempo, em tom mais discreto.

A caixa de resposta é fixa no fim da timeline, com dois seletores:

- **Visibilidade** — Resposta pública / Nota interna.
- **Canal de saída** — "Canal de origem" (padrão) / E-mail / WhatsApp.

O padrão responder pelo canal de origem é o que impede o agente de
mandar e-mail para quem falou por WhatsApp.

## 7. Acessibilidade

- Contraste mínimo 4.5:1 em texto de corpo; 7:1 em texto sobre dourado
  (garantido por texto preto).
- Foco visível com anel dourado de 3px (`--focus-ring`) em todo elemento
  interativo.
- Estado nunca é comunicado só por cor: status tem rótulo, prioridade
  tem número, SLA tem tempo.
- `prefers-reduced-motion` zera as transições.
- Tabela com `<th scope="col">` e cabeçalho fixo.

## 8. Como realinhar ao licita quando as capturas chegarem

1. Trocar os valores de marca e superfície em `tokens.css`.
2. Ajustar `--font-sans`, a escala de `--text-*` e os `--radius-*`.
3. Ajustar `--sidebar-width`, `--topbar-height`, `--queue-row-height`.
4. Se a barra lateral for clara no licita, trocar `--surface-inverse` por
   `--surface-card` na regra `.sidebar` de `base.css` — é o único ponto
   que precisa mudar fora dos tokens.

Nenhum componente React precisa ser tocado.
