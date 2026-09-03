# Conciliação de etiquetas — baixa, cancelamento e alerta

Desenho do mecanismo central do produto: cada pesagem vira uma **etiqueta
com identidade**, que precisa ser **baixada** no caixa. O que não baixa,
alerta. O que é cancelado, volta ao setor e é registrado com o produto na
mão.

> Complementa `estudo-antifraude-balanca-cftv.md`. Aqui está a lógica de
> negócio; lá estão hardware, CFTV e fases.

---

## 1. O problema que precisa ser resolvido primeiro

**A etiqueta de balança, do jeito que sai de fábrica, não tem identidade.**

O código de barras de produto pesável é um EAN-13 que começa com `2`:

```
2 PPPPP QQQQQQ D
│ │     │      └─ dígito verificador
│ │     └──────── peso (em gramas) ou preço, conforme configuração da loja
│ └────────────── código interno do produto (PLU)
└──────────────── prefixo de código variável
```

Não há número de série. **Duas embalagens da mesma carne com o mesmo peso
geram códigos de barras idênticos.** Então não existe, no padrão, um
"passou esta etiqueta" — existe apenas "passou uma etiqueta deste produto
com este peso".

Isso não inviabiliza nada, mas define o desenho inteiro. Ignorar esse
fato é o erro clássico de quem tenta montar esse sistema e descobre no
piloto que a baixa não fecha.

### 1.1 Três estratégias de identidade

| Estratégia | Como | Conciliação | Requer |
|---|---|---|---|
| **A. Multiset** (base) | Usa o EAN pesável como está | Estatística exata por contagem | Nada — funciona em qualquer loja |
| **B. Serial no GS1** | Balança imprime **GS1 DataBar Expanded / Code 128** com AI de série | Unitária, exata | PDV que leia DataBar com AIs |
| **C. QR paralelo** | Segundo código na etiqueta, lido no posto de estorno | Unitária no estorno; multiset no caixa | Layout de etiqueta customizado |

O MGV7 da Toledo permite configurar **Code 128 e GS1 DataBar Expanded**
na composição do código de barras da etiqueta, além do EAN-13 — e o
MGV6 tem campos extras de layout (`Campext1.txt`, `Campext2.txt`).
**A confirmar com a Toledo:** se a composição aceita um campo de
sequencial/serial da transação (AI 21) ou se dá para injetar o serial por
campo extra. Se aceitar, a estratégia B vira o tier premium.

**Decisão:** construir sobre a **A**, porque ela funciona em 100% das
lojas sem tocar no PDV do cliente. B e C entram como *upgrade* de
precisão onde o parque permitir. Nunca depender de B para o produto
existir.

---

## 2. Conciliação por multiset

### 2.1 A conta

Por loja, por SKU, por dia (ou turno):

```
não_baixadas(sku, peso) = emitidas − vendidas − canceladas
```

- **> 0** → saiu produto sem passar no caixa → **ALERTA**
- **= 0** → fechou
- **< 0** → vendeu mais do que pesou → etiqueta de outro dia, reimpressão
  não registrada ou falha de captura → **INVESTIGAR** (não é fraude do
  açougue, mas é buraco no dado)

A chave é `(lojaId, sku, peso)` — e o peso tem três casas, então dentro
de um dia a colisão é rara. Onde colide, a contagem resolve: se foram
impressas 3 etiquetas de "picanha 0,842 kg" e o caixa registrou 2, falta
uma. Não sabemos *qual* das três — mas sabemos que falta uma, e as três
têm clipe de vídeo, operador e horário.

### 2.2 Atribuição ao evento

Para investigar, o alerta precisa apontar para uma pesagem específica.
Dentro da mesma chave, casamento **FIFO por horário**: a etiqueta mais
antiga casa com a venda mais antiga. É heurística e está documentado que
é. O que a prevenção de perdas precisa é "sobrou uma picanha de 0,842 kg
pesada pelo operador X por volta das 14h32" — e disso a heurística dá
conta.

Onde o PDV arredonda peso ou valor, o casamento é por **menor diferença**
dentro da mesma SKU e da janela de tempo, com tolerância configurável.

### 2.3 Janela de conciliação

Etiqueta pesada às 14h32 pode passar no caixa às 15h10 — ou no dia
seguinte, se for produto embalado com validade longa. A janela é
**configurável por setor/SKU** (padrão sugerido: fim do dia + 4 h para
açougue/padaria; até a validade impressa para embalados). Só ao fim da
janela a etiqueta vira `NAO_CONCILIADA` e abre alerta.

