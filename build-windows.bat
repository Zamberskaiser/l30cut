@echo off
setlocal enabledelayedexpansion
title L30 CUT AI - Instalacao automatica
cd /d "%~dp0"

rem ============================================================
rem   L30 CUT AI - script unico e automatico
rem   Script versao 17 (2026-09-04)
rem   Faz tudo sozinho: dependencias -> build -> instalador ->
rem   instalacao silenciosa -> abre o app. Sem perguntas.
rem   v16: a janela nunca fecha sozinha e, sem permissao de
rem   administrador, a instalacao segue no modo "por usuario".
rem ============================================================

set "L30_NOADMIN="
net session >nul 2>&1
if errorlevel 1 (
  if /I "%~1"=="--elevated" (
    set "L30_NOADMIN=1"
  ) else (
    echo Pedindo permissao de administrador ^(clique em Sim^)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Start-Process -FilePath '%~f0' -ArgumentList '--elevated' -Verb RunAs -ErrorAction Stop; exit 0 } catch { exit 1 }"
    if not errorlevel 1 (
      echo A instalacao continua na outra janela ^(a de administrador^).
      timeout /t 8 /nobreak >nul
      exit /b 0
    )
    echo   [AVISO] Sem permissao de administrador.
    echo   Vou continuar instalando somente para o seu usuario.
    set "L30_NOADMIN=1"
  )
)

echo ============================================
echo   L30 CUT AI - instalacao automatica
echo   Script versao 17 (2026-09-04)
echo ============================================
echo   Nao e preciso fazer nada: o script instala
echo   dependencias, gera o app, instala e abre.
echo   Esta janela so fecha quando voce apertar uma tecla.
echo.

call :addpath

rem Impede compilar por engano um ZIP antigo que continha a API incorreta do updater.
findstr /C:"tauri_plugin_updater::Builder::new().build()" "src-tauri\src\lib.rs" >nul 2>&1
if errorlevel 1 (
  echo   [ERRO] Este pacote esta desatualizado ^(anterior a versao 17^).
  echo   Apague esta pasta e baixe novamente o arquivo L30-CUT-AI-source-v17.zip.
  goto :falhou
)

rem Versao 14: a visualizacao de video local exige o protocolo de arquivos
rem liberado na config E compilado no binario (feature protocol-asset).
findstr /C:"assetProtocol" "src-tauri\tauri.conf.json" >nul 2>&1
if errorlevel 1 (
  echo   [ERRO] Este pacote esta desatualizado ^(anterior a versao 17^).
  echo   Apague esta pasta e baixe novamente o arquivo L30-CUT-AI-source-v17.zip.
  goto :falhou
)
findstr /C:"api/public/update/windows" "src-tauri\tauri.conf.json" >nul 2>&1
if errorlevel 1 (
  echo   [ERRO] Este pacote esta desatualizado ^(anterior a versao 17^).
  echo   Apague esta pasta e baixe novamente o arquivo L30-CUT-AI-source-v17.zip.
  goto :falhou
)
findstr /C:"protocol-asset" "src-tauri\Cargo.toml" >nul 2>&1
if errorlevel 1 (
  echo   [ERRO] Este pacote esta desatualizado ^(anterior a versao 17^).
  echo   Apague esta pasta e baixe novamente o arquivo L30-CUT-AI-source-v17.zip.
  goto :falhou
)

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

echo [3/7] Verificando compilador Visual C++ ^(link.exe^)...
call :preparemsvc
if errorlevel 1 goto :falhou
echo   OK: compilador Visual C++ disponivel.
echo.

echo [4/7] Verificando runtime WebView2...
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

echo [5/7] Instalando pacotes do projeto...
call bun install
if errorlevel 1 goto :falhou
echo.

