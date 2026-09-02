import { formatTimecode } from "@/core/contracts/domain";
import { toolMeta } from "@/core/commands/tools";
import { formatCombo } from "@/core/shortcuts/shortcutEngine";
import { useActiveSequence, useEditor } from "@/core/store/editorStore";
import { useUi } from "@/core/store/uiStore";

export function StatusBar() {
  const editor = useEditor();
  const sequence = useActiveSequence();
  const ui = useUi();
  const combo = ui.bindings["app.palette"]?.[0];

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-chrome px-3 text-[10px] text-muted-foreground">
      <span>
        Ferramenta: <span className="text-foreground">{toolMeta(ui.tool).label}</span>
      </span>
      <span>
        Snap:{" "}
        <span className={ui.snap ? "text-success" : "text-foreground"}>
          {ui.snap ? "ligado" : "desligado"}
        </span>
      </span>
      <span className="tabular">seleção: {editor.selection.length}</span>
      <span className="tabular">{formatTimecode(editor.playheadUs, sequence.fpsNum)}</span>
      {editor.inOutUs ? (
        <span className="tabular">
          in/out {formatTimecode(editor.inOutUs[0]).slice(3, 8)}–
          {formatTimecode(editor.inOutUs[1]).slice(3, 8)}
        </span>
      ) : null}
      <span className="ml-auto truncate">
        {ui.lastCommand ? `Último comando: ${ui.lastCommand}` : null}
      </span>
      <button
        type="button"
        onClick={() => ui.setPaletteOpen(true)}
        className="rounded-sm border border-border px-1.5 py-0.5 hover:text-foreground"
      >
        Comando rápido {combo ? formatCombo(combo) : ""}
      </button>
    </footer>
  );
}
