# Contrato — vitrine de preços na mídia indoor

Ver o desenho completo em
[`../integracao-midia-indoor.md`](../integracao-midia-indoor.md). Este
diretório é a fronteira formal: o que o coletor Toledo produz, e o que
o player de mídia indoor consome — nada mais passa entre os dois.

Validado com `tsc --strict` (zero erros) e 9 cenários em
[`contrato.test.ts`](./contrato.test.ts), incluindo a prova de que
[`exemplo-payload.json`](./exemplo-payload.json) é, ele mesmo, válido
contra o contrato — um exemplo que não passa no próprio validador não
serve de exemplo.

| Arquivo | Papel |
|---|---|
| `contrato-vitrine-precos.ts` | Os tipos (`ItemVitrine`, `CatalogoVitrine`) e a validação em runtime — é a fronteira onde dado de arquivo-texto de terceiro vira dado confiável |
| `exemplo-payload.json` | Uma foto real do que o coletor entrega |
| `contrato.test.ts` | Prova de comportamento, sem framework — `ts-node contrato.test.ts` |

## As duas regras que o validador impõe, e por quê

- **Preço em centavos, inteiro, sempre positivo.** Zero ou float nunca
  chegam à tela — errado em público é pior que ausente.
- **`itensSegurosParaExibir` filtra por idade E por validade**, não só
  uma das duas. Um item pode ter preço "correto" no cadastro e ainda
  assim estar velho demais para confiar, ou ter uma promoção que já
  venceu — são dois motivos diferentes de sumir do rodízio, e o código
  trata como dois `if` separados de propósito, não uma condição só.
