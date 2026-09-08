/* ================================================================
   Farmax -> Norty Farma : exportacao do cadastro e dos titulos.

   Nomes de tabela e coluna confirmados no mapa_tabelas.txt desta
   instalacao (Firebird 4.0, base 19FARMAX):

     CLIENTES         CD_CLIENTE, NOME, CPF, RG, DT_NASCIMENTO,
                      EMAIL, ENDERECO, NUMERO, COMPLEMENTO, BAIRRO,
                      CIDADE, UF, CEP, FONE, CONTATO, DATA_FICHA,
                      DT_ULTIMA_COMPRA, LIMITE_CREDITO, SALDO, STATUS
     CONTAS_RECEBER   CD_CLIENTE, DT_LANCAMENTO, DT_VENCIMENTO,
                      VALOR, DT_PAGAMENTO, VL_PAGAMENTO, VL_SALDO

   Gera quatro arquivos na pasta atual:
     conferencia.txt          totais para bater com os relatorios
     titulos_abertos.csv      um titulo por linha, com as datas reais
     clientes_conta_aberta.csv cadastro completo de quem deve
     clientes_completo.csv    a base inteira, para a migracao

   Datas saem no formato do Firebird (AAAA-MM-DD) e decimais com
   ponto: e o formato que o script de analise le. Separador ";".
   ================================================================ */

/* ---------------------------------------------------------------
   1. CONFERENCIA - antes de exportar, descobrir qual definicao de
   "titulo em aberto" reproduz os relatorios em HTML, que somam
   R$ 40.356,65 em 90 clientes. So assim a exportacao e confiavel.
   --------------------------------------------------------------- */
OUTPUT conferencia.txt;

SELECT 'A) DT_PAGAMENTO nulo' AS DEFINICAO,
       COUNT(DISTINCT CD_CLIENTE) AS CLIENTES,
       COUNT(*) AS TITULOS,
       CAST(SUM(VALOR) AS NUMERIC(15,2)) AS TOTAL
  FROM CONTAS_RECEBER
 WHERE DT_PAGAMENTO IS NULL;

SELECT 'B) VL_SALDO > 0' AS DEFINICAO,
       COUNT(DISTINCT CD_CLIENTE) AS CLIENTES,
       COUNT(*) AS TITULOS,
       CAST(SUM(VL_SALDO) AS NUMERIC(15,2)) AS TOTAL
  FROM CONTAS_RECEBER
 WHERE COALESCE(VL_SALDO, 0) > 0;

SELECT 'C) VALOR - VL_PAGAMENTO > 0' AS DEFINICAO,
       COUNT(DISTINCT CD_CLIENTE) AS CLIENTES,
       COUNT(*) AS TITULOS,
       CAST(SUM(VALOR - COALESCE(VL_PAGAMENTO,0)) AS NUMERIC(15,2)) AS TOTAL
  FROM CONTAS_RECEBER
 WHERE VALOR - COALESCE(VL_PAGAMENTO, 0) > 0.004;

SELECT 'D) A) vencidos ate hoje' AS DEFINICAO,
       COUNT(DISTINCT CD_CLIENTE) AS CLIENTES,
       COUNT(*) AS TITULOS,
       CAST(SUM(VALOR) AS NUMERIC(15,2)) AS TOTAL
  FROM CONTAS_RECEBER
 WHERE DT_PAGAMENTO IS NULL
   AND DT_VENCIMENTO < CURRENT_DATE;

/* Quantas filiais tem titulo em aberto (o relatorio era so da ALC) */
SELECT CD_FILIAL,
       COUNT(DISTINCT CD_CLIENTE) AS CLIENTES,
       CAST(SUM(VALOR) AS NUMERIC(15,2)) AS TOTAL
  FROM CONTAS_RECEBER
 WHERE DT_PAGAMENTO IS NULL
 GROUP BY CD_FILIAL
 ORDER BY 1;

/* Como a base se distribui no tempo */
SELECT EXTRACT(YEAR FROM DT_VENCIMENTO) AS ANO_VENCIMENTO,
       COUNT(*) AS TITULOS,
       CAST(SUM(VALOR) AS NUMERIC(15,2)) AS TOTAL
  FROM CONTAS_RECEBER
 WHERE DT_PAGAMENTO IS NULL
 GROUP BY 1
 ORDER BY 1;

OUTPUT;


