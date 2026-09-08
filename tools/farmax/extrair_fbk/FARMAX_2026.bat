@echo off
REM ================================================================
REM  FARMAX - crediario de 01/01/2026 ate hoje.
REM
REM  Responde: os clientes que compraram a prazo de janeiro pra ca
REM  tem cadastro completo o bastante para migrar para o Norty
REM  Farma? E exporta so esses. Quem so deve de 2025 pra tras fica
REM  de fora.
REM
REM  Precisa do banco ja restaurado pelo FARMAX_MAPEAR.bat.
REM  Coloque este arquivo na MESMA PASTA que 04_crediario_2026.sql.
REM
REM  Saida:  auditoria_2026.txt         SEM DADO PESSOAL, so contagens
REM          crediario_2026.csv         cadastro dos elegiveis
REM          crediario_2026_faltas.csv  os incompletos, para revisar
REM ================================================================
setlocal
cd /d "%~dp0"

echo ==================================================
echo    Farmax - crediario de 2026
echo ==================================================
echo.

set "DESTINO=C:\temp\farmax_analise.fdb"
set ISC_USER=
set ISC_PASSWORD=
if exist consulta2026.log del /q consulta2026.log

if not exist "%~dp004_crediario_2026.sql" goto :sem_sql

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

echo [3/3] Consultando...
if exist auditoria_2026.txt del /q auditoria_2026.txt
call :roda "-ch WIN1252"
call :roda ""
call :roda "-ch WIN1252 -user SYSDBA -password masterkey"
call :roda "-user SYSDBA -password masterkey"
if not exist auditoria_2026.txt goto :falhou

echo.
echo ==================================================
echo    PRONTO
echo ==================================================
echo.
for %%F in (auditoria_2026.txt crediario_2026.csv crediario_2026_faltas.csv) do call :mostra "%%F"
echo.
echo MANDE PRIMEIRO O auditoria_2026.txt: ele nao tem nome, CPF nem
echo telefone de ninguem, so contagens. E ele que responde se o
echo cadastro esta completo o bastante para migrar.
echo.
echo Os dois .csv tem dados pessoais. So mande depois, se precisar.
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

:roda
if exist auditoria_2026.txt exit /b 0
echo. >>consulta2026.log
echo === tentativa [%~1] === >>consulta2026.log
"%FBDIR%\isql.exe" %~1 "%DESTINO%" -i "%~dp004_crediario_2026.sql" >>consulta2026.log 2>&1 <nul
exit /b 0

:mostra
if not exist "%~1" exit /b 0
for %%F in ("%~1") do echo    %%~nxF  (%%~zF bytes)
exit /b 0


REM ================= erros =================

:sem_sql
echo [ERRO] 04_crediario_2026.sql nao esta nesta pasta.
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
echo [ERRO] A consulta falhou. Abra consulta2026.log: cada tentativa
echo esta registrada com o erro que o Firebird devolveu.
echo Me mande esse log que eu ajusto o SQL.
pause
exit /b 1
