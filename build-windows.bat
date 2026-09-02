@echo off
setlocal enabledelayedexpansion
title L30 CUT AI - Build Windows
cd /d "%~dp0"

echo ============================================
echo   L30 CUT AI - build do app para Windows
echo ============================================
echo.

echo [1/5] Verificando dependencias...
where bun >nul 2>nul
if errorlevel 1 (
  echo   [ERRO] Bun nao encontrado.
  echo   Instale com:  powershell -c "irm bun.sh/install.ps1 ^| iex"
  echo   Depois feche e abra este .bat novamente.
  pause
  exit /b 1
)
where cargo >nul 2>nul
if errorlevel 1 (
  echo   [ERRO] Rust/Cargo nao encontrado.
  echo   Instale em: https://rustup.rs  ^(inclua o Visual Studio Build Tools^)
  pause
  exit /b 1
)
echo   OK: bun e cargo encontrados.
echo.

echo [2/5] Instalando pacotes do projeto...
call bun install
if errorlevel 1 goto :falhou
echo.

echo [3/5] Rodando testes...
call bun run test
if errorlevel 1 (
  echo   [AVISO] Testes falharam. Continuando mesmo assim...
)
echo.

echo [4/5] Gerando build web...
call bun run build
if errorlevel 1 goto :falhou
echo.

echo [5/5] Gerando instalador Windows ^(Tauri^)...
call bunx tauri build
if errorlevel 1 goto :falhou
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

:falhou
echo.
echo [ERRO] O build falhou. Leia a mensagem acima para ver o motivo.
pause
exit /b 1
