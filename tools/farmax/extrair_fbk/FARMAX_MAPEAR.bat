@echo off
REM ================================================================
REM  FARMAX - PASSOS 1 e 2 NUM ARQUIVO SO
REM
REM  Restaura o backup numa copia de trabalho e le a estrutura do
REM  banco. Nao encosta no banco de producao e nao le nenhum dado
REM  de cliente: so nomes de tabela e coluna.
REM
REM  Uso: copie este arquivo sozinho para a maquina do Farmax e
REM       clique duas vezes.
REM
REM  Saida: mapa_tabelas.txt, na mesma pasta deste arquivo.
REM ================================================================
setlocal
cd /d "%~dp0"

echo ==================================================
echo    Farmax - mapeamento da estrutura do banco
echo ==================================================
echo.

REM ---------- Ajuste aqui se os caminhos forem outros ----------
set "BACKUP=A:\Farmax ok\FarmaxWin\19FARMAX.fbk"
set "DESTINO=C:\temp\farmax_analise.fdb"
set "SENHA=masterkey"
REM -------------------------------------------------------------

REM ---------- 1/4 Achar o Firebird ----------
REM  As chamadas ficam fora de blocos entre parenteses de proposito:
REM  %ProgramFiles(x86)% tem um ")" que fecharia o bloco antes da hora.
set FBDIR=
call :busca_fb "%ProgramFiles%\Firebird"
call :busca_fb "%ProgramFiles(x86)%\Firebird"
call :busca_fb "C:\Firebird"
call :testa_fb "C:\FarmaxWin"
call :testa_fb "C:\Farmax"
call :testa_fb "A:\Farmax ok\FarmaxWin"
if not defined FBDIR call :varre_fb
if not defined FBDIR goto :sem_firebird
echo [1/4] Firebird encontrado em: %FBDIR%

REM ---------- 2/4 Conferir o backup ----------
if not exist "%BACKUP%" goto :sem_backup
echo [2/4] Backup encontrado: %BACKUP%

REM ---------- 3/4 Restaurar numa copia ----------
if not exist C:\temp mkdir C:\temp
if exist "%DESTINO%" del /q "%DESTINO%"
echo [3/4] Restaurando para %DESTINO% ...
"%FBDIR%\gbak.exe" -c -user SYSDBA -password "%SENHA%" "%BACKUP%" "%DESTINO%" >restauracao.log 2>&1
REM O Firebird trunca a senha em 8 caracteres; masterkey = masterke.
if not exist "%DESTINO%" "%FBDIR%\gbak.exe" -c -user SYSDBA -password masterke "%BACKUP%" "%DESTINO%" >>restauracao.log 2>&1
if not exist "%DESTINO%" goto :falha_restauracao

REM ---------- 4/4 Ler a estrutura ----------
call :escreve_sql
echo [4/4] Lendo a estrutura do banco...
if exist mapa_tabelas.txt del /q mapa_tabelas.txt
"%FBDIR%\isql.exe" -user SYSDBA -password "%SENHA%" "%DESTINO%" -i _mapa.sql -o mapa_tabelas.txt >>restauracao.log 2>&1
if not exist mapa_tabelas.txt "%FBDIR%\isql.exe" -user SYSDBA -password masterke "%DESTINO%" -i _mapa.sql -o mapa_tabelas.txt >>restauracao.log 2>&1
del /q _mapa.sql 2>nul
if not exist mapa_tabelas.txt goto :falha_leitura

echo.
echo ==================================================
echo    PRONTO
echo ==================================================
echo.
echo Gerado: %~dp0mapa_tabelas.txt
echo.
echo O arquivo tem so nomes de tabela e coluna, nenhum dado de
echo cliente. Envie ele no chat para os SQLs de exportacao serem
echo ajustados aos nomes reais desta instalacao do Farmax.
echo.
pause
exit /b 0


REM ================= sub-rotinas =================

:busca_fb
for %%V in (Firebird_5_0 Firebird_4_0 Firebird_3_0 Firebird_2_5 Firebird_2_1) do call :testa_fb "%~1\%%V"
exit /b 0

