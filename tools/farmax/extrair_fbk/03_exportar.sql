/* ============================================================
   Cadastro completo dos clientes com titulo em aberto de 01/2026
   em diante — os 19 identificados no cruzamento dos relatorios.

   ANTES DE RODAR: abra mapa_tabelas.txt (gerado pelo 02) e troque
   os nomes abaixo pelos reais desta instalacao. No Farmax a tabela
   costuma ser CLIENTES ou CADCLIENTE; os nomes de coluna variam
   entre versoes.

     tabela   CLIENTES     -> nome real da tabela
     CODIGO   CPF_CNPJ ... -> nomes reais das colunas
   ============================================================ */
SET NAMES WIN1252;
SET HEADING OFF;
OUTPUT clientes_norty_farma.csv;

SELECT 'codigo;nome;cpf;rg;nascimento;telefone;celular;email;endereco;numero;'
    || 'complemento;bairro;cidade;uf;cep;limite;data_cadastro'
  FROM rdb$database;

SELECT TRIM(COALESCE(c.CODIGO, ''))     || ';' ||
       TRIM(COALESCE(c.NOME, ''))       || ';' ||
       TRIM(COALESCE(c.CPF, ''))        || ';' ||
       TRIM(COALESCE(c.RG, ''))         || ';' ||
       COALESCE(CAST(c.NASCIMENTO AS VARCHAR(10)), '') || ';' ||
       TRIM(COALESCE(c.TELEFONE, ''))   || ';' ||
       TRIM(COALESCE(c.CELULAR, ''))    || ';' ||
       TRIM(COALESCE(c.EMAIL, ''))      || ';' ||
       TRIM(COALESCE(c.ENDERECO, ''))   || ';' ||
       TRIM(COALESCE(c.NUMERO, ''))     || ';' ||
       TRIM(COALESCE(c.COMPLEMENTO, '')) || ';' ||
       TRIM(COALESCE(c.BAIRRO, ''))     || ';' ||
       TRIM(COALESCE(c.CIDADE, ''))     || ';' ||
       TRIM(COALESCE(c.UF, ''))         || ';' ||
       TRIM(COALESCE(c.CEP, ''))        || ';' ||
       COALESCE(CAST(c.LIMITE AS VARCHAR(20)), '0') || ';' ||
       COALESCE(CAST(c.DATA_CADASTRO AS VARCHAR(10)), '')
  FROM CLIENTES c
 WHERE CAST(c.CODIGO AS VARCHAR(20)) IN (
       '1000002','1000003','1000009','1000025','1000044','1000169','1000173',
       '1000198','1000200','1000338','1000355','1000360','1000374','1000377',
       '1000411','1000458','1000465','1000479','1000481')
 ORDER BY c.CODIGO;

OUTPUT;
SET HEADING ON;
