# Onde o L30 CUT AI fica salvo no Windows

Este documento explica onde cada parte do programa fica gravada no computador após rodar o `build-windows.bat`.

## 1. Ícones

Sim, o instalador gera ícones.

- Os arquivos-fonte dos ícones estão em: `src-tauri/icons/`
  - `icon.ico` → ícone do executável e do instalador
  - `icon.png` → ícone em alta resolução
  - Outros tamanhos são gerados automaticamente pelo Tauri
- O Tauri embute o ícone no `.exe` e cria o atalho do menu Iniciar/área de trabalho com o mesmo ícone.

## 2. Programa instalado

Depende do tipo de instalador gerado:

### MSI (padrão)

- Executável: `C:\Program Files\L30 CUT AI\L30 CUT AI.exe`
- Ou, em sistemas 32 bits: `C:\Program Files (x86)\L30 CUT AI\L30 CUT AI.exe`
- Atalho no menu Iniciar: `L30 CUT AI`
- Atalho na área de trabalho: opcional, criado pelo instalador

### NSIS (fallback)

- Executável: `%LOCALAPPDATA%\L30 CUT AI\L30 CUT AI.exe`
- Atalho no menu Iniciar: `L30 CUT AI`

## 3. Arquivos de build (antes da instalação)

Enquanto o `build-windows.bat` roda, os artefatos ficam em:

- Build web: `dist\client\` ou `.output\public\`
- Executável Rust: `src-tauri\target\release\l30-cut-ai.exe`
- Instaladores gerados:
  - MSI: `src-tauri\target\release\bundle\msi\`
  - NSIS: `src-tauri\target\release\bundle\nsis\`

## 4. Dados do usuário

Projetos, configurações e modelos de IA baixados ficam em pastas do Windows reservadas ao app:

- Configurações: `%APPDATA%\com.l30cut.ai\` ou `%LOCALAPPDATA%\com.l30cut.ai\`
- Projetos salvos: dentro da pasta de configuração ou em local escolhido pelo usuário
- Modelos Ollama: gerenciados pelo próprio Ollama, normalmente em `C:\Users\<você>\.ollama\models\`
- FFmpeg/whisper.cpp: baixados automaticamente pelo setup do app em subpastas de dados

## 5. Como abrir depois

- Use o atalho `L30 CUT AI` no menu Iniciar
- Ou rode `run-windows.bat` na pasta do projeto
- Ou execute diretamente o caminho onde foi instalado

## 6. Desinstalação

- Vá em **Configurações → Aplicativos → L30 CUT AI → Desinstalar**
- Ou execute novamente o MSI com a opção de remoção
