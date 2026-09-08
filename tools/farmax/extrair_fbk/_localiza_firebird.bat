@echo off
REM ============================================================
REM  Localiza o Firebird e define FBDIR.
REM  Chamado pelos scripts numerados; nao precisa rodar sozinho.
REM
REM  As chamadas ficam fora de blocos entre parenteses de
REM  proposito: %ProgramFiles(x86)% tem um ")" que fecharia o
REM  bloco antes da hora.
REM ============================================================

REM Se voce ja sabe onde esta, descomente e ajuste:
REM set "FBDIR=C:\Program Files (x86)\Firebird\Firebird_2_5\bin"

if defined FBDIR goto :ok

call :busca_fb "%ProgramFiles%\Firebird"
call :busca_fb "%ProgramFiles(x86)%\Firebird"
call :busca_fb "C:\Firebird"
call :testa_fb "C:\FarmaxWin"
call :testa_fb "C:\Farmax"
call :testa_fb "A:\Farmax ok\FarmaxWin"
if not defined FBDIR call :varre_fb
if not defined FBDIR goto :erro

:ok
echo Firebird encontrado em: %FBDIR%
exit /b 0

:busca_fb
for %%V in (Firebird_5_0 Firebird_4_0 Firebird_3_0 Firebird_2_5 Firebird_2_1) do call :testa_fb "%~1\%%V"
exit /b 0

:testa_fb
if defined FBDIR exit /b 0
if not exist "%~1\gbak.exe" goto :testa_fb_bin
set "FBDIR=%~1"
exit /b 0
:testa_fb_bin
if not exist "%~1\bin\gbak.exe" exit /b 0
set "FBDIR=%~1\bin"
exit /b 0

:varre_fb
echo Firebird nao esta nos lugares comuns, varrendo o disco C:...
for /f "delims=" %%F in ('dir /b /s "C:\gbak.exe" 2^>nul') do call :testa_fb "%%~dpF."
exit /b 0

:erro
echo.
echo [ERRO] Firebird nao encontrado nesta maquina.
echo Ache o gbak.exe e edite a linha "set FBDIR=" no topo deste arquivo.
exit /b 1
