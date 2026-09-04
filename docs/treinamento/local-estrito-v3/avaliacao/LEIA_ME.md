# Validação do pacote versus teste do aplicativo

`validar_pacote.py` verifica arquivos, UTF-8, contratos, exemplos, regras, política, hash do TXT e comportamento das restrições do modelo SQLite em diretório temporário. Não faz chamadas de rede. Requer Python e jsonschema já instalados no ambiente de desenvolvimento; não instala dependências e não adiciona Python ao runtime do Cut.

Execute offline: `python avaliacao/validar_pacote.py`.

Isso NÃO testa Ollama, voz, vídeo, GPU, Windows/Tauri, modelo de linguagem, qualidade das perguntas nem ausência de tráfego do Cut. `ACEITE_NO_COMPUTADOR.txt` descreve os testes integrados pendentes. Cenários de TREINO e TESTE_RESERVADO são dados sintéticos; nenhum resultado de modelo é inferido de sua validação sintática.
