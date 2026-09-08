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
echo.

REM O Firebird trunca a senha em 8 caracteres, entao masterkey = masterke.
for %%S in (masterkey masterke) do (
  if not exist "%DESTINO%" (
    "%FBDIR%\gbak.exe" -c -user SYSDBA -password %%S "%BACKUP%" "%DESTINO%" 2>&1
  )
)

if not exist "%DESTINO%" (
  echo.
  echo [ERRO] A restauracao falhou.
  echo Se a senha do SYSDBA nao for a padrao, edite a linha "for %%S in (...)"
  echo acima e coloque a senha correta.
  exit /b 1
)

echo.
echo OK. Banco de trabalho criado em %DESTINO%
echo Agora rode: 02_mapear.bat
endlocal
