# Roadmap — L30 CUT AI

## Concluído (entrega atual: editor familiar + fundação de treinamento)

- [x] 1. Domínio/reducer: playbackRate retrocompatível, trim de borda correto (startUs+sourceInUs),
      ripple trim, rolling, rate stretch, slip, slide, marcador, lock de trilha, keyframes de ganho tipados
- [x] 2. Registro único de comandos + engine de atalhos + preset "Premiere Pro — Windows" + editor de atalhos (Ctrl+Alt+K)
- [x] 3. Motor de interação da timeline: pointer events, drag/trim/razor/marquee/scrub/snap/ghost/Escape,
      1 gesto = 1 transação; toolbar com ícones SVG próprios; menu de contexto real
- [x] 4. Modos Essencial/Pro, painéis redimensionáveis, barra de status, paleta de comandos (Ctrl+Shift+P)
- [x] 5. Fundação de treinamento: schema v1 estrito versionado + adapter, catálogo de ferramentas,
      ContextBuilder compacto, TrainingEvent local, dataset bootstrap com splits, suíte de regressão
- [x] 6. Assistente: cartão de plano humano-primeiro, Pré-visualizar (diff sem mutação), Ajustar, Descartar
- [x] 7. Testes novos (atalhos, reducer, geometria/gestos, schema v1, treinamento) + typecheck + lint + build

## Review final (aplicado integralmente)

- [x] R1. TimelineRuler: coleção única e determinística de ticks (sem arrays fragmentados)
- [x] R2. Nenhum controle decorativo no header/toolbar (não existe "Transitions"; auditar todos os botões)
- [x] R3. Dialogs (Atalhos/Confirmar/Export) com altura/scroll corretos em telas menores
- [x] R4. CommandPalette: composição de Dialog válida + abrir/pesquisar/executar/fechar por teclado
- [x] R5. A11y: remover role="slider" indevido da régua; rótulos de Track Select = selecionar, não mover
- [x] R6. Fronteira de segurança nativa: validação Rust allowlisted p/ operações de IA; remover plugin de shell;
      deixar explícito o que ainda é contrato
- [x] R7. Mute de trilha real (comando setTrackMute) — nenhum ícone sem comportamento
- [x] R8. Executar npm run types / test -- --run / lint -- --quiet / build e corrigir falhas

## Pronto (entregas anteriores)

- Fundação completa: domínio µs, command bus transacional, planner determinístico, runtimes demo/Tauri,
  jobs, setup, download, treinamento inicial, CI/release, scaffolding Tauri

## Backlog (próximas melhorias)

- [x] Clips A/V vinculados (link/unlink) com sincronismo em mover, cortar, aparar e apagar
- [x] Automação de ganho com interpolação linear aplicada ao volume da reprodução demo

- [x] Waveforms reais nos clips de áudio (Web Audio no browser; ffmpeg no Tauri segue contrato)
- [ ] Persistência de atalhos e perfis via Tauri (arquivo em %APPDATA%)
- [ ] Instalador Windows: validar build-windows.bat em máquina real / release CI
