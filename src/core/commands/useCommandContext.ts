import { useCallback, useMemo, useRef } from "react";
import { activeSequence } from "@/core/contracts/domain";
import { useEditor } from "@/core/store/editorStore";
import { newId } from "@/core/store/timelineReducer";
import { useUi } from "@/core/store/uiStore";
import { emitAppEvent } from "./appEvents";
import type { CommandContext } from "./editorCommandRegistry";

/** Escape hatch used by the timeline gesture engine to register a cancel fn. */
const cancelHandlers = new Set<() => boolean>();

export function registerGestureCancel(handler: () => boolean): () => void {
  cancelHandlers.add(handler);
  return () => cancelHandlers.delete(handler);
}

export function useCommandContext(): CommandContext {
  const editor = useEditor();
  const ui = useUi();
  const latest = useRef<CommandContext | null>(null);

  const cancelGesture = useCallback(() => {
    let handled = false;
    for (const handler of cancelHandlers) if (handler()) handled = true;
    return handled;
  }, []);

  const ctx = useMemo<CommandContext>(
    () => ({
      project: editor.project,
      sequence: activeSequence(editor.project),
      selection: editor.selection,
      playheadUs: editor.playheadUs,
      inOutUs: editor.inOutUs,
      tool: ui.tool,
      snap: ui.snap,
      playing: ui.playing,
      playRate: ui.playRate,
      mode: ui.mode,
      run: editor.run,
      undo: editor.undo,
      redo: editor.redo,
      save: () => void editor.save(),
      setSelection: editor.setSelection,
      setPlayhead: (us) =>
        editor.setPlayhead((prev) => Math.max(0, typeof us === "function" ? us(prev) : us)),
      setInOut: editor.setInOut,
      setTool: ui.setTool,
      setSnap: ui.setSnap,
      setPlaying: ui.setPlaying,
      setPlayRate: ui.setPlayRate,
      setPxPerSecond: ui.setPxPerSecond,
      setMode: ui.setMode,
      openShortcuts: () => ui.setShortcutsOpen(true),
      openPalette: () => ui.setPaletteOpen(true),
      openTrim: () => ui.setTrimOpen(true),
      requestImport: () => emitAppEvent("import"),
      requestExport: () => emitAppEvent("export"),
      cancelGesture,
      newId,
    }),
    [editor, ui, cancelGesture],
  );

  latest.current = ctx;
  return ctx;
}
