@echo off
setlocal enabledelayedexpansion
title L30 CUT AI - Build Windows
cd /d "%~dp0"

echo ============================================
echo   L30 CUT AI - build do app para Windows
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
echo.

echo [6/6] Gerando instalador Windows ^(Tauri^)...
echo   Garantindo a CLI do Tauri...
call cargo tauri --version >nul 2>&1
if errorlevel 1 (
  echo   Instalando tauri-cli via cargo ^(pode levar alguns minutos^)...
  call cargo install tauri-cli --version "^2" --locked
  if errorlevel 1 (
    echo   [AVISO] cargo install falhou. Tentando a CLI npm...
    call bunx --bun @tauri-apps/cli@^2 build
    if errorlevel 1 goto :falhou
    goto :bundleok
  )
)
call cargo tauri build
if errorlevel 1 goto :falhou

:bundleok
echo.

echo ============================================
echo   Build concluido com sucesso!
echo ============================================
echo   MSI:  src-tauri\target\release\bundle\msi\
echo   EXE:  src-tauri\target\release\bundle\nsis\
echo.
if exist "src-tauri\target\release\bundle" (
  start "" "src-tauri\target\release\bundle"
)
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
