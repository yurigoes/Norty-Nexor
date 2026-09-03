# Integração — preço do açougue na mídia indoor

Como levar o preço por kg que já sai da balança até o seu sistema de
mídia indoor, para o telão mostrar "Carne Bovina · Picanha · R$
59,90/kg" sempre atualizado.

> Escopo deliberadamente pequeno: é leitura de preço, **sentido único**
> (açougue → seu sistema), e **não depende** de o mercado ter contratado
> o antifraude de pesagem. É o mesmo dado, reaproveitado — mas é um
> módulo que existe sozinho.

---

## 1. O que isto é, e o que isto não é

- **É** um conector que lê o catálogo de preços que já existe na
  balança/retaguarda do açougue e entrega isso, normalizado, para o seu
  player de mídia indoor.
- **Não escreve nada** na balança nem no MGV7 — é leitura, ponto.
- **Não precisa** do antifraude instalado. Se o cliente tiver os dois,
  melhor (§8), mas este módulo se vende e funciona sozinho.
- **Não é tempo real**, e não precisa ser — ver §6.

---

## 2. Onde mora a verdade do preço

Antes de escrever uma linha de código, decidir isso é o que evita
retrabalho:

| Cenário | Fonte da verdade | Frequência |
|---|---|---|
| Mais comum | **MGV7 / MGV Cloud** (Toledo) — já é quem manda preço para a balança | Cada troca de tabela |
| Melhor, quando existe | **ERP/sistema de precificação central** do cliente, que alimenta o MGV7 *e* poderia alimentar você direto | Depende do cliente |

O manual da Prix 5 Plus confirma que a balança não decide preço sozinha:
ela **recebe carga do MGV7** e trava a operação se a carga não bater
("Supervisão de Rede", ver
[`antifraude/homologacao-toledo-prix5plus.md`](./antifraude/homologacao-toledo-prix5plus.md)
§5.2.3 do manual). Ou seja: **o MGV7 já é, hoje, o hub de preço da
loja** — é ali que a integração deve mirar primeiro, não na balança.

Comece assumindo MGV7 como fonte — funciona em qualquer cliente com
parque Toledo, sem depender de ele ter (ou não) um ERP central. Não
feche a porta para o ERP central quando ele existir: é estritamente
melhor (uma fonte a menos para divergir), mas é opcional.

---

## 3. Três caminhos técnicos — com o trade-off de cada um

### A. Arquivo de exportação do MGV7/MGV6 (caminho recomendado, hoje)

O próprio manual descreve isto como o mecanismo oficial de integração
de terceiros: *"[a balança permite] total integração com outros
programas de gerenciamento através da importação/exportação dos
arquivos texto"*. É o mesmo padrão que documentamos para o cadastro de
operadores (`Opecad.txt`) e campos extras (`Campext1.txt`,
`Campext2.txt`) — o MGV7 fala com o mundo exterior por arquivo-texto.

Um serviço simples observa a pasta (local ou compartilhamento de rede)
onde o MGV7 exporta o catálogo, processa a cada mudança ou em intervalo
curto, e publica no seu contrato canônico (§5).

**A favor:** funciona com o que já existe, sem esperar nada da Toledo,
sem VPN até a rede da loja se o coletor rodar local. **Contra:** é
*batch*, não evento — mas para preço de açougue isso não é defeito, é
adequado (§6).

### B. MGV Cloud / API (upgrade, a confirmar)

O manual cita **"MGV 7 e MGV Cloud"** como as duas formas de
gerenciamento centralizado da Toledo. Se o MGV Cloud expuser uma API
HTTP documentada, é o caminho mais limpo: sem tocar em arquivo, sem
depender de rede local da loja, um único ponto de integração para
clientes com múltiplas lojas.

**Ainda não confirmado.** É a pergunta D12 do
[`perguntas-toledo.md`](./perguntas-toledo.md), sem resposta até aqui.
Enquanto isso, trate como *upgrade futuro*, não como plano A.

### C. Ler direto da balança — não recomendado

O único consumidor documentado do protocolo de rede da Prix 5 Plus é o
próprio MGV7; não há API de terceiros para "puxar" dado da balança.
Além de não documentado, não escala: seria uma conexão por balança, por
loja, multiplicando pontos de falha por algo que o MGV7 já centraliza
sozinho. Só cair aqui se A e B não existirem de jeito nenhum no
cliente — e mesmo assim, validar com a Toledo antes, não descobrir por
engenharia reversa.

**Decisão:** A é a base universal. B substitui A quando confirmado,
sem mudar o contrato que o player consome (§5) — é troca de adaptador,
não de arquitetura.

---

## 4. Arquitetura

```
        Loja                                    Seu sistema
┌──────────────────────┐
│  Toledo MGV7          │
│  (ou MGV Cloud)        │        arquivo-texto         ┌───────────────────┐
│  cadastro de PLU,      │ ─────── ou API (quando ──────▶│  Coletor Toledo   │
│  preço por kg           │        confirmado) B)         │  (adapter)         │
└──────────────────────┘                                └─────────┬─────────┘
                                                                     │ normaliza
                                                                     ▼
                                                          ┌────────────────────┐
                                                          │  API de catálogo    │
                                                          │  (contrato canônico)│
                                                          └─────────┬──────────┘
                                                                     │
                                                                     ▼
                                                          ┌────────────────────┐
                                                          │  Player de mídia    │
                                                          │  indoor (já existe) │
                                                          └────────────────────┘
```

