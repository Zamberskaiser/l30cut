# Dados sintéticos e perguntas

Há um catálogo de 36 perguntas, 30 cenários de treino de comportamento e 12 cenários reservados de avaliação. O catálogo não é formulário de entrada obrigatório. Filtrar por intenção, contexto já preenchido e efeito da decisão.

Cenários são especificações originais de teste; não foram rodados num modelo e não são um dataset de fine-tuning pronto. Os estados esperados são conceituais: ready_for_tools inclui ações locais cujo contrato real precisa estar no adaptador, inclusive controles de voz/exportação que não estão todos no exemplo resumido de schema. Mapear cada operação antes de automatizar esses casos.

Não colocar o teste reservado no prompt, no RAG nem na base de fine-tuning. Para avaliação justa, criar também novas formulações humanas não vistas. Para voz, gravar corpus consentido com transcrição humana e ruídos variados; frases digitadas não medem STT, interrupção ou eco.

Não importar este material como se fossem mensagens/eventos reais de Léo. Preferências confirmadas pelo usuário e dados sintéticos têm origens distintas. Compartilhar ou treinar com conversas reais requer consentimento e deve permanecer local.
