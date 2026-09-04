# Auditoria de localidade — material e código
Data: 04/09/2026. Resultado: **não está demonstrado isolamento estrito na implementação consultada**.

## Escopo e origem das evidências
Foram lidos os ZIPs v1 e v2 fornecidos na conversa. O manifesto de código do v2 indicava o repositório `Zamberskaiser/l30cut`; a conexão GitHub confirmou sua existência. A revisão nova foi fixada no commit `b60ad7d0bb861a4258ad46396e9527cffa34d39b`, obtido da branch principal nesta consulta. O executável instalado pode ter outra revisão.

Os oito arquivos consultados nesta revisão: `src-tauri/src/agent.rs`, `src/core/ai/ollama.ts`, `src-tauri/tauri.conf.json`, `src/features/assistant/AssistantPanel.tsx`, `src/features/assistant/useAssistantActions.ts`, `src/core/store/editorStore.tsx`, `src/core/ai/contextBuilder.ts` e `src/features/assistant/provider.ts`. Foram consultados integralmente ou por trechos indicados no manifesto de evidências. Não é uma auditoria integral de todos os módulos, binários, dependências ou serviços do sistema operacional.

## 1. O treinamento anterior não era exclusivamente local
No v1, `conhecimento/08_PIPELINE_E_RECURSOS.md` diferenciava local estrito, híbrido e remoto. O núcleo aceitava envio para nuvem mediante autorização. A biblioteca reunia referências de APIs remotas de voz, imagem, vídeo e recuperação. O v2 proibia envio de conteúdo do cliente à nuvem em regras, mas seu guia ainda aceitava busca web com autorização. Esses materiais não são adequados como política definitiva de ausência total de comunicação externa.

Um link bibliográfico, por si só, não executa comunicação. O problema é autorizar ou implementar caminhos externos. O v3 não carrega exemplos de nuvem na base operacional e trata as referências apenas como proveniência documental.

## 2. Busca externa real no caminho nativo [C01, C04, C05]
`agent.rs::web_search` constrói URL de `api.duckduckgo.com` e usa `reqwest::get`. `useAssistantActions.ts` chama `runtime.webSearch`; `AssistantPanel.tsx` oferece uma sugestão de pesquisa na internet. Portanto há caminho explícito de saída. O comentário “não leva dados de projeto” não garante anonimato: o conteúdo de `query` pode conter informações privadas e codificar a URL não as remove.

Correção: retirar busca externa das sugestões, roteamento, catálogo, bridge e comandos registrados; rejeitar a operação também no host. Pesquisa deve significar consulta à biblioteca no disco. Um pedido para usar internet recebe explicação curta, não uma tela para habilitar exceção.

## 3. Download sob demanda dentro do fluxo de criação [C05, C02]
`useAssistantActions.ts::prepare` percorre módulos ausentes e chama `runtime.installComponent` quando `componentDownloads` está disponível. `ollama.ts::pullOllamaModel` solicita `/api/pull`. Uma requisição ao Ollama no loopback pode provocar download externo pelo serviço. Nos trechos vistos, a preparação não é apenas leitura de inventário.

Correção: preparação consulta e valida arquivos locais, sem instalar nada pela internet. Motores e pesos ausentes geram `missing_local_capability`. Importar pacote offline validado é tarefa administrativa separada, nunca consequência escondida de “gere um vídeo”.

## 4. Provedor externo continua definido [C08]
`provider.ts` mantém um provedor `openai` com endpoint externo, desativado por padrão. Isso NÃO comprova que houve uso ou transmissão. Mas opt-in de nuvem é incompatível com um produto exclusivamente local.

Correção: remover o provedor remoto do produto local, da configuração persistida, dos tipos operacionais e do registro nativo. A expressão “compatível com OpenAI” pode apenas descrever um formato de API local; não deve ser confundida com envio à empresa. O destino real e o comportamento do servidor precisam ser conferidos.

## 5. URL local padrão não é validação de destino [C02, C08]
`normalizeOllamaBaseUrl` remove barras e sufixos; esse método não valida host. O solicitante do provider usa `config.endpoint`. Esses caminhos não demonstram, por si, allowlist estrita de destino. Não inferimos aqui o comportamento de eventuais outras validações não lidas.

