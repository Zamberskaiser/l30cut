# L30 CUT AI — Arquitetura

Editor de vídeo local-first para Windows: UI React (TanStack Start) + host Tauri
(Rust) + binários locais (ffmpeg/ffprobe/whisper.cpp) + LLM local opcional.

## Camadas

```text
UI (src/features/*)            painéis: mídia, monitor, timeline, transcrição, chat, jobs
Store (src/core/store)         projeto, seleção, playhead, histórico, jobs, mensagens
Command bus (src/core/contracts/commands.ts + timelineReducer.ts)
  - conjunto fechado de comandos, transações atômicas, undo/redo
IA (src/features/assistant)    planner determinístico + provider LLM local → plano Zod → executor → transação
Jobs (src/core/jobs)           fila com progresso, cancelamento e concorrência limitada
Runtime (src/core/runtime)     RuntimeAdapter: BrowserDemoRuntime (simulado) | TauriRuntime (real)
Host (src-tauri)               comandos IPC allowlisted, diagnósticos, diretórios de dados
```

## Regras invariantes

- Todos os tempos são inteiros em **microssegundos**.
- A timeline é **não destrutiva**: mídia original nunca é modificada; clips só
  referenciam `assetId` + `sourceInUs/sourceOutUs`.
- A IA **nunca** muta o projeto: ela emite um `AiPlan` validado por Zod, que o
  executor compila em comandos. Falha em qualquer comando → rollback total.
- Planos com impacto destrutivo exigem confirmação explícita.
- O navegador é **demo simulado**: sem FFmpeg, sem whisper, sem escrita em disco.

## Fluxo de um pedido de IA

1. Usuário descreve a edição no chat, com escopo (sequência / seleção / range).
2. `contextBuilder` monta um contexto determinístico e limitado (sem caminhos
   de arquivo) para o provider.
3. Provider (determinístico ou LLM local) devolve JSON estrito no schema
   **AiEditPlan v1** (`version: 1`); planos pré-v1 passam por um adapter que
   só tolera a ausência do campo `version` — nada mais.
4. `planExecutor` verifica IDs, ranges, duração, assets e capabilities.
5. Prévia opcional: `planPreview` dobra o reducer puro sobre uma cópia do
   projeto — nada é aplicado. "Ajustar" reedita as operações e revalida tudo.
6. Plano compila em `Transaction`; usuário aplica ou descarta; eventos tipados
   (`trainingEvents`) são registrados localmente quando o aprendizado está ativo.

## Fronteira de segurança

- **O browser NÃO é fronteira de segurança.** Registry, Zod e TypeScript no
  WebView são conveniência/UX: qualquer coisa ali pode ser adulterada.
- **A fronteira real no desktop é o Rust** (`src-tauri/src/ai_ops.rs`):
  enum allowlisted com `deny_unknown_fields`, argumentos tipados, IDs/ranges
  com limites, teto de 500 operações por transação e nenhum caminho de arquivo
  em operações de timeline. O comando IPC `validate_ai_transaction` é chamado
  antes de qualquer aplicação no modo Tauri.
- O host **não linka plugin de shell** e nunca executa strings livres.
- Status honesto: a *validação* nativa está implementada e testada
  (`cargo test`); o *executor* nativo (aplicar comandos num store Rust)
  continua contrato — no desktop os comandos validados são aplicados pelo
  mesmo reducer TypeScript da demo.
