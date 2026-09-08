/* ================================================================
   Crediario de 01/01/2026 ate hoje: os clientes tem cadastro
   completo o bastante para migrar para o Norty Farma?

   Elegivel = cliente com pelo menos um titulo EM ABERTO lancado
   de 01/01/2026 em diante. Quem so tem titulo de 2025 pra tras
   fica de fora, como pedido.

   Atencao: um cliente elegivel pode ARRASTAR divida antiga. Ele
   entra na lista (comprou em 2026), e o saldo dele vem separado
   em saldo_2026 e saldo_anterior, para a divida velha nao ser
   confundida com consumo novo.

   Gera:
     auditoria_2026.txt        SEM DADO PESSOAL - so contagens.
                               E o arquivo para mandar no chat.
     crediario_2026.csv        cadastro completo dos elegiveis.
     crediario_2026_faltas.csv os que estao incompletos demais
                               para migrar sem revisao.
   ================================================================ */

/* ---------------------------------------------------------------
   1. AUDITORIA - nenhuma linha aqui identifica cliente.
   --------------------------------------------------------------- */
OUTPUT auditoria_2026.txt;

SELECT COUNT(*) AS CLIENTES_ELEGIVEIS_2026
  FROM CLIENTES c
 WHERE EXISTS (SELECT 1 FROM CONTAS_RECEBER r
                WHERE r.CD_CLIENTE = c.CD_CLIENTE
                  AND r.DT_PAGAMENTO IS NULL
                  AND r.DT_LANCAMENTO >= DATE '2026-01-01');

/* Preenchimento campo a campo, entre os elegiveis. */
SELECT COUNT(*)                             AS TOTAL,
       COUNT(NULLIF(TRIM(c.CPF), ''))       AS TEM_CPF,
       COUNT(NULLIF(TRIM(c.RG), ''))        AS TEM_RG,
       COUNT(c.DT_NASCIMENTO)               AS TEM_NASCIMENTO,
       COUNT(NULLIF(TRIM(c.FONE), ''))      AS TEM_FONE,
       COUNT(NULLIF(TRIM(c.EMAIL), ''))     AS TEM_EMAIL
  FROM CLIENTES c
 WHERE EXISTS (SELECT 1 FROM CONTAS_RECEBER r
                WHERE r.CD_CLIENTE = c.CD_CLIENTE
                  AND r.DT_PAGAMENTO IS NULL
                  AND r.DT_LANCAMENTO >= DATE '2026-01-01');

SELECT COUNT(*)                             AS TOTAL,
       COUNT(NULLIF(TRIM(c.ENDERECO), ''))  AS TEM_ENDERECO,
       COUNT(NULLIF(TRIM(c.NUMERO), ''))    AS TEM_NUMERO,
       COUNT(NULLIF(TRIM(c.BAIRRO), ''))    AS TEM_BAIRRO,
       COUNT(NULLIF(TRIM(c.CIDADE), ''))    AS TEM_CIDADE,
       COUNT(NULLIF(TRIM(c.CEP), ''))       AS TEM_CEP
  FROM CLIENTES c
 WHERE EXISTS (SELECT 1 FROM CONTAS_RECEBER r
                WHERE r.CD_CLIENTE = c.CD_CLIENTE
                  AND r.DT_PAGAMENTO IS NULL
                  AND r.DT_LANCAMENTO >= DATE '2026-01-01');

/* Quantos dao para migrar sem revisao manual.
   Minimo aceitavel: nome + telefone + (CPF ou endereco com CEP). */
SELECT SUM(CASE WHEN TRIM(COALESCE(c.CPF,'')) <> '' THEN 1 ELSE 0 END)     AS COM_CPF,
       SUM(CASE WHEN TRIM(COALESCE(c.CPF,'')) = ''
                 AND TRIM(COALESCE(c.ENDERECO,'')) <> ''
                 AND TRIM(COALESCE(c.CEP,'')) <> ''  THEN 1 ELSE 0 END)    AS SEM_CPF_MAS_COM_ENDERECO,
       SUM(CASE WHEN TRIM(COALESCE(c.CPF,'')) = ''
                 AND (TRIM(COALESCE(c.ENDERECO,'')) = ''
                   OR TRIM(COALESCE(c.CEP,'')) = '')
                 AND TRIM(COALESCE(c.FONE,'')) <> '' THEN 1 ELSE 0 END)    AS SO_TELEFONE,
       SUM(CASE WHEN TRIM(COALESCE(c.CPF,'')) = ''
                 AND TRIM(COALESCE(c.ENDERECO,'')) = ''
                 AND TRIM(COALESCE(c.FONE,'')) = ''  THEN 1 ELSE 0 END)    AS SEM_NADA
  FROM CLIENTES c
 WHERE EXISTS (SELECT 1 FROM CONTAS_RECEBER r
                WHERE r.CD_CLIENTE = c.CD_CLIENTE
                  AND r.DT_PAGAMENTO IS NULL
                  AND r.DT_LANCAMENTO >= DATE '2026-01-01');

