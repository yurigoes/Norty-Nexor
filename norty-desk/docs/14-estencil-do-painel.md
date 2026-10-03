# 14 — Estêncil: o painel do equipamento

Onde cada porta fica na frente do equipamento, desenhado.

> **Estado em 03/10/2026.** No ar: painel por modelo e por face, zonas,
> ligação automática com as portas de rede do equipamento, tela de
> edição no catálogo, desenho na ficha do equipamento e na **elevação do
> rack**.

---

## 1. Para que serve

O chamado diz "a internet da sala 3 caiu". O patch panel diz que a sala
3 vai para a porta 17 do switch do rack B. Sem o painel, "porta 17" é um
número num cadastro; com ele, é **a nona de cima na segunda fileira** — e
o técnico de plantão não precisa contar RJ45 com o dedo dentro de um rack
escuro, às duas da manhã, com a empresa parada.

É o `Stencil` do GLPI 11, que era o último item da paridade (ver
`docs/02-gap-analysis.md`).

## 2. A diferença para o GLPI: grade, não foto

No GLPI o estêncil é uma **foto** do painel com retângulos desenhados por
cima, um por porta. Aqui é uma **grade**: tantas colunas, tantas linhas, e
a numeração correndo por uma delas.

A troca é deliberada. Painel de switch é grade — 24 portas em duas
fileiras de doze, 48 em duas de vinte e quatro —, e pedir uma foto e um
editor de retângulos para descrever isso é pedir vinte e quatro gestos de
mouse para gerar o que uma conta dá. Quem cadastra o modelo digita 12, 2
e "por coluna", e o painel inteiro está descrito.

O custo da escolha é honesto: painel que não é grade (um chassi com
módulos de tamanhos diferentes) se descreve pior aqui do que lá. Em
compensação, o que se descreve bem se descreve em dez segundos — e é o
que existe em 99% dos racks que esta casa atende.

### Os cinco campos

| Campo | O que decide |
|---|---|
| `columns`, `rows` | O tamanho da grade. 12×2 é o switch de 24 portas. |
| `numbering` | `COLUNA` (ímpares em cima, pares embaixo — Cisco e a maioria) ou `LINHA` (a fileira de cima inteira, depois a de baixo — muitos HP/Aruba). |
| `startAt` | O número da primeira posição. 1 no switch; **0** onde as placas se chamam `eth0`, `eth1`. |
| `slots` | Quantas posições a grade numera, quando ela sobra: dez portas numa fileira desenhada de doze. Nulo é "todas". |

Errar a **ordem** não é detalhe estético: num switch de 24, a porta 13
fica na sétima coluna de cima por um lado e na primeira coluna de baixo
pelo outro. O desenho mandaria o técnico ao lugar errado com a mesma
confiança com que o desenho certo o manda ao certo — por isso a tela
mostra a numeração enquanto se digita, antes de salvar.

### A zona, que é a exceção

O que a grade não descreve — a porta de console, os dois SFP+ que ficam
fora da fileira, o furo onde não há porta nenhuma — entra como **zona**:
uma posição com tipo (`PORTA`, `TOMADA`, `CONSOLE`, `ENERGIA`, `VAZIO`),
rótulo e, se for porta, o número dela.

Duas regras, e a segunda é a que importa:

1. **A zona manda sobre a célula.** O que está marcado ali é o que
   aparece, no lugar do que a grade poria.
2. **A zona não consome número.** Marcar um console no meio do painel
   não empurra a numeração — porque no equipamento de verdade ele também
   não empurrou. O painel passa a ter 23 portas numeradas de 1 a 23, sem
   furo na contagem, e a porta 12 passa a ser a sétima de cima.

A consequência da regra 2 aparece do lado do equipamento: pôr um console
na última posição de um painel de 24 faz a porta `Gi1/0/24` deixar de ter
lugar, e ela vai para a lista de fora (seção 4). Isso é o desenho
dizendo que a descrição do painel e o equipamento discordam — melhor que
desenhar por aproximação.

## 3. Mora no modelo, não no equipamento

Trinta switches do mesmo modelo têm o mesmo painel. Descrevê-lo trinta
vezes é trinta chances de divergir, e o dia em que divergem é o dia em
que o desenho deixa de ser confiável — que é o único valor que ele tem.

Por isso `model_panels` pende de `asset_models`, e o equipamento empresta
o painel do modelo dele. Um painel por face (`@@unique`), porque dois
desenhos da mesma frente são duas respostas para "onde fica a porta 17", e
o plantão não tem como escolher entre elas.

```
GET    /v1/asset-models/:id/paineis                       → ativo:ler
PUT    /v1/asset-models/:id/paineis/:face                 → ativo:catalogo
DELETE /v1/asset-models/:id/paineis/:face
POST   /v1/asset-models/:id/paineis/:face/zonas
PATCH  /v1/asset-models/:id/paineis/:face/zonas/:zonaId
DELETE /v1/asset-models/:id/paineis/:face/zonas/:zonaId

GET    /v1/assets/:id/painel                              → ativo:ler
GET    /v1/racks/:id/paineis                              → ativo:ler
```

Desenhar o painel é **curadoria do catálogo** (`ativo:catalogo`), como o
fabricante e o apelido de modelo; **consultar** é leitura de plantão
(`ativo:ler`), que é quem precisa dele de madrugada.

