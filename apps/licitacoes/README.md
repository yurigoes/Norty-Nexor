# Nexor Licitações — radar

Encontra oportunidades de licitação no [PNCP](https://pncp.gov.br), filtra
pelo que a sua empresa vende e ordena pelo que vale a pena olhar hoje.

Não envia proposta e não dá lance. O porquê está em
[`docs/licitacoes/primeiros-passos.md`](../../docs/licitacoes/primeiros-passos.md),
junto com o guia de SICAF e de dispensa eletrônica.

## Começando

```bash
cp perfil.exemplo.json perfil.json   # e edite com os dados da sua empresa
npm run radar -w @nexor/licitacoes
```

O arquivo de exemplo é comentado campo a campo. Os três que mais importam:

- **`municipioIbge` e `municipiosRegiao`** — códigos IBGE de 7 dígitos.
  Consulte em <https://www.ibge.gov.br/explica/codigos-dos-municipios.php>.
- **`linhas`** — o que você vende. Cada linha vira um motivo explícito na
  saída ("casou com Informática"), então nomeie por ramo, não por produto
  solto.
- **`valorMaximo`** — não é quanto você consegue vender, é quanto seu caixa
  aguenta financiar até o órgão pagar.

`perfil.json` está no `.gitignore`: ele tem CNPJ e estratégia comercial.

## Opções

```bash
node src/cli.ts --ajuda

  --perfil <arquivo>   Perfil da empresa (padrão: perfil.json)
  --dias <n>           Janela de prazos à frente (padrão: 30)
  --minimo <n>         Só exibe oportunidades com nota igual ou maior
  --json               Saída em JSON, para encadear com outra ferramenta
  --explicar           Detalha a composição da nota de cada oportunidade
```

`--explicar` é a ferramenta de calibragem: mostra quantos pontos vieram de
cada dimensão e por quê. Se a lista vier ruim, ele mostra qual peso ou qual
palavra-chave está errado.

## Códigos de saída

| Código | Significado |
|---|---|
| 0 | Rodou e encontrou oportunidades aderentes |
| 1 | Erro de configuração, ou alguma modalidade não pôde ser consultada |
| 2 | Rodou e consultou, mas nada aderente na janela |

O 2 é separado do 0 para que um cron notifique só quando há o que fazer, sem
tratar dia vazio como falha:

```cron
0 7 * * 1-5 cd /caminho/apps/licitacoes && node src/cli.ts > /tmp/radar.txt && notificar < /tmp/radar.txt
```

## Como a nota é composta

| Dimensão | Peso | Critério |
|---|---|---|
| Aderência | 45 | Quantos termos e quantas linhas do perfil o objeto casou |
| Geografia | 20 | Município (cheio) → região (70%) → estado (40%) |
| Valor | 15 | Dentro da faixa do perfil |
| Modalidade | 10 | Dispensa e pregão eletrônico valem mais que concorrência |
| Exclusividade | 10 | Indício de cota ME/EPP (até R$ 80 mil) |

Antes de pontuar há **cortes**: contratação revogada, prazo encerrado, fora
do alcance geográfico, sem aderência, termo excluído, ou valor muito acima da
capacidade. Descarte é diferente de nota baixa — o descartado sai da lista, e
aparece só no resumo por motivo no rodapé.

Se o rodapé mostrar quase tudo caindo em "não bate com nenhuma linha", o
problema provavelmente é o perfil, não o mercado: faltam palavras-chave.

## Desenvolvimento

```bash
npm run test -w @nexor/licitacoes           # cliente HTTP e normalização
npm run test -w @nexor/licitacoes-shared    # triagem, prazos e texto
npm run lint -w @nexor/licitacoes
```

O app roda direto do TypeScript, sem passo de build: o Node 22 remove os
tipos nativamente. Por isso os imports relativos levam extensão `.ts` e o
código evita açúcar sintático que gera código — `enum`, `namespace` e
parameter property de construtor não sobrevivem ao modo de remoção pura.

O domínio (tipos, tabelas do PNCP, motor de triagem) mora em
`packages/licitacoes-shared`, separado do domínio de condomínio do my Home.
A triagem é uma função pura de `(oportunidade, perfil, agora)` — sem rede,
sem relógio próprio, sem banco — o que torna cada regra testável isolada.

## Estrutura

```
src/pncp/tipos.ts       Formato bruto da resposta do PNCP
src/pncp/cliente.ts     HTTP: paginação, retry, tolerância a 204
src/pncp/normalizar.ts  Bruto → domínio
src/radar.ts            Orquestra consulta, triagem e ordenação
src/relatorio.ts        Renderização de terminal
src/config.ts           Leitura e validação do perfil
src/cli.ts              Entrada
```
