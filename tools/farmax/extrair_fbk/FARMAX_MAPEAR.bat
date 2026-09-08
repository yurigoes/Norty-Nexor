@echo off
REM ================================================================
REM  FARMAX - restaura o backup e le a estrutura do banco.
REM
REM  Nao encosta no banco de producao e nao le nenhum dado de
REM  cliente: so nomes de tabela e coluna.
REM
REM  Uso: copie este arquivo sozinho para a maquina do Farmax e
REM       clique duas vezes.
REM
REM  Saida: mapa_tabelas.txt  (o que me interessa)
REM         restauracao.log   (diagnostico, se algo falhar)
REM ================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ==================================================
echo    Farmax - mapeamento da estrutura do banco
echo ==================================================
echo.

REM ---------- Ajuste aqui se os caminhos forem outros ----------
set "BACKUP=A:\Farmax ok\FarmaxWin\19FARMAX.fbk"
set "DESTINO=C:\temp\farmax_analise.fdb"
set "LOCAL=C:\temp\19FARMAX.fbk"
REM -------------------------------------------------------------

set ISC_USER=
set ISC_PASSWORD=
if exist restauracao.log del /q restauracao.log
if not exist C:\temp mkdir C:\temp

REM ---------- 1/5 Achar o Firebird ----------
set FBDIR=
call :testa_fb "A:\Farmax ok\FarmaxWin"
call :testa_fb "C:\FarmaxWin"
call :testa_fb "C:\Farmax"
call :busca_fb "%ProgramFiles%\Firebird"
call :busca_fb "%ProgramFiles(x86)%\Firebird"
call :busca_fb "C:\Firebird"
if not defined FBDIR call :varre_fb
if not defined FBDIR goto :sem_firebird
echo [1/5] Firebird: %FBDIR%

REM ---------- 2/5 Inventario da pasta do backup ----------
if not exist "%BACKUP%" goto :sem_backup
for %%F in ("%BACKUP%") do set "TAM=%%~zF"
for %%F in ("%BACKUP%") do set "PASTA=%%~dpF"
for %%F in ("%BACKUP%") do set "BASE=%%~nF"
echo [2/5] Backup: %TAM% bytes
echo === conteudo da pasta do backup === >>restauracao.log
dir "%PASTA%" >>restauracao.log 2>&1

REM Backup dividido em volumes: o Farmax costuma numerar .fbk .fbk2 ...
REM Se houver mais de um arquivo com o mesmo nome base, todos entram
REM na linha de comando, na ordem - e assim que o gbak remonta.
set "VOLUMES="
for /f "delims=" %%F in ('dir /b /o:n "%PASTA%%BASE%.*" 2^>nul') do call :junta_vol "%PASTA%%%F"
echo       volumes encontrados: %VOLUMES%
echo === volumes montados: %VOLUMES% === >>restauracao.log

REM ---------- 3/5 Copiar para disco local ----------
REM  Ler direto de A: (rede ou removivel) e a causa mais comum de
REM  leitura truncada, que faz o gbak pedir o "proximo volume".
echo [3/5] Copiando o backup para o disco local...
if exist "%LOCAL%" del /q "%LOCAL%"
copy /b /y "%BACKUP%" "%LOCAL%" >>restauracao.log 2>&1
if not exist "%LOCAL%" goto :falha_copia
for %%F in ("%LOCAL%") do set "TAMLOCAL=%%~zF"
echo       copia local: %TAMLOCAL% bytes
if not "%TAM%"=="%TAMLOCAL%" goto :copia_truncada

REM ---------- 4/5 Restaurar ----------
REM  "<nul" e essencial: sem isso o gbak fica parado num prompt
REM  interativo pedindo o proximo volume, e o script trava.
echo [4/5] Restaurando para %DESTINO%
if exist "%DESTINO%" del /q "%DESTINO%"

set "CRED="
call :restaura "" "%LOCAL%"
call :restaura "-user SYSDBA -password masterkey" "%LOCAL%"
call :restaura "-user SYSDBA -password masterke" "%LOCAL%"
call :restaura "-user SYSDBA" "%LOCAL%"