rem ============================================================
rem  Versao 15: chave de assinatura para a atualizacao automatica.
rem  A chave fica so no seu PC (%USERPROFILE%\.l30cut). Nunca apague:
rem  se trocar a chave, os apps ja instalados param de aceitar updates.
rem ============================================================
set "L30_KEYDIR=%USERPROFILE%\.l30cut"
set "L30_KEY=%L30_KEYDIR%\updater.key"
if not exist "%L30_KEYDIR%" mkdir "%L30_KEYDIR%"
echo [5b/7] Preparando a chave das atualizacoes automaticas...
set "TAURI_SIGNING_PRIVATE_KEY_PASSWORD="
set "L30_TAURI_CLI=%~dp0node_modules\.bin\tauri.cmd"
if not exist "%L30_TAURI_CLI%" (
  echo   Instalando a ferramenta do Tauri...
  cmd /c "bun add --dev --exact @tauri-apps/cli@2.11.4 >> "%~dp0build-log-setup.txt" 2>&1"
)
if not exist "%L30_TAURI_CLI%" (
  echo   [AVISO] Ferramenta do Tauri nao encontrada; seguindo sem assinatura.
) else (
  if not exist "%L30_KEY%.pub" (
    echo   Criando chave de assinatura ^(uma vez apenas^)...
    cmd /c ""%L30_TAURI_CLI%" signer generate -w "%L30_KEY%" -p "" --force >> "%~dp0build-log-setup.txt" 2>&1" <nul
  )
)
echo   Etapa da chave concluida.
if exist "%L30_KEY%.pub" (
  for /f "usebackq delims=" %%K in ("%L30_KEY%.pub") do set "L30_PUBKEY=%%K"
  for /f "usebackq delims=" %%K in ("%L30_KEY%") do set "L30_PRIVKEY=%%K"
  set "TAURI_SIGNING_PRIVATE_KEY=!L30_PRIVKEY!"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=Get-Content -Raw 'src-tauri\tauri.conf.json'; $k='%L30_PUBKEY%'; $c=[regex]::Replace($c,'\"pubkey\": \"[^\"]*\"', '\"pubkey\": \"'+$k+'\"'); Set-Content -NoNewline -Path 'src-tauri\tauri.conf.json' -Value $c"
  echo   OK: atualizacao automatica assinada com a sua chave.
) else (
  echo   [AVISO] Nao foi possivel gerar a chave; o app sera gerado sem updates automaticos.
)
echo.



echo [6/7] Gerando instalador Windows ^(Tauri^)...
if not exist "%L30_TAURI_CLI%" (
  echo   Preparando a CLI local do Tauri...
  cmd /c "bun add --dev --exact @tauri-apps/cli@2.11.4 >> "%~dp0build-log-setup.txt" 2>&1"
)
if not exist "%L30_TAURI_CLI%" (
  echo   [ERRO] Nao foi possivel preparar a CLI local do Tauri via Bun.
  echo   Detalhes em: %~dp0build-log-setup.txt
  goto :falhou
)
echo   OK: CLI local do Tauri pronta.
echo   Compilando... isso leva de 5 a 20 minutos na primeira vez.
echo   Acompanhe o progresso abaixo (tambem salvo em build-log.txt):
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Continue'; & cmd /c ''''%L30_TAURI_CLI%'''' build 2>&1 | Tee-Object -FilePath '%~dp0build-log.txt'; exit $LASTEXITCODE"
if errorlevel 1 (
  echo   [ERRO] A geracao do instalador falhou. Log completo em: %~dp0build-log.txt
  powershell -NoProfile -Command "Get-Content -Tail 40 '%~dp0build-log.txt'"
  goto :falhou
)
echo   OK: build concluido. Log em: %~dp0build-log.txt
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

rem Copia os instaladores gerados para uma pasta simples de achar.
if not exist "%~dp0instaladores" mkdir "%~dp0instaladores"
if defined MSI_FILE copy /y "%MSI_FILE%" "%~dp0instaladores" >nul
if defined NSIS_FILE copy /y "%NSIS_FILE%" "%~dp0instaladores" >nul
rem Arquivos .sig das atualizacoes assinadas (enviar junto na release do GitHub).
copy /y "src-tauri\target\release\bundle\nsis\*.sig" "%~dp0instaladores" >nul 2>&1
copy /y "src-tauri\target\release\bundle\msi\*.sig" "%~dp0instaladores" >nul 2>&1

if defined MSI_FILE echo   Instalador copiado para: %~dp0instaladores
if not defined MSI_FILE if defined NSIS_FILE echo   Instalador copiado para: %~dp0instaladores
if not defined MSI_FILE if not defined NSIS_FILE echo   [AVISO] Nenhum instalador foi gerado. Veja %~dp0build-log.txt


rem Sem administrador o MSI nao instala: nesse caso usamos o NSIS (por usuario).
if defined L30_NOADMIN if defined NSIS_FILE set "MSI_FILE="

if defined MSI_FILE (
  echo   Instalando via MSI: %MSI_FILE%
  msiexec /i "%MSI_FILE%" /qb /norestart
  if errorlevel 1 if defined NSIS_FILE (
    echo   MSI recusado; instalando somente para o seu usuario...
    "%NSIS_FILE%" /S
  )
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
  "%LOCALAPPDATA%\L30 CUT AI\L30 CUT AI.exe"
  "%ProgramFiles%\L30 CUT AI\l30-cut-ai.exe"
  "%LOCALAPPDATA%\Programs\L30 CUT AI\l30-cut-ai.exe"
  "src-tauri\target\release\L30 CUT AI.exe"
  "src-tauri\target\release\l30-cut-ai.exe"
) do (
  if not defined APP_EXE if exist %%P set "APP_EXE=%%~fP"
)