---

## 3. De onde vem o dado do caixa

### 3.1 NFC-e / SAT — a integração que faz o SaaS existir

Toda venda no varejo brasileiro emite **NFC-e** (ou **SAT-CF-e** em SP).
O XML autorizado traz item a item: código, EAN, quantidade, valor.

Um agente na retaguarda observa a pasta de XMLs autorizados (ou o banco
do PDV) e alimenta a conciliação.

**Por que isso importa para vender SaaS:** é *uma* integração que
funciona com Consinco, Linx, VR, CISS, Millennium, Casa Magalhães e
qualquer outro — porque todos emitem o mesmo documento fiscal. Integrar
PDV por PDV mataria a escala comercial do produto. Esta é a decisão
arquitetural mais importante do projeto.

**Limitações, que o desenho tem de absorver:**

1. O XML só existe na **conclusão da venda** — latência de segundos a
   minutos. Aceitável: a conciliação não é tempo real.
2. Venda em **contingência offline** autoriza depois. Estados
   `aguardando` precisam existir.
3. **Item cancelado no meio da venda nunca aparece no XML.** Ele
   simplesmente não está lá — indistinguível de um item que nunca passou.

### 3.2 O item 3 é a razão do posto de estorno

Do ponto de vista fiscal, "cancelado no caixa" e "nunca passou no caixa"
são o **mesmo dado**: ausência. Sem uma segunda fonte, todo cancelamento
legítimo viraria alerta falso — e o painel morreria afogado em ruído em
uma semana.

O posto de estorno no setor resolve isso pelo mundo físico: **o produto
volta**. Não é uma conveniência da operação, é o que fecha a equação.

Onde o PDV tiver API de eventos em tempo real, capturar o cancelamento
de item direto do caixa é um complemento (tier premium) que reduz o
vaivém — mas nunca substitui a volta física do produto, porque é
justamente a volta física que prova que o produto não saiu pela porta.

---

## 4. Máquina de estados da etiqueta

```
                     ┌──────────────┐
                     │   EMITIDA    │ ← pesagem registrada
                     └──────┬───────┘
        ┌───────────────────┼───────────────────┬────────────────┐
        │                   │                   │                │
  casou no XML        estorno no posto    janela expirou    reimpressão
        │                   │                   │                │
        ▼                   ▼                   ▼                ▼
 ┌─────────────┐    ┌──────────────┐   ┌─────────────────┐ ┌─────────────┐
 │ CONCILIADA  │    │  CANCELADA   │   │ NAO_CONCILIADA  │ │ REIMPRESSA  │
 │   (verde)   │    │  (vermelho)  │   │    ALERTA       │ │ (invalida a │
 └─────────────┘    └──────────────┘   └─────────────────┘ │   original) │
        │                                                   └─────────────┘
        │ peso/valor fora da tolerância
        ▼
 ┌─────────────┐
 │ DIVERGENTE  │ ← casou a SKU, não casou o peso → revisar vídeo
 └─────────────┘

 Estado especial:
 ┌────────────────────┐
 │  ESTORNO_ORFAO     │ ← estorno registrado para etiqueta que não tem
 │  ALERTA            │   sinal de passagem no caixa. Não absolve —
 └────────────────────┘   é suspeita própria (ver §6.1).
```

Regras que vivem **no banco**, não só na aplicação (regra 4 do
`CLAUDE.md`):

- `@@unique([lojaId, balancaId, sequencialTransacao])` — uma etiqueta por
  pesagem, sem duplicata por reenvio do agente.
- `@@unique([etiquetaId])` na tabela de estorno — uma etiqueta não pode
  ser cancelada duas vezes.
- `@@unique([nfceChave, nItem])` — um item fiscal casa com no máximo uma
  etiqueta.

---

## 5. O posto de estorno

Um mini-PC com leitor de código de barras, leitor RFID e **balança** no
setor. O leitor sozinho não basta — e o motivo está abaixo.

### 5.1 Fluxo

1. Operador aproxima o **crachá RFID**. Sem identificação não há estorno.
2. Lê o **código da etiqueta** com o scanner.
3. **Repesagem obrigatória:** põe o produto na balança do posto. O peso
   tem de bater com o da etiqueta dentro da tolerância.
4. Escolhe o **motivo** em lista fechada: desistência do cliente,
   código/peso errado, produto avariado, troca.
5. Sistema registra o estorno, dispara o overlay **em vermelho** na
   câmera do posto e grava o clipe.