/* ---------------------------------------------------------------
   2. TITULOS EM ABERTO, um por linha.
   E daqui que sai a resposta exata de "comprou de 01/2026 pra ca":
   DT_LANCAMENTO e a data real da compra, nao uma deducao.
   --------------------------------------------------------------- */
SET HEADING OFF;
OUTPUT titulos_abertos.csv;

SELECT 'cd_cliente;nome;cd_filial;dt_lancamento;dt_vencimento;valor;'
    || 'vl_pagamento;vl_saldo;documento;parcela'
  FROM rdb$database;

SELECT CAST(CAST(cr.CD_CLIENTE AS BIGINT) AS VARCHAR(20)) || ';' ||
       REPLACE(COALESCE(c.NOME,''), ';', ',')             || ';' ||
       CAST(CAST(COALESCE(cr.CD_FILIAL,0) AS BIGINT) AS VARCHAR(10)) || ';' ||
       COALESCE(CAST(cr.DT_LANCAMENTO AS VARCHAR(10)), '') || ';' ||
       COALESCE(CAST(cr.DT_VENCIMENTO AS VARCHAR(10)), '') || ';' ||
       CAST(CAST(COALESCE(cr.VALOR,0) AS NUMERIC(15,2)) AS VARCHAR(20)) || ';' ||
       CAST(CAST(COALESCE(cr.VL_PAGAMENTO,0) AS NUMERIC(15,2)) AS VARCHAR(20)) || ';' ||
       CAST(CAST(COALESCE(cr.VL_SALDO,0) AS NUMERIC(15,2)) AS VARCHAR(20)) || ';' ||
       REPLACE(COALESCE(cr.DOCUMENTO,''), ';', ',')       || ';' ||
       CAST(COALESCE(cr.PARCELA,0) AS VARCHAR(10))
  FROM CONTAS_RECEBER cr
  LEFT JOIN CLIENTES c ON c.CD_CLIENTE = cr.CD_CLIENTE
 WHERE cr.DT_PAGAMENTO IS NULL
 ORDER BY cr.CD_CLIENTE, cr.DT_VENCIMENTO;

OUTPUT;


/* ---------------------------------------------------------------
   3. CADASTRO COMPLETO de quem tem titulo em aberto.
   --------------------------------------------------------------- */
OUTPUT clientes_conta_aberta.csv;

SELECT 'cd_cliente;nome;cpf;rg;dt_nascimento;sexo;fone;contato;email;'
    || 'endereco;numero;complemento;bairro;cidade;uf;cep;data_ficha;'
    || 'dt_ultima_compra;limite_credito;saldo_cadastro;status;'
    || 'saldo_aberto;qtd_titulos;venc_mais_antigo;venc_mais_recente;'
    || 'compra_mais_recente_aberta;observacao'
  FROM rdb$database;

