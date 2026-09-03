# Motor de casamento

Núcleo puro em TypeScript — sem Prisma, sem NestJS, sem I/O. Recebe
arrays já filtrados pelos índices do `schema.prisma` (`storeId,
productId, weightGrams, state`) e devolve decisões. O serviço da API é
uma casca fina em volta disto: busca no Postgres, chama estas funções,
persiste o resultado.

Validado com `tsc --strict` (zero erros, `noUnusedLocals`/
`noUnusedParameters` ligados) e 18 cenários em
[`engine.test.ts`](./engine.test.ts), sem framework — roda com
`ts-node engine.test.ts` assim que o projeto tiver `@types/node`
instalado normalmente via `npm install`.

## A premissa que organiza este código

O manual da Toledo Prix 5 Plus
([`../homologacao-toledo-prix5plus.md`](../homologacao-toledo-prix5plus.md))
confirmou que a balança **não bloqueia** sem identificação — pede o
código do operador e um toque de tecla pula o pedido. Isso quer dizer
que `operatorId: null` é o caso **frequente**, não a exceção, e isso se
propaga por três arquivos diferentes:

- **`matching.ts`** — o operador nunca entra no custo do casamento.
  Isso não é só consequência da regra acima: quem pesou nunca aparece
  no XML da NFC-e de qualquer forma, então usar identidade como parte
  do custo estaria comparando um dado que existe de um lado só. O
  casamento é sempre produto + peso + tempo.
- **`kpis.ts`** — não existe limiar fixo tipo "mais de 10% sem crachá =
  alerta". Uma loja pode operar normalmente com 40% das pesagens sem
  identificação, se o gerente não cobrar isso da equipe. O que dispara
  `configuracao_alterada` é a **balança que tinha baseline baixo e
  despencou de repente** — mudança, não nível.
- **`returnStation.ts`** — nunca pede crachá para cancelar. Quem
  responde pelo estorno é sempre quem *pesou* (já registrado na
  etiqueta), nunca quem está no posto — coerente com §6.2 do estudo:
  atrito no cancelamento destrói o dado de conciliação inteiro.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `types.ts` | Contratos de entrada/saída — espelham `Label` e `FiscalItem` do schema, sem depender dele |
| `matching.ts` | `cost()`, `findCandidates()`, `classifyConfidence()`, `matchLabel()` — o casamento em si, com o atalho de serial do Cenário A |
| `returnStation.ts` | `lookupForCancel()` — a pergunta "posso cancelar isto?", decidida pelo estado da etiqueta |
| `kpis.ts` | Taxa de não identificação, detector de mudança de configuração, sinal de estorno por operador |
| `dailyClosing.ts` | Fechamento agregado do dia, incluindo `unidentifiedRate` como métrica operacional normal |
| `engine.test.ts` | 18 cenários, sem framework — prova de comportamento, não decoração |

## O fluxo que isto implementa

```
pesou (com ou sem crachá) → Label 'emitida'
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                             ▼
        casou no XML da NFC-e            venceu a janela sem casar
        → matchLabel() decide:            → Label 'nao_conciliada'
          alta/média = autoconcilia          (job externo a este motor,
          baixa = fila de revisão             que varre matchWindowUntil)
          nenhuma = aguarda ou expira

Etiqueta ainda 'emitida' e o produto volta ao balcão:
  lookupForCancel(código) →
    'elegivel'            → devolve peso e produto EXATOS, segue para o cancelamento
    'ja_vendida'          → já casou (Label 'conciliada') — recusa, não desfaz venda
    'ja_cancelada'        → recusa duplicidade
    'codigo_desconhecido' → etiqueta não é desta loja
```

## O que fica de fora, de propósito

- **Persistência e transação.** `lookupForCancel` lê um snapshot; a API
  real precisa envolver a checagem e a escrita do `Cancellation` numa
  transação (a unicidade `@@unique([labelId])` do schema é a rede de
  segurança contra corrida, não este código).
- **O job de expiração de janela** que promove `emitida` vencida para
  `nao_conciliada` e abre o `Alert`. É orquestração (cron/fila), não
  decisão de domínio — não pertence a um núcleo puro.
- **Troca de etiqueta** (código barato em produto caro). O casamento
  concilia perfeitamente porque as duas etiquetas fecham; a detecção é
  outra regra, sobre `Product.minWeightGrams/maxWeightGrams`, que este
  motor não implementa ainda.