6. Etiqueta física é invalidada (corte/carimbo) e o código é **queimado**
   no sistema — se reaparecer num XML depois, alerta.

### 5.2 Por que a repesagem não é opcional

Sem ela, "cancelar" é clicar num botão. Com ela, o funcionário precisa
ter o produto na mão — é a prova física de que a mercadoria voltou. É o
controle mais barato e mais forte do desenho inteiro, e a balança já
está a dois metros do posto.

### 5.3 Janela de estorno

Estorno só é considerado normal dentro de X minutos da passagem no caixa
(padrão sugerido: 30 min). Fora disso continua sendo registrado, mas
entra como `estorno_fora_de_janela` no painel — porque produto perecível
que passeia pela loja por duas horas e volta é, no mínimo, um problema
operacional.

---

## 6. Fraudes que o próprio sistema cria

Todo controle novo vira alvo. Estas precisam estar fechadas na v1:

### 6.1 Estorno fantasma

Cancelar etiquetas que nunca chegaram ao caixa, só para zerar o alerta de
"não passou". É o ataque óbvio.

Fechamento: (a) repesagem obrigatória — o produto tem de existir; (b)
estorno de etiqueta sem sinal de passagem no caixa vira
`ESTORNO_ORFAO`, que é alerta próprio e **não** limpa a pendência; (c)
taxa de estorno por operador é KPI no painel — quem estorna muito
aparece.

### 6.2 Reimpressão

Imprimir duas etiquetas para um produto: uma vai no produto, outra é
"cancelada" para fechar a conta.

Fechamento: reimpressão gera vínculo mãe→filha, invalida a mãe, conta no
KPI do operador e alerta acima do *baseline* do setor. Se a mãe
invalidada aparecer conciliada depois, é alerta duro.

### 6.3 Troca de etiqueta

Etiqueta de osso em peça de picanha. **A conciliação não pega** — as duas
etiquetas fecham perfeitamente.

Fechamento: é outra família de regra — plausibilidade de peso por SKU
(faixa histórica), margem por setor, e revisão de vídeo dos casos fora da
faixa. Está no motor de regras, não na conciliação. Importante não
prometer ao cliente que a baixa resolve isso.

### 6.4 Conluio com o caixa

O caixa registra e cancela o item para o cúmplice. Esse **a conciliação
pega**: sem estorno físico no setor, a etiqueta vence a janela e vira
`NAO_CONCILIADA`. É o caso que justifica o produto.

---

## 7. Overlay: cores e um detalhe de implementação

- **Branco/verde** — pesagem registrada (bancada da balança)
- **Vermelho** — cancelamento (posto de estorno)
- Amarelo/alerta é coisa de painel, não de overlay ao vivo

Detalhe que muda a escolha técnica: a **função POS** do gravador
costuma ter cor de texto **global**, configurada uma vez — não dá para
alternar por mensagem. Já o **CGI** expõe cor por título
(`VideoWidget[0].CustomTitle[n].FrontColor`).

Duas saídas: usar o caminho CGI para o posto de estorno, ou pré-configurar
dois `CustomTitle` (um branco, um vermelho) e escrever no slot certo
conforme o evento. A segunda é mais robusta e serve nos dois caminhos.

---

## 8. O painel

O que o gerente/prevenção de perdas abre de manhã:

| Bloco | Conteúdo |
|---|---|
| **Fechamento do dia** | Emitidas · Conciliadas · Canceladas · **Não conciliadas** — em peças e em R$ |
| **Fila de alertas** | Cada não conciliada com operador, horário, produto, peso, valor e **clipe de vídeo** ao lado |
| **Por operador** | Volume, taxa de cancelamento, taxa de reimpressão, taxa de não conciliação — com o *baseline* do setor ao lado |
| **Por SKU** | Onde a perda se concentra (quase sempre 3 ou 4 SKUs respondem por quase tudo) |
| **Por loja** | Só para rede — é o ranking entre lojas que vende o contrato |
| **Auditoria** | Quem assistiu qual clipe e quando (§ LGPD do outro documento) |

Regra de ouro do painel: **alerta que não tem vídeo do lado não é
usado**. A investigação tem de caber em um clique.

---

## 9. Modelo de dados (esboço)

```
Loja ─┬─ Setor ─┬─ Balanca ─── Etiqueta ─┬─ Estorno
      │         └─ PostoEstorno          ├─ ItemFiscal (casamento)
      ├─ Camera                          └─ Evidencia (clipe + hash)
      ├─ Operador ─── Cracha
      └─ DocumentoFiscal ─── ItemFiscal
```

