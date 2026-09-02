# Plano: rodar o L30 CUT AI após o build

## Contexto
O `build-windows.bat` já gera o instalador MSI e o executável portátil NSIS, mas termina apenas abrindo a pasta do bundle. O usuário não tem instruções claras sobre qual arquivo clicar, como instalar e como abrir o app pela primeira vez. A README também está genérica do template Lovable.

## Objetivo
Fazer o fluxo pós-build ser autoexplicativo: scripts que encontram/instalam/executam o app e documentação que ensina o usuário a rodar o L30 CUT AI no Windows.

## Entregas

### 1. Melhorar `build-windows.bat` — instruções pós-build
- Após `bundleok`, exibir passos numerados:
  1. MSI: `src-tauri\target\release\bundle\msi\*.msi` → clique duplo para instalar.
  2. Portátil: `src-tauri\target\release\bundle\nsis\*.exe` → extrai sem instalar.
  3. Atalho no menu Iniciar aparece após o MSI.
- Perguntar se deseja executar o instalador MSI agora (`choice /c SN`).
- Se sim, localizar o arquivo `.msi` gerado e rodar `msiexec /i` (ou `start` no arquivo).
- Continuar abrindo a pasta do bundle como fallback/visual.

### 2. Criar `run-windows.bat` — localizar e abrir o app
- Prioridade de localização:
  1. Instalação padrão do MSI: `%LOCALAPPDATA%\L30 CUT AI\L30 CUT AI.exe`.
  2. Pasta do bundle atual: `src-tauri\target\release\L30 CUT AI.exe`.
  3. Pasta do bundle release: `src-tauri\target\release\bundle\nsis\`.
- Se encontrar, executa o app.
- Se não encontrar, exibe mensagem dizendo para rodar `build-windows.bat` primeiro ou baixar o release.
- Adicionar opção `--dev` para rodar `bun run dev` (servidor web de preview) quando chamado com esse argumento.

### 3. Atualizar `README.md`
- Substituir texto genérico por guia específico do L30 CUT AI.
- Seções:
  - O que é (editor local-first com IA).
  - Requisitos (Windows 10/11 x64, Bun, Rust, WebView2).
  - Build rápido: `build-windows.bat`.
  - Rodar o app: `run-windows.bat`.
  - Desenvolvimento web: `bun install && bun run dev`.
  - Estrutura de pastas (`src/`, `src-tauri/`, `docs/`).

### 4. Atualizar `docs/RELEASE.md`
- Adicionar seção "Depois do build" explicando MSI vs NSIS e como executar.
- Mencionar que a primeira execução abre a tela `/setup` para baixar FFmpeg/whisper.cpp.

### 5. Melhorar rota `/download`
- Expandir o bloco "Depois de instalar" com passos visuais:
  1. Execute o `.msi` e complete a instalação.
  2. Abra o app pelo menu Iniciar/atalho.
  3. Na tela de setup, escolha o perfil e baixe os componentes.
  4. Crie ou abra um projeto e importe mídia.
- Adicionar botão secundário "Como instalar" (scroll suave para a seção).

### 6. Testar e validar
- Executar os comandos padrão após as alterações:
  - `npm run types`
  - `npm run test -- --run`
  - `npm run lint -- --quiet`
  - `npm run build`
- Verificar se o ZIP `public/l30-cut-ai-source.zip` inclui os novos scripts e README.

## O que continua sendo contrato/adaptador
- A execução real do app depende do Windows, WebView2 e dos binários Tauri gerados.
- O script `run-windows.bat` não substitui a instalação; ele apenas localiza e executa o binário existente.
- A tela de setup (`/setup`) já existe e continua sendo o fluxo de primeira execução.

## Escopo fora deste plano
- Não alterar a arquitetura do editor, runtime ou assistente.
- Não implementar novas funcionalidades de edição.
- Não modificar o build Tauri em si, apenas a experiência pós-build.