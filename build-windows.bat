@echo off
setlocal enabledelayedexpansion
title L30 CUT AI - Instalacao automatica
cd /d "%~dp0"

rem ============================================================
rem   L30 CUT AI - script unico e automatico
rem   Script versao 6 (2026-09-03)
rem   Faz tudo sozinho: dependencias -> build -> instalador ->
rem   instalacao silenciosa -> abre o app. Sem perguntas.
rem ============================================================

rem --- Eleva para administrador (necessario para instalar o MSI) ---
net session >nul 2>&1
if errorlevel 1 (
  echo Solicitando permissao de administrador...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b 0
)

echo ============================================
echo   L30 CUT AI - instalacao automatica
echo   Script versao 6 (2026-09-03)
echo ============================================
echo   Nao e preciso fazer nada: o script instala
echo   dependencias, gera o app, instala e abre.
echo.

call :addpath

echo [1/7] Verificando Bun...
where bun >nul 2>nul
if errorlevel 1 (
  echo   Instalando Bun automaticamente...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
  call :addpath
  where bun >nul 2>nul
  if errorlevel 1 (
    echo   [ERRO] Nao foi possivel instalar o Bun. Veja https://bun.sh
    goto :falhou
  )
)
echo   OK: Bun disponivel.
echo.

echo [2/7] Verificando Rust/Cargo...
where cargo >nul 2>nul
if errorlevel 1 (
  echo   Instalando Rust automaticamente...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri https://win.rustup.rs/x86_64 -OutFile \"$env:TEMP\rustup-init.exe\""
  if exist "%TEMP%\rustup-init.exe" "%TEMP%\rustup-init.exe" -y --default-toolchain stable --profile minimal
  call :addpath
  where cargo >nul 2>nul
  if errorlevel 1 (
    echo   [ERRO] Rust nao instalado. Instale em https://rustup.rs e rode de novo.
    echo   Instale tambem o "Visual Studio Build Tools" com a carga "C++".
    goto :falhou
  )
)
echo   OK: Cargo disponivel.
echo.

echo [3/7] Verificando runtime WebView2...
set "WV2_OK="
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" >nul 2>&1 && set "WV2_OK=1"
reg query "HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" >nul 2>&1 && set "WV2_OK=1"
if not defined WV2_OK (
  echo   Instalando WebView2 automaticamente...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri https://go.microsoft.com/fwlink/p/?LinkId=2124703 -OutFile \"$env:TEMP\MicrosoftEdgeWebview2Setup.exe\""
  if exist "%TEMP%\MicrosoftEdgeWebview2Setup.exe" "%TEMP%\MicrosoftEdgeWebview2Setup.exe" /silent /install
)
echo   OK: WebView2 pronto.
echo.

echo [4/7] Instalando pacotes do projeto...
call bun install
if errorlevel 1 goto :falhou
echo.

echo [5/7] Gerando build web...
call bun run build
if errorlevel 1 goto :falhou
if not exist "dist\client\index.html" (
  echo   Procurando a saida estatica em outros diretorios de build...
  if exist ".output\public\index.html" (
    if not exist "dist\client" mkdir "dist\client"
    xcopy ".output\public" "dist\client" /E /I /Y >nul
  ) else (
    if exist "dist\public\index.html" (
      if not exist "dist\client" mkdir "dist\client"
      xcopy "dist\public" "dist\client" /E /I /Y >nul
    )
  )
)
if not exist "dist\client\index.html" (
  echo   [ERRO] Nenhum index.html estatico foi encontrado.
  echo   Procurei em: dist\client, .output\public e dist\public.
  goto :falhou
)
echo   OK: interface estatica pronta em dist\client.
echo.

echo [6/7] Gerando instalador Windows ^(Tauri^)...
set "TAURI_CMD="

rem 1) CLI local do projeto (node_modules\.bin\tauri.cmd) - caminho mais confiavel
if not exist "node_modules\@tauri-apps\cli\package.json" (
  echo   Instalando @tauri-apps/cli...
  call bun add -d "@tauri-apps/cli@2"
)
if exist "node_modules\.bin\tauri.cmd" set "TAURI_CMD=node_modules\.bin\tauri.cmd"

rem 2) Fallback: cargo-tauri
if not defined TAURI_CMD (
  call cargo tauri --version >nul 2>&1
  if errorlevel 1 (
    echo   Instalando tauri-cli via cargo ^(pode levar alguns minutos^)...
    call cargo install tauri-cli --version ^^2 --locked
  )
  call cargo tauri --version >nul 2>&1
  if not errorlevel 1 set "TAURI_CMD=cargo tauri"
)

if not defined TAURI_CMD (
  echo   [ERRO] Nao foi possivel preparar a CLI do Tauri.
  goto :falhou
)

echo   Usando CLI: %TAURI_CMD%
call %TAURI_CMD% build
if errorlevel 1 goto :falhou
echo.


echo [7/7] Instalando o L30 CUT AI no computador...
set "MSI_FILE="
for %%F in ("src-tauri\target\release\bundle\msi\*.msi") do (
  if not defined MSI_FILE set "MSI_FILE=%%~fF"
)
set "NSIS_FILE="
for %%F in ("src-tauri\target\release\bundle\nsis\*-setup.exe") do (
  if not defined NSIS_FILE set "NSIS_FILE=%%~fF"
)

if defined MSI_FILE (
  echo   Instalando via MSI: %MSI_FILE%
  msiexec /i "%MSI_FILE%" /qb /norestart
) else (
  if defined NSIS_FILE (
    echo   Instalando via NSIS: %NSIS_FILE%
    "%NSIS_FILE%" /S
  ) else (
    echo   [AVISO] Nenhum instalador encontrado; usando o executavel gerado.
  )
)
echo.

echo Abrindo o L30 CUT AI...
set "APP_EXE="
for %%P in (
  "%ProgramFiles%\L30 CUT AI\L30 CUT AI.exe"
  "%ProgramFiles(x86)%\L30 CUT AI\L30 CUT AI.exe"
  "%LOCALAPPDATA%\Programs\L30 CUT AI\L30 CUT AI.exe"
  "src-tauri\target\release\l30-cut-ai.exe"
) do (
  if not defined APP_EXE if exist %%P set "APP_EXE=%%~fP"
)

if defined APP_EXE (
  start "" "%APP_EXE%"
  echo   App iniciado: %APP_EXE%
) else (
  echo   [AVISO] Executavel nao localizado. Abra pelo menu Iniciar.
  if exist "src-tauri\target\release\bundle" start "" "src-tauri\target\release\bundle"
)

echo.
echo ============================================
echo   Tudo pronto! L30 CUT AI instalado e aberto.
echo ============================================
echo   Na primeira execucao o app abre a tela de setup
echo   para baixar FFmpeg e whisper.cpp.
echo   Para abrir de novo depois: run-windows.bat ou menu Iniciar.
echo.
timeout /t 20 >nul
exit /b 0

:addpath
set "PATH=%PATH%;%USERPROFILE%\.bun\bin;%USERPROFILE%\.cargo\bin"
exit /b 0

:falhou
echo.
echo [ERRO] A instalacao falhou. Leia a mensagem acima para ver o motivo.
pause
exit /b 1
