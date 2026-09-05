# L30 CUT AI

Editor de vídeo local-first para Windows com assistente de IA por chat. O app roda 100% na máquina do usuário: FFmpeg local para render, whisper.cpp local para transcrição e um provider de IA local opcional.

A versão web disponível no preview é uma **demonstração navegável** com processamento simulado. O app desktop compilado com Tauri é que executa as operações reais de mídia.

## Requisitos

- Windows 10 21H2 ou Windows 11 (64 bits)
- [Bun](https://bun.sh) — runtime e gerenciador de pacotes
- [Rust](https://rustup.rs) — necessário para compilar o Tauri
- Microsoft Visual C++ Build Tools — o script instala automaticamente a carga “Desenvolvimento para desktop com C++” quando `link.exe` não estiver disponível
- WebView2 Runtime — presente por padrão no Windows 11 e na maioria das instalações do Windows 10

## Build e instalação rápida

1. Baixe o pacote-fonte **v41 ou mais recente** em `/download` ou clone este repositório. Versões anteriores ainda enviavam `txt2img` ao gerador de imagens e devem ser descartadas.
2. Extraia e abra a pasta no Windows Explorer.
3. Execute `build-windows.bat` com dois cliques.

O script:
- verifica/instala Bun, Rust e Visual C++ Build Tools;
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

## IA generativa local (Ollama)

O assistente funciona em dois motores:

1. **Regras determinísticas (padrão, sem download):** interpreta pedidos como “remova pausas maiores que 700 ms” ou “crie 6 cortes de 30 a 60 s” usando a transcrição e a detecção de silêncio locais. Nenhum modelo é necessário.
2. **IA generativa local via Ollama (opcional):** um LLM roda no próprio computador e entende pedidos livres, devolvendo um plano no mesmo schema fechado `AiEditPlan`.

Como ativar:

1. Instale o Ollama em <https://ollama.com/download> e deixe o serviço rodando (padrão `http://127.0.0.1:11434`).
2. No editor, painel **Assistente** → botão **Motor** → ative *Usar IA generativa nos planos*.
3. Clique em **Testar** para detectar o servidor e os modelos instalados.
4. Baixe o modelo padrão do produto, **Llama 3.1 8B** (`llama3.1:8b`), direto da tela. Alternativas: `qwen2.5:7b-instruct`, `qwen2.5:3b-instruct` (leve) ou `phi3.5:3.8b`. O download é streamado com progresso e fica salvo na máquina.
5. Selecione o modelo. Ele passa a ser usado nos próximos pedidos.

Garantias:

- **Offline:** o app fala apenas com o endpoint local configurado. Nenhum prompt, transcrição ou mídia sai do computador, e não há chave de API.
- **Nunca confia no modelo:** a resposta é validada por Zod contra `AiEditPlan` (enum fechada de operações) e, no desktop, revalidada nativamente em Rust (`src-tauri/src/ai_ops.rs`) antes de virar transação na timeline. Plano inválido é recusado inteiro.
- **Fallback:** se o Ollama estiver desligado ou devolver algo fora do schema, o planejador determinístico assume (pode ser desligado nas configurações).
- **Contexto mínimo:** só o escopo escolhido (projeto, sequência, seleção, intervalo ou transcrição) é enviado ao modelo local, sempre marcado como dado não confiável.

No preview web, chamadas para `127.0.0.1` normalmente são bloqueadas por CORS; use o app instalado (o Ollama libera origens `tauri://` por padrão) ou inicie o Ollama com `OLLAMA_ORIGINS=*` para testar no navegador.

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