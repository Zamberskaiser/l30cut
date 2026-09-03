import type { EditCommand } from "@/core/contracts/commands";
import {
  clipEnd,
  clipDuration,
  SECOND,
  sequenceDuration,
  type Project,
  type Sequence,
} from "@/core/contracts/domain";
import type { CommandCategory, PanelContext } from "@/core/shortcuts/types";
import type { ToolId } from "./tools";

/**
 * Single typed command registry. Every keyboard shortcut, toolbar button,
 * context-menu entry and palette row resolves to one of these commands —
 * there are no ad-hoc listeners anywhere else in the app.
 */
export interface EditorCommand {
  id: string;
  label: string;
  description: string;
  category: CommandCategory;
  contexts: readonly PanelContext[];
  /** Escape and similar are allowed while typing. */
  allowInEditable?: boolean;
  /** Safe to fire on key auto-repeat (scrub/nudge). */
  repeatable?: boolean;
  canExecute: (ctx: CommandContext) => boolean;
  execute: (ctx: CommandContext) => void;
}

export interface CommandContext {
  project: Project;
  sequence: Sequence;
  selection: string[];
  playheadUs: number;
  inOutUs: [number, number] | null;
  tool: ToolId;
  snap: boolean;
  playing: boolean;
  playRate: number;
  mode: "essential" | "pro";
  run: (commands: EditCommand[], label: string) => unknown;
  undo: () => void;
  redo: () => void;
  save: () => void;
  setSelection: (ids: string[]) => void;
  setPlayhead: (us: number | ((prev: number) => number)) => void;
  setInOut: (range: [number, number] | null) => void;
  setTool: (tool: ToolId) => void;
  setSnap: (snap: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setPlayRate: (rate: number) => void;
  setPxPerSecond: (next: number | ((prev: number) => number)) => void;
  setMode: (mode: "essential" | "pro") => void;
  openShortcuts: () => void;
  openPalette: () => void;
  /** Opens the advanced trim window. */
  openTrim: () => void;
  requestImport: () => void;
  requestExport: () => void;
  /** Cancels the running timeline gesture, if any. Returns true when it did. */
  cancelGesture: () => boolean;
  newId: (prefix: string) => string;
}

const frameUs = (seq: Sequence) => Math.max(1, Math.round((SECOND * seq.fpsDen) / seq.fpsNum));

const unlockedTracks = (seq: Sequence) =>
  seq.tracks.filter((t) => !t.locked && t.kind !== "caption");

function targetClip(ctx: CommandContext) {
  const selected = ctx.sequence.clips.find((c) => ctx.selection.includes(c.id));
  if (selected) return selected;
  return ctx.sequence.clips.find((c) => ctx.playheadUs >= c.startUs && ctx.playheadUs < clipEnd(c));
}

function clipsUnderPlayhead(ctx: CommandContext, onlyUnlocked: boolean) {
  const trackIds = new Set(unlockedTracks(ctx.sequence).map((t) => t.id));
  return ctx.sequence.clips.filter(
    (c) =>
      ctx.playheadUs > c.startUs &&
      ctx.playheadUs < clipEnd(c) &&
      (!onlyUnlocked || trackIds.has(c.trackId)),
  );
}

const tool = (id: string, toolId: ToolId, label: string, description: string): EditorCommand => ({
  id,
  label,
  description,
  category: "Ferramentas",
  contexts: ["global"],
  canExecute: () => true,
  execute: (ctx) => ctx.setTool(toolId),
});

const always = () => true;
const hasSelection = (ctx: CommandContext) => ctx.selection.length > 0;

export function buildEditorCommands(): EditorCommand[] {
  return [
    /* ---------- Effects ---------- */
    {
      id: "edit.openTrim",
      label: "Aparar (trim avançado)",
      description: "Abre a janela de trim quadro a quadro com ripple e rolling",
      category: "Edição",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => ctx.openTrim(),
    },
    {
      id: "effects.fadeIn",
      label: "Fade de entrada",
      description: "Aplica meio segundo de fade na entrada dos clips selecionados",
      category: "Edição",
      contexts: ["global"],
      canExecute: hasSelection,
      execute: (ctx) => {
        const clips = ctx.sequence.clips.filter((c) => ctx.selection.includes(c.id));
        const cmds = clips
          .filter((c) => clipDuration(c) >= SECOND)
          .map((c) => ({
            type: "setClipTransition" as const,
            clipId: c.id,
            edge: "in" as const,
            transition: { kind: "fade" as const, durationUs: 500_000 },
          }));
        if (cmds.length) ctx.run(cmds, "Fade de entrada");
      },
    },
    {
      id: "effects.fadeOut",
      label: "Fade de saída",
      description: "Aplica meio segundo de fade na saída dos clips selecionados",
      category: "Edição",
      contexts: ["global"],
      canExecute: hasSelection,
      execute: (ctx) => {
        const clips = ctx.sequence.clips.filter((c) => ctx.selection.includes(c.id));
        const cmds = clips
          .filter((c) => clipDuration(c) >= SECOND)
          .map((c) => ({
            type: "setClipTransition" as const,
            clipId: c.id,
            edge: "out" as const,
            transition: { kind: "fade" as const, durationUs: 500_000 },
          }));
        if (cmds.length) ctx.run(cmds, "Fade de saída");
      },
    },
    {
      id: "effects.chromaToggle",
      label: "Chroma key (fundo verde)",
      description: "Liga ou desliga o recorte de fundo verde no clip selecionado",
      category: "Edição",
      contexts: ["global"],
      canExecute: hasSelection,
      execute: (ctx) => {
        const clip = ctx.sequence.clips.find((c) => ctx.selection.includes(c.id));
        if (!clip) return;
        ctx.run(
          [
            {
              type: "setClipChromaKey",
              clipId: clip.id,
              chroma: clip.chroma
                ? null
                : {
                    enabled: true,
                    colorHex: "#00b140",
                    similarity: 0.35,
                    smoothness: 0.08,
                    spill: 0.1,
                  },
            },
          ],
          clip.chroma ? "Remover chroma key" : "Chroma key",
        );
      },
    },

    /* ---------- Tools ---------- */
    tool("tool.selection", "selection", "Seleção", "Selecionar, mover e aparar clips"),
    {
      id: "tool.trackSelectForward",
      label: "Selecionar trilha para frente",
      description: "Ferramenta que seleciona todos os clips à frente",
      category: "Ferramentas",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => ctx.setTool("trackSelect"),
    },
    {
      id: "tool.trackSelectBackward",
      label: "Selecionar trilha para trás",
      description: "Seleciona os clips anteriores ao playhead nas trilhas desbloqueadas",
      category: "Seleção",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => {
        const ids = ctx.sequence.clips
          .filter(
            (c) =>
              clipEnd(c) <= ctx.playheadUs &&
              unlockedTracks(ctx.sequence).some((t) => t.id === c.trackId),
          )
          .map((c) => c.id);
        ctx.setSelection(ids);
      },
    },
    tool("tool.rippleEdit", "rippleEdit", "Ripple Edit", "Apara fechando ou abrindo espaço"),
    tool("tool.rollingEdit", "rollingEdit", "Rolling Edit", "Move a fronteira entre dois clips"),
    tool("tool.rateStretch", "rateStretch", "Rate Stretch", "Muda a duração pela velocidade"),
    tool("tool.razor", "razor", "Razor", "Corta o clip no ponto clicado"),
    tool("tool.slip", "slip", "Slip", "Desloca o conteúdo mantendo posição"),
    tool("tool.slide", "slide", "Slide", "Move o clip ajustando os vizinhos"),
    tool("tool.pen", "pen", "Pen", "Keyframes de ganho no áudio"),
    tool("tool.hand", "hand", "Hand", "Pan da timeline sem editar"),
    tool("tool.zoom", "zoom", "Zoom", "Clique aproxima, Alt+clique afasta"),
    {
      id: "tool.text",
      label: "Texto / legenda",
      description: "Adiciona uma legenda no playhead",
      category: "Ferramentas",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => {
        ctx.setTool("text");
        ctx.run(
          [
            {
              type: "addCaption",
              segment: {
                id: ctx.newId("cap"),
                startUs: Math.round(ctx.playheadUs),
                endUs: Math.round(ctx.playheadUs) + 2 * SECOND,
                text: "Nova legenda",
              },
            },
          ],
          "Adicionar legenda",
        );
      },
    },

    /* ---------- Playback ---------- */
    {
      id: "playback.toggle",
      label: "Reproduzir / pausar",
      description: "Alterna a reprodução no monitor",
      category: "Reprodução",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => {
        ctx.setPlayRate(1);
        ctx.setPlaying(!ctx.playing);
      },
    },
    {
      id: "playback.reverse",
      label: "Reproduzir de trás para frente (J)",
      description: "Cada toque aumenta a velocidade reversa",
      category: "Reprodução",
      contexts: ["global"],
      repeatable: true,
      canExecute: always,
      execute: (ctx) => {
        const next = ctx.playing && ctx.playRate < 0 ? Math.max(-8, ctx.playRate * 2) : -1;
        ctx.setPlayRate(next);
        ctx.setPlaying(true);
      },
    },
    {
      id: "playback.stop",
      label: "Pausar (K)",
      description: "Para a reprodução",
      category: "Reprodução",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => {
        ctx.setPlaying(false);
        ctx.setPlayRate(1);
      },
    },
    {
      id: "playback.forward",
      label: "Reproduzir para frente (L)",
      description: "Cada toque aumenta a velocidade",
      category: "Reprodução",
      contexts: ["global"],
      repeatable: true,
      canExecute: always,
      execute: (ctx) => {
        const next = ctx.playing && ctx.playRate > 0 ? Math.min(8, ctx.playRate * 2) : 1;
        ctx.setPlayRate(next);
        ctx.setPlaying(true);
      },
    },

    /* ---------- Marks ---------- */
    {
      id: "marks.in",
      label: "Marcar entrada",
      description: "Define o ponto de entrada no playhead",
      category: "Marcação",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => {
        const at = Math.round(ctx.playheadUs);
        const out = ctx.inOutUs?.[1];
        ctx.setInOut([at, out !== undefined && out > at ? out : at + SECOND]);
      },
    },
    {
      id: "marks.out",
      label: "Marcar saída",
      description: "Define o ponto de saída no playhead",
      category: "Marcação",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => {
        const at = Math.round(ctx.playheadUs);
        const inn = ctx.inOutUs?.[0] ?? 0;
        ctx.setInOut([Math.min(inn, Math.max(0, at - 1)), at]);
      },
    },
    {
      id: "marks.gotoIn",
      label: "Ir para a entrada",
      description: "Move o playhead para o ponto de entrada",
      category: "Marcação",
      contexts: ["global"],
      canExecute: (ctx) => ctx.inOutUs !== null,
      execute: (ctx) => ctx.inOutUs && ctx.setPlayhead(ctx.inOutUs[0]),
    },
    {
      id: "marks.gotoOut",
      label: "Ir para a saída",
      description: "Move o playhead para o ponto de saída",
      category: "Marcação",
      contexts: ["global"],
      canExecute: (ctx) => ctx.inOutUs !== null,
      execute: (ctx) => ctx.inOutUs && ctx.setPlayhead(ctx.inOutUs[1]),
    },
    {
      id: "marks.clear",
      label: "Limpar entrada e saída",
      description: "Remove os pontos de entrada e saída",
      category: "Marcação",
      contexts: ["global"],
      canExecute: (ctx) => ctx.inOutUs !== null,
      execute: (ctx) => ctx.setInOut(null),
    },
    {
      id: "marks.addMarker",
      label: "Adicionar marcador",
      description: "Cria um marcador no playhead",
      category: "Marcação",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) =>
        ctx.run(
          [
            {
              type: "addMarker",
              marker: {
                id: ctx.newId("mk"),
                atUs: Math.round(ctx.playheadUs),
                label: "Marcador",
                color: "accent",
              },
            },
          ],
          "Adicionar marcador",
        ),
    },

    /* ---------- Edits ---------- */
    {
      id: "edit.addEdit",
      label: "Adicionar corte no playhead",
      description: "Corta os clips selecionados (ou sob o playhead) na posição atual",
      category: "Edição",
      contexts: ["global"],
      canExecute: (ctx) => clipsUnderPlayhead(ctx, true).length > 0,
      execute: (ctx) => {
        const under = clipsUnderPlayhead(ctx, true);
        const chosen = ctx.selection.length
          ? under.filter((c) => ctx.selection.includes(c.id))
          : under.slice(0, 1);
        const list = chosen.length ? chosen : under.slice(0, 1);
        ctx.run(
          list.map((c) => ({
            type: "splitClip" as const,
            clipId: c.id,
            atUs: Math.round(ctx.playheadUs),
          })),
          "Adicionar corte",
        );
      },
    },
    {
      id: "edit.addEditAllTracks",
      label: "Adicionar corte em todas as trilhas",
      description: "Corta todas as trilhas desbloqueadas no playhead",
      category: "Edição",
      contexts: ["global"],
      canExecute: (ctx) => clipsUnderPlayhead(ctx, true).length > 0,
      execute: (ctx) =>
        ctx.run(
          clipsUnderPlayhead(ctx, true).map((c) => ({
            type: "splitClip" as const,
            clipId: c.id,
            atUs: Math.round(ctx.playheadUs),
          })),
          "Corte em todas as trilhas",
        ),
    },
    {
      id: "edit.delete",
      label: "Remover deixando lacuna",
      description: "Remove os clips selecionados mantendo o espaço",
      category: "Edição",
      contexts: ["global"],
      canExecute: hasSelection,
      execute: (ctx) => {
        ctx.run(
          ctx.selection.map((id) => ({ type: "deleteClip" as const, clipId: id })),
          "Remover clips",
        );
        ctx.setSelection([]);
      },
    },
    {
      id: "edit.rippleDelete",
      label: "Ripple delete",
      description: "Remove e fecha o espaço deixado",
      category: "Edição",
      contexts: ["global"],
      canExecute: hasSelection,
      execute: (ctx) => {
        ctx.run(
          ctx.selection.map((id) => ({ type: "rippleDelete" as const, clipId: id })),
          "Ripple delete",
        );
        ctx.setSelection([]);
      },
    },
    {
      id: "edit.duplicate",
      label: "Duplicar clip",
      description: "Duplica o clip selecionado após o original",
      category: "Edição",
      contexts: ["global"],
      canExecute: hasSelection,
      execute: (ctx) => {
        const clip = ctx.sequence.clips.find((c) => c.id === ctx.selection[0]);
        if (clip) ctx.run([{ type: "duplicateClip", clipId: clip.id }], "Duplicar clip");
      },
    },
    {
      id: "edit.undo",
      label: "Desfazer",
      description: "Desfaz a última transação",
      category: "Edição",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => ctx.undo(),
    },
    {
      id: "edit.redo",
      label: "Refazer",
      description: "Refaz a transação desfeita",
      category: "Edição",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => ctx.redo(),
    },
    {
      id: "audio.gain",
      label: "Ganho de áudio",
      description: "Alterna o ganho do clip entre 0 dB e -6 dB",
      category: "Edição",
      contexts: ["global"],
      canExecute: (ctx) => Boolean(targetClip(ctx)),
      execute: (ctx) => {
        const clip = targetClip(ctx);
        if (!clip) return;
        ctx.run(
          [{ type: "changeGain", clipId: clip.id, gainDb: clip.gainDb === 0 ? -6 : 0 }],
          "Ajustar ganho",
        );
      },
    },
    {
      id: "clip.link",
      label: "Vincular clips (A/V)",
      description: "Vincula os clips selecionados para mover, cortar e apagar juntos",
      category: "Edição",
      contexts: ["global"],
      canExecute: (ctx) => ctx.selection.length >= 2,
      execute: (ctx) => {
        const ids = ctx.sequence.clips.filter((c) => ctx.selection.includes(c.id)).map((c) => c.id);
        if (ids.length < 2) return;
        ctx.run([{ type: "linkClips", clipIds: ids.slice(0, 12) }], "Vincular clips");
      },
    },
    {
      id: "clip.unlink",
      label: "Desvincular clips",
      description: "Remove o vínculo A/V do clip selecionado",
      category: "Edição",
      contexts: ["global"],
      canExecute: (ctx) => {
        const clip = targetClip(ctx);
        return Boolean(clip?.linkGroupId);
      },
      execute: (ctx) => {
        const clip = targetClip(ctx);
        if (!clip?.linkGroupId) return;
        ctx.run([{ type: "unlinkClips", clipId: clip.id }], "Desvincular clips");
      },
    },
    {
      id: "clip.speed",
      label: "Velocidade / duração",
      description: "Aplica rate stretch de 10% mais lento no clip",
      category: "Edição",
      contexts: ["global"],
      canExecute: (ctx) => Boolean(targetClip(ctx)),
      execute: (ctx) => {
        const clip = targetClip(ctx);
        if (!clip) return;
        ctx.run(
          [
            {
              type: "rateStretchClip",
              clipId: clip.id,
              newDurationUs: Math.round(clipDuration(clip) * 1.1),
            },
          ],
          "Velocidade do clip",
        );
      },
    },

    /* ---------- Selection ---------- */
    {
      id: "select.all",
      label: "Selecionar todos os clips",
      description: "Seleciona os clips das trilhas desbloqueadas",
      category: "Seleção",
      contexts: ["global"],
      canExecute: (ctx) => ctx.sequence.clips.length > 0,
      execute: (ctx) => {
        const ids = new Set(unlockedTracks(ctx.sequence).map((t) => t.id));
        ctx.setSelection(ctx.sequence.clips.filter((c) => ids.has(c.trackId)).map((c) => c.id));
      },
    },
    {
      id: "select.none",
      label: "Desmarcar tudo",
      description: "Limpa a seleção",
      category: "Seleção",
      contexts: ["global"],
      canExecute: hasSelection,
      execute: (ctx) => ctx.setSelection([]),
    },

    /* ---------- File ---------- */
    {
      id: "file.save",
      label: "Salvar projeto",
      description: "Grava o projeto no runtime atual",
      category: "Arquivo",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => ctx.save(),
    },
    {
      id: "file.import",
      label: "Importar mídia",
      description: "Abre o seletor de mídia",
      category: "Arquivo",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => ctx.requestImport(),
    },
    {
      id: "file.export",
      label: "Exportar",
      description: "Abre o diálogo de exportação",
      category: "Arquivo",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => ctx.requestExport(),
    },

    /* ---------- View ---------- */
    {
      id: "timeline.toggleSnap",
      label: "Snap",
      description: "Liga/desliga o encaixe magnético",
      category: "Visualização",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => ctx.setSnap(!ctx.snap),
    },
    {
      id: "view.zoomIn",
      label: "Zoom in",
      description: "Aproxima a timeline",
      category: "Visualização",
      contexts: ["global"],
      repeatable: true,
      canExecute: always,
      execute: (ctx) => ctx.setPxPerSecond((prev) => prev * 1.3),
    },
    {
      id: "view.zoomOut",
      label: "Zoom out",
      description: "Afasta a timeline",
      category: "Visualização",
      contexts: ["global"],
      repeatable: true,
      canExecute: always,
      execute: (ctx) => ctx.setPxPerSecond((prev) => prev / 1.3),
    },
    {
      id: "view.toggleMode",
      label: "Alternar modo Essencial/Pro",
      description: "Progressive disclosure da interface",
      category: "Visualização",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => ctx.setMode(ctx.mode === "essential" ? "pro" : "essential"),
    },

    /* ---------- Navigation ---------- */
    {
      id: "nav.home",
      label: "Ir para o início",
      description: "Playhead em 00:00",
      category: "Navegação",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => ctx.setPlayhead(0),
    },
    {
      id: "nav.end",
      label: "Ir para o fim",
      description: "Playhead no fim da sequência",
      category: "Navegação",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => ctx.setPlayhead(sequenceDuration(ctx.sequence)),
    },
    {
      id: "nav.frameBack",
      label: "Um frame para trás",
      description: "Scrub de um frame",
      category: "Navegação",
      contexts: ["global"],
      repeatable: true,
      canExecute: always,
      execute: (ctx) => ctx.setPlayhead((prev) => Math.max(0, prev - frameUs(ctx.sequence))),
    },
    {
      id: "nav.frameForward",
      label: "Um frame para frente",
      description: "Scrub de um frame",
      category: "Navegação",
      contexts: ["global"],
      repeatable: true,
      canExecute: always,
      execute: (ctx) => ctx.setPlayhead((prev) => prev + frameUs(ctx.sequence)),
    },
    {
      id: "nav.fiveBack",
      label: "Cinco frames para trás",
      description: "Scrub de cinco frames",
      category: "Navegação",
      contexts: ["global"],
      repeatable: true,
      canExecute: always,
      execute: (ctx) => ctx.setPlayhead((prev) => Math.max(0, prev - 5 * frameUs(ctx.sequence))),
    },
    {
      id: "nav.fiveForward",
      label: "Cinco frames para frente",
      description: "Scrub de cinco frames",
      category: "Navegação",
      contexts: ["global"],
      repeatable: true,
      canExecute: always,
      execute: (ctx) => ctx.setPlayhead((prev) => prev + 5 * frameUs(ctx.sequence)),
    },
    nudge("nav.nudgeLeft", "Mover seleção 1 frame para trás", -1),
    nudge("nav.nudgeRight", "Mover seleção 1 frame para frente", 1),
    nudge("nav.nudgeLeft5", "Mover seleção 5 frames para trás", -5),
    nudge("nav.nudgeRight5", "Mover seleção 5 frames para frente", 5),
    {
      id: "nav.prevEdit",
      label: "Edição anterior",
      description: "Playhead no corte anterior",
      category: "Navegação",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => {
        const points = editPoints(ctx.sequence).filter((p) => p < ctx.playheadUs - 1);
        ctx.setPlayhead(points.length ? Math.max(...points) : 0);
      },
    },
    {
      id: "nav.nextEdit",
      label: "Próxima edição",
      description: "Playhead no próximo corte",
      category: "Navegação",
      contexts: ["global"],
      canExecute: always,
      execute: (ctx) => {
        const points = editPoints(ctx.sequence).filter((p) => p > ctx.playheadUs + 1);
        ctx.setPlayhead(points.length ? Math.min(...points) : sequenceDuration(ctx.sequence));
      },
    },

    /* ---------- App ---------- */
    {
      id: "app.shortcuts",
      label: "Atalhos de teclado",
      description: "Abre o editor de atalhos",
      category: "Aplicação",
      contexts: ["global"],
      allowInEditable: true,
      canExecute: always,
      execute: (ctx) => ctx.openShortcuts(),
    },
    {
      id: "app.palette",
      label: "Comando rápido",
      description: "Busca por qualquer comando do editor",
      category: "Aplicação",
      contexts: ["global"],
      allowInEditable: true,
      canExecute: always,
      execute: (ctx) => ctx.openPalette(),
    },
    {
      id: "app.cancel",
      label: "Cancelar",
      description: "Cancela o gesto atual e volta para a ferramenta Seleção",
      category: "Aplicação",
      contexts: ["global"],
      allowInEditable: true,
      canExecute: always,
      execute: (ctx) => {
        if (ctx.cancelGesture()) return;
        if (ctx.tool !== "selection") {
          ctx.setTool("selection");
          return;
        }
        ctx.setSelection([]);
      },
    },
  ];
}

function nudge(id: string, label: string, frames: number): EditorCommand {
  return {
    id,
    label,
    description: "Move os clips selecionados na timeline",
    category: "Edição",
    contexts: ["global"],
    repeatable: true,
    canExecute: hasSelection,
    execute: (ctx) => {
      const delta = frames * frameUs(ctx.sequence);
      const clips = ctx.sequence.clips.filter((c) => ctx.selection.includes(c.id));
      if (!clips.length) return;
      if (clips.some((c) => c.startUs + delta < 0)) return;
      ctx.run(
        clips.map((c) => ({
          type: "moveClip" as const,
          clipId: c.id,
          toStartUs: c.startUs + delta,
        })),
        label,
      );
    },
  };
}

function editPoints(seq: Sequence): number[] {
  const set = new Set<number>([0]);
  for (const clip of seq.clips) {
    set.add(clip.startUs);
    set.add(clipEnd(clip));
  }
  return [...set].sort((a, b) => a - b);
}

export const EDITOR_COMMANDS = buildEditorCommands();

export const commandById = (id: string): EditorCommand | undefined =>
  EDITOR_COMMANDS.find((c) => c.id === id);
