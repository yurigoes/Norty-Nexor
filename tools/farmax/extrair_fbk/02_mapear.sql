/* ============================================================
   Mapa da estrutura do banco do Farmax.

   Nao le nenhum dado de cliente - so os nomes de tabela e coluna.
   O arquivo gerado (mapa_tabelas.txt) e pequeno e pode ser
   enviado no chat sem expor informacao pessoal.
   ============================================================ */
SET LIST OFF;
SET WIDTH TABELA 40;
SET WIDTH COLUNA 40;
SET WIDTH TIPO 18;

/* ---------- 1. Todas as tabelas do sistema ---------- */
SELECT TRIM(rdb$relation_name) AS TABELA
  FROM rdb$relations
 WHERE COALESCE(rdb$system_flag, 0) = 0
   AND rdb$view_blr IS NULL
 ORDER BY 1;

/* ---------- 2. Colunas das tabelas de interesse ----------
   Cadastro de cliente, contas a receber, crediario e vendas.
   E aqui que aparecem CPF, endereco, nascimento, e-mail e as
   datas de venda.                                          */
SELECT TRIM(rf.rdb$relation_name)      AS TABELA,
       TRIM(rf.rdb$field_name)         AS COLUNA,
       TRIM(t.rdb$type_name)           AS TIPO,
       COALESCE(f.rdb$character_length, f.rdb$field_precision) AS TAM
  FROM rdb$relation_fields rf
  JOIN rdb$fields    f ON f.rdb$field_name = rf.rdb$field_source
  JOIN rdb$types     t ON t.rdb$type = f.rdb$field_type
                      AND t.rdb$field_name = 'RDB$FIELD_TYPE'
  JOIN rdb$relations r ON r.rdb$relation_name = rf.rdb$relation_name
 WHERE COALESCE(r.rdb$system_flag, 0) = 0
   AND r.rdb$view_blr IS NULL
   AND (   rf.rdb$relation_name LIKE '%CLI%'
        OR rf.rdb$relation_name LIKE '%RECEB%'
        OR rf.rdb$relation_name LIKE '%CREDIARIO%'
        OR rf.rdb$relation_name LIKE '%TITULO%'
        OR rf.rdb$relation_name LIKE '%DUPLIC%'
        OR rf.rdb$relation_name LIKE '%VENDA%'
        OR rf.rdb$relation_name LIKE '%MOVIMENT%'
        OR rf.rdb$relation_name LIKE '%CONTA%'
        OR rf.rdb$relation_name LIKE '%PARCEL%' )
 ORDER BY 1, rf.rdb$field_position;

/* ---------- 3. Onde estao os codigos 1000001+ ----------
   Confirma qual tabela guarda o codigo de cliente usado nos
   relatorios, olhando so os valores minimo e maximo.        */
SELECT TRIM(rf.rdb$relation_name) AS TABELA,
       TRIM(rf.rdb$field_name)    AS COLUNA_CODIGO
  FROM rdb$relation_fields rf
  JOIN rdb$relations r ON r.rdb$relation_name = rf.rdb$relation_name
 WHERE COALESCE(r.rdb$system_flag, 0) = 0
   AND r.rdb$view_blr IS NULL
   AND rf.rdb$relation_name LIKE '%CLI%'
   AND (rf.rdb$field_name LIKE '%CODIGO%' OR rf.rdb$field_name LIKE '%COD%'
     OR rf.rdb$field_name LIKE '%ID%')
 ORDER BY 1, 2;
