/* ============================================================
   OPCIONAL, porem o mais valioso.

   Os relatorios em HTML nao trazem data de compra — a analise
   deduziu tudo a partir de "dias em atraso". Com o banco na mao
   da para pegar a data real de cada venda e responder de forma
   direta "quem comprou de 01/2026 pra ca".

   Ajuste os nomes conforme mapa_tabelas.txt.
   ============================================================ */
SET NAMES WIN1252;
SET HEADING OFF;
OUTPUT movimento_clientes.csv;

SELECT 'codigo;nome;ultima_compra;primeira_compra;qtd_compras_2026;'
    || 'valor_comprado_2026;saldo_aberto'
  FROM rdb$database;

SELECT TRIM(CAST(c.CODIGO AS VARCHAR(20)))            || ';' ||
       TRIM(c.NOME)                                    || ';' ||
       COALESCE(CAST(MAX(v.DATA) AS VARCHAR(10)), '')  || ';' ||
       COALESCE(CAST(MIN(v.DATA) AS VARCHAR(10)), '')  || ';' ||
       CAST(COUNT(CASE WHEN v.DATA >= DATE '2026-01-01' THEN 1 END) AS VARCHAR(10)) || ';' ||
       CAST(COALESCE(SUM(CASE WHEN v.DATA >= DATE '2026-01-01'
                              THEN v.VALOR_TOTAL END), 0) AS VARCHAR(20)) || ';' ||
       CAST(COALESCE(SUM(CASE WHEN v.PAGO = 'N' THEN v.VALOR_TOTAL END), 0) AS VARCHAR(20))
  FROM CLIENTES c
  JOIN VENDAS   v ON v.CODIGO_CLIENTE = c.CODIGO
 GROUP BY c.CODIGO, c.NOME
HAVING MAX(v.DATA) >= DATE '2026-01-01'
    OR SUM(CASE WHEN v.PAGO = 'N' THEN v.VALOR_TOTAL END) > 0
 ORDER BY 1;

OUTPUT;
SET HEADING ON;