`PUT` na face, e não `POST` com `PATCH` ao lado: há um painel por face,
então "mande como a frente é" descreve a operação melhor do que decidir, a
cada chamada, se é a primeira vez.

## 4. O que liga a porta ao desenho

O painel numera de 1 a 24. O equipamento chama a mesma porta de
`GigabitEthernet1/0/24`, `Gi1/0/24`, `eth3`, `Porta 7` ou `24`.
`numeroDaPorta` (em `packages/shared/src/painel.ts`) faz a ponte, e é por
isso que ninguém digita a posição de cada porta em cada switch — seriam
vinte e quatro linhas por equipamento, para dizer o que o nome já diz.

A regra, nesta ordem:

1. **O que vem depois da última barra.** Em `Gi1/0/24`, o 1 é a pilha e o
   0 o módulo; a porta é a 24.
2. **Subinterface não é porta.** `Gi0/1.100` é a VLAN 100 passando pela
   porta 1 — o painel tem a 1. Só o caso puramente numérico entra nesta
   regra, para não estragar um `2.5GbE port 3`.
3. **O último número do que restou.** `eth0` é a 0, `Porta 7` é a 7.

Nome sem número (`Ethernet`, `Wi-Fi`) devolve nulo: é porta que o painel
não sabe onde pôr, e dizer "é a 0" seria desenhar errado com ar de
certeza.

Duas coisas que a API **não** esconde:

- **Porta sem lugar aparece em `outside`**, e a tela a mostra num aviso:
  um switch de 24 com uma porta 25, ou uma porta chamada só `Ethernet`.
  Sumir com ela calada faria o desenho incompleto parecer completo — que
  é o único jeito de um estêncil mentir.
- **Duas portas na mesma posição aparecem as duas.** `Gi1/0/1` e
  `Te1/0/1` dão o mesmo número; escolher uma em silêncio seria apontar o
  dedo para a porta errada com ar de certeza.

E uma que ela garante: **a mesma porta não aparece em duas faces.** Quem
entrou num desenho não entra noutro, porque seriam duas respostas para
"onde ela fica".

## 5. O desenho na tela

Na ficha do equipamento, uma caixinha por posição, na grade do modelo.
Três estados e nada mais, que é o que se decide olhando:

| Estado | Como aparece |
|---|---|
| Porta com cabo | azul, e leva ao equipamento do outro lado |
| Porta livre | cinza da superfície afundada |
| Não é porta (console, fonte, furo) | sem cor, contorno tracejado |

Nenhuma informação depende só da cor: cada caixinha mostra o número, e o
`title` diz o resto — a porta, o cabo, a VLAN, o IP da última varredura.
Equipamento sem modelo, ou modelo sem painel, não desenha nada: uma grade
vazia pareceria defeito.

## 6. Na elevação do rack

É onde a pergunta nasce: quem está de pé na frente do rack já sabe em
que U está o equipamento — falta saber **qual das portas**.

Dentro de cada U, o painel aparece miúdo: uma caixinha de nove pixels
por posição, sem número. Número em nove pixels não se lê, e número
ilegível é pior que número nenhum — passa a impressão de que se pode
ler. O que o miúdo mostra é a **forma** do painel e quanto dele está em
uso; clicar no equipamento abre o desenho grande logo abaixo, com os
números, o cabo de cada porta e o aviso das que não têm lugar.

A face desenhada dentro do U é a que está virada para quem olha:
equipamento montado de costas mostra a traseira dele, e o que ocupa a
profundidade inteira aparece pela frente.

`GET /v1/racks/:id/paineis` traz o rack inteiro de uma vez. A elevação
desenha quarenta e duas posições; pedir o painel de cada equipamento
seriam quarenta e duas idas ao servidor para montar uma tela. São três
consultas, não importa o tamanho do rack: os itens, os painéis dos
modelos que aparecem neles e as portas de todos. Item sem modelo, ou
cujo modelo não tem painel, não vem na lista — a elevação continua
desenhando o retângulo dele.

Clicar num item passou a **escolhê-lo**, e não a abrir o formulário de
mover: ver o painel é o que mais se faz com um item do rack, e não exige
mandar no parque. Mover e retirar continuam ali, no cartão do item
escolhido, para quem tem `ativo:gerenciar`.

## 7. O que fica no banco

```
model_panels   (assetModelId, face) único  — a grade, por face
panel_zones    (panelId, column, row) único — a exceção, por posição
```

Dois `CHECK` guardam o que a tela também guarda, pela regra 4 do
`CLAUDE.md`: grade entre 1 e 64 colunas e 1 e 8 fileiras, `startAt` não
negativo, posição de zona a partir de 1. Validar só na aplicação deixaria
a porta aberta para quem grava por SQL — e painel inválido não dá erro,
dá desenho errado.

Encolher a grade com uma zona fora dela é **recusado**, nomeando a zona:
apagá-la junto seria desfazer em silêncio o que alguém cadastrou de
propósito.

## 8. O que ainda não tem

- **Foto do painel por trás da grade.** Daria o reconhecimento visual que
  a grade não dá ("é este switch mesmo"), e é o que o GLPI faz. Depende de
  decidir onde a imagem do modelo mora.
- **Tomada de PDU ligada a uma régua de verdade.** O tipo `TOMADA` já
  desenha, mas nada liga a tomada 7 a quem está plugado nela — o Desk
  trata PDU como equipamento, e não tem o modelo de alimentação do GLPI.
