# Homologação — Toledo Prix 5 Plus

Leitura do **Guia rápido** (`GR_5Plus_0525Rev.10`) e do **Manual do
usuário** (`MU_5Plus_0525Rev.15`, a partir da versão de firmware 8.7),
ambos fornecidos pelo usuário. Fonte primária — substitui suposição por
fato onde os dois divergem.

**Resultado em uma frase:** a balança documentada aqui **não tem RFID,
não tem porta USB e não bloqueia o teclado sem identificação** — os
três pontos que sustentavam o cenário 1 do estudo original. Isso muda
a arquitetura recomendada. Por outro lado, ela tem uma coisa melhor do
que esperávamos para o Cenário A: um **segundo código de barras Code
128 com sequencial**, nativo, configurável por parâmetro local.

---

## 1. O que a 5 Plus tem

| Recurso | Confirmado | Onde |
|---|---|---|
| Comunicação | Ethernet e Wi-Fi (802.11b/g) | Ficha técnica, §5.1.5 |
| Cadastro de operador | Código numérico, 1 a 500 | §7.3.6, parâmetro C14 |
| Segundo código de barras (Code 128) | Sim, 13 composições pré-definidas | Parâmetro C18 |
| Code 128 com **sequencial** | Sim — Tipo 3 e Tipo 7 | Parâmetro C18 |
| GS1 DataBar Expanded | Citado só em bullet de marketing, sem parâmetro local documentado | §2 (descrição geral) |
| Supervisão de rede com o MGV7 | Sim — compara cadastro, pode bloquear a balança por preço desatualizado | §5.2.3, parâmetro C07 |
| "Modo Quebra" (pesagem de descarte) | Sim, ativado via MGV | §8.16 |
| Controle de reimpressão | Sim — parâmetro C15 | Tabela de parâmetros |
| Capacidade de PLU | Até 5.500 | Ficha técnica |

## 2. O que ela NÃO tem

| Recurso | Confirmado ausente | Como sabemos |
|---|---|---|
| Leitor RFID | Não há em nenhuma das 118 páginas | Zero ocorrências de "RFID", "crachá", "cartão", "MIFARE", "leitor", "proximidade" no texto integral; diagrama do painel (p. 15-16) mostra só teclado numérico e teclado de edição |
| Porta USB | Não documentada | Ficha técnica lista "COMUNICAÇÃO: Ethernet e Wi-Fi" como único campo; nenhuma imagem mostra porta além do cabo de força e do cabo de rede |
| Porta serial (RS-232) | Não documentada | Idem |
| Bloqueio de teclado por identificação ausente | Confirmado que **não bloqueia** | Ver §3 abaixo — é a informação mais importante deste documento |

---

## 3. A pergunta A0.1 tem resposta — e não é a que esperávamos