if not defined APP_EXE (
  echo   [ERRO] Executavel do L30 CUT AI nao encontrado.
  echo   Procurei em Arquivos de Programas, AppData e src-tauri\target\release.
  echo   Veja o final de build-log.txt para o motivo real do build.
  powershell -NoProfile -Command "if (Test-Path '%~dp0build-log.txt') { Get-Content -Tail 25 '%~dp0build-log.txt' }"
  if exist "src-tauri\target\release\bundle" start "" "src-tauri\target\release\bundle"
  goto :falhou
)

start "" "%APP_EXE%"
echo   App iniciado: %APP_EXE%
echo   Confirmando se a janela abriu...
timeout /t 8 /nobreak >nul
tasklist /fi "imagename eq L30 CUT AI.exe" 2>nul | find /i "L30 CUT AI.exe" >nul
if errorlevel 1 (
  echo   [AVISO] O app fechou logo apos abrir. Rodando no console para capturar o erro...
  echo   Log do app: %~dp0app-log.txt
  "%APP_EXE%" > "%~dp0app-log.txt" 2>&1
  powershell -NoProfile -Command "if (Test-Path '%~dp0app-log.txt') { Get-Content -Tail 25 '%~dp0app-log.txt' }"
  echo.
  echo   Envie o conteudo de app-log.txt para eu corrigir a causa.
  pause
  exit /b 1
)
echo   OK: L30 CUT AI esta rodando.

echo.
echo ============================================
echo   Tudo pronto! L30 CUT AI instalado e aberto.
echo ============================================
echo   Na primeira execucao o app abre a tela de setup
echo   para baixar FFmpeg e whisper.cpp.
echo   Para abrir de novo depois: run-windows.bat ou menu Iniciar.
echo.
echo   Aperte qualquer tecla para fechar esta janela.
pause >nul
exit /b 0


:addpath
set "PATH=%PATH%;%USERPROFILE%\.bun\bin;%USERPROFILE%\.cargo\bin"
exit /b 0

:preparemsvc
rem O Rust para Windows usa o linker MSVC. VS Code sozinho nao fornece link.exe.
set "VCVARS_FILE="
if exist "C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS_FILE=C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if not defined VCVARS_FILE if exist "%ProgramFiles%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS_FILE=%ProgramFiles%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if not defined VCVARS_FILE if exist "%ProgramFiles%\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS_FILE=%ProgramFiles%\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
if not defined VCVARS_FILE if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS_FILE=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

if defined VCVARS_FILE goto :activatemsvc

echo   Visual C++ Build Tools nao encontrado. Instalando automaticamente...
set "VS_BOOTSTRAPPER=%TEMP%\vs_BuildTools.exe"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri https://aka.ms/vs/17/release/vs_BuildTools.exe -OutFile '%VS_BOOTSTRAPPER%'"
if not exist "%VS_BOOTSTRAPPER%" (
  echo   [ERRO] Nao foi possivel baixar o Visual Studio Build Tools.
  exit /b 1
)

"%VS_BOOTSTRAPPER%" --quiet --wait --norestart --nocache --installPath "C:\BuildTools" --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended
set "VS_EXIT=%ERRORLEVEL%"
if not "%VS_EXIT%"=="0" if not "%VS_EXIT%"=="3010" (
  echo   [ERRO] A instalacao do Visual C++ Build Tools falhou.
  echo   Abra https://visualstudio.microsoft.com/visual-cpp-build-tools/ e instale "Desenvolvimento para desktop com C++".
  exit /b 1
)
set "VCVARS_FILE=C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

:activatemsvc
if not exist "%VCVARS_FILE%" (
  echo   [ERRO] O ambiente Visual C++ foi instalado, mas vcvars64.bat nao foi localizado.
  exit /b 1
)
echo   Ativando ambiente MSVC: %VCVARS_FILE%
call "%VCVARS_FILE%" >nul
where link >nul 2>nul
if errorlevel 1 (
  echo   [ERRO] link.exe continua indisponivel apos ativar o Visual C++.
  exit /b 1
)
exit /b 0

:falhou
echo.
echo [ERRO] A instalacao falhou. Leia a mensagem acima para ver o motivo.
pause
exit /b 1