/* Para comparar: preenchimento na base inteira. */
SELECT COUNT(*)                             AS BASE_INTEIRA,
       COUNT(NULLIF(TRIM(c.CPF), ''))       AS TEM_CPF,
       COUNT(NULLIF(TRIM(c.ENDERECO), ''))  AS TEM_ENDERECO,
       COUNT(NULLIF(TRIM(c.FONE), ''))      AS TEM_FONE
  FROM CLIENTES c;

/* Quanto de divida esta em 2026 e quanto e arrasto de antes,
   considerando so os clientes elegiveis. */
SELECT CASE WHEN r.DT_LANCAMENTO >= DATE '2026-01-01'
            THEN 'lancado em 2026' ELSE 'lancado antes de 2026' END AS ORIGEM,
       COUNT(*)                                  AS TITULOS,
       COUNT(DISTINCT r.CD_CLIENTE)              AS CLIENTES,
       CAST(SUM(r.VALOR) AS NUMERIC(15,2))       AS TOTAL
  FROM CONTAS_RECEBER r
 WHERE r.DT_PAGAMENTO IS NULL
   AND EXISTS (SELECT 1 FROM CONTAS_RECEBER r2
                WHERE r2.CD_CLIENTE = r.CD_CLIENTE
                  AND r2.DT_PAGAMENTO IS NULL
                  AND r2.DT_LANCAMENTO >= DATE '2026-01-01')
 GROUP BY 1;

/* Movimento mes a mes em 2026, para ver o ritmo do crediario. */
SELECT EXTRACT(YEAR FROM r.DT_LANCAMENTO)  AS ANO,
       EXTRACT(MONTH FROM r.DT_LANCAMENTO) AS MES,
       COUNT(*)                            AS TITULOS,
       COUNT(DISTINCT r.CD_CLIENTE)        AS CLIENTES,
       CAST(SUM(r.VALOR) AS NUMERIC(15,2)) AS TOTAL
  FROM CONTAS_RECEBER r
 WHERE r.DT_PAGAMENTO IS NULL
   AND r.DT_LANCAMENTO >= DATE '2026-01-01'
 GROUP BY 1, 2
 ORDER BY 1, 2;

OUTPUT;


/* ---------------------------------------------------------------
   2. EXPORTACAO dos elegiveis, com o cadastro completo.
   --------------------------------------------------------------- */
SET HEADING OFF;
OUTPUT crediario_2026.csv;

