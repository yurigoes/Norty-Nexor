# Conciliação de etiquetas — baixa, cancelamento e alerta

Desenho do mecanismo central do produto: cada pesagem gera uma etiqueta
que precisa ser **baixada** no caixa. O que não baixa, alerta. O que é
cancelado volta ao setor e é dado baixa passando a etiqueta num leitor.

Dois cenários, um motor só: balança que imprime **código único** (baixa
unitária exata) e balança convencional, onde a baixa se dá por **SKU +
peso + janela de tempo**, com fila de revisão humana para o ambíguo.

> Complementa [`estudo-antifraude-balanca-cftv.md`](./estudo-antifraude-balanca-cftv.md)
> (hardware, CFTV, fases) e [`perguntas-toledo.md`](./perguntas-toledo.md)
> (o que precisa ser confirmado com o fabricante).

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

## 2. Os dois cenários

O produto tem de funcionar nos dois, e o desenho é **um motor só** — o
serial, quando existe, é apenas um sinal forte a mais na função de
custo do casamento. Não são dois produtos.

### Cenário A — etiqueta com código único

A balança imprime um serial no código de barras. A baixa é **unitária e
determinística**: esta etiqueta passou ou não passou. A fila de revisão
humana praticamente desaparece.

**Deixou de ser hipotético.** O manual da Toledo Prix 5 Plus confirma um
segundo código de barras, Code 128, com uma composição — **Tipo 7**:
`EAN13 + peso/quantidade + data + hora + endereço da balança +
sequencial` — configurável localmente por parâmetro (C18), sem depender
do MGV7. Detalhe em
[`homologacao-toledo-prix5plus.md`](./homologacao-toledo-prix5plus.md)
§6. Falta confirmar largura e comportamento de reinício do contador,
mas a capacidade existe e é de fábrica.

Ainda depende de uma coisa que não é com a Toledo: o PDV do cliente
precisa **preservar** esse código até o registro da venda. Muitos PDVs
traduzem o código de pesável para o código interno e descartam o
original — e aí o serial não chega ao XML. Por isso o Cenário A é um
*upgrade* configurado balança a balança e validado PDV a PDV, nunca a
base do produto.

### Cenário B — etiqueta convencional

Código com PLU + peso, sem identidade. É o caso universal e é o que
sustenta o produto. Casa por **SKU + peso + janela de tempo**, com fila
de revisão humana para o que ficar ambíguo.

Todo o resto deste documento descreve o Cenário B. O Cenário A entra
como atalho: chegou serial e casou, vai direto para `CONCILIADA` com
confiança alta, pulando o casamento por peso.

---

## 3. Conciliação por peso e tempo (Cenário B)

### 3.1 O peso já é um quase-identificador

Corte de carne é irregular: o peso quase nunca se repete. Na prática,
`(SKU, peso em gramas)` é praticamente único dentro de um dia — o que
torna o casamento muito melhor do que o pior caso teórico.

A colisão real acontece em **porcionado e padronizado**: bandeja de
500 g de frango, frios fatiados em porção fixa, pão de forma. Nesses
casos o desempate é temporal.

### 3.2 O casamento

Dentro de cada SKU, casamento por **menor custo**:

```
custo(etiqueta, item_vendido) = w₁·|Δpeso| + w₂·|Δtempo|
```

com `Δtempo ≥ 0` (venda depois da pesagem) e dentro da janela do setor.
Etiqueta emitida às 14h32 casa com a venda das 15h10 sem drama. Onde o
PDV arredonda peso ou valor, a tolerância entra em `w₁`.

### 3.3 Níveis de confiança — o número que decide o produto

| Confiança | Condição | Destino |
|---|---|---|
| **Alta** | Peso exato, único naquela SKU no dia, dentro da janela | Conciliada automaticamente |
| **Média** | Peso exato mas repetido na SKU/dia; desempate temporal | Conciliada automaticamente, marcada |
| **Baixa** | Peso aproximado, fora da janela, ou sobra/falta na contagem | **Fila de revisão humana** |
| **Nenhuma** | Sem candidato até o fim da janela | Alerta direto |

A métrica de produto é a **taxa de auto-conciliação**, e ela é
existencial. Um açougue com 300 etiquetas/dia:

- 95% de auto-conciliação → fila de ~15 itens/dia → meia hora de
  trabalho, o cliente usa
- 70% → fila de 90 itens/dia → o cliente abandona no primeiro mês

Essa taxa precisa ser medida no piloto, monitorada por loja e por SKU, e
tratada como incidente quando cair. É o indicador de saúde do produto,
não um número de relatório.

### 3.4 A fila de revisão

É aqui que entra o operador do CFTV — mas o trabalho dele não pode ser
*seguir o cliente pela loja no vídeo*. Isso leva minutos por caso e não
escala.

O que a fila entrega em cada item:

- o **clipe da pesagem** (bancada, operador, produto, peso)
- os **candidatos de venda** que o motor achou no XML, ordenados por custo
- o **clipe do caixa** no horário de cada candidato