:testa_fb
if defined FBDIR exit /b 0
if not exist "%~1\gbak.exe" goto :testa_fb_bin
set "FBDIR=%~1"
exit /b 0
:testa_fb_bin
if not exist "%~1\bin\gbak.exe" exit /b 0
set "FBDIR=%~1\bin"
exit /b 0

:varre_fb
echo       Firebird nao esta nos lugares comuns, varrendo o disco C:
echo       (pode levar um minuto)
for /f "delims=" %%F in ('dir /b /s "C:\gbak.exe" 2^>nul') do call :testa_fb "%%~dpF."
exit /b 0

:escreve_sql
REM Consulta so o catalogo do Firebird: nenhuma tabela de dados e lida.
> _mapa.sql echo SET LIST OFF;
>>_mapa.sql echo /* ---------- Tabelas do sistema ---------- */
>>_mapa.sql echo SELECT TRIM(rdb$relation_name) AS TABELA FROM rdb$relations
>>_mapa.sql echo  WHERE COALESCE(rdb$system_flag,0)=0 AND rdb$view_blr IS NULL ORDER BY 1;
>>_mapa.sql echo /* ---------- Colunas das tabelas de interesse ---------- */
>>_mapa.sql echo SELECT TRIM(rf.rdb$relation_name) AS TABELA, TRIM(rf.rdb$field_name) AS COLUNA,
>>_mapa.sql echo        TRIM(t.rdb$type_name) AS TIPO,
>>_mapa.sql echo        COALESCE(f.rdb$character_length,f.rdb$field_precision) AS TAM
>>_mapa.sql echo   FROM rdb$relation_fields rf
>>_mapa.sql echo   JOIN rdb$fields f ON f.rdb$field_name=rf.rdb$field_source
>>_mapa.sql echo   JOIN rdb$types t ON t.rdb$type=f.rdb$field_type AND t.rdb$field_name='RDB$FIELD_TYPE'
>>_mapa.sql echo   JOIN rdb$relations r ON r.rdb$relation_name=rf.rdb$relation_name
>>_mapa.sql echo  WHERE COALESCE(r.rdb$system_flag,0)=0 AND r.rdb$view_blr IS NULL
>>_mapa.sql echo    AND (rf.rdb$relation_name LIKE '%%CLI%%' OR rf.rdb$relation_name LIKE '%%RECEB%%'
>>_mapa.sql echo      OR rf.rdb$relation_name LIKE '%%CREDIARIO%%' OR rf.rdb$relation_name LIKE '%%TITULO%%'
>>_mapa.sql echo      OR rf.rdb$relation_name LIKE '%%DUPLIC%%' OR rf.rdb$relation_name LIKE '%%VENDA%%'
>>_mapa.sql echo      OR rf.rdb$relation_name LIKE '%%MOVIMENT%%' OR rf.rdb$relation_name LIKE '%%CONTA%%'
>>_mapa.sql echo      OR rf.rdb$relation_name LIKE '%%PARCEL%%')
>>_mapa.sql echo  ORDER BY 1, rf.rdb$field_position;
exit /b 0


REM ================= erros =================

:sem_firebird
echo.
echo [ERRO] Nao achei o gbak.exe nesta maquina.
echo Ache onde o Firebird esta instalado e acrescente a pasta
echo na lista de "call :testa_fb" no topo deste arquivo.
echo.
pause
exit /b 1

:sem_backup
echo.
echo [ERRO] Backup nao encontrado em:
echo    "%BACKUP%"
echo Edite a linha "set BACKUP=" no topo deste arquivo.
echo.
pause
exit /b 1

:falha_restauracao
echo.
echo [ERRO] A restauracao falhou. Abra restauracao.log para ver o motivo.
echo Se a senha do SYSDBA nao for a padrao, edite "set SENHA=" no topo.
echo.
pause
exit /b 1

:falha_leitura
echo.
echo [ERRO] A leitura da estrutura falhou. Veja restauracao.log
echo.
pause
exit /b 1
