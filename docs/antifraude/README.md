# Schema do Cenário B

`schema.prisma` — modelo de dados do antifraude de pesagem, conforme
[`../antifraude-conciliacao-etiquetas.md`](../antifraude-conciliacao-etiquetas.md).

**Validado** com o engine de schema do Prisma (`prisma-schema-wasm`):
modelos, relações e índices passam sem erro.

Ressalva: o engine disponível aqui é da linha 8, que já removeu `url` do
bloco `datasource`. O arquivo mantém `url = env("DATABASE_URL")` para
ficar igual a `apps/api/prisma/schema.prisma`, e essa linha foi removida
apenas durante a validação. Ao adotar Prisma 8, a conexão migra para
`prisma.config.ts`.

---

## As cinco decisões que valem discussão

### 1. Peso é `Int` em gramas

Peso é meia chave de conciliação. Em `Float`, dois valores que deveriam
ser iguais deixam de ser, o casamento perde a etiqueta e o alerta nasce
falso. Gramas inteiras eliminam a classe inteira de bug.

Mesmo motivo pelo qual dinheiro é `Decimal(12,2)` — só que aqui o
prejuízo não é o caixa não fechar, é o produto não funcionar.

### 2. Unicidade da etiqueta inclui a data operacional

```prisma
@@unique([scaleId, businessDate, transactionSeq])
```

O sequencial da balança reinicia (diário, por carga ou por operador,
conforme o fabricante — pergunta C19 à Toledo). Só `(balança,
sequencial)` colidiria na virada. Duplicata aqui estoura o fechamento e
ninguém entende de onde veio.

### 3. `Match` é único nos dois lados

```prisma
labelId      String @unique
fiscalItemId String @unique
```

Uma etiqueta não baixa duas vendas; uma venda não baixa duas etiquetas.
Validar isso só na aplicação deixa duas requisições simultâneas passarem
juntas — que é exatamente o que acontece quando o *edge* reenvia a fila
depois de uma queda de rede.

### 4. `operatorId` é nulo, de propósito

Etiqueta sem operador não é falha de captura: é o evento
`operacao_sem_identificacao`, que vai vermelho no overlay e abre alerta.
Se o campo fosse obrigatório, a pesagem anônima — o caso que mais
interessa — não teria onde ser gravada.

### 5. CPF em tabela separada

`OperatorIdentity` existe para que nenhuma consulta do dia a dia carregue
o documento. O overlay usa matrícula e primeiro nome; a leitura do CPF
passa por serviço auditado (`AccessAudit`). É minimização de dados imposta
pelo schema, não pela boa vontade de quem escreve o `select`.

---

## As consultas que os índices sustentam

**Casamento (o caminho quente).** Para cada etiqueta aberta, buscar itens
fiscais do mesmo produto com peso próximo:

```
Label:      @@index([storeId, productId, weightGrams, state])
FiscalItem: @@index([storeId, productId, weightGrams])
```

**Expiração da janela.** Job periódico que promove etiqueta vencida a
`nao_conciliada` e abre alerta:

```
Label: @@index([storeId, state, matchWindowUntil])
```

**Fila de revisão.** Candidatos ordenados por custo, por etiqueta:

```
MatchCandidate: @@index([storeId, labelId, rank])
```

**Crachá simultâneo.** Mesma credencial aberta em duas balanças ao mesmo
tempo:

```
OperatorSession: @@index([storeId, badgeId, startedAt(sort: Desc)])
```

**Expurgo LGPD.** Clipes vencidos:

```
Evidence: @@index([storeId, retainUntil])
```

---

## O que o schema deliberadamente não resolve

- **Troca de etiqueta** (código barato em produto caro). Concilia
  perfeitamente. O que existe aqui é a matéria-prima da detecção —
  `Product.minWeightGrams` / `maxWeightGrams` — mas a regra vive no motor,
  não no banco.
- **Estorno fantasma** no tier base. `Cancellation` registra o
  cancelamento, mas o XML não distingue "cancelado no caixa" de "nunca
  passou". O que fecha a brecha é KPI por quem pesou e amostragem de
  vídeo; o cruzamento automático só existe com integração de PDV.
- **Séries temporais e *baselines*.** Taxa de reimpressão e de estorno
  por operador saem de agregação sobre `Label` e `Cancellation`. Se o
  volume pedir, isso vira tabela materializada — mas não antes de doer.

---

## O que ainda pode mudar

Depende das respostas da Toledo ([`../perguntas-toledo.md`](../perguntas-toledo.md)):

| Resposta | Efeito no schema |
|---|---|
| C16/C17 — existe serial no código | `Label.serial` e `FiscalItem.serial` saem de opcionais para o caminho principal naquela loja |
| C19 — sequencial não reinicia | `businessDate` sai da unicidade de `Label` |
| A0.4 — a balança não registra o método de autenticação | `Label.authMethod` fica sempre `nenhum` e o alerta de código numérico não existe |
| B13 — a coleta não traz tara ou reimpressão | `tareGrams` e `reprintCount` ficam vazios; a regra de reimpressão cai |

Nenhuma dessas quebra o modelo — todas são campos que deixam de ser
preenchidos. Foi desenhado assim de propósito: o schema não deve ficar
refém de uma resposta de fabricante que ainda não chegou.
