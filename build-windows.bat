@echo off
setlocal enabledelayedexpansion
title L30 CUT AI - Build Windows
cd /d "%~dp0"

echo ============================================
echo   L30 CUT AI - build do app para Windows
echo   Script versao 4 (2026-09-03)
echo ============================================
echo.


echo [1/6] Verificando Bun...
call :addpath
where bun >nul 2>nul
if errorlevel 1 (
  echo   Bun nao encontrado. Instalando automaticamente...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
  call :addpath
  where bun >nul 2>nul
  if errorlevel 1 (
    echo   [ERRO] Nao foi possivel instalar o Bun automaticamente.
    echo   Instale manualmente em https://bun.sh e rode este .bat novamente.
    pause
    exit /b 1
  )
)
echo   OK: Bun disponivel.
echo.

echo [2/6] Verificando Rust/Cargo...
where cargo >nul 2>nul
if errorlevel 1 (
  echo   Rust nao encontrado. Baixando instalador oficial...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri https://win.rustup.rs/x86_64 -OutFile \"$env:TEMP\rustup-init.exe\""
  if exist "%TEMP%\rustup-init.exe" (
    "%TEMP%\rustup-init.exe" -y --default-toolchain stable
  )
  call :addpath
  where cargo >nul 2>nul
  if errorlevel 1 (
    echo   [ERRO] Rust nao instalado. Instale em https://rustup.rs
    echo   Importante: instale tambem o "Visual Studio Build Tools" com C++.
    pause
    exit /b 1
  )
)
echo   OK: Cargo disponivel.
echo.

echo [3/6] Instalando pacotes do projeto...
call bun install
if errorlevel 1 goto :falhou
echo.

echo [4/6] Rodando testes...
call bun run test
if errorlevel 1 (
  echo   [AVISO] Testes falharam. Continuando mesmo assim...
)
echo.

echo [5/6] Gerando build web...
call bun run build
if errorlevel 1 goto :falhou
if not exist "dist\client\index.html" (
  echo   [ERRO] O build web terminou, mas dist\client\index.html nao foi criado.
  echo   O Tauri precisa do HTML estatico para empacotar a interface.
  goto :falhou
)
echo   OK: arquivos web estaticos encontrados em dist\client.
echo.

echo [6/6] Gerando instalador Windows ^(Tauri^)...
echo   Garantindo a CLI do Tauri...
set "TAURI_OK="

call bunx --bun tauri --version >nul 2>&1
if not errorlevel 1 set "TAURI_OK=npm"

if not defined TAURI_OK (
  echo   Instalando @tauri-apps/cli via bun...
  call bun add -d "@tauri-apps/cli@2"
  if not errorlevel 1 set "TAURI_OK=npm"
)

if not defined TAURI_OK (
  call cargo tauri --version >nul 2>&1
  if not errorlevel 1 set "TAURI_OK=cargo"
)

if not defined TAURI_OK (
  echo   Instalando tauri-cli via cargo ^(pode levar alguns minutos^)...
  call cargo install tauri-cli --version 2 --locked
  if not errorlevel 1 set "TAURI_OK=cargo"
)

if not defined TAURI_OK (
  echo   [ERRO] Nao foi possivel instalar a CLI do Tauri.
  goto :falhou
)

if "%TAURI_OK%"=="npm" (
  call bunx --bun tauri build
) else (
  call cargo tauri build
)
if errorlevel 1 goto :falhou


:bundleok

echo.
echo ============================================
echo   Build concluido com sucesso!
echo ============================================
echo.
echo Proximos passos:
echo   1. Instalador MSI ^(recomendado^): de dois cliques no arquivo em
echo      src-tauri\target\release\bundle\msi\
echo   2. Versao portatil: use o arquivo em
echo      src-tauri\target\release\bundle\nsis\
echo   3. Depois de instalar, abra o L30 CUT AI pelo menu Iniciar.
echo      Na primeira execucao, o app abre a tela de setup para baixar
echo      FFmpeg e whisper.cpp.
echo.

set "MSI_DIR=src-tauri\target\release\bundle\msi"
set "MSI_FILE="
if exist "%MSI_DIR%" (
  for %%F in ("%MSI_DIR%\*.msi") do (
    set "MSI_FILE=%%~F"
    goto :msiFound
  )
)
:msiFound

if defined MSI_FILE (
  echo MSI encontrado: %MSI_FILE%
  choice /c SN /M "Deseja executar o instalador agora"
  if errorlevel 2 goto :openBundle
  if errorlevel 1 (
    echo Executando instalador...
    start "" "%MSI_FILE%"
    goto :fim
  )
) else (
  echo   [AVISO] Nenhum arquivo MSI encontrado. Verifique os logs acima.
)

:openBundle
if exist "src-tauri\target\release\bundle" (
  start "" "src-tauri\target\release\bundle"
)

:fim
echo.
echo Dica: depois de instalar, use run-windows.bat para abrir o app.
echo.
pause
exit /b 0

:addpath
set "PATH=%PATH%;%USERPROFILE%\.bun\bin;%USERPROFILE%\.cargo\bin"
exit /b 0

:falhou
echo.
echo [ERRO] O build falhou. Leia a mensagem acima para ver o motivo.
pause
exit /b 1