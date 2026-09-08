@echo off
REM ============================================================
REM  PASSO 3 - Exporta o cadastro completo dos clientes da fila.
REM  Ajuste antes os nomes de tabela/coluna em 03_exportar.sql,
REM  conforme o que aparecer em mapa_tabelas.txt.
REM ============================================================
setlocal

set "DESTINO=C:\temp\farmax_analise.fdb"

call "%~dp0_localiza_firebird.bat"
if errorlevel 1 exit /b 1

if not exist "%DESTINO%" goto :sem_banco

call "%~dp0_credenciais.bat"
if errorlevel 1 goto :sem_acesso

"%FBDIR%\isql.exe" %CRED% "%DESTINO%" -i "%~dp003_exportar.sql"
if errorlevel 1 goto :falha

echo.
echo OK. Gerado clientes_norty_farma.csv
echo ATENCAO: esse arquivo tem dados pessoais de clientes.
exit /b 0

:sem_banco
echo.
echo [ERRO] "%DESTINO%" nao existe. Rode 01_restaurar.bat primeiro.
exit /b 1

:sem_acesso
echo.
echo [ERRO] Nao consegui conectar no banco restaurado.
exit /b 1

:falha
echo.
echo [ERRO] isql falhou. Confira se os nomes de tabela e coluna em
echo 03_exportar.sql batem com os de mapa_tabelas.txt
exit /b 1