O revisor compara dois clipes e clica: **confirma** (vira `CONCILIADA`),
**rejeita** (vira `NAO_CONCILIADA` e abre alerta) ou **marca como
cancelada**. Segundos por caso, não minutos.

As decisões humanas alimentam o ajuste de `w₁`, `w₂` e da janela por
setor. Se o revisor confirma sempre o primeiro candidato, os pesos estão
bons e o limiar de "alta confiança" pode subir — encolhendo a fila
sozinho.

### 3.5 O fechamento agregado

Independente do casamento item a item, o fechamento do dia é uma conta
simples, por SKU:

```
não_baixadas = emitidas − vendidas − canceladas
```

Serve de conferência: se o casamento diz que fechou mas a contagem
agregada não fecha, há erro no motor ou buraco na captura do XML. Valor
negativo (vendeu mais do que pesou) aponta etiqueta de outro dia,
reimpressão não registrada ou falha de coleta — não é fraude do setor,
mas é dado furado e precisa aparecer.

## 4. De onde vem o dado do caixa

### 4.1 NFC-e / SAT — a integração que faz o SaaS existir

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

### 4.2 O item 3 é a razão do posto de estorno

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

## 5. Máquina de estados da etiqueta

Toda etiqueta nasce com o operador que a pesou — ou com a marca de que
**não houve identificação**. `operacao_sem_identificacao` não é um estado
da etiqueta: é um atributo dela, que vale vermelho no overlay e alerta
próprio, independente de a etiqueta conciliar ou não depois. Ver §5.7 do
estudo (bloqueio da balança e por que a detecção não pode depender dele).


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
 │  ESTORNO_ORFAO     │ ← estorno de etiqueta sem passagem no caixa.
 │  ALERTA (premium)  │   Só é detectável com integração de PDV que
 └────────────────────┘   exponha cancelamento de item — ver §7.1.
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

## 6. O posto de estorno

Um mini-PC com leitor de código de barras no setor, ao lado da balança,
e uma câmera apontada para ele.

### 6.1 Fluxo — um segundo, sem identificação

1. Passa a **etiqueta no leitor**.
2. Confirmação na tela e bipe.
3. Overlay **vermelho** na câmera do posto + clipe gravado.
4. Etiqueta invalidada; o código é **queimado** — se reaparecer num XML
   depois, alerta.

Pronto. Sem crachá, sem menu, sem motivo obrigatório.

### 6.2 Por que o estorno não pede identificação

Decisão deliberada, e ela se sustenta em três pontos:

1. **Quem responde é quem pesou.** A etiqueta já carrega o operador da
   pesagem. O cancelamento entra no KPI de quem *pesou*, não de quem
   *cancelou* — que é exatamente onde a responsabilidade deve estar.
2. **Atrito no estorno destrói o dado.** Se cancelar for chato, ninguém
   cancela; todo cancelamento legítimo vira alerta falso, a fila
   explode e o produto morre em um mês. Um fluxo de um segundo é o que
   garante adesão — e adesão é o que faz a conciliação fechar.
3. **A responsabilização vem do vídeo.** A câmera do posto grava quem
   passou a etiqueta e se havia produto na mão. Para saber quem foi, o
   clipe basta; o crachá seria redundância cara.

**Repesagem é opcional, não obrigatória.** Onde houver balança livre no
posto e a operação aceitar, ligar — é um controle forte de graça. Onde
o ritmo do setor não permitir, desligar e confiar no vídeo. Vira uma
configuração por cliente, não uma regra do produto.

### 6.3 Motivo do cancelamento

Opcional, em lista fechada de um toque (código errado, peso errado,
desistência, avaria). Se o operador não escolher em 3 segundos, grava
como `nao_informado` e segue. Motivo é dado de gestão, não pode virar
bloqueio de fluxo.

### 6.4 Janela de estorno

Estorno é normal dentro de X minutos da emissão da etiqueta (padrão
sugerido: 60 min, ajustável por setor). Fora disso continua sendo
aceito, mas entra como `estorno_fora_de_janela` no painel — perecível
que passeia pela loja por horas e volta é, no mínimo, um problema
operacional.

## 7. Fraudes que o próprio sistema cria

Todo controle novo vira alvo. Estas precisam estar fechadas na v1:

### 7.1 Estorno fantasma

Cancelar etiquetas cujo produto nunca voltou, só para zerar o alerta de
"não passou". É o ataque óbvio ao desenho sem crachá.

**Correção de uma afirmação anterior deste documento:** eu havia escrito
que o estorno de etiqueta "sem sinal de passagem no caixa" seria
detectável automaticamente. Não é — e a razão é a mesma do §4.2: item
cancelado no caixa e item que nunca passou são ambos *ausência* no XML.
No Cenário B sem integração com o PDV, **o sistema não distingue os
dois**. Melhor deixar isso explícito do que descobrir no piloto.

