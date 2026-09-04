# Corrigir criação de imagem e diagnóstico da Cut

## O que será corrigido
- Trocar o modo incompatível `txt2img` pelo modo aceito pelo gerador instalado, `img_gen`, em toda criação local de imagens.
- Normalizar falhas vindas do aplicativo Windows para nunca exibir `undefined`; a conversa mostrará a causa real em português.
- Exibir sucesso e falha no alto da tela, sem depender apenas da mensagem no fim da conversa.
- Fazer o Diagnóstico validar uma execução real do gerador, não apenas a presença do programa e do modelo.
- Manter um histórico contínuo das tentativas de imagem e oferecer uma forma direta de copiar o relatório para análise.

## Comportamento da Cut
- Pedidos de imagem, áudio, vídeo, pesquisa e transcrição continuam sendo identificados antes do planejador de edição.
- O JSON tipado continua restrito às alterações da timeline; ele não será usado para bloquear ações de criação.
- A IA de texto ajuda a interpretar e planejar, enquanto o programa executa localmente os recursos instalados no computador.

## Validação
- Cobrir o modo correto e a formatação de erros com testes.
- Verificar a compilação da interface e os testes existentes.
- A validação final do executável nativo continuará sendo confirmada no Windows com o novo relatório copiável.
