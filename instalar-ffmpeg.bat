@echo off
setlocal enabledelayedexpansion
title L30 CUT AI - Instalar FFmpeg e ffprobe
cd /d "%~dp0"

rem ============================================================
rem   L30 CUT AI - instalador do FFmpeg / ffprobe (Windows)
rem   Baixa o pacote oficial (BtbN/FFmpeg-Builds), coloca os
rem   programas na pasta do projeto (bin\) e tambem na pasta
rem   que o aplicativo instalado usa (%APPDATA%\ai.l30cut.desktop\bin).
rem   Esta janela so fecha quando voce apertar uma tecla.
rem ============================================================

set "PROJ_BIN=%~dp0bin"
set "APP_BIN=%APPDATA%\ai.l30cut.desktop\bin"
set "FF_ZIP_URL=https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
set "FF_ZIP=%TEMP%\l30cut-ffmpeg-win64.zip"
set "FF_TMP=%TEMP%\l30cut-ffmpeg-extract"

echo ============================================
echo   FFmpeg / ffprobe para o L30 CUT AI
echo ============================================
echo   Pasta do projeto : %PROJ_BIN%
echo   Pasta do app     : %APP_BIN%
echo.

if not exist "%PROJ_BIN%" mkdir "%PROJ_BIN%"
if not exist "%APP_BIN%" mkdir "%APP_BIN%"

echo [1/4] Verificando se ja esta instalado...
set "NEED=1"
if exist "%PROJ_BIN%\ffmpeg.exe" if exist "%PROJ_BIN%\ffprobe.exe" set "NEED="
if not defined NEED (
  echo   Ja existe uma copia na pasta do projeto. Versao encontrada:
  "%PROJ_BIN%\ffmpeg.exe" -version 2>nul | findstr /I /C:"ffmpeg version"
  if errorlevel 1 (
    echo   [AVISO] O arquivo existente nao respondeu. Vou baixar de novo.
    set "NEED=1"
  ) else (
    choice /c SN /M "Deseja baixar novamente a versao mais recente"
    if errorlevel 2 goto :copiar
    set "NEED=1"
  )
)
echo.

if not defined NEED goto :copiar

echo [2/4] Baixando FFmpeg ^(cerca de 90 MB, pode levar alguns minutos^)...
if exist "%FF_ZIP%" del /q "%FF_ZIP%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -UseBasicParsing -Uri '%FF_ZIP_URL%' -OutFile '%FF_ZIP%' } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 goto :falhou
if not exist "%FF_ZIP%" goto :falhou
echo   OK: download concluido.
echo.

echo [3/4] Extraindo arquivos...
if exist "%FF_TMP%" rmdir /s /q "%FF_TMP%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Expand-Archive -LiteralPath '%FF_ZIP%' -DestinationPath '%FF_TMP%' -Force } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 goto :falhou

set "SRC_FFMPEG="
set "SRC_FFPROBE="
for /r "%FF_TMP%" %%F in (ffmpeg.exe) do if not defined SRC_FFMPEG set "SRC_FFMPEG=%%~fF"
for /r "%FF_TMP%" %%F in (ffprobe.exe) do if not defined SRC_FFPROBE set "SRC_FFPROBE=%%~fF"
if not defined SRC_FFMPEG (
  echo   [ERRO] ffmpeg.exe nao foi encontrado dentro do arquivo baixado.
  goto :falhou
)
if not defined SRC_FFPROBE (
  echo   [ERRO] ffprobe.exe nao foi encontrado dentro do arquivo baixado.
  goto :falhou
)
copy /y "%SRC_FFMPEG%" "%PROJ_BIN%\ffmpeg.exe" >nul
copy /y "%SRC_FFPROBE%" "%PROJ_BIN%\ffprobe.exe" >nul
echo   OK: arquivos colocados em %PROJ_BIN%
echo.

:copiar
echo [4/4] Copiando para a pasta usada pelo aplicativo...
set "APP_OK=1"
if not exist "%APP_BIN%" mkdir "%APP_BIN%" 2>nul
if not exist "%APP_BIN%" (
  echo   [AVISO] Nao foi possivel criar a pasta %APP_BIN%
  set "APP_OK="
)
if defined APP_OK (
  taskkill /f /im ffmpeg.exe >nul 2>&1
  taskkill /f /im ffprobe.exe >nul 2>&1
  copy /y "%PROJ_BIN%\ffmpeg.exe" "%APP_BIN%\ffmpeg.exe" >nul 2>&1
  if not exist "%APP_BIN%\ffmpeg.exe" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Copy-Item -LiteralPath '%PROJ_BIN%\ffmpeg.exe' -Destination '%APP_BIN%\ffmpeg.exe' -Force } catch { exit 1 }" >nul 2>&1
  )
  copy /y "%PROJ_BIN%\ffprobe.exe" "%APP_BIN%\ffprobe.exe" >nul 2>&1
  if not exist "%APP_BIN%\ffprobe.exe" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Copy-Item -LiteralPath '%PROJ_BIN%\ffprobe.exe' -Destination '%APP_BIN%\ffprobe.exe' -Force } catch { exit 1 }" >nul 2>&1
  )
  if not exist "%APP_BIN%\ffmpeg.exe" set "APP_OK="
  if not exist "%APP_BIN%\ffprobe.exe" set "APP_OK="
)
if defined APP_OK (
  echo   OK: %APP_BIN%
) else (
  echo   [AVISO] Nao foi possivel copiar para %APP_BIN%
  echo   Isso costuma acontecer quando o antivirus bloqueia a pasta
  echo   ou os arquivos estao em uso. Nao tem problema: o aplicativo
  echo   tambem aceita os programas na pasta do projeto.
  echo   Se quiser, copie manualmente ffmpeg.exe e ffprobe.exe de
  echo   %PROJ_BIN% para %APP_BIN%
  echo   Adicionando a pasta do projeto ao PATH do seu usuario...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=[Environment]::GetEnvironmentVariable('Path','User'); if ($p -notlike '*%PROJ_BIN%*') { [Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';') + ';%PROJ_BIN%'), 'User') }" >nul 2>&1
  echo   Feito. Reinicie o computador se o aplicativo nao encontrar o FFmpeg.
)
echo.

echo Conferindo as versoes instaladas:
"%PROJ_BIN%\ffmpeg.exe" -version 2>nul | findstr /I /C:"ffmpeg version"
if errorlevel 1 (
  echo   [ERRO] O ffmpeg baixado nao respondeu ao teste de versao.
  goto :falhou
)
"%PROJ_BIN%\ffprobe.exe" -version 2>nul | findstr /I /C:"ffprobe version"
if errorlevel 1 (
  echo   [ERRO] O ffprobe baixado nao respondeu ao teste de versao.
  goto :falhou
)

if exist "%FF_TMP%" rmdir /s /q "%FF_TMP%"
if exist "%FF_ZIP%" del /q "%FF_ZIP%"

echo.
echo ============================================
echo   Tudo certo! FFmpeg e ffprobe prontos.
echo ============================================
echo   Agora abra o L30 CUT AI ^(run-windows.bat^) e a tela de
echo   Configuracao ja vai mostrar FFmpeg e ffprobe como instalados.
echo.
echo   Aperte qualquer tecla para fechar esta janela.
pause >nul
exit /b 0

:falhou
echo.
echo [ERRO] Nao foi possivel instalar o FFmpeg.
echo Voce pode baixar manualmente em:
echo   %FF_ZIP_URL%
echo e copiar ffmpeg.exe e ffprobe.exe para:
echo   %APP_BIN%
echo.
pause
exit /b 1
