@echo off
setlocal
call "%~dp0_localiza_firebird.bat"
if errorlevel 1 exit /b 1
set DESTINO=C:\temp\farmax_analise.fdb

"%FBDIR%\isql.exe" -user SYSDBA -password masterkey "%DESTINO%" -i 03_exportar.sql
if errorlevel 1 (
  echo [ERRO] isql falhou. Confira se os nomes de tabela/coluna em
  echo 03_exportar.sql batem com o que aparece em mapa_tabelas.txt
  exit /b 1
)
echo OK. Gerado clientes_norty_farma.csv
endlocal
