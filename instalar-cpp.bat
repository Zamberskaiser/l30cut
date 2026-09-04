@echo off
setlocal enabledelayedexpansion
title L30 CUT AI - Instalar compilador C++
cd /d "%~dp0"

rem ============================================================
rem   Instala somente o Visual C++ Build Tools (compilador C++)
rem   necessario para gerar o L30 CUT AI no Windows.
rem   Pode ser executado sozinho, antes do build-windows.bat.
rem ============================================================

net session >nul 2>&1
if errorlevel 1 (
  if /I not "%~1"=="--elevated" (
    echo Pedindo permissao de administrador ^(clique em Sim^)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath '%~f0' -ArgumentList '--elevated' -Verb RunAs -ErrorAction Stop; exit 0 } catch { exit 1 }"
    if not errorlevel 1 (
      echo A instalacao continua na outra janela ^(a de administrador^).
      timeout /t 8 /nobreak >nul
      exit /b 0
    )
    echo   [ERRO] Sem permissao de administrador.
    echo   O compilador C++ precisa de administrador para ser instalado.
    pause
    exit /b 1
  )
)

echo ============================================
echo   Instalador do compilador C++ (Visual C++)
echo ============================================
echo   Esta janela so fecha quando voce apertar uma tecla.
echo.

echo [1/3] Procurando uma instalacao existente...
set "VCVARS_FILE="
if exist "C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS_FILE=C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if not defined VCVARS_FILE if exist "%ProgramFiles%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS_FILE=%ProgramFiles%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if not defined VCVARS_FILE if exist "%ProgramFiles%\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS_FILE=%ProgramFiles%\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
if not defined VCVARS_FILE if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS_FILE=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

if defined VCVARS_FILE (
  echo   Ja instalado: %VCVARS_FILE%
  goto :verificar
)
echo   Nada encontrado. Vou baixar e instalar.
echo.

echo [2/3] Baixando o instalador oficial da Microsoft...
set "VS_BOOTSTRAPPER=%TEMP%\vs_BuildTools.exe"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri https://aka.ms/vs/17/release/vs_BuildTools.exe -OutFile '%VS_BOOTSTRAPPER%'"
if not exist "%VS_BOOTSTRAPPER%" (
  echo   [ERRO] Nao foi possivel baixar o instalador.
  echo   Verifique sua internet ou baixe manualmente em:
  echo   https://visualstudio.microsoft.com/visual-cpp-build-tools/
  pause
  exit /b 1
)
echo   OK: instalador baixado.
echo.

echo   Instalando... isso pode levar de 10 a 30 minutos.
"%VS_BOOTSTRAPPER%" --quiet --wait --norestart --nocache --installPath "C:\BuildTools" --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended
set "VS_EXIT=%ERRORLEVEL%"
if not "%VS_EXIT%"=="0" if not "%VS_EXIT%"=="3010" (
  echo   [ERRO] A instalacao falhou ^(codigo %VS_EXIT%^).
  echo   Instale manualmente "Desenvolvimento para desktop com C++" em:
  echo   https://visualstudio.microsoft.com/visual-cpp-build-tools/
  pause
  exit /b 1
)
set "VCVARS_FILE=C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
echo.

:verificar
echo [3/3] Verificando o compilador...
if not exist "%VCVARS_FILE%" (
  echo   [ERRO] vcvars64.bat nao encontrado em: %VCVARS_FILE%
  pause
  exit /b 1
)
call "%VCVARS_FILE%" >nul
where link >nul 2>nul
if errorlevel 1 (
  echo   [ERRO] link.exe continua indisponivel.
  echo   Reinicie o computador e rode este arquivo novamente.
  pause
  exit /b 1
)
echo   OK: compilador C++ pronto para uso.
echo.
echo ============================================
echo   Tudo certo! Agora rode build-windows.bat
echo ============================================
echo.
echo   Aperte qualquer tecla para fechar esta janela.
pause >nul
exit /b 0
