import { Magnet, ZoomIn, ZoomOut } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TOOLS, type ToolId } from "@/core/commands/tools";
import { formatCombo } from "@/core/shortcuts/shortcutEngine";
import { useUi } from "@/core/store/uiStore";
import { TOOL_ICONS } from "./icons";

export function TimelineToolbar() {
  const ui = useUi();
  const tools = TOOLS.filter((t) => ui.mode === "pro" || t.essential);

  function comboFor(commandId: string): string {
    const combo = ui.bindings[commandId]?.[0];
    return combo ? formatCombo(combo) : "—";
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
        <h2 className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Timeline
        </h2>
        <div className="flex items-center gap-0.5" role="toolbar" aria-label="Ferramentas">
          {tools.map((tool) => {
            const Icon = TOOL_ICONS[tool.id as ToolId];
            const active = ui.tool === tool.id;
            return (
              <Tooltip key={tool.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={`${tool.label} (${comboFor(tool.commandId)})`}
                    onClick={() => {
                      ui.setTool(tool.id);
                      ui.setLastCommand(tool.label);
                    }}
                    className={`grid size-7 place-items-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? "border-primary/60 bg-primary/20 text-foreground"
                        : "border-transparent text-muted-foreground hover:border-border-strong hover:bg-chrome hover:text-foreground"
                    }`}
                  >
                    <Icon />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <span className="font-medium">{tool.label}</span>{" "}
                  <span className="text-muted-foreground">{comboFor(tool.commandId)}</span>
                  <p className="text-[10px] text-muted-foreground">{tool.description}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              pressed={ui.snap}
              onPressedChange={(v) => {
                ui.setSnap(v);
                ui.setLastCommand(v ? "Snap ligado" : "Snap desligado");
              }}
              aria-label="Snap"
              className="ml-1 h-7 gap-1 px-2 text-[11px]"
            >
              <Magnet className="size-3.5" /> Snap
            </Toggle>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Snap magnético {comboFor("timeline.toggleSnap")}
          </TooltipContent>
        </Tooltip>

        <div className="ml-auto flex w-48 items-center gap-2">
          <button
            type="button"
            aria-label="Zoom out"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => ui.setPxPerSecond((p) => p / 1.3)}
          >
            <ZoomOut className="size-3.5" />
          </button>
          <Slider
            value={[ui.pxPerSecond]}
            min={4}
            max={200}
            step={2}
            aria-label="Zoom da timeline"
            onValueChange={([v]) => ui.setPxPerSecond(v ?? 28)}
          />
          <button
            type="button"
            aria-label="Zoom in"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => ui.setPxPerSecond((p) => p * 1.3)}
          >
            <ZoomIn className="size-3.5" />
          </button>
        </div>
      </div>
    </TooltipProvider>
  );
}
