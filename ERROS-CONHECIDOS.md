# L30 CUT AI — Erros conhecidos e o que falta confirmar

Documento feito para ser entregue a outra pessoa (ou colado em outro assistente) sem
precisar reexplicar o projeto. Última revisão: 05/09/2026.

---

## 1. O produto em cinco linhas

- L30 CUT AI é um editor de vídeo para computador (Windows), instalado na máquina.
- Tudo roda localmente: nada de nuvem, nada de conta obrigatória.
- A assistente "Cut" conversa, edita a linha do tempo e cria material (imagem, narração,
  transcrição, roteiro) usando programas instalados no próprio computador.
- Programas locais usados: Ollama (texto), stable-diffusion.cpp / sd-cli (imagem),
  Piper (voz), whisper.cpp (transcrição) e FFmpeg (montagem e exportação).
- Tudo que a Cut cria entra automaticamente nas mídias do projeto.

---

## 2. Onde cada coisa pode ser testada

| Parte | Testável no ambiente de desenvolvimento | Só testável no Windows do usuário |
| --- | --- | --- |
| Telas, conversa, linha do tempo | Sim | — |
| Testes automáticos e verificação de tipos | Sim | — |
| Geração de imagem, voz, transcrição | Não | Sim |
| Montagem/exportação com FFmpeg | Não | Sim |
| Compilação do executável e instalador | Não | Sim |
| Atualização automática | Parcial (o endereço responde) | Sim (instalar de fato) |

Consequência prática: qualquer IA ou pessoa que ajude à distância consegue mexer no código,
mas **não** consegue confirmar os itens da coluna da direita. Esses precisam de um teste
na máquina e do texto do erro copiado de volta.

---

## 3. Erros e pontos abertos

### E1 — Criação de imagem recusada pelo gerador
- **O que aparecia:** `[ERROR] main.cpp:163 - error: invalid mode txt2img`.
- **Quando:** ao pedir uma imagem na conversa.
- **Causa:** a versão instalada do gerador não aceita o modo antigo `txt2img`.
- **Já corrigido:** o programa passou a usar o modo `img_gen`
  (`src-tauri/src/creator.rs`, constante `SD_IMAGE_MODE`), com teste travando esse valor.
- **Falta confirmar:** uma geração real de imagem no Windows, do começo ao fim,
  com o arquivo aparecendo nas mídias.

### E2 — Falha sem explicação ("undefined") vinda do lado nativo
- **O que aparecia:** mensagem de erro vazia ou com `undefined` na conversa.
- **Causa:** o lado nativo às vezes devolve texto puro, às vezes objeto.
- **Já corrigido:** `src/features/assistant/errorMessage.ts` normaliza qualquer formato e,
  no pior caso, escreve "o motor local falhou sem informar o motivo".
- **Falta confirmar:** que nenhuma tela ainda mostra o erro cru.

### E3 — Montagem de vídeo falhando por causa da fonte da legenda
- **O que aparecia:** falha ao montar a cena, com erro do FFmpeg no filtro `drawtext`.
- **Causa:** caminho de fonte do Windows (`C:\Windows\Fonts\...`) precisa de escape especial,
  e em algumas máquinas a fonte esperada não existe.
- **Já corrigido:** caminho escapado (`C\:/Windows/Fonts/arial.ttf`) e, se a fonte não existir,
  a cena é remontada sem legenda em vez de falhar.
- **Registro:** `logs/creator.log` e `logs/criacao.log` dentro da pasta de dados do aplicativo.
- **Falta confirmar:** uma montagem completa no Windows, com e sem fonte disponível.

### E4 — "Plano inválido" ao pedir uma edição para a IA local
- **O que aparecia:** `A IA local não respondeu: Plano inválido: scope.kind ...`.
- **Causa:** modelos pequenos devolvem o formato com campos faltando ou fora do padrão.
- **Já corrigido:** verificação do Ollama antes de habilitar a IA generativa
  (`verifyGenerativeSetup` em `src/core/ai/ollama.ts`), normalização tolerante do formato
  e uma segunda tentativa automática com os erros exatos.
