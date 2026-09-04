# Documentos e conversa persistente
O roteiro completo deve existir em TXT UTF-8 e estar anexado à mensagem. A resposta informa a entrega e a UI apresenta Visualizar, Baixar TXT e versão. Não pedir ao usuário para copiar o texto num bloco de notas.

## Registro
Serviço local cria o documento com ID do host, família, versão, origem, tamanho, hash e status. Mensagem contém referência ao anexo. Arquivo canônico vive em diretório durável; Salvar como gera cópia. Novo clique baixa os mesmos bytes, não consulta o modelo.

## Persistência
Conversas, perguntas, respostas e anexos ficam em banco no computador, por workspace/projeto. Reiniciar recupera o mesmo histórico. URLs blob e estado React não são armazenamento durável. Mensagens antigas apontam para versões antigas. Mudança de projeto deve carregar outra conversa, nunca apenas trocar a timeline.

## Falhas
Não mostrar anexo ready antes de gravar/verificar/registrar. Erro de permissão ou disco cheio aparece. Arquivo sumido é missing; checksum diferente é corrupt. Texto preservado pode gerar outra versão, mas não se chama restauração exata sem prova. Limpeza de treino não elimina documentos por acidente.

## Exceções
Pergunta/resposta curta não gera arquivo. Se o usuário pedir somente texto, não criar. Roteiro, transcrição e briefing solicitados como entregáveis geram TXT por padrão. Documento longo deve ficar inteiro no arquivo, mesmo quando a prévia é curta. Reutilização em vídeo aponta para a versão exata.
