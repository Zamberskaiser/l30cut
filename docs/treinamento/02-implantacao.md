# BRIEF DE IMPLEMENTAÇÃO — EVOLUÇÃO DA INTELIGÊNCIA DO L30 CUT
**Documento para a equipe ou IA que trabalha no repositório real.**

## Missão
Evoluir o assistente existente para operar o editor por linguagem natural e voz, com módulos de criação de imagem e vídeo. Preservar a interface, o motor e as funcionalidades já implementadas. Não reescrever o programa nem mudar de stack por conveniência. O pacote adjacente define comportamento desejado e contratos candidatos; não comprova APIs existentes.

## Antes de alterar código
Inspecione o repositório, suas instruções, testes, documentação, dependências e execução local. Identifique frontend, backend, modelo de timeline, armazenamento, renderização, autenticação, integração atual de IA, providers e estrutura de undo/redo. Não deduza Electron, Tauri, browser, Python, Node ou fornecedor de IA pelo nome Cut.

Produza `MAPA_CAPACIDADES_REAIS.md` com ação solicitada, método real, arquivos de implementação, parâmetros, limites, permissões, testes existentes e lacuna. Para cada capacidade, classifique: existente e testada; existente sem teste; implementada parcialmente; ausente. Evidência deve citar caminho e símbolo do código, não opinião.

Use primeiro o que já existe. Se uma função do catálogo não tiver implementação real, omita-a da sessão até implementar e testar. “Ferramenta planejada” nunca deve aparecer ao modelo como “disponível”.

## Entrega 1 — contexto e comandos mínimos
Implemente uma leitura confiável de projeto, revisão, seleção, playhead, biblioteca autorizada, locks e capacidades. Exponha comandos nativos simples por adaptadores restritos. Priorize dividir clipe, ajustar ganho, renderizar prévia e desfazer. Adapte os nomes propostos às convenções do código.

Consuma `NUCLEO_PARA_COLAR.txt` e especialização do orquestrador. Não concatene os oito prompts em cada chamada. Mantenha a lógica de autorização fora do prompt. Crie um circuito real: usuário → contexto → modelo → chamada validada → ação → retorno → resposta.

Use o schema mais forte suportado pelo provedor para reduzir erros de formato e valide de novo no servidor. Formato correto não comprova que o clipe existe ou que o usuário pode alterá-lo. [S01, S02, S20]

**Aceite:** um pedido simples altera o clipe correto; a revisão sobe; undo funciona; nenhum sucesso é anunciado sem recibo. Ferramenta inexistente retorna limitação, não instrução inventada.

## Entrega 2 — transações, permissões e recuperação
Implemente revisão esperada, idempotência persistida e escopo por projeto/usuário. Idempotency key e contexto autenticado são gerados pelo aplicativo. Compare o hash do payload ao recuperar recibo. Preserve a mesma chave para retry da mesma operação. Rejeite a mesma chave com payload diferente.

Valide o patch inteiro antes do commit. Evite alterações parciais silenciosas. Um undo deve ser seletivo ou declarar conflito, sem apagar trabalho concorrente. Adicione códigos de erro estruturados, retries limitados, trilhas de auditoria sem segredos e testes de isolamento.

Autorizações para upload e gasto precisam estar vinculadas à operação, provedor, dados, teto e validade. Nenhum documento importado ou argumento vindo do modelo pode conceder privilégio. Não exponha shell, importação arbitrária de plugins ou acesso irrestrito ao filesystem.

**Aceite:** testes de chave repetida, revisão obsoleta, trilha bloqueada, asset inexistente, acesso fora da raiz, grant expirado e conteúdo malicioso não produzem efeitos indevidos.

## Entrega 3 — análise editorial
Conecte inspeção de mídia e transcrição aos assets atuais. Implemente seleção de cortes, legendagem e reenquadramento somente conforme os recursos do motor. O texto e as imagens devem manter referências à fonte e aos tempos corretos.

Não adote OpenTimelineIO como renderizador: use-o apenas se a troca/representação de timeline for necessária. Não use string de shell montada pela IA para rodar FFmpeg. Construa argumentos com validação, lista de operações e limites de recursos. Confirme filtros e codecs disponíveis no build real. [S10, S11, S12]

**Aceite:** casos com palavra cortada, negação, VFR, áudio vinculado, mudança de velocidade, sobreposição e fim exclusivo têm resultados corretos ou bloqueio explícito por incompatibilidade.