- **Falta confirmar:** comportamento com o modelo padrão (Llama 3.1 8B) instalado na máquina.

### E5 — Componentes locais não encontrados
- **O que aparece:** pedidos de imagem, voz ou transcrição dizem que falta um componente.
- **Causa:** os programas (sd-cli, Piper, whisper.cpp, FFmpeg) nem sempre estão nos caminhos
  esperados, ou foram instalados em outra pasta.
- **Onde olhar:** `src-tauri/src/media.rs` (lista de binários) e a tela de Diagnóstico,
  que gera um relatório copiável.
- **Falta confirmar:** rodar o Diagnóstico no Windows e colar o relatório.

### E6 — Compilação do executável Windows não verificável aqui
- **Situação:** o ambiente de desenvolvimento é Linux e não tem o compilador Rust nem o
  ambiente MSVC; portanto o executável não é compilado nem validado aqui.
- **Como validar:** rodar `build-windows.bat` no Windows e guardar a saída completa.

### E7 — Instalação e atualização automática
- **Situação:** o endereço de atualização responde, mas instalar e atualizar de verdade só se
  confirma rodando o instalador na máquina.
- **Sintomas já relatados no passado:** instalador fechando sozinho, instalação sem finalizar,
  falha silenciosa por falta de permissão. Foram tratados (modo "apenas para este usuário",
  janela que não fecha sozinha), mas precisam de nova confirmação.

---

## 4. Já resolvido — não mexer de novo

- Importação de vídeo com áudio: as trilhas de áudio e vídeo entram vinculadas e podem ser
  separadas.
- Seletor de "escopo" na assistente: removido de propósito; ela decide sozinha entre
  seleção e sequência inteira. Não recolocar.
- Pedidos de criação (imagem, voz, vídeo, pesquisa, transcrição) não passam pelo planejador
  de edição — isso é intencional.
- Renomear mídia altera apenas o nome dentro do programa, nunca o arquivo no disco.
- Nada de nuvem por padrão: a política local é fixa e não deve ser trocada por API externa.

---

## 5. Como reproduzir e o que enviar de volta

1. Abrir o programa no Windows e rodar o **Diagnóstico** — copiar o relatório inteiro.
2. Pedir na conversa: "cria uma imagem de um gato astronauta" — copiar a mensagem de erro,
   se houver.
3. Pedir: "aumenta o som do <nome do arquivo> em 4 db" — copiar a resposta.
4. Pedir a criação de um vídeo curto e, se falhar, enviar `logs/creator.log`.
5. Enviar também a saída completa de `build-windows.bat`, se o problema for de instalação.

Os registros ficam na pasta de dados do aplicativo, subpasta `logs`.

---

## 6. Texto pronto para colar em outra IA

> Estou trabalhando no L30 CUT AI: editor de vídeo desktop para Windows, feito em
> TanStack Start (React 19 + Vite) na interface e Tauri/Rust na parte nativa. Tudo roda
> localmente: Ollama para texto, stable-diffusion.cpp (sd-cli) para imagem, Piper para voz,
> whisper.cpp para transcrição e FFmpeg para montagem. Nada de nuvem e nada de outro roteador
> que não o TanStack Router.
>
> Erro que estou vendo: <colar a mensagem exata>.
> Passos: <o que eu fiz até aparecer>.
> Registro: <colar o conteúdo de logs/creator.log ou do Diagnóstico>.
>
> Preciso da causa provável e da correção mínima, sem trocar a arquitetura local nem
> adicionar serviços na internet. Arquivos prováveis: `src-tauri/src/creator.rs`,
> `src-tauri/src/media.rs`, `src-tauri/src/agent.rs`, `src/core/ai/ollama.ts`,
> `src/features/assistant/`.

---

## 7. Aviso honesto

Os itens marcados como "falta confirmar" continuam abertos porque não é possível executar o
programa instalado no Windows a partir do ambiente de desenvolvimento. A correção está no
código, mas a prova só vem do teste na máquina.
