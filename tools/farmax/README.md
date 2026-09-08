# Farmax → Norty Farma — cruzamento da carteira de crédito

Ferramental para ler os relatórios do Farmax, cruzar dívida com cadastro e
preparar a migração dos clientes para o Norty Farma.

## O que entra

Três relatórios exportados em HTML pelo Farmax (FortesReport), emitidos em
07/09/2026:

| Arquivo | Conteúdo | Total |
|---|---|---|
| `Relatório de Clientes em Atraso` | saldo devedor + atraso do título **mais antigo** | R$ 40.356,65 em 90 clientes |
| `Relatório de Clientes em Débito` | título em aberto **mais recente** | R$ 1.143,93 em 19 clientes |
| `Relatório Resumido de Clientes` | cadastro: nome, telefone, data de cadastro, limite | 450 clientes |

O FortesReport exporta HTML posicional — cada célula é um `<div>` com `left` e
`top` absolutos, sem `<table>`. O parser reconstrói as linhas agrupando os divs
pelo `top` e as colunas pela faixa de `left`.

## Como rodar

```bash
python3 parse_relatorios.py \
  --atraso   "contas em atraso.htm" \
  --abertas  "contas abertas.htm" \
  --cadastro "Relatorio Resumido de Clientes.htm" \
  --emissao  07/09/2026 \
  --corte    01/01/2026 \
  --saida    ./saida
```

Gera `saida/devedores_segmentado.csv` (os 90 devedores classificados) e
`saida/norty_farma_fila.csv` (os 19 da fila de migração). Sem dependências
além da biblioteca padrão.

## Como a data foi deduzida

Nenhum dos três relatórios traz data de compra. O que existe é a coluna
**Dias Atraso**, e dela se deduz o vencimento: `07/09/2026 − dias`. Entre
01/01/2026 e a emissão há **249 dias**, então:

- `dias ≤ 249` → título vencido **em 2026**;
- `dias ≥ 250` → título vencido **antes de janeiro de 2026**.

A distinção entre os dois relatórios de dívida é o que sustenta a análise: o
**Clientes em Débito** mostra o título em aberto mais recente e o **Clientes em
Atraso** mostra o saldo total com o atraso mais antigo. Quando os dois divergem,
o cliente **continuou comprando** enquanto arrastava dívida velha.

> **Vencimento não é data de compra.** A dedução é um bom indicador de
> atividade, mas quem quiser a data real precisa do banco — ver
> `extrair_fbk/04_datas_reais.sql`.

## Segmentação

| Seg. | Critério | Clientes | Valor |
|---|---|---:|---:|
| **A** | comprou em 2026 **e** deve de antes | 4 | R$ 23.187,49 |
| **B** | comprou em 2026, dívida toda de 2026 | 15 | R$ 964,91 |
| **C** | sem movimento em 2026, dentro dos 5 anos | 49 | R$ 5.948,54 |
| **D** | sem movimento e prescrita (> 5 anos) | 22 | R$ 10.255,71 |
| | **Total** | **90** | **R$ 40.356,65** |

O corte de prescrição usa 5 anos (Código Civil, art. 206 §5º I), que em
07/09/2026 cai em 07/09/2021. A coluna `prescrita` do CSV marca isso por
cliente, independente do segmento.

## Extrair o cadastro completo do backup

O `.fbk` é um backup Firebird (`gbak`) e traz o que os relatórios não têm: CPF,
endereço, nascimento, e-mail e as datas reais de compra. A pasta
`extrair_fbk/` tem o roteiro para Windows, na ordem:

1. `01_restaurar.bat` — restaura o backup numa **cópia de trabalho**
   (`C:\temp\farmax_analise.fdb`), sem tocar na produção;
2. `02_mapear.bat` — descobre os nomes reais de tabelas e colunas nesta versão
   do Farmax e grava em `mapa_tabelas.txt`;