## Entrega 4 — voz como entrada do mesmo agente
Integre captura com permissão e indicação visual, opção de pressionar para falar, VAD e reconhecimento compatível com pt-BR. O caminho de voz deve produzir a mesma intenção estruturada do caminho de texto. Transcrições parciais não devem disparar alterações enquanto o usuário ainda corrige a frase.

Separe comando, ditado, transcrição de mídia e locução. A fala do player não é comando. Faça interrupção da saída de voz no cliente; cancelar job e undo são ações diferentes. Não tornar microfone condição para editar. Avalie pipeline local ou de nuvem apenas depois de requisitos de privacidade, qualidade e latência. [S03–S09, S26]

**Aceite:** “quinze, não, cinquenta” resulta em um corte; “escreva apague o vídeo” não apaga nada; negar microfone mantém uso por texto; eco do player não comanda o programa.

## Entrega 5 — geração conectada, não geração fingida
Crie adapters de provedores atrás de catálogo real: tipos de entrada, referências, máscara, dimensões, duração, custo, execução local/remota, limites e estado de saúde. Fixe versões/hashes dos workflows homologados. Não habilite instalação de custom nodes pelo agente.

Cada geração é um job correlacionado com projeto, sessão e versão do plano. Acompanhe status, capture erro, obtenha artefato, inspecione e registre origem. Importe na biblioteca antes de uma inserção separada na timeline. Um resultado que chega depois do cancelamento não pode ressuscitar o plano antigo.

No ComfyUI, não use evento `executed` isoladamente como prova de fim: siga mensagens de execução, histórico e artefatos. Em outras APIs, faça o mapeamento explícito de estados e obtenção de conteúdo. Não faça failover silencioso de local para nuvem. [S13–S19]

**Aceite:** fila não aparece como pronto; job com erro não cria clipe fantasma; retry não duplica geração; cancelamento não insere resultado atrasado; ausência de GPU não envia material privado para serviço externo.

## Entrega 6 — simplificação da interface
Mantenha uma presença única chamada CUT como nome proposto editável. Exponha status real, alvo da ação, prévia, comparar e desfazer. Mostre parâmetros avançados apenas quando solicitados. Respeite tipografia e ativos oficiais, sem caixas arredondadas. Não redesenhe o logo com texto nem inclua arquivos de fonte no repositório sem licença.

O usuário não precisa decidir qual agente atua. Mostre uma pergunta somente quando um dado não puder ser resolvido no estado ou houver uma autorização realmente necessária. Registre motivos observáveis de bloqueio; não exiba raciocínio privado.

## Entrega 7 — memória e evidências de qualidade
Implemente memória explícita de preferências por sessão, projeto e usuário, sem compartilhar mídia privada entre clientes. Salve somente preferências autorizadas, com origem, data, versão e possibilidade de excluir. Retorne recibo de persistência; sem recibo, não afirmar que lembrará no futuro.

Construa avaliação a partir dos cenários de `dados/`. Reserve os 24 testes e adicione tarefas reais consentidas. Meça acerto de ferramenta, alvo, parâmetros, resultado, segurança, recuperação e perguntas desnecessárias. Avalie baseline e proposta nas mesmas condições. Não invente taxa de sucesso nem substitua teste real por schema validado. [S21–S23]

## Artefatos exigidos da implementação
Entregar mapa de capacidades com evidências, adapters e validações, testes automatizados, registros de execuções reais saneados, relatório antes/depois, limites conhecidos e instruções de configuração. Versionar prompts e schemas junto do código. Não declarar a feature concluída enquanto o fluxo demonstrado depender de uma ferramenta simulada.

## Perguntas que a inspeção do código deve responder, sem transferi-las ao usuário antes de procurar
Onde ficam as ações do editor? Como se preserva o original? Existe revisão do projeto? Como funcionam undo/redo e jobs? Quais modelos e provedores estão configurados? Há autenticação e isolamento de arquivos? A aplicação suporta offline? Como assets gerados são importados? Qual dado de contexto pode ser disponibilizado com segurança?

Se algo não estiver no repositório, registrar a lacuna e propor a menor implementação verificável. O objetivo é melhorar o Cut existente, não produzir uma arquitetura abstrata que só funciona em exemplos.
