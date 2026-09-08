@echo off
REM ================================================================
REM  FARMAX - exporta o cadastro e os titulos em aberto.
REM
REM  Precisa do banco ja restaurado pelo FARMAX_MAPEAR.bat, que
REM  deixou C:\temp\farmax_analise.fdb pronto. Se apagou, rode o
REM  FARMAX_MAPEAR.bat de novo antes deste.
REM
REM  Coloque este arquivo na MESMA PASTA que 03_exportar.sql.
REM
REM  Saida:  conferencia.txt            confere os totais
REM          titulos_abertos.csv        um titulo por linha
REM          clientes_conta_aberta.csv  cadastro de quem deve
REM          clientes_completo.csv      a base inteira
REM ================================================================
setlocal
cd /d "%~dp0"

echo ==================================================
echo    Farmax - exportacao para o Norty Farma
echo ==================================================
echo.

set "DESTINO=C:\temp\farmax_analise.fdb"
set ISC_USER=
set ISC_PASSWORD=
if exist exportacao.log del /q exportacao.log

if not exist "%~dp003_exportar.sql" goto :sem_sql

REM ---------- Achar o Firebird ----------
set FBDIR=
call :testa_fb "A:\Farmax ok\FarmaxWin"
call :testa_fb "C:\FarmaxWin"
call :testa_fb "C:\Farmax"
call :busca_fb "%ProgramFiles%\Firebird"
call :busca_fb "%ProgramFiles(x86)%\Firebird"
call :busca_fb "C:\Firebird"
if not defined FBDIR goto :sem_firebird
echo [1/3] Firebird: %FBDIR%

if not exist "%DESTINO%" goto :sem_banco
echo [2/3] Banco: %DESTINO%

REM ---------- Exportar ----------
REM  A ordem das tentativas repete a que funcionou no mapeamento:
REM  sem credencial primeiro, que e o modo embedded.
echo [3/3] Exportando...
if exist clientes_completo.csv del /q clientes_completo.csv
call :exporta "-ch WIN1252"
call :exporta ""
call :exporta "-ch WIN1252 -user SYSDBA -password masterkey"
call :exporta "-user SYSDBA -password masterkey"
if not exist clientes_completo.csv goto :falhou

echo.
echo ==================================================
echo    PRONTO
echo ==================================================
echo.
for %%F in (conferencia.txt titulos_abertos.csv clientes_conta_aberta.csv clientes_completo.csv) do call :mostra "%%F"
echo.
echo IMPORTANTE: os tres .csv tem dados pessoais de clientes
echo (nome, CPF, endereco, telefone). O conferencia.txt nao tem:
echo so totais. Se quiser mandar so o seguro, mande esse primeiro.
echo.
pause
exit /b 0


REM ================= sub-rotinas =================

:busca_fb
for %%V in (Firebird_5_0 Firebird_4_0 Firebird_3_0 Firebird_2_5 Firebird_2_1) do call :testa_fb "%~1\%%V"
exit /b 0

:testa_fb
if defined FBDIR exit /b 0
if not exist "%~1\isql.exe" goto :testa_fb_bin
set "FBDIR=%~1"
exit /b 0
:testa_fb_bin
if not exist "%~1\bin\isql.exe" exit /b 0
set "FBDIR=%~1\bin"
exit /b 0

:exporta
if exist clientes_completo.csv exit /b 0
echo. >>exportacao.log
echo === tentativa [%~1] === >>exportacao.log
"%FBDIR%\isql.exe" %~1 "%DESTINO%" -i "%~dp003_exportar.sql" >>exportacao.log 2>&1 <nul
exit /b 0

:mostra
if not exist "%~1" exit /b 0
for %%F in ("%~1") do echo    %%~nxF  (%%~zF bytes)
exit /b 0


REM ================= erros =================

:sem_sql
echo [ERRO] 03_exportar.sql nao esta nesta pasta.
echo Os dois arquivos precisam ficar juntos.
pause
exit /b 1

:sem_firebird
echo [ERRO] Nao achei o isql.exe nesta maquina.
pause
exit /b 1

:sem_banco
echo.
echo [ERRO] "%DESTINO%" nao existe.
echo Rode o FARMAX_MAPEAR.bat primeiro: ele restaura o backup.
pause
exit /b 1

:falhou
echo.
echo [ERRO] A exportacao falhou. Abra exportacao.log: cada tentativa
echo esta registrada com o erro que o Firebird devolveu.
echo Me mande esse log que eu ajusto o SQL.
pause
exit /b 1