Correção: resolver configuração no host, aceitar somente endereços literais e portas locais homologadas, recusar redirecionamentos, credenciais na URL, proxies herdados e esquemas alternativos. Endereço local também não prova inferência local: desabilitar recursos cloud do próprio Ollama e verificar o modelo instalado. [F01]

## 6. Configuração permite saída e prepara instalação conectada [C03]
A CSP inclui `https:` em `connect-src`; o updater tem endpoint remoto configurado e `active: true`; o instalador usa `downloadBootstrapper` para WebView2. Isto prova permissões/configuração, não a frequência de checagens nem que uma atualização tenha sido executada. Não inspecionamos o registro completo do plugin updater.

Correção: restringir a CSP e o host, remover registro/checagem remota de atualização da edição local e distribuir WebView2/motores em pacote offline, conforme licença. Alterar apenas `active` sem verificar a inicialização real do plugin não basta. A CSP protege o conteúdo da webview; não deve ser apresentada como firewall de Rust ou dos processos auxiliares. [F02, F03]

O escopo do protocolo de assets é `**`. Não é prova de envio externo, mas é amplo demais para um contrato de anexo limitado por projeto. Restringir raízes e resolver arquivos por ID autorizado.

## 7. TXT existe, mas ainda não é um anexo conversacional completo [C01, C05, C06]
`save_text_file` escreve na pasta exports e devolve uma string de caminho; `std::fs::write` no mesmo nome pode substituir arquivo existente. A extensão é filtrada por caracteres, não por uma lista estrita de tipos de documento.

No fluxo de transcrição, a escrita é tentada e erros são convertidos em `saved = null`; a mensagem exibe até 1.200 caracteres e eventualmente o caminho. `ActionOutcome` só tem `text`; `AssistantMessage` tem texto/plano, sem campo de anexos. Não há, nesses contratos, cartão persistente com identidade e versão do arquivo.

Correção: serviço de artefatos locais, nome único, escrita verificável, metadados estruturados e mensagem vinculada. Erro ao salvar deve aparecer, sem anunciar anexo inexistente. Todo roteiro entregue como documento gera TXT real por padrão.

## 8. Histórico observado fica em estado de interface [C06]
`messages` é um `useState`. `pushMessage` e `updateMessage` só alteram esse estado. Nos métodos vistos, salvar envia `project`, não `messages`; criar novo projeto limpa mensagens. Abrir outro projeto não recarrega uma conversa persistida nesse caminho. Isso não prova ausência de armazenamento em qualquer outro módulo, mas esse store não implementa a persistência solicitada.

Correção: armazenar conversas, mensagens, anexos e perguntas pendentes por usuário/projeto em disco. Reabrir o programa reconstrói a conversa. Trocar de projeto isola os históricos e impede mistura visual entre trabalhos.

## 9. O sistema ainda precisa de uma resposta própria para dúvida [C04, C07, C08]
O provider pede `AiEditPlan`, não um resultado de conversa que represente uma pergunta. O prompt contém orientações contraditórias: usar a operação mais próxima quando impossível e, adiante, não inventar edição parecida. Isso precisa ser corrigido no prompt real, não apenas no perfil.

`contextBuilder` encaminha no máximo 20 regras de 240 caracteres e defaults. Não encaminha `profile.knowledge`, histórico nem uma estrutura de respostas do briefing. Logo anexar manuais ao perfil não demonstra recuperação funcional.

Em transcrição, o fallback observado escolhe a última mídia transcrevível se não encontra o nome. Para alvo ambíguo, o novo comportamento deve perguntar, não decidir pelo último arquivo. [C05]

Correção: resultado externo ao AiEditPlan com `needs_clarification`, `ready_for_tools`, `completed` e `blocked`; incorporar contexto relevante e perguntas respondidas. Perguntar pausa somente a ação dependente da resposta. A informação nova leva à releitura de estado antes da execução.

## Veredito e limites
A base contém caminhos de processamento local, mas não atende ao requisito de ausência de coisas externas enquanto os caminhos acima continuarem disponíveis. Não há evidência aqui de que mídias foram enviadas, e não declaramos um vazamento ocorrido. A configuração instalada no computador do usuário não foi medida. Os arquivos deste pacote corrigem a especificação; a aplicação e o teste das mudanças são etapas de implementação.

Fontes detalhadas: `fontes/EVIDENCIAS_CODIGO.json` e `fontes/FONTES_OFICIAIS.md`.
