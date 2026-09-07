/* Tabelas cujo nome sugere cadastro de cliente */
SELECT TRIM(rdb$relation_name) AS TABELA
  FROM rdb$relations
 WHERE rdb$system_flag = 0
   AND (rdb$relation_name LIKE '%CLI%' OR rdb$relation_name LIKE '%CLIENTE%')
 ORDER BY 1;

/* Colunas dessas tabelas — é aqui que se descobre onde estão CPF,
   endereço, nascimento e e-mail. */
SELECT TRIM(rf.rdb$relation_name) AS TABELA,
       TRIM(rf.rdb$field_name)    AS COLUNA,
       TRIM(t.rdb$type_name)      AS TIPO,
       f.rdb$character_length     AS TAM
  FROM rdb$relation_fields rf
  JOIN rdb$fields f  ON f.rdb$field_name = rf.rdb$field_source
  JOIN rdb$types  t  ON t.rdb$type = f.rdb$field_type
                    AND t.rdb$field_name = 'RDB$FIELD_TYPE'
  JOIN rdb$relations r ON r.rdb$relation_name = rf.rdb$relation_name
 WHERE r.rdb$system_flag = 0
   AND (rf.rdb$relation_name LIKE '%CLI%' OR rf.rdb$relation_name LIKE '%CLIENTE%')
 ORDER BY 1, rf.rdb$field_position;

/* Tabelas de contas a receber / crediario, para conferir os saldos */
SELECT TRIM(rdb$relation_name) AS TABELA
  FROM rdb$relations
 WHERE rdb$system_flag = 0
   AND (rdb$relation_name LIKE '%RECEB%' OR rdb$relation_name LIKE '%CREDIARIO%'
     OR rdb$relation_name LIKE '%TITULO%'  OR rdb$relation_name LIKE '%DUPLIC%'
     OR rdb$relation_name LIKE '%CONTA%'   OR rdb$relation_name LIKE '%VENDA%')
 ORDER BY 1;
