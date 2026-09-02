# Roadmap — L30 CUT AI

## Em andamento (entrega atual: editor familiar + fundação de treinamento)

- [ ] 1. Domínio/reducer: playbackRate retrocompatível, trim de borda correto (startUs+sourceInUs),
      ripple trim, rolling, rate stretch, slip, slide, marcador, lock de trilha, keyframes de ganho tipados
- [ ] 2. Registro único de comandos + engine de atalhos + preset "Premiere Pro — Windows" + editor de atalhos (Ctrl+Alt+K)
- [ ] 3. Motor de interação da timeline: pointer events, drag/trim/razor/marquee/scrub/snap/ghost/Escape,
      1 gesto = 1 transação; toolbar com ícones SVG próprios; menu de contexto real
- [ ] 4. Modos Essencial/Pro, painéis redimensionáveis, barra de status, paleta de comandos (Ctrl+Shift+P)
- [ ] 5. Fundação de treinamento: schema v1 estrito versionado + adapter, catálogo de ferramentas,
      ContextBuilder compacto, TrainingEvent local, dataset bootstrap com splits, suíte de regressão
- [ ] 6. Assistente: cartão de plano humano-primeiro, Pré-visualizar (ghosts), Ajustar, chips "O que você quer fazer?"
- [ ] 7. Testes novos (atalhos, reducer, geometria/gestos, schema v1, treinamento) + typecheck + lint + build

## Pronto (entregas anteriores)

- Fundação completa: domínio µs, command bus transacional, planner determinístico, runtimes demo/Tauri,
  jobs, setup, download, treinamento inicial, CI/release, scaffolding Tauri

## Backlog (próximas melhorias)

- [ ] Clips A/V vinculados (link/unlink) com sincronismo garantido nos gestos
- [ ] Automação de ganho com curvas (interpolação) aplicada na reprodução demo
- [ ] Waveforms reais nos clips de áudio (Web Audio no demo, ffmpeg no Tauri)
- [ ] Persistência de atalhos e perfis via Tauri (arquivo em %APPDATA%)
- [ ] Instalador Windows: validar build-windows.bat em máquina real / release CI