SELECT 'cd_cliente;nome;cpf;rg;dt_nascimento;sexo;fone;email;endereco;'
    || 'numero;complemento;bairro;cidade;uf;cep;data_ficha;'
    || 'dt_ultima_compra;limite_credito;saldo_2026;saldo_anterior;'
    || 'saldo_total;titulos_2026;primeira_compra_2026;ultima_compra_2026;'
    || 'venc_mais_antigo;completude'
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
       CAST(CAST(a.SALDO_2026 AS NUMERIC(15,2)) AS VARCHAR(20))     || ';' ||
       CAST(CAST(a.SALDO_ANTERIOR AS NUMERIC(15,2)) AS VARCHAR(20)) || ';' ||
       CAST(CAST(a.SALDO_TOTAL AS NUMERIC(15,2)) AS VARCHAR(20))    || ';' ||
       CAST(a.TITULOS_2026 AS VARCHAR(10))                 || ';' ||
       COALESCE(CAST(a.PRIMEIRA_2026 AS VARCHAR(10)),'')   || ';' ||
       COALESCE(CAST(a.ULTIMA_2026 AS VARCHAR(10)),'')     || ';' ||
       COALESCE(CAST(a.VENC_ANTIGO AS VARCHAR(10)),'')     || ';' ||
       CASE WHEN TRIM(COALESCE(c.CPF,'')) <> '' THEN 'com CPF'
            WHEN TRIM(COALESCE(c.ENDERECO,'')) <> ''
             AND TRIM(COALESCE(c.CEP,'')) <> ''      THEN 'sem CPF, com endereco'
            WHEN TRIM(COALESCE(c.FONE,'')) <> ''     THEN 'so telefone'
            ELSE 'so o nome' END
  FROM CLIENTES c
  JOIN (SELECT CD_CLIENTE,
               SUM(CASE WHEN DT_LANCAMENTO >= DATE '2026-01-01'
                        THEN VALOR ELSE 0 END)              AS SALDO_2026,
               SUM(CASE WHEN DT_LANCAMENTO <  DATE '2026-01-01'
                         OR DT_LANCAMENTO IS NULL
                        THEN VALOR ELSE 0 END)              AS SALDO_ANTERIOR,
               SUM(VALOR)                                   AS SALDO_TOTAL,
               COUNT(CASE WHEN DT_LANCAMENTO >= DATE '2026-01-01'
                          THEN 1 END)                       AS TITULOS_2026,
               MIN(CASE WHEN DT_LANCAMENTO >= DATE '2026-01-01'
                        THEN DT_LANCAMENTO END)             AS PRIMEIRA_2026,
               MAX(CASE WHEN DT_LANCAMENTO >= DATE '2026-01-01'
                        THEN DT_LANCAMENTO END)             AS ULTIMA_2026,
               MIN(DT_VENCIMENTO)                           AS VENC_ANTIGO
          FROM CONTAS_RECEBER
         WHERE DT_PAGAMENTO IS NULL
         GROUP BY CD_CLIENTE
        HAVING COUNT(CASE WHEN DT_LANCAMENTO >= DATE '2026-01-01'
                          THEN 1 END) > 0) a ON a.CD_CLIENTE = c.CD_CLIENTE
 ORDER BY a.SALDO_TOTAL DESC;

OUTPUT;


/* ---------------------------------------------------------------
   3. Os que nao tem cadastro suficiente para migrar direto.
      Lista curta, para preencher no balcao.
   --------------------------------------------------------------- */
OUTPUT crediario_2026_faltas.csv;

SELECT 'cd_cliente;nome;fone;saldo_total;o_que_falta' FROM rdb$database;

SELECT CAST(CAST(c.CD_CLIENTE AS BIGINT) AS VARCHAR(20))   || ';' ||
       REPLACE(COALESCE(c.NOME,''), ';', ',')              || ';' ||
       REPLACE(COALESCE(c.FONE,''), ';', ',')              || ';' ||
       CAST(CAST(a.SALDO_TOTAL AS NUMERIC(15,2)) AS VARCHAR(20)) || ';' ||
       TRIM(CASE WHEN TRIM(COALESCE(c.CPF,'')) = ''      THEN 'CPF ' ELSE '' END ||
            CASE WHEN TRIM(COALESCE(c.ENDERECO,'')) = '' THEN 'endereco ' ELSE '' END ||
            CASE WHEN TRIM(COALESCE(c.CEP,'')) = ''      THEN 'CEP ' ELSE '' END ||
            CASE WHEN c.DT_NASCIMENTO IS NULL            THEN 'nascimento ' ELSE '' END ||
            CASE WHEN TRIM(COALESCE(c.FONE,'')) = ''     THEN 'telefone ' ELSE '' END)
  FROM CLIENTES c
  JOIN (SELECT CD_CLIENTE, SUM(VALOR) AS SALDO_TOTAL
          FROM CONTAS_RECEBER
         WHERE DT_PAGAMENTO IS NULL
         GROUP BY CD_CLIENTE
        HAVING COUNT(CASE WHEN DT_LANCAMENTO >= DATE '2026-01-01'
                          THEN 1 END) > 0) a ON a.CD_CLIENTE = c.CD_CLIENTE
 WHERE TRIM(COALESCE(c.CPF,'')) = ''
    OR TRIM(COALESCE(c.ENDERECO,'')) = ''
    OR TRIM(COALESCE(c.CEP,'')) = ''
 ORDER BY a.SALDO_TOTAL DESC;

OUTPUT;
SET HEADING ON;