SELECT CAST(CAST(c.CD_CLIENTE AS BIGINT) AS VARCHAR(20))   || ';' ||
       REPLACE(COALESCE(c.NOME,''), ';', ',')              || ';' ||
       COALESCE(c.CPF,'')                                  || ';' ||
       COALESCE(c.RG,'')                                   || ';' ||
       COALESCE(CAST(c.DT_NASCIMENTO AS VARCHAR(10)),'')   || ';' ||
       COALESCE(c.SEXO,'')                                 || ';' ||
       REPLACE(COALESCE(c.FONE,''), ';', ',')              || ';' ||
       REPLACE(COALESCE(c.CONTATO,''), ';', ',')           || ';' ||
       COALESCE(c.EMAIL,'')                                || ';' ||
       REPLACE(COALESCE(c.ENDERECO,''), ';', ',')          || ';' ||
       COALESCE(c.NUMERO,'')                               || ';' ||
       REPLACE(COALESCE(c.COMPLEMENTO,''), ';', ',')       || ';' ||
       REPLACE(COALESCE(c.BAIRRO,''), ';', ',')            || ';' ||
       REPLACE(COALESCE(c.CIDADE,''), ';', ',')            || ';' ||
       COALESCE(c.UF,'')                                   || ';' ||
       COALESCE(c.CEP,'')                                  || ';' ||
       COALESCE(CAST(c.DATA_FICHA AS VARCHAR(10)),'')      || ';' ||
       COALESCE(CAST(c.DT_ULTIMA_COMPRA AS VARCHAR(10)),'') || ';' ||
       CAST(CAST(COALESCE(c.LIMITE_CREDITO,0) AS NUMERIC(15,2)) AS VARCHAR(20)) || ';' ||
       CAST(CAST(COALESCE(c.SALDO,0) AS NUMERIC(15,2)) AS VARCHAR(20)) || ';' ||
       COALESCE(c.STATUS,'')                               || ';' ||
       CAST(CAST(a.SALDO_ABERTO AS NUMERIC(15,2)) AS VARCHAR(20)) || ';' ||
       CAST(a.QTD_TITULOS AS VARCHAR(10))                  || ';' ||
       COALESCE(CAST(a.VENC_ANTIGO AS VARCHAR(10)),'')     || ';' ||
       COALESCE(CAST(a.VENC_RECENTE AS VARCHAR(10)),'')    || ';' ||
       COALESCE(CAST(a.LANC_RECENTE AS VARCHAR(10)),'')    || ';' ||
       REPLACE(REPLACE(REPLACE(COALESCE(c.OBSERVACAO_GERAL,''),
               ';', ','), ASCII_CHAR(13), ' '), ASCII_CHAR(10), ' ')
  FROM CLIENTES c
  JOIN (SELECT CD_CLIENTE,
               SUM(VALOR)          AS SALDO_ABERTO,
               COUNT(*)            AS QTD_TITULOS,
               MIN(DT_VENCIMENTO)  AS VENC_ANTIGO,
               MAX(DT_VENCIMENTO)  AS VENC_RECENTE,
               MAX(DT_LANCAMENTO)  AS LANC_RECENTE
          FROM CONTAS_RECEBER
         WHERE DT_PAGAMENTO IS NULL
         GROUP BY CD_CLIENTE) a ON a.CD_CLIENTE = c.CD_CLIENTE
 ORDER BY a.SALDO_ABERTO DESC;

OUTPUT;


/* ---------------------------------------------------------------
   4. BASE INTEIRA, para a migracao para o Norty Farma.
   --------------------------------------------------------------- */
OUTPUT clientes_completo.csv;

SELECT 'cd_cliente;nome;cpf;rg;dt_nascimento;sexo;fone;email;endereco;'
    || 'numero;complemento;bairro;cidade;uf;cep;data_ficha;'
    || 'dt_ultima_compra;limite_credito;saldo_cadastro;status'
  FROM rdb$database;

SELECT CAST(CAST(c.CD_CLIENTE AS BIGINT) AS VARCHAR(20))   || ';' ||
       REPLACE(COALESCE(c.NOME,''), ';', ',')              || ';' ||
       COALESCE(c.CPF,'')                                  || ';' ||
       COALESCE(c.RG,'')                                   || ';' ||
       COALESCE(CAST(c.DT_NASCIMENTO AS VARCHAR(10)),'')   || ';' ||
       COALESCE(c.SEXO,'')                                 || ';' ||
       REPLACE(COALESCE(c.FONE,''), ';', ',')              || ';' ||
       COALESCE(c.EMAIL,'')                                || ';' ||
       REPLACE(COALESCE(c.ENDERECO,''), ';', ',')          || ';' ||
       COALESCE(c.NUMERO,'')                               || ';' ||
       REPLACE(COALESCE(c.COMPLEMENTO,''), ';', ',')       || ';' ||
       REPLACE(COALESCE(c.BAIRRO,''), ';', ',')            || ';' ||
       REPLACE(COALESCE(c.CIDADE,''), ';', ',')            || ';' ||
       COALESCE(c.UF,'')                                   || ';' ||
       COALESCE(c.CEP,'')                                  || ';' ||
       COALESCE(CAST(c.DATA_FICHA AS VARCHAR(10)),'')      || ';' ||
       COALESCE(CAST(c.DT_ULTIMA_COMPRA AS VARCHAR(10)),'') || ';' ||
       CAST(CAST(COALESCE(c.LIMITE_CREDITO,0) AS NUMERIC(15,2)) AS VARCHAR(20)) || ';' ||
       CAST(CAST(COALESCE(c.SALDO,0) AS NUMERIC(15,2)) AS VARCHAR(20)) || ';' ||
       COALESCE(c.STATUS,'')
  FROM CLIENTES c
 ORDER BY c.CD_CLIENTE;

OUTPUT;
SET HEADING ON;