REM Se a copia unica nao bastou, tenta com todos os volumes juntos.
if not exist "%DESTINO%" echo       tentando com os volumes da pasta original...
if not exist "%DESTINO%" call :restaura_vol ""
if not exist "%DESTINO%" call :restaura_vol "-user SYSDBA -password masterkey"

if not exist "%DESTINO%" goto :falha_restauracao
echo       OK com: [%CRED%]

REM ---------- 5/5 Ler a estrutura ----------
call :escreve_sql
echo [5/5] Lendo a estrutura do banco...
if exist mapa_tabelas.txt del /q mapa_tabelas.txt
"%FBDIR%\isql.exe" %CRED% "%DESTINO%" -i _mapa.sql -o mapa_tabelas.txt >>restauracao.log 2>&1
if not exist mapa_tabelas.txt goto :falha_leitura
del /q _mapa.sql 2>nul

echo.
echo ==================================================
echo    PRONTO
echo ==================================================
echo.
echo Gerado: %~dp0mapa_tabelas.txt
echo.
echo So nomes de tabela e coluna, nenhum dado de cliente.
echo Envie esse arquivo no chat.
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
echo       procurando o Firebird no disco C:, aguarde...
for /f "delims=" %%F in ('dir /b /s "C:\gbak.exe" 2^>nul') do call :testa_fb "%%~dpF."
exit /b 0

REM Acumula um volume na lista, ignorando o que nao e arquivo de backup.
:junta_vol
set "EXT=%~x1"
if /i "%EXT%"==".fdb" exit /b 0
if /i "%EXT%"==".gdb" exit /b 0
if /i "%EXT%"==".log" exit /b 0
set "VOLUMES=!VOLUMES! "%~1""
exit /b 0

REM Restaura de um arquivo unico.
:restaura
if exist "%DESTINO%" exit /b 0
echo. >>restauracao.log
echo === tentativa [%~1] em "%~2" === >>restauracao.log
"%FBDIR%\gbak.exe" -c -v %~1 "%~2" "%DESTINO%" >>restauracao.log 2>&1 <nul
if not exist "%DESTINO%" exit /b 0
set "CRED=%~1"
exit /b 0

REM Restaura de todos os volumes da pasta original, em ordem.
:restaura_vol
if exist "%DESTINO%" exit /b 0
echo. >>restauracao.log
echo === tentativa [%~1] multi-volume: %VOLUMES% === >>restauracao.log
"%FBDIR%\gbak.exe" -c -v %~1 %VOLUMES% "%DESTINO%" >>restauracao.log 2>&1 <nul
if not exist "%DESTINO%" exit /b 0
set "CRED=%~1"
exit /b 0

:escreve_sql
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
pause
exit /b 1

:sem_backup
echo.
echo [ERRO] Backup nao encontrado em "%BACKUP%"
echo Edite a linha "set BACKUP=" no topo deste arquivo.
pause
exit /b 1

:falha_copia
echo.
echo [ERRO] Nao consegui copiar o backup para %LOCAL%
echo Veja restauracao.log
pause
exit /b 1

:copia_truncada
echo.
echo [ERRO] A copia saiu com tamanho diferente do original:
echo    origem %TAM% bytes, copia %TAMLOCAL% bytes
echo O arquivo em A: nao esta sendo lido por inteiro. Copie o .fbk
echo para o disco local pelo Explorer e rode de novo apontando
echo BACKUP para a copia.
pause
exit /b 1

:falha_restauracao
echo.
echo [ERRO] A restauracao nao funcionou.
echo.
echo Abra restauracao.log. Se aparecer "Done with volume #1" seguido
echo de pedido de outro arquivo, o backup esta incompleto: o .fbk foi
echo cortado na copia ou a rotina de backup do Farmax nao terminou.
echo Nesse caso gere um backup novo pelo proprio Farmax e use ele.
echo.
echo Me mande o restauracao.log que eu digo qual dos dois e.
pause
exit /b 1

:falha_leitura
echo.
echo [ERRO] A restauracao funcionou mas a leitura falhou.
echo Veja restauracao.log
pause
exit /b 1
