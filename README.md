# L30 CUT AI

Editor de vídeo local-first para Windows com assistente de IA por chat. O app roda 100% na máquina do usuário: FFmpeg local para render, whisper.cpp local para transcrição e um provider de IA local opcional.

A versão web disponível no preview é uma **demonstração navegável** com processamento simulado. O app desktop compilado com Tauri é que executa as operações reais de mídia.

## Requisitos

- Windows 10 21H2 ou Windows 11 (64 bits)
- [Bun](https://bun.sh) — runtime e gerenciador de pacotes
- [Rust](https://rustup.rs) — necessário para compilar o Tauri
- WebView2 Runtime — presente por padrão no Windows 11 e na maioria das instalações do Windows 10

## Build e instalação rápida

1. Baixe o pacote-fonte em `/download` ou clone este repositório.
2. Extraia e abra a pasta no Windows Explorer.
3. Execute `build-windows.bat` com dois cliques.

O script:
- verifica/instala Bun e Rust;
- instala as dependências do projeto;
- roda os testes;
- gera o build web;
- compila o app Tauri e produz o instalador MSI e a versão portátil.

Os artefatos ficam em:

```text
src-tauri\target\release\bundle\msi\     <- instalador recomendado
src-tauri\target\release\bundle\nsis\    <- versão portátil
```

## Rodar o app

Depois que o build terminar, o próprio `build-windows.bat` pergunta se você quer executar o instalador MSI. Instale-o e abra o L30 CUT AI pelo menu Iniciar.

Alternativamente, use o script auxiliar:

```bat
run-windows.bat
```

Ele procura o executável nas localizações comuns e abre o app. Para desenvolvimento web:

```bat
run-windows.bat --dev
```

## Desenvolvimento local

```bash
bun install
bun run dev
```

O preview web roda em `http://localhost:8080`. Nesse modo o processamento de mídia é simulado (`BrowserDemoRuntime`).

Para testar o app desktop real, use:

```bash
bun run build
bunx --bun tauri build
```

O build gera as páginas estáticas do desktop em `dist/client`; esse é o diretório
empacotado pelo Tauri. O `build-windows.bat` confirma a presença de
`dist/client/index.html` antes de iniciar a geração do MSI/NSIS.

## Primeira execução

Na primeira vez que o app desktop abrir, ele apresenta a tela de setup (`/setup`). Escolha um perfil (Leve, Recomendado ou Alta qualidade) e baixe os componentes locais (FFmpeg, ffprobe e whisper.cpp). A partir daí você pode criar projetos, importar mídia e pedir edições no chat do assistente.

## Estrutura do projeto

```text
src/                    # Aplicacao React/TypeScript (TanStack Start)
  core/                 # Dominio, comandos, reducer, runtime, IA
  features/             # Telas e componentes (editor, timeline, assistente, etc.)
  routes/               # Rotas do TanStack Router
src-tauri/              # Projeto Rust/Tauri (shell desktop)
  src/
    ai_ops.rs           # Validacao nativa de operacoes de IA
    lib.rs              # Comandos IPC
public/                 # Assets e pacote-fonte .zip
docs/                   # Arquitetura, release e guias
.github/workflows/      # CI e release automatizado
```

## Scripts uteis

| Script | Uso |
|--------|-----|
| `build-windows.bat` | Build completo: web + Tauri + MSI/NSIS |
| `run-windows.bat` | Localiza e abre o app instalado |
| `run-windows.bat --dev` | Inicia o servidor de desenvolvimento web |

## Testes e qualidade

```bash
npm run types
npm run test -- --run
npm run lint -- --quiet
npm run build
```

## Release automatizado

Atualize a versão em `package.json`, `src-tauri/Cargo.toml` e `src-tauri/tauri.conf.json`, depois:

```bash
git tag vX.Y.Z
git push --tags
```

O workflow `.github/workflows/release.yml` gera os artefatos e cria um rascunho de release no GitHub.

## Licença

Este projeto é de código aberto. Consulte o repositório para a licença completa.