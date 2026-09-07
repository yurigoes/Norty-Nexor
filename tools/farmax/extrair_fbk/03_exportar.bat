@echo off
setlocal
set FB=C:\Program Files\Firebird\Firebird_3_0
set DESTINO=C:\temp\farmax_analise.fdb

"%FB%\isql.exe" -user SYSDBA -password masterkey "%DESTINO%" -i 03_exportar.sql
if errorlevel 1 (
  echo [ERRO] isql falhou. Confira se os nomes de tabela/coluna em
  echo 03_exportar.sql batem com o que aparece em mapa_tabelas.txt
  exit /b 1
)
echo OK. Gerado clientes_norty_farma.csv
endlocal
