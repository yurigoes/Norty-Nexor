@echo off
REM ============================================================
REM  Descobre como se chamam as tabelas e colunas de cliente
REM  nesta versao do Farmax. Gera mapa_tabelas.txt.
REM ============================================================
setlocal
set FB=C:\Program Files\Firebird\Firebird_3_0
set DESTINO=C:\temp\farmax_analise.fdb

"%FB%\isql.exe" -user SYSDBA -password masterkey "%DESTINO%" -i 02_mapear.sql -o mapa_tabelas.txt
if errorlevel 1 (
  echo [ERRO] isql falhou. Confira o caminho FB e se 01_restaurar.bat rodou.
  exit /b 1
)
echo OK. Abra mapa_tabelas.txt e veja o nome real da tabela de clientes.
echo Depois ajuste 03_exportar.sql com esse nome e rode 03_exportar.bat
endlocal
