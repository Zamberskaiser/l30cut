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
2. Provider (determinístico ou LLM local) devolve JSON estrito.
3. `AiPlanSchema` valida; campos desconhecidos são rejeitados.
4. `planExecutor` verifica IDs, ranges, duração, assets e capabilities.
5. Plano compila em `Transaction`; usuário aplica ou descarta; feedback é
   registrado no perfil de aprendizado local.