3. `03_exportar.bat` — exporta o cadastro completo dos 19 clientes da fila;
4. `04_datas_reais.sql` — opcional e o mais valioso: troca a dedução por
   datas de venda reais.

Para só mapear a estrutura, há o atalho **`FARMAX_MAPEAR.bat`**: um arquivo
único e autossuficiente que faz os passos 1 e 2 de uma vez. Copie ele sozinho
para a máquina do Farmax e clique duas vezes — ele acha o Firebird instalado
(2.1 a 5.0, incluindo o que vem embutido com o Farmax), restaura numa cópia e
gera `mapa_tabelas.txt`.

### Quando o gbak pede "o próximo volume"

`Done with volume #1 ... Press return to reopen that file` é o prompt de
backup multi-volume: o `gbak` leu o arquivo até o fim e o fluxo não terminou.
Ou o backup foi dividido em vários arquivos, ou o `.fbk` está truncado.

O script trata os dois: copia o backup para o disco local antes de restaurar
(ler direto de drive de rede ou removível é a causa mais comum de leitura
truncada), confere se a cópia saiu com o mesmo tamanho do original e, se o
arquivo único não bastar, tenta de novo com todos os volumes da pasta na
linha de comando.

Toda chamada ao `gbak` leva `<nul` na entrada. Sem isso, esse prompt trava o
script indefinidamente em vez de falhar e seguir para a tentativa seguinte.

### Senha do banco

Farmax que "não pede senha" quase sempre roda o Firebird em **modo embedded**,
onde a autenticação é desligada e a conexão vai sem credencial nenhuma. Os
scripts tentam as formas em sequência — sem credencial primeiro, depois
`SYSDBA/masterkey`, `masterke` (o Firebird trunca a senha em 8 caracteres) e
mais algumas — e param na primeira que conecta, registrando cada tentativa em
`restauracao.log`.

A busca pelo Firebird começa pela pasta do próprio Farmax, que costuma trazer
uma cópia embutida: é a da mesma versão que gerou o backup.

Ajuste no topo dos `.bat` o caminho do Firebird e do backup. Os nomes de
tabela em `03`/`04` são um chute informado — o passo `02` é que revela os
corretos.

## Estrutura real do banco

O mapeamento confirmou os nomes desta instalação (Firebird 4.0, base
`19FARMAX`), e eles resolvem as duas ressalvas da análise por HTML:

| Tabela | O que resolve |
|---|---|
| `CLIENTES` | `CPF`, `RG`, `DT_NASCIMENTO`, `EMAIL`, `ENDERECO`/`NUMERO`/`COMPLEMENTO`/`BAIRRO`/`CIDADE`/`UF`/`CEP`, `DATA_FICHA`, `LIMITE_CREDITO`, `SALDO` e `DT_ULTIMA_COMPRA` |
| `CONTAS_RECEBER` | `DT_LANCAMENTO` (data real da compra), `DT_VENCIMENTO`, `VALOR`, `DT_PAGAMENTO`, `VL_PAGAMENTO`, `VL_SALDO` — título a título |
| `VENDAS` | venda item a item, com `DATA_CAIXA`; inclui as compras à vista |

Existe também uma tabela `CADASTROCLIENTES`, mas ela é outra coisa: importação
de representantes e distribuidores. A do cadastro de verdade é `CLIENTES`.

Com `CONTAS_RECEBER.DT_LANCAMENTO` o corte de janeiro de 2026 deixa de ser
dedução a partir de "dias em atraso" e passa a ser a data real da compra.

`FARMAX_EXPORTAR.bat` + `03_exportar.sql` (os dois na mesma pasta) geram os
CSVs. O `conferencia.txt` sai junto e serve para validar: os totais dele têm
que bater com os R$ 40.356,65 em 90 clientes dos relatórios em HTML antes de
qualquer número novo ser levado a sério.

## Dados pessoais

Os CSVs gerados têm nome e telefone de clientes reais e estão no `.gitignore`
desta pasta. Versione o ferramental, não a saída.