O manual descreve o fluxo exato (§8.8, "Operando com a solicitação do
Código do Operador"): com o parâmetro **C14** ligado, a balança **pede**
o código do operador depois de pesar, antes de imprimir. Mas o próprio
manual documenta a saída:

> "Caso queira que a transação não seja acumulada para nenhum operador,
> no momento da digitação do código do operador, basta clicar [ESC]. A
> operação será realizada, uma etiqueta será impressa e a operação não
> será acumulada para nenhum operador."

E a descrição do parâmetro C14 usa o verbo certo: "cada operação
realizada **solicitará** ao operador o código" — solicita, não exige.

**Isto responde, com fonte primária, a pergunta que fizemos à Toledo:**
a 5 Plus documentada aqui **não bloqueia** o teclado sem identificação.
Ela pede o código, e um único toque de tecla pula o pedido e completa a
venda sem operador. Nossa postura de design — "bloquear onde o firmware
permitir, detectar sempre" (§5.7 do estudo) — estava certa em não
apostar no bloqueio. Agora sabemos que, nesta balança, **não há
bloqueio para apostar**: `operacao_sem_identificacao` deixa de ser o
caminho de exceção e vira o caminho **normal** a ser tratado, porque
pular a identificação custa um toque de tecla.

Isso não é um defeito do produto — é a categoria de instrumento. A
"Supervisão de Rede" da 5 Plus é rigorosa exatamente onde o INMETRO
exige rigor: **preço**. Bloquear a balança por preço desatualizado é
metrologia. Bloquear por ausência de identificação de operador não é
função metrológica, e a Toledo simplesmente não construiu isso como
trava.

## 4. Sobre a variante "com leitor RFID"

O documento anterior recomendava a **Prix 5 Plus com leitor RFID** como
produto de prateleira, com base em uma página de revenda. **Este manual
oficial, atual (rev. 15, base 8.7), não confirma essa variante.** Duas
hipóteses, nesta ordem de probabilidade:

1. A "com RFID" anunciada pela revenda é um **retrofit do próprio
   integrador** — um leitor externo acoplado à balança e apresentado
   comercialmente como "balança com RFID", sem ser recurso de fábrica
   Toledo. É o padrão mais comum nesse mercado.
2. É uma variante de hardware real, mas **documentada em manual
   próprio**, não neste.

**Não presuma mais a topologia 1 (RFID integrado, com bloqueio de
fábrica).** Ela sai da lista de "produto pronto para comprar" e vira
"a confirmar direto com o revendedor que anunciou": pedir o manual
específico daquele SKU, não aceitar a peça de marketing como prova.
Enquanto isso não vier, a arquitetura para o piloto assume que **nenhuma
balança do parque bloqueia por identificação** — o pior caso, que é
também o caso mais realista para venda de SaaS a varejo com parque
misto.

## 5. Consequência para a topologia do leitor

Das quatro topologias do estudo (§5.7):

| Topologia | Antes | Agora, para esta balança |
|---|---|---|
| 1 — Integrada | Recomendada, bloqueia | **Não confirmada nesta linha de manual** — tratar como exceção a validar caso a caso, nunca como padrão |
| 2 — USB-HID direto | Plano B, retrofit trivial | **Inviável** — não há porta USB documentada |
| 2b — Edge em modo teclado | Evolução | Inviável pelo mesmo motivo — não há porta para o *edge* se apresentar como teclado |
| 3 — Leitor só no *edge* | Retrofit garantido, não bloqueia | **Vira o caminho principal**, não o alternativo |

Isso simplifica a decisão: para esta balança, não existe versão "com
bloqueio de fábrica" de confiança. O produto deve ser desenhado para o
caso sem bloqueio como **regra**, e todo o peso da identificação recai
sobre a correlação por sessão (crachá no *edge*, ao lado da balança) e
sobre a detecção — exatamente como o §5.7 do estudo já recomendava como
postura defensiva, só que agora sem a rede de segurança do "mas a
topologia 1 cobre a maioria dos casos".

## 6. O código de barras — melhor do que esperávamos

A tabela de composição do **parâmetro C18** (Code 128), a segunda
simbologia impressa na etiqueta, além do EAN-13 padrão:

| Tipo | Composição |
|---|---|
| 1 | EAN13+DATA |
| 2 | EAN13+DATA+HORA |
| **3** | **EAN13+DATA+HORA+ENDEREÇO+SEQUENCIAL** |
| 4 | EAN13+DATA+LOTE+0 |
| 5 | EAN13+LOJA+OPERADOR+DÍGITO VERIFICADOR |
| 6 | EAN13+PESO/QUANTIDADE+DATA+HORA+BALANÇA |
| **7** | **EAN13+PESO/QUANTIDADE+DATA+HORA+END. DA BALANÇA+SEQUENCIAL** |
| 8 | EAN13+PREÇO TOTAL+DATA+00+DÍGITO VERIFICADOR |
| 9 | EAN13+PESO/QUANTIDADE+DATA |
| 10 | EAN13+PESO/QUANTIDADE+DATA+00+DÍGITO VERIFICADOR |
| 11 | EAN13+PESO/QUANTIDADE+DATA DE VALIDADE+PREÇO PROMOCIONAL |
| 12 | EAN13 sem DV+DATA DE VALIDADE |
| 13 | EAN13+DATA DE VALIDADE+OPERADOR |

**Tipo 3 e Tipo 7 resolvem a pergunta C16/C17 do documento de perguntas
à Toledo.** Existe sequencial, é nativo, é um parâmetro local (não
depende do MGV7 nem de licenciamento GS1), e vem combinado com data,
hora e o **endereço da balança na rede** (parâmetro C20, 1 a 64) — o
que dá um identificador com boa chance de ser único mesmo sem saber
ainda a largura exata do contador ou se ele reinicia.

Isso promove o **Cenário A** (baixa unitária exata, ver
[`antifraude-conciliacao-etiquetas.md`](./antifraude-conciliacao-etiquetas.md)
§2) de "depende de resposta do fabricante" para "configurável hoje,
com uma balança em mãos, sem esperar retorno comercial". O que falta
confirmar — não se existe, mas o comportamento fino — é objeto da
seção 8 abaixo.

A ressalva do documento de conciliação continua de pé: o serial só
sustenta baixa unitária se **sobreviver até o XML da NFC-e**. Isso
depende do PDV do cliente, não da balança.

Achado colateral: o **Tipo 5** (`EAN13+LOJA+OPERADOR+DV`) sugere que
identificar o operador **no código de barras da própria etiqueta** é
algo que a balança já sabe fazer — outro caminho de auditoria (o
operador da venda fica registrado na etiqueta, não só no log interno),
mas que compete pelo mesmo espaço de código com Tipo 3/7. Não dá para
ter os dois na mesma etiqueta sem outra fonte.

## 7. Achado colateral — "Modo Quebra"

A balança já tem, nativamente, um conceito de **pesagem que não é
venda**: o "Modo Quebra" (§8.16), para produtos pesados e descartados,
ativado pelo MGV. Vale considerar como uma **terceira categoria de
etiqueta** ao lado de vendida/cancelada — perda declarada pelo próprio
setor, que não deveria contar como `nao_conciliada` no fechamento. Um
uso de "quebra" muito acima do padrão do setor é, ele mesmo, um sinal
de auditoria — mas isso é dado operacional legítimo, não indício de
fraude por si só.

## 8. Perguntas à Toledo — o que mudou

O documento [`perguntas-toledo.md`](./perguntas-toledo.md) foi escrito
antes desta leitura. Atualização:

**Respondidas por este manual (remover ou marcar como resolvidas):**
- A0.1 → não bloqueia; solicita e é possível pular com uma tecla.
- C15 (existe simbologia além de EAN-13?) → sim, Code 128, parâmetro
  C18, local.
- C16/C17 (existe sequencial na composição?) → sim, Tipo 3 e Tipo 7.
- E0.6/E0.7 (porta USB e largura de campo) → sem porta USB
  documentada; pergunta cai.
- A5 (quantos operadores, como carrega) → até 500, cadastro local pelo
  teclado (arquivo de carga via MGV é hipótese a confirmar, não
  documentada aqui).

**Novas perguntas, mais específicas que as anteriores:**

1. **A "Prix 5 Plus com leitor RFID" anunciada por revendedores é SKU
   de fábrica Toledo, ou retrofit do integrador?** Se for de fábrica,
   pedir o manual específico dela — este documento não a cobre.
2. **Largura e reinício do contador SEQUENCIAL** dos Tipos 3 e 7 do
   parâmetro C18. Quantos dígitos, reinicia quando (diário? nunca? por
   carga do MGV?).
3. **O parâmetro C18 é local (definido pelo técnico na balança) ou
   fica sob gestão do MGV7?** Se for puramente local, qualquer balança
   em campo pode ser configurada para o Tipo 7 sem depender do
   software de retaguarda — o que muda o plano de implantação.
4. Existe algum parâmetro, em versão de firmware mais recente que a
   8.7 documentada aqui, que **exija** o código do operador (sem a
   opção de pular)? Se não, isso precisa ficar assumido como definitivo
   no desenho do produto, não como lacuna a fechar depois.
5. As perguntas de latência e protocolo de coleta do MGV7 (bloco B do
   documento original) continuam de pé — nada neste manual as
   responde, porque a comunicação com o MGV7 é tratada como caixa-preta
   aqui.

---

## 9. Configurações a fazer na balança (piloto)

Lista prática para a instalação de teste, extraída dos parâmetros
documentados:

| Parâmetro | Ajuste | Efeito |
|---|---|---|
| **C14** | `L` | Ativa cadastro/solicitação de operador |
| **C17** | `D` | Só permite transação por código de PLU (evita venda "diversos" sem produto identificado — reduz uma categoria inteira de ambiguidade na conciliação) |
| **C18** | `Tipo 7` | Code 128 com peso/quantidade + data + hora + endereço + **sequencial** — a etiqueta do Cenário A |
| **C19** | `L` | Imprime o texto legível abaixo do Code 128 (facilita conferência visual e depuração no piloto) |
| **C15** | `d` (padrão) | Inibe reimpressão sem variação de peso — mantém o controle nativo de reimpressão ligado |
| **C07** | Liberação com senha | Der o meio-termo: bloqueia por preço desatualizado sem travar a loja por qualquer motivo menor |
| **C16** | `d` | Desativa "Senha MIT" — não é o que precisamos (é fila de atendimento, não autenticação) |
| **C20 / Endereço** | Único por balança, 1–64 | Vira o campo "ENDEREÇO" do Tipo 7 e o identificador da balança no nosso `Scale.identifier` |

Nenhum desses parâmetros exige o MGV7 — são ajustáveis localmente pelo
técnico com a senha de programação (padrão de fábrica `1234`, **trocar
no piloto**).

---

## 10. O que muda nos outros documentos

- `estudo-antifraude-balanca-cftv.md` §5.7 — a seção que descrevia
  quatro topologias como opções equivalentes precisa registrar que,
  **para esta balança específica**, só a topologia 3 está confirmada.
- `antifraude-conciliacao-etiquetas.md` §2 — o Cenário A deixa de ser
  hipotético: com C18 em Tipo 7, ele é configurável hoje. A ressalva
  sobre o PDV preservar o serial continua sendo o fator decisivo.
- `perguntas-toledo.md` — revisar conforme §8 acima antes de enviar.

Nenhuma mudança de schema é necessária: `Label.serial` e
`Label.barcode` já cobrem o Tipo 7, e `Scale.identifier` já cobre o
endereço de rede.
