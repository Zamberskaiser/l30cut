# Referências oficiais — somente bibliográficas

Consulta em 04/09/2026. Sínteses de apoio ao briefing; não são cópias integrais dos sites nem downloads executados pelo Cut. Nenhuma URL desta pasta deve ser aberta automaticamente no runtime. A documentação foi pesquisada durante a elaboração desta entrega, não pelo aplicativo local.

## F01 — Ollama — FAQ e modelos cloud

Fonte: https://docs.ollama.com/faq

O que foi confirmado: A FAQ descreve OLLAMA_NO_CLOUD=1 ou disable_ollama_cloud e reinício para desabilitar recursos cloud. Loopback é o bind padrão. A origem local da requisição não substitui a conferência de onde a inferência ocorre.

Aplicação proposta: Aplicar no processo Ollama real e verificar log/modelos; complementar com bloqueio dos caminhos de download e da rede no sistema.

Referência complementar: https://docs.ollama.com/cloud

## F02 — Tauri — Content Security Policy

Fonte: https://v2.tauri.app/security/csp/

O que foi confirmado: A CSP restringe o conteúdo da webview e deve ser ajustada às origens necessárias. A documentação alerta contra conteúdo remoto e recomenda restrições específicas.

Aplicação proposta: Retirar HTTPS genérico e fontes/CDNs remotos. Validar também Rust e processos auxiliares; CSP não é firewall do aplicativo inteiro.

## F03 — Tauri — Windows Installer

Fonte: https://v2.tauri.app/distribute/windows-installer/

O que foi confirmado: A documentação distingue bootstrapper baixado, bootstrapper embutido, instalador offline e versão fixa do WebView2.

Aplicação proposta: Selecionar empacotamento apropriado à instalação sem internet. Conferir em máquina limpa. Embutir apenas um bootstrapper não é o mesmo que trazer todo o runtime.

## F04 — Hugging Face Hub — Environment variables

Fonte: https://huggingface.co/docs/huggingface_hub/package_reference/environment_variables

O que foi confirmado: HF_HUB_OFFLINE evita chamadas ao Hub e usa arquivos previamente disponíveis. HF_HUB_DISABLE_TELEMETRY controla telemetria das bibliotecas que respeitam essa configuração.

Aplicação proposta: Referência condicional para extensões que usem essas bibliotecas. Não é motivo para adicioná-las ao Cut. Carregar por caminho local; a política do sistema cobre outras conexões.

## F05 — whisper.cpp — projeto oficial

Fonte: https://github.com/ggml-org/whisper.cpp

O que foi confirmado: Implementação local de reconhecimento de fala com exemplos offline e detecção de atividade de voz.

Aplicação proposta: Usar modelo compatível com português já no disco e avaliar áudio real. Separar aquisição de pesos da inferência; não copiar exemplos de download para o runtime.

## F06 — Piper — projeto oficial mantido pela OHF

Fonte: https://github.com/OHF-Voice/piper1-gpl

O que foi confirmado: Motor de síntese de voz local. O repositório declara licença GPL-3.0.

Aplicação proposta: Conferir licença do motor e de cada voz distribuída. Usar arquivos de voz e configuração já instalados. Não há voz nem binário neste pacote.

## F07 — stable-diffusion.cpp — projeto oficial

Fonte: https://github.com/leejet/stable-diffusion.cpp

O que foi confirmado: Motor de inferência de difusão local com famílias e modos dependentes da build/modelo.

Aplicação proposta: Reutilizar o adaptador do Cut; a biblioteca ter recurso não prova que a interface o expõe. Validar pesos, argumentos e qualidade na máquina.

## F08 — Tauri — Dialog

Fonte: https://v2.tauri.app/plugin/dialog/

O que foi confirmado: Documentação para diálogos nativos de seleção e salvamento.

Aplicação proposta: O botão Baixar TXT pode usar Salvar como no computador, sem URL pública. O backend valida destino e copia os bytes. Ainda depende de implementação no Cut.

## Código do produto

As evidências C01–C08 estão em EVIDENCIAS_CODIGO.json, com commit e escopo de leitura. O comportamento instalado e o tráfego real não foram ensaiados.

## Material original do projeto

Os ZIPs v1/v2 fornecidos orientaram a preservação da organização e a identificação de incompatibilidades. Os módulos e briefings v3 são redação original. Os documentos operacionais não dependem de carregar os manuais completos pela internet.