O ponto chave: **o player não sabe nada sobre Toledo, MGV7 ou arquivo
de texto.** Ele só consome o contrato canônico (§5). Isso significa que
quando entrar o segundo fabricante de balança (Urano, Filizola), você
escreve um adapter novo — o player e tudo que vem depois dele não
mudam uma linha.

Onde roda o coletor: pode ser um serviço leve na própria loja (se o
MGV7 for local e a pasta de exportação só for acessível ali) ou
centralizado na nuvem (se for MGV Cloud, ou se a pasta puder ser
sincronizada). Desenhe a interface do adapter para aceitar os dois sem
mudar o contrato — é só onde ele roda, não o que ele produz.

---

## 5. O contrato de dados

O que entra no seu sistema, documentado e validado em
[`contrato-vitrine-precos.ts`](./integracao-midia-indoor/contrato-vitrine-precos.ts):

```ts
interface ItemVitrine {
  lojaId: string;
  sku: string;              // PLU na balança
  nome: string;              // "Picanha", não "Carne Bovina Picanha Kg Promo"
  categoria: 'acougue' | 'padaria' | 'peixaria' | 'hortifruti' | 'frios' | 'outro';
  precoPorKgCentavos: number;
  unidade: 'kg' | 'un';
  imagemUrl?: string;
  validoAte?: string;        // ISO 8601 — fim de uma promoção, por exemplo
  atualizadoEm: string;      // ISO 8601 — quando o coletor viu esse valor pela última vez
  origem: 'toledo_mgv7' | 'toledo_mgv_cloud' | 'manual';
}
```

Preço em **centavos, inteiro** — mesma razão do peso em gramas no
schema do antifraude: chave de exibição não pode depender de
arredondamento de ponto flutuante, e aqui o preço é exatamente o que
está sendo mostrado ao cliente final, no telão, em público.

`origem` existe para o dia em que houver mais de uma fonte — e para o
player poder decidir, por exemplo, dar prioridade a um valor `manual`
(o gerente sobrescreveu uma promoção na mão) sobre o que vem do MGV7.

---

## 6. Frequência — por que aqui não é o problema de latência do antifraude

No antifraude, latência importa de verdade: o overlay da câmera precisa
acompanhar a pesagem em segundos, porque é prova de um evento que
aconteceu agora (ver §5.6 do estudo original).

Aqui, não. **Ninguém liga se o telão demorar alguns minutos para
refletir uma troca de tabela de preço.** Isso simplifica a engenharia
de verdade: nada de fila em tempo real, nada de *push*, nada de
WebSocket. Um *polling* do arquivo de exportação a cada 2–5 minutos
resolve o problema inteiro, com uma fração da complexidade operacional.

Resista à tentação de superengenhar isto só porque "tempo real" soa
melhor em uma reunião. Não é o que o produto precisa.

---

## 7. O que exibir quando o feed falhar

Isto importa mais do que parece: **preço errado no telão, em público,
é pior do que produto ausente do telão.**

- Mantenha o último valor válido em cache, com um carimbo de
  "atualizado há X min" (uso interno, não necessariamente exibido ao
  cliente final).
- Defina um limite de idade (sugestão: 24h). Passado isso, o item sai
  do rodízio de telas — silenciosamente — em vez de continuar exibindo
  um preço que pode estar desatualizado.
- Nunca exiba preço zerado, `null`, ou um erro de parsing bruto. Se o
  coletor não conseguir ler o arquivo do MGV7 (permissão, rede, arquivo
  corrompido), isso é um alerta operacional para você, não um problema
  visual para o cliente final.

---

## 8. Reuso com o antifraude, quando o cliente tiver os dois

O `Product.pricePerKg` já existe no schema do antifraude
([`antifraude/schema.prisma`](./antifraude/schema.prisma)). É o mesmo
dado, mas **cada sistema mantém seu próprio banco** — a integração é
sempre por API, nunca leitura direta de um banco no outro. É a regra 3
do `CLAUDE.md` aplicada aqui, fora do contexto do my Home: nenhum
sistema confia num dado que não passou pela fronteira que ele controla.

Na prática, se o cliente tiver os dois produtos, o **coletor Toledo é o
mesmo** para os dois — só os consumidores finais mudam (o motor de
conciliação de um lado, o player de mídia indoor do outro). Vale
desenhar o adapter da Toledo como uma peça compartilhável desde o
início, mesmo que os dois produtos sejam vendidos e faturados
separadamente.

---

## 9. Pergunta nova para a Toledo

Adicionada ao bloco B de
[`perguntas-toledo.md`](./perguntas-toledo.md): o layout do arquivo de
**catálogo/preço** (distinto do arquivo de coleta de vendas, pergunta
B13) — é o `Cadcom.txt` ou equivalente que o MGV7 exporta com PLU,
descrição, preço por kg e categoria.

---

## 10. Primeiro passo prático

Não espere resposta comercial da Toledo para começar. Peça ao cliente
piloto:

1. Uma **amostra real** do arquivo de exportação do MGV7 (ou acesso de
   leitura à pasta compartilhada onde ele grava).
2. Confirmação de qual versão — MGV6, MGV7 local ou MGV Cloud — está em
   uso.

Com isso, o parser do coletor começa a ser escrito **hoje**, sem
depender de ninguém.
