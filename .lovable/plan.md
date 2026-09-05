# Documento de erros do L30 CUT AI (para levar a outra IA)

## Objetivo

Criar um arquivo único, em português claro, com tudo o que hoje falha ou não pode ser confirmado aqui, para você colar em qualquer outro assistente (ou entregar a um técnico) sem precisar reexplicar o projeto.

## Resposta curta à sua pergunta

Sim: dá para pedir ajuda a outra IA, mas ela não vai conseguir testar o programa instalado no seu Windows. O gargalo não é falta de IA — é que a parte nativa (o executável do Windows, o gerador de imagem, o FFmpeg, o Ollama) só pode ser testada na sua máquina. Por isso o documento abaixo é a peça que economiza tempo: ele descreve o erro, o que já foi tentado e o que precisa ser confirmado aí.

## O que será criado

Um arquivo `ERROS-CONHECIDOS.md` na raiz do projeto, com estas partes:

1. Resumo do produto em cinco linhas (o que é, onde roda, o que é local).
2. Ambiente: o que é testado aqui (interface e testes) e o que só é testável no Windows.
3. Lista de erros, um bloco por erro, cada um com: o que aparece na tela, quando acontece, causa provável, o que já foi corrigido, o que ainda falta confirmar.
4. Erros já resolvidos (para ninguém "corrigir" de novo).
5. Como reproduzir e onde ficam os registros (`logs/creator.log`, o relatório copiável do Diagnóstico).
6. Um trecho pronto para colar em outra IA, com o contexto mínimo.

## Erros que entram na lista

- Criação de imagem: o gerador recusava o modo antigo; hoje o programa usa o modo aceito. Falta confirmar uma geração real no Windows.
- Mensagens de falha vindas do lado nativo que apareciam sem texto útil.
- Montagem de vídeo: caminho de fonte do Windows na legenda; hoje a cena é remontada sem legenda quando a fonte não existe. Falta confirmar no Windows.
- IA local: pedido recusado por plano inválido quando o modelo devolve campos fora do formato; hoje há verificação do Ollama e normalização. Falta confirmar com o modelo padrão instalado.
- Componentes locais (gerador de imagem, narração, transcrição, FFmpeg) que às vezes não são encontrados nos caminhos esperados.
- Compilação do executável Windows: não pode ser verificada neste ambiente.
- Instalação/atualização automática: pontos que só se confirmam rodando o instalador.

## Observação de honestidade

Alguns itens acima estão marcados como "falta confirmar" justamente porque não posso executar o programa no seu Windows. O documento vai deixar isso explícito em vez de afirmar que está resolvido.

## Detalhes técnicos

- Arquivo novo: `ERROS-CONHECIDOS.md` (raiz), em português, sem alterar código.
- Fontes usadas: `roadmap.md`, `docs/build-logs/`, `src-tauri/src/creator.rs`, `src-tauri/src/media.rs`, `src/core/ai/ollama.ts`, `src/features/assistant/errorMessage.ts`, planos arquivados em `.lovable/plan/`.
- Cada erro recebe um identificador curto (E1, E2, ...) para facilitar a conversa com outra IA.
- Nenhuma mudança de comportamento do aplicativo nesta entrega.