`Etiqueta`: `lojaId, balancaId, sequencialTransacao, operadorId, sku,
pesoGramas, valorCentavos, codigoBarras, serial?, emitidaEm, estado,
janelaAte, mae?`

Dinheiro em `Decimal(12,2)`; peso em **inteiro de gramas** — peso em
ponto flutuante quebra a chave de conciliação, e uma chave de conciliação
que não é exata destrói o produto.

Todo `where` começa por `lojaId`, resolvido no *guard* (regra 3 do
`CLAUDE.md`, com `condominiumId` → `lojaId`).

---

## 10. Consequências para o SaaS

1. **Instalação sem engenheiro.** Loja nova = ligar o *edge*, ler um QR de
   provisionamento, apontar a pasta de XMLs. Se precisar de um técnico
   por loja, o modelo não fecha.
2. **Offline é o caso normal**, não a exceção. O *edge* tem fila local e
   reenvio; nenhum evento se perde por queda de link.
3. **Tempo até o primeiro valor.** Nas primeiras 48 h o cliente tem de ver
   o primeiro "não conciliada" com vídeo. É o que fecha a venda.
4. **Período de calibração.** As duas primeiras semanas geram alerta
   demais (janela mal ajustada, SKU mal cadastrada, XML incompleto). Isso
   é esperado e precisa estar no *onboarding* — cliente que vê 400
   alertas no dia 1 cancela no dia 10.
5. **Empacotamento sugerido**

   | Tier | Entrega |
   |---|---|
   | Registro | Overlay na câmera, evento gravado, busca de vídeo por operador/produto |
   | Conciliação | + NFC-e/SAT, posto de estorno, alertas, painel de perdas |
   | Prevenção | + serial GS1 (baixa unitária exata), regras avançadas, multiloja, visão computacional |

   Preço por bancada monitorada/mês. A métrica de valor é perda evitada —
   e ela é mensurável já no primeiro mês, o que é raro e vale usar na
   proposta comercial.

---

## 11. O que muda nas fases

A Fase 2 do outro documento deixa de ser "reconciliação" genérica e passa
a ser este documento inteiro. Ordem sugerida:

1. Agente NFC-e/SAT + conciliação multiset + estados + alerta de não
   conciliada. *(sem isso, nada mais importa)*
2. Posto de estorno com crachá, repesagem e overlay vermelho.
3. Painel de fechamento e fila de alertas com vídeo.
4. KPIs por operador e *baselines* de reimpressão/estorno.
5. Serial GS1 onde o PDV suportar (tier Prevenção).

---

## 12. A confirmar antes de codar

1. Toledo: a composição do Code 128 / GS1 DataBar Expanded aceita um
   campo de **sequencial da transação** (ou AI 21)? Se sim, temos baixa
   unitária exata sem tocar no PDV.
2. Em que formato a balança expõe as transações emitidas e com que
   latência (item 5.5 do outro documento — segue sendo o risco nº 1).
3. O XML da NFC-e do PDV alvo traz o **EAN pesável completo** no item ou
   já o traduz para o código interno? Muda a chave de conciliação.
4. Prazo real entre pesagem e caixa em açougue/padaria/hortifruti — mede
   a janela padrão. Levantar com um cliente piloto, não chutar.

---

## Fontes

- Estrutura do EAN-13 de produto pesável — [Urano — Código de Barras / InStore Standards](http://www.urano.ind.br/integra/manual_integra/instore_standards.aspx), [Sicompra — configurar código de barras de balança](https://atendimento.sicompra.com.br/como-configurar-o-codigo-de-barras-de-balanca/), [EAN-13 (Wikipédia)](https://pt.wikipedia.org/wiki/EAN-13)
- Composição do código na etiqueta Toledo — [MGV7 — configuração do código de barras](https://help.toledobrasil.com/mgv7/v7_0_/HTML_PAGES/configuracao_codigo_barras.html), [MGV7 — Code 128](https://help.toledobrasil.com/mgv7/v7_0_/HTML_PAGES/codigo_barras_Code128.html), [MGV6 — arquivos de cadastro](https://help.toledobrasil.com/mgv6/v1_6_/Html_Pages/arquivos_de_cadastro.html)
- Leitura de etiqueta de balança no PDV — [VR Software](https://vrsystem.info/publico/post/leitura-de-etiquetas-de-balanca-no-pdv/69ac0e5a-12c8-4b56-81ba-93adb4b38a38)
