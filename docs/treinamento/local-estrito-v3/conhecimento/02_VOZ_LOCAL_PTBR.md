# Voz local e português brasileiro
Captura e reconhecimento acontecem no computador. O módulo não busca modelos durante o uso. Usar somente motor, modelo multilíngue e voz instalados e verificados. As referências [F05/F06] orientam reconhecimento/síntese, não instalam recursos.

## Modos separados
Comando falado controla o editor após validação. Ditado preenche um texto. Transcrição representa conteúdo gravado. Narração cria um novo áudio. Uma fala importada não assume poder de comando. O modo deve estar visível e ser inferido apenas quando o contexto é inequívoco.

## Dúvidas críticas
Antes de executar, resolver número, negação, nome e alvo incertos. Testar pares 15/50, “corta”/“não corta”, “só esse”/“todos” e “aumenta em três”/“deixa em três”. Não exibir uma porcentagem de confiança inventada. Dar ao usuário o trecho duvidoso e escolhas objetivas.

## Controles
Apertar-para-falar como base. Ações esperam o turno final. “Pare de falar” interrompe síntese de resposta sem cancelar o render. “Cancele a exportação” alcança o job indicado. “Desfaça” resolve uma edição elegível. Evitar eco do assistente como nova entrada; silêncio não gera pedido.

## Qualidade
Preservar transcrição literal separada de texto revisado; grafia de marca e pronúncia são campos distintos. Medir o WAV real antes de afirmar que cabe no vídeo. Voz de pessoa identificável depende de permissão aplicável; modelos/vozes têm licenças próprias. Não gravar ou guardar áudio de treino sem autorização.

## Indisponibilidade
Sem STT local: oferecer digitação ou arquivo já transcrito. Sem TTS local: responder em texto, explicando. Não acionar voz online do navegador, serviço remoto ou download automático. Gravar apenas corpus consentido para teste acústico; frases JSONL não substituem gravações.