O que de fato fecha a brecha, em ordem de custo:

1. **KPI por quem pesou.** Taxa de estorno por operador contra o
   *baseline* do setor. Quem pesa e estorna muito acima da média
   aparece, mesmo que o estorno seja anônimo. É o controle mais forte e
   custa zero.
2. **Amostragem de vídeo.** Os clipes do posto existem; auditar uma
   fração aleatória mostra se havia produto na mão. Uma revisão semanal
   por setor já muda comportamento.
3. **Repesagem** (§6.2), onde a operação aceitar: elimina o ataque,
   porque exige o produto fisicamente.
4. **Integração com o PDV** expondo o cancelamento de item em tempo real
   (tier premium): aí o cruzamento passa a existir e `ESTORNO_ORFAO`
   vira detectável de verdade.

O estado `ESTORNO_ORFAO` continua no modelo — ele só é **preenchível no
tier premium**. No tier base, ele fica vazio, e é honesto dizer isso ao
cliente na proposta.

### 7.2 Reimpressão

Imprimir duas etiquetas para um produto: uma vai no produto, outra é
"cancelada" para fechar a conta.

Fechamento: reimpressão gera vínculo mãe→filha, invalida a mãe, conta no
KPI do operador e alerta acima do *baseline* do setor. Se a mãe
invalidada aparecer conciliada depois, é alerta duro.

### 7.3 Troca de etiqueta

Etiqueta de osso em peça de picanha. **A conciliação não pega** — as duas
etiquetas fecham perfeitamente.

Fechamento: é outra família de regra — plausibilidade de peso por SKU
(faixa histórica), margem por setor, e revisão de vídeo dos casos fora da
faixa. Está no motor de regras, não na conciliação. Importante não
prometer ao cliente que a baixa resolve isso.

### 7.4 Conluio com o caixa

O caixa registra e cancela o item para o cúmplice. Esse **a conciliação
pega**: sem estorno físico no setor, a etiqueta vence a janela e vira
`NAO_CONCILIADA`. É o caso que justifica o produto.

---

## 8. Overlay: cores e um detalhe de implementação

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

## 9. O painel

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

## 10. Modelo de dados (esboço)

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

## 11. Consequências para o SaaS

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

## 12. O que muda nas fases

A Fase 2 do outro documento deixa de ser "reconciliação" genérica e passa
a ser este documento inteiro. Ordem sugerida:

1. Agente NFC-e/SAT + conciliação multiset + estados + alerta de não
   conciliada. *(sem isso, nada mais importa)*
2. Posto de estorno: leitor, cancelamento em um passo, overlay
   vermelho e clipe (§6).
3. Painel de fechamento, **fila de revisão** (§3.4) e fila de alertas
   com vídeo — a fila de revisão é o que torna o Cenário B usável.
4. KPIs por operador que **pesou** e *baselines* de reimpressão e
   estorno por setor.
5. Serial GS1 onde o PDV suportar (tier Prevenção).

---

## 13. A confirmar antes de codar

As perguntas técnicas para a Toledo estão consolidadas em
[`perguntas-toledo.md`](./perguntas-toledo.md) — bloco **C** decide se
uma loja entra no Cenário A ou B, bloco **B** decide a latência do
overlay.

Além delas:

1. O XML da NFC-e do PDV alvo traz o **EAN pesável completo** no item ou
   já o traduz para o código interno? Muda a chave de conciliação e
   define se o Cenário A é sequer possível naquele cliente.
2. Prazo real entre pesagem e caixa em açougue, padaria e hortifruti —
   é o que calibra a janela padrão. Medir num piloto, não chutar.
3. Taxa de porcionados/padronizados no mix do cliente — é o que
   determina quanta colisão de peso teremos e, portanto, o tamanho da
   fila de revisão.

## Fontes

- Estrutura do EAN-13 de produto pesável — [Urano — Código de Barras / InStore Standards](http://www.urano.ind.br/integra/manual_integra/instore_standards.aspx), [Sicompra — configurar código de barras de balança](https://atendimento.sicompra.com.br/como-configurar-o-codigo-de-barras-de-balanca/), [EAN-13 (Wikipédia)](https://pt.wikipedia.org/wiki/EAN-13)
- Composição do código na etiqueta Toledo — [MGV7 — configuração do código de barras](https://help.toledobrasil.com/mgv7/v7_0_/HTML_PAGES/configuracao_codigo_barras.html), [MGV7 — Code 128](https://help.toledobrasil.com/mgv7/v7_0_/HTML_PAGES/codigo_barras_Code128.html), [MGV6 — arquivos de cadastro](https://help.toledobrasil.com/mgv6/v1_6_/Html_Pages/arquivos_de_cadastro.html)
- Leitura de etiqueta de balança no PDV — [VR Software](https://vrsystem.info/publico/post/leitura-de-etiquetas-de-balanca-no-pdv/69ac0e5a-12c8-4b56-81ba-93adb4b38a38)
