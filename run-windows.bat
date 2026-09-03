@echo off
setlocal enabledelayedexpansion
title L30 CUT AI - Executar
cd /d "%~dp0"

REM Modo desenvolvimento: roda o preview web local
if /I "%~1"=="--dev" (
  echo [modo desenvolvimento] Iniciando servidor web de preview...
  call :addpath
  where bun >nul 2>nul
  if errorlevel 1 (
    echo [ERRO] Bun nao encontrado. Instale em https://bun.sh
    pause
    exit /b 1
  )
  call bun run dev
  exit /b %errorlevel%
)

echo ============================================
echo   L30 CUT AI - localizar e executar app
echo ============================================
echo.

set "FOUND_EXE="
set "FOUND_LABEL="

REM 1. Instalacao MSI por maquina (WiX usa Arquivos de Programas)
set "CANDIDATE=%ProgramFiles%\L30 CUT AI\L30 CUT AI.exe"
if exist "%CANDIDATE%" (
  set "FOUND_EXE=%CANDIDATE%"
  set "FOUND_LABEL=instalacao MSI (Arquivos de Programas)"
  goto :run
)

REM 2. Instalacao NSIS por usuario
set "CANDIDATE=%LOCALAPPDATA%\Programs\L30 CUT AI\L30 CUT AI.exe"
if exist "%CANDIDATE%" (
  set "FOUND_EXE=%CANDIDATE%"
  set "FOUND_LABEL=instalacao NSIS (por usuario)"
  goto :run
)

REM 3. Instalacao antiga em LOCALAPPDATA
set "CANDIDATE=%LOCALAPPDATA%\L30 CUT AI\L30 CUT AI.exe"
if exist "%CANDIDATE%" (
  set "FOUND_EXE=%CANDIDATE%"
  set "FOUND_LABEL=instalacao local"
  goto :run
)

REM 4. Build de release local (sem instalar)
set "CANDIDATE=src-tauri\target\release\L30 CUT AI.exe"
if exist "%CANDIDATE%" (
  set "FOUND_EXE=%CANDIDATE%"
  set "FOUND_LABEL=build release local"
  goto :run
)

REM 5. Nenhuma instalacao: oferecer o instalador gerado, se existir
for %%F in ("src-tauri\target\release\bundle\msi\*.msi") do (
  echo Nenhuma instalacao encontrada, mas ha um instalador MSI gerado:
  echo   %%~fF
  choice /c SN /M "Deseja instalar agora"
  if not errorlevel 2 (
    start "" "%%~fF"
    exit /b 0
  )
  goto :notfound
)


:run
if defined FOUND_EXE (
  echo App encontrado: %FOUND_LABEL%
  echo Caminho: %FOUND_EXE%
  echo.
  echo Iniciando L30 CUT AI...
  start "" "%FOUND_EXE%"
  echo.
  echo Pronto. Na primeira execucao, siga a tela de setup para baixar FFmpeg e whisper.cpp.
  timeout /t 3 /nobreak >nul
  exit /b 0
)

:notfound
echo [ERRO] Nao encontrei o executavel do L30 CUT AI.
echo.
echo Possiveis causas:
echo   - O app ainda nao foi instalado.
echo   - O build ainda nao foi gerado.
echo.
echo Solucoes:
echo   1. Rode build-windows.bat para compilar e gerar o instalador MSI.
echo   2. Instale o MSI gerado em src-tauri\target\release\bundle\msi\
echo   3. Baixe um release pronto da pagina /download do projeto.
echo   4. Para desenvolvimento, rode: run-windows.bat --dev
pause
exit /b 1

:addpath
set "PATH=%PATH%;%USERPROFILE%\.bun\bin;%USERPROFILE%\.cargo\bin"
exit /b 0