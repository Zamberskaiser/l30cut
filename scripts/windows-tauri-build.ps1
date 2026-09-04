param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$Target = "x86_64-pc-windows-msvc"
$TauriVersion = "2.11.4"
$SetupLog = Join-Path $ProjectRoot "build-log-setup.txt"
$BuildLog = Join-Path $ProjectRoot "build-log.txt"
$TauriCli = Join-Path $ProjectRoot "node_modules\.bin\tauri.cmd"
$Manifest = Join-Path $ProjectRoot "src-tauri\Cargo.toml"
$ConfigPath = Join-Path $ProjectRoot "src-tauri\tauri.conf.json"
$KeyDirectory = Join-Path $env:USERPROFILE ".l30cut"
$PrivateKey = Join-Path $KeyDirectory "updater.key"
$PublicKey = "$PrivateKey.pub"

function Write-Stage([string]$Message) {
  Write-Host "  $Message"
  Add-Content -Path $SetupLog -Value "[$(Get-Date -Format s)] $Message"
}

function Require-Command([string]$Name, [string]$Help) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "$Name nao foi encontrado. $Help"
  }
  return $command.Source
}

function Invoke-Captured([string]$File, [string[]]$Arguments, [string]$LogPath) {
  & $File @Arguments 2>&1 | Tee-Object -FilePath $LogPath -Append | Out-Host
  $exitCode = $LASTEXITCODE
  if ($null -eq $exitCode) { $exitCode = 0 }
  return $exitCode
}

Set-Location $ProjectRoot
Set-Content -Path $SetupLog -Value "L30 CUT AI - diagnostico da compilacao Tauri"

try {
  if ($env:OS -ne "Windows_NT") {
    throw "Este compilador gera o instalador somente no Windows."
  }

  Write-Stage "Validando as ferramentas nativas do Windows..."
  $null = Require-Command "cargo.exe" "Execute instalar-cpp.bat e abra o build novamente."
  $null = Require-Command "rustc.exe" "Reinstale o Rust pelo build-windows.bat."
  $null = Require-Command "rustup.exe" "Reinstale o Rust pelo build-windows.bat."
  $null = Require-Command "link.exe" "Instale Visual C++ Build Tools e reinicie o build."
  $null = Require-Command "rc.exe" "Instale o Windows SDK pelo Visual C++ Build Tools."

  Write-Stage "Fixando o compilador Rust stable para Windows MSVC..."
  $toolchainExit = Invoke-Captured "rustup.exe" @(
    "toolchain", "install", "stable-x86_64-pc-windows-msvc", "--profile", "minimal"
  ) $SetupLog
  if ($toolchainExit -ne 0) { throw "Nao foi possivel instalar o Rust stable para Windows MSVC." }
  $env:RUSTUP_TOOLCHAIN = "stable-x86_64-pc-windows-msvc"

  Write-Stage "Garantindo o alvo Rust $Target..."
  $targetExit = Invoke-Captured "rustup.exe" @("target", "add", $Target) $SetupLog
  if ($targetExit -ne 0) { throw "Nao foi possivel preparar o alvo Rust $Target." }
  $rustDetails = (& rustc.exe -vV 2>&1 | Out-String)
  Add-Content -Path $SetupLog -Value $rustDetails
  if ($rustDetails -notmatch "host: $([regex]::Escape($Target))") {
    throw "O Rust ativo nao e o compilador Windows MSVC de 64 bits. Reinstale o Rust pelo build-windows.bat."
  }

  if (-not (Test-Path $TauriCli)) {
    throw "A CLI local do Tauri nao existe. Execute bun install --frozen-lockfile."
  }

  Write-Stage "Validando a CLI local do Tauri..."
  $cliOutput = (& $TauriCli --version 2>&1 | Out-String).Trim()
  Add-Content -Path $SetupLog -Value $cliOutput
  Write-Host "  $cliOutput"
  if ($LASTEXITCODE -ne 0 -or $cliOutput -notmatch [regex]::Escape($TauriVersion)) {
    throw "Versao inesperada do Tauri. Esperado: $TauriVersion. Encontrado: $cliOutput"
  }

  Write-Stage "Validando as dependencias Rust bloqueadas..."
  $metadataExit = Invoke-Captured "cargo.exe" @(
    "metadata", "--locked", "--no-deps", "--format-version", "1", "--manifest-path", $Manifest
  ) $SetupLog
  if ($metadataExit -ne 0) { throw "Cargo.lock nao corresponde ao projeto Rust." }

  Write-Stage "Preparando a assinatura das atualizacoes..."
  New-Item -ItemType Directory -Force -Path $KeyDirectory | Out-Null
  if (-not (Test-Path $PrivateKey) -or -not (Test-Path $PublicKey)) {
    & $TauriCli signer generate -w $PrivateKey -p "" --force 2>&1 |
      Tee-Object -FilePath $SetupLog -Append | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel gerar a chave de atualizacao." }
  }
  if (-not (Test-Path $PrivateKey) -or -not (Test-Path $PublicKey)) {
    throw "Os arquivos da chave de atualizacao nao foram criados."
  }

  $publicKeyValue = (Get-Content -Raw $PublicKey).Trim()
  $privateKeyValue = (Get-Content -Raw $PrivateKey).Trim()
  if ([string]::IsNullOrWhiteSpace($publicKeyValue) -or [string]::IsNullOrWhiteSpace($privateKeyValue)) {
    throw "A chave de atualizacao foi criada vazia."
  }
  $config = Get-Content -Raw $ConfigPath | ConvertFrom-Json
  $config.plugins.updater.pubkey = $publicKeyValue
  $configJson = $config | ConvertTo-Json -Depth 100
  [IO.File]::WriteAllText($ConfigPath, $configJson, [Text.UTF8Encoding]::new($false))
  $env:TAURI_SIGNING_PRIVATE_KEY = $privateKeyValue
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

  Write-Stage "Iniciando Tauri $TauriVersion com Rust/MSVC..."
  Set-Content -Path $BuildLog -Value "L30 CUT AI - build Tauri para Windows ($Target)"
  & $TauriCli build 2>&1 | Tee-Object -FilePath $BuildLog -Append | Out-Host
  $buildExit = $LASTEXITCODE
  if ($null -eq $buildExit) { $buildExit = 0 }
  if ($buildExit -ne 0) { throw "O Tauri terminou com codigo $buildExit. Consulte build-log.txt." }

  Write-Stage "Compilacao Tauri concluida com sucesso."
  exit 0
} catch {
  $message = $_.Exception.Message
  Write-Host "  [ERRO] $message" -ForegroundColor Red
  Add-Content -Path $SetupLog -Value "[ERRO] $message"
  exit 1
}
