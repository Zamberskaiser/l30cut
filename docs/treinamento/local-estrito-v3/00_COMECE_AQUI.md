# L30 CUT — LOCAL ESTRITO · v3
L30 | Ateliê de Design, Tecnologia e Produção
4 de setembro de 2026

## A decisão do produto
O Cut deve executar a conversa, o reconhecimento e a síntese de voz, o processamento de mídia, a consulta ao conhecimento, a geração disponível e a criação de arquivos no próprio computador. Não há modo híbrido, consulta web, provedor externo, atualização automática ou download automático de modelos nesta especificação. Outra máquina na mesma rede também não conta como o computador do usuário.

Esta versão substitui o treinamento ativo v1/v2 no tema Cut: não carregue os prompts antigos junto com os novos. Preserve as versões anteriores apenas como histórico, fora da recuperação de conhecimento ativa. O pacote é treinamento, contratos propostos e briefing de implementação; não é instalador nem conjunto de pesos. Não altera automaticamente o aplicativo.

## Arquivos para usar primeiro
1. `01_AUDITORIA_LOCALIDADE.md`: o que foi realmente encontrado nos materiais e no código consultado.
2. `02_TREINAMENTO_MESTRE_LOCAL.md`: comportamento consolidado.
3. `03_BRIEFING_PERGUNTAS.txt`: atendimento guiado, dúvidas e exemplos.
4. `04_BRIEFING_CHAT_E_ARQUIVOS.txt`: TXT real, cartão baixável, versões e persistência.
5. `05_BRIEFING_IMPLEMENTACAO.txt`: tarefas ligadas aos caminhos reais do repositório.
6. `NUCLEO_PARA_COLAR.txt`: instrução do orquestrador, não substituta do código.

`06_PERFIL_TREINAMENTO.json` usa o formato do perfil presente no pacote v2 fornecido. Seus 20 enunciados cabem no limite de 240 caracteres por regra observado no contextBuilder atual. Isso facilita a importação, mas não muda PLAN_SYSTEM_PROMPT, não bloqueia rede e não implementa anexos. A compatibilidade de importação na instalação do usuário precisa ser ensaiada.

## Organização
Prompts: núcleo e sete especializações. Conhecimento: oito módulos locais. Contratos: resultado conversacional, perguntas, anexos e política local. Dados: banco de perguntas e cenários sintéticos. Avaliação: validação de consistência do pacote e roteiro de aceite no Windows. Fontes: referências consultadas, somente bibliográficas; não são chamadas de rede para o aplicativo.

## Limites da entrega
Revisão estática de oito arquivos distintos do código, alguns por trechos, no commit b60ad7d0bb861a4258ad46396e9527cffa34d39b. Não executamos nem inspecionamos o processo instalado no computador do Léo. O relatório separa evidência, conclusão e requisito de mudança. Código do repositório não foi alterado nesta entrega. Não houve treinamento de pesos, teste de GPU, gravação de voz ou instalação de motores.

## Como liberar
Só declarar a versão instalada como local após ensaiar instalação offline, primeira execução sem internet, fluxos de mídia e reabertura do chat, com bloqueio de saída e observação de tentativas de rede de todos os processos envolvidos. Testar também com rede disponível e política ativa, para identificar chamadas que apareceriam quando a conexão voltasse.
