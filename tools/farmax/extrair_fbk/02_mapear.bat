@echo off
REM ============================================================
REM  PASSO 2 - Descobre como se chamam as tabelas e colunas
REM  nesta versao do Farmax. Gera mapa_tabelas.txt.
REM
REM  O arquivo gerado e pequeno e NAO contem dado de cliente:
REM  pode ser enviado no chat sem problema.
REM ============================================================
setlocal

set "DESTINO=C:\temp\farmax_analise.fdb"

call "%~dp0_localiza_firebird.bat"
if errorlevel 1 exit /b 1

if not exist "%DESTINO%" goto :sem_banco

echo.
echo Lendo a estrutura do banco...

call "%~dp0_credenciais.bat"
if errorlevel 1 goto :sem_acesso

if exist "%~dp0mapa_tabelas.txt" del /q "%~dp0mapa_tabelas.txt"
"%FBDIR%\isql.exe" %CRED% "%DESTINO%" -i "%~dp002_mapear.sql" -o "%~dp0mapa_tabelas.txt"
if not exist "%~dp0mapa_tabelas.txt" goto :sem_acesso

echo.
echo OK. Gerado mapa_tabelas.txt
echo Envie esse arquivo no chat para os SQLs de exportacao serem
echo ajustados aos nomes reais desta instalacao.
exit /b 0

:sem_banco
echo.
echo [ERRO] "%DESTINO%" nao existe. Rode 01_restaurar.bat primeiro.
exit /b 1

:sem_acesso
echo.
echo [ERRO] Nao consegui conectar no banco restaurado.
echo Use FARMAX_MAPEAR.bat, que faz os dois passos de uma vez e
echo registra cada tentativa em restauracao.log.
exit /b 1
