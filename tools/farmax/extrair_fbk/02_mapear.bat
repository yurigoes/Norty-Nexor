@echo off
REM ============================================================
REM  PASSO 2 - Descobre como se chamam as tabelas e colunas
REM  nesta versao do Farmax. Gera mapa_tabelas.txt.
REM
REM  Este arquivo e pequeno e NAO contem dado de cliente -
REM  pode ser enviado no chat sem problema.
REM ============================================================
setlocal

set "DESTINO=C:\temp\farmax_analise.fdb"

call "%~dp0_localiza_firebird.bat"
if errorlevel 1 exit /b 1

if not exist "%DESTINO%" (
  echo.
  echo [ERRO] "%DESTINO%" nao existe. Rode 01_restaurar.bat primeiro.
  exit /b 1
)

echo.
echo Lendo a estrutura do banco...

for %%S in (masterkey masterke) do (
  if not exist "%~dp0mapa_tabelas.txt" (
    "%FBDIR%\isql.exe" -user SYSDBA -password %%S "%DESTINO%" ^
      -i "%~dp002_mapear.sql" -o "%~dp0mapa_tabelas.txt" 2>&1
  )
)

if not exist "%~dp0mapa_tabelas.txt" (
  echo [ERRO] isql falhou. Confira a senha do SYSDBA.
  exit /b 1
)

echo.
echo OK. Gerado mapa_tabelas.txt
echo Envie esse arquivo no chat para os SQLs serem ajustados,
echo ou abra e procure a tabela de clientes para seguir sozinho.
endlocal
