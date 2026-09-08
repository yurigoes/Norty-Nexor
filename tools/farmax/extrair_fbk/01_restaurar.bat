@echo off
REM ============================================================
REM  PASSO 1 - Restaura o backup do Farmax numa copia de trabalho.
REM  NUNCA restaura por cima do banco de producao.
REM ============================================================
setlocal enabledelayedexpansion

set "BACKUP=A:\Farmax ok\FarmaxWin\19FARMAX.fbk"
set "DESTINO=C:\temp\farmax_analise.fdb"

call "%~dp0_localiza_firebird.bat"
if errorlevel 1 exit /b 1

if not exist "%BACKUP%" (
  echo.
  echo [ERRO] Backup nao encontrado em:
  echo   "%BACKUP%"
  echo Ajuste a variavel BACKUP no topo deste arquivo.
  exit /b 1
)

if not exist C:\temp mkdir C:\temp
if exist "%DESTINO%" (
  echo Ja existe "%DESTINO%" de uma execucao anterior. Apagando...
  del /q "%DESTINO%"
)

echo.
echo Restaurando "%BACKUP%"
echo        para "%DESTINO%"
echo (testando as formas de autenticacao, uma de cada vez)
echo.

set ISC_USER=
set ISC_PASSWORD=
set "CRED="
if exist restauracao.log del /q restauracao.log

REM Embedded dispensa autenticacao - e o caso de quem "nao tem senha".
call :restaura ""
call :restaura "-user SYSDBA -password masterkey"
REM O Firebird corta a senha em 8 caracteres.
call :restaura "-user SYSDBA -password masterke"
call :restaura "-user SYSDBA"
call :restaura "-user SYSDBA -password x"
call :restaura "-user SYSDBA -password farmax"

if not exist "%DESTINO%" goto :falhou

REM "echo." e nao "echo": com CRED vazio (embedded) um "echo" solto
REM gravaria o texto "ECHO is on." no lugar de uma linha em branco.
> _cred.txt echo.%CRED%

echo.
echo OK. Banco de trabalho criado em %DESTINO%
echo Autenticacao que funcionou: [%CRED%]
echo Agora rode: 02_mapear.bat
exit /b 0

:falhou
echo.
echo [ERRO] A restauracao nao funcionou em nenhuma tentativa.
echo Abra restauracao.log: cada tentativa esta registrada com o
echo erro que o Firebird devolveu. Me mande esse log que eu ajusto.
exit /b 1

REM Tenta uma forma de autenticacao; para na primeira que der certo.
:restaura
if exist "%DESTINO%" exit /b 0
echo. >>restauracao.log
echo === tentativa: [%~1] === >>restauracao.log
"%FBDIR%\gbak.exe" -c %~1 "%BACKUP%" "%DESTINO%" >>restauracao.log 2>&1
if not exist "%DESTINO%" exit /b 0
set "CRED=%~1"
exit /b 0
