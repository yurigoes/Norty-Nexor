@echo off
REM ============================================================
REM  Restaura o backup do Farmax numa copia de trabalho.
REM  NUNCA restaure por cima do banco em producao.
REM ============================================================
setlocal

REM Ajuste estes tres caminhos se necessario:
set FB=C:\Program Files\Firebird\Firebird_3_0
set BACKUP=A:\Farmax ok\FarmaxWin\19FARMAX.fbk
set DESTINO=C:\temp\farmax_analise.fdb

if not exist "%FB%\gbak.exe" (
  echo [ERRO] gbak.exe nao encontrado em "%FB%".
  echo Procure a pasta do Firebird e ajuste a variavel FB no topo deste arquivo.
  exit /b 1
)
if not exist "%BACKUP%" (
  echo [ERRO] Backup nao encontrado: "%BACKUP%"
  exit /b 1
)
if exist "%DESTINO%" (
  echo [ERRO] "%DESTINO%" ja existe. Apague ou troque o nome antes de restaurar.
  exit /b 1
)

if not exist C:\temp mkdir C:\temp

echo Restaurando "%BACKUP%"
echo        para "%DESTINO%" ...
"%FB%\gbak.exe" -c -v -user SYSDBA -password masterkey "%BACKUP%" "%DESTINO%"

if errorlevel 1 (
  echo.
  echo [ERRO] Falha na restauracao. Se a senha nao for a padrao, edite -password.
  exit /b 1
)
echo.
echo OK. Banco de trabalho pronto em %DESTINO%
echo Proximo passo: execute 02_mapear.bat
endlocal
