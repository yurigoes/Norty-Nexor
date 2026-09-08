@echo off
REM ============================================================
REM  Descobre como este Firebird aceita conexao e define CRED.
REM  "Sem senha" normalmente e Firebird embedded, que dispensa
REM  autenticacao - por isso a primeira tentativa e sem nada.
REM  Chamado pelos scripts numerados; precisa de FBDIR definido.
REM ============================================================
set ISC_USER=
set ISC_PASSWORD=
set "CRED="
set "OK="

if not exist "%~dp0_cred.txt" goto :descobre
set /p CRED=<"%~dp0_cred.txt"
exit /b 0

:descobre
if not exist "%DESTINO%" exit /b 1
call :tenta ""
call :tenta "-user SYSDBA -password masterkey"
call :tenta "-user SYSDBA -password masterke"
call :tenta "-user SYSDBA"
call :tenta "-user SYSDBA -password x"
call :tenta "-user SYSDBA -password farmax"
if not defined OK exit /b 1
REM "echo." preserva a credencial vazia do modo embedded.
> "%~dp0_cred.txt" echo.%CRED%
exit /b 0

:tenta
if defined OK exit /b 0
echo SELECT 1 FROM rdb$database; > "%TEMP%\_ping.sql"
"%FBDIR%\isql.exe" %~1 "%DESTINO%" -i "%TEMP%\_ping.sql" -o "%TEMP%\_ping.out" 2>nul
if errorlevel 1 exit /b 0
set "OK=1"
set "CRED=%~1"
exit /b 0
