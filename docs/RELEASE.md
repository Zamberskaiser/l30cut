# Release Windows — L30 CUT AI

## Pré-requisitos locais

- Windows 10/11 x64, Rust stable, Bun, WebView2 Runtime.
- `bun install`

## Build local

```powershell
bun run test
bunx --bun tauri build
```

Artefatos em `src-tauri/target/release/bundle/` (MSI e NSIS `.exe`).
Os arquivos da interface são lidos de `dist/client`, incluindo o HTML estático
gerado pelo prerender do TanStack Start. O script Windows interrompe com uma
mensagem específica se `dist/client/index.html` não tiver sido gerado.

## Depois do build

O `build-windows.bat` termina abrindo a pasta do bundle e, opcionalmente, executando o instalador MSI.

Escolha um dos caminhos:

1. **Instalador MSI** (recomendado para a maioria dos usuários):
   - Arquivo em `src-tauri\target\release\bundle\msi\`.
   - Dê dois cliques e siga o assistente de instalação.
   - O app aparece no menu Iniciar como **L30 CUT AI**.
2. **Versão portátil (NSIS)**:
   - Arquivo em `src-tauri\target\release\bundle\nsis\`.
   - Extrai para uma pasta sem precisar instalar.
   - Ideal para pendrives ou máquinas restritas.

Para abrir o app depois de instalado, use `run-windows.bat` na raiz do projeto. Ele procura o executável nas localizações padrão e inicia automaticamente.

## Primeira execução

Na primeira vez que o app abrir, ele exibe a tela de setup (`/setup`). Nela você:

- escolhe o perfil de componentes (Leve, Recomendado ou Alta qualidade);
- baixa FFmpeg, ffprobe e whisper.cpp para a pasta de dados do app;
- verifica o diagnóstico do sistema.

Depois do setup, crie um projeto, importe mídia e use o chat do assistente para propor edições. Os arquivos originais nunca são modificados.

## Release automatizado

1. Atualize a versão em `package.json`, `src-tauri/Cargo.toml` e `src-tauri/tauri.conf.json`.
2. `git tag vX.Y.Z && git push --tags`
3. O workflow `release.yml` roda testes, gera MSI/NSIS, calcula SHA-256 e cria
   um release em rascunho com `checksums.txt`.
4. Publique o rascunho e copie os hashes para a página `/download`.

## Assinatura de código (pendente)

Sem certificado configurado, o SmartScreen exibirá aviso na primeira execução.
Para assinar, adicione os secrets `WINDOWS_CERTIFICATE` e
`WINDOWS_CERTIFICATE_PASSWORD` e habilite `bundle.windows.certificateThumbprint`.