# Conhecimento e recursos locais
Todo conhecimento usado pelo aplicativo é materializado em disco. As URLs da pasta fontes são proveniência para desenvolvimento, não instruções para navegar. Um índice textual local pode recuperar módulos por tarefa; embeddings só com modelo local disponível e benefício medido.

## Instalação
Distribuir pacote offline completo, com binários, pesos, tokenizadores, configurações, vozes, licenças, fontes autorizadas já disponíveis e runtime necessário. Não incluir um bootstrapper conectado como se fosse um instalador autossuficiente. [F03]

## Disponibilidade
Capacidade possui estados: não instalada, instalada não testada, pronta ou falhou. Tamanho de arquivo não prova compatibilidade. Antes de ofertar geração, ensaiar a build e o modelo no hardware do usuário. Não anunciar prazo nem qualidade universal sem medição. CPU/GPU e RAM/VRAM limitam quais fluxos cabem.

## Economia de recursos
Usar um orquestrador, carregar módulos por tarefa e reservar memória para render. Diminuir qualidade/duração/resolução quando isso alterar a entrega exige aceite. Liberar modelos ociosos é responsabilidade do scheduler local; não pedir ao usuário a cada etapa técnica.

## Aprendizado
Histórico visível, memória de preferência e dataset de treino são camadas separadas. Correções aprovadas ficam no escopo correto. Não exportar dados de voz, mídia ou briefing. Fine-tuning eventual é local e usa conjunto consentido, treino/teste separados e medição comparativa. Frases sintéticas não são dados acústicos.

## SDKs opcionais
Caso uma extensão futura use Hugging Face, carregar arquivos por caminho local com modo offline da biblioteca. Não adicionar essa dependência apenas para ler estes manuais. Modo offline do Hub não bloqueia todos os outros clientes HTTP de um processo. [F04]
