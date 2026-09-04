# Contratos propostos — não são APIs instaladas

O JSON de política é especificação que precisa ser aplicada pelo host. Não concede nem remove acesso sozinho. A lista de modelos começa vazia de propósito: esta entrega não inventaria o computador do usuário.

`turno_assistente.schema.json` é um envelope novo para o orquestrador, fora do AiEditPlan atual. `needs_clarification` não contém tarefas. IDs de perguntas são atribuídos pela camada de persistência, que relaciona cada campo à mensagem. `ready_for_tools` é uma proposta ainda sujeita ao adaptador; os parâmetros de cada ferramenta têm de ser validados pelo contrato nativo específico. O campo inputs genérico deste exemplo NÃO é autorização para executar JSON arbitrário.

`completed` representa resposta textual normal ou entrega com recibos. Artefatos só entram na mensagem depois de validados pelo host, que deve impedir referência a IDs de outro projeto. Não confiar no LLM para preencher a lista de IDs de arquivos prontos.

`artefato.schema.json` descreve metadados públicos de um arquivo já pronto. Caminho canônico é privado do host. Artefatos missing/corrupt ficam registrados no banco mas não atendem a esse schema de entrega pronta.

`perfil_espelho_fornecido.schema.json` foi copiado do pacote v2 fornecido. O perfil v3 é validado contra esse espelho; a tela de importação e o schema da revisão instalada precisam ser testados. O contextBuilder consultado limita 20 regras a 240 caracteres e não usa knowledge: é necessário implementar a recuperação. Não confundir perfil aceito com comportamento alterado.

`persistencia_proposta.sql` é modelo novo, não migração pronta sobre um banco desconhecido. Não execute cegamente em produção. Migrar preservando arquivos, contratos atuais e vínculos. O teste do pacote usa um banco temporário isolado.

Os URIs de $schema são identificadores de formato, não serviços. Validar com metaschemas já locais, sem buscar nada pela rede. Os nomes create_text_artifact, inspect_local_capabilities e demais ferramentas são propostos; mapear para RuntimeAdapter e Rust com validação, ou marcar ausente.
