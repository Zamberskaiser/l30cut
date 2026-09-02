import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EDITOR_COMMANDS } from "@/core/commands/editorCommandRegistry";
import { PRESET_NAME } from "@/core/shortcuts/premiereWindowsPreset";
import {
  comboFromEvent,
  findConflicts,
  formatCombo,
  parseOverrides,
  serializeOverrides,
} from "@/core/shortcuts/shortcutEngine";
import { useUi } from "@/core/store/uiStore";

export function ShortcutsDialog() {
  const ui = useUi();
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState<string | null>(null);
  const [importText, setImportText] = useState("");

  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = EDITOR_COMMANDS.filter((cmd) => {
      if (!term) return true;
      const combos = (ui.bindings[cmd.id] ?? []).map(formatCombo).join(" ").toLowerCase();
      return (
        cmd.label.toLowerCase().includes(term) ||
        cmd.description.toLowerCase().includes(term) ||
        cmd.category.toLowerCase().includes(term) ||
        combos.includes(term)
      );
    });
    const map = new Map<string, typeof filtered>();
    for (const cmd of filtered) map.set(cmd.category, [...(map.get(cmd.category) ?? []), cmd]);
    return [...map.entries()];
  }, [query, ui.bindings]);

  function record(commandId: string, event: React.KeyboardEvent) {
    event.preventDefault();
    const combo = comboFromEvent(event.nativeEvent);
    if (!combo) return;
    if (combo === "Escape") {
      setRecording(null);
      return;
    }
    const conflicts = findConflicts(commandId, combo, EDITOR_COMMANDS, ui.bindings);
    ui.setBinding(commandId, [combo]);
    setRecording(null);
    if (conflicts.length) {
      toast.warning(`Conflito com ${conflicts.length} comando(s)`, {
        description: conflicts
          .map((id) => EDITOR_COMMANDS.find((c) => c.id === id)?.label ?? id)
          .join(", "),
      });
    } else {
      toast.success(`Atalho definido: ${formatCombo(combo)}`);
    }
  }

  return (
    <Dialog open={ui.shortcutsOpen} onOpenChange={ui.setShortcutsOpen}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
          <DialogDescription>
            Preset padrão: {PRESET_NAME}. Clique em um atalho e pressione a nova combinação. A
            personalização fica salva neste navegador.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar comando, categoria ou combinação…"
          className="h-8"
        />

        <ScrollArea className="min-h-24 flex-1 rounded-md border border-border">
          <div className="divide-y divide-border">
            {groups.map(([category, commands]) => (
              <div key={category} className="p-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {category}
                </p>
                {commands.map((cmd) => {
                  const combos = ui.bindings[cmd.id] ?? [];
                  const isRecording = recording === cmd.id;
                  return (
                    <div key={cmd.id} className="flex items-center gap-2 py-1">
                      <span className="min-w-0 flex-1 truncate text-xs" title={cmd.description}>
                        {cmd.label}
                      </span>
                      {combos.slice(1).map((combo) => (
                        <Badge key={combo} variant="outline" className="text-[10px]">
                          {formatCombo(combo)}
                        </Badge>
                      ))}
                      <button
                        type="button"
                        onKeyDown={(e) => (isRecording ? record(cmd.id, e) : undefined)}
                        onClick={() => setRecording(isRecording ? null : cmd.id)}
                        className={`tabular w-32 rounded-sm border px-2 py-1 text-[11px] ${
                          isRecording
                            ? "border-primary bg-primary/15 text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {isRecording ? "Pressione…" : combos[0] ? formatCombo(combos[0]) : "—"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
            {groups.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Nenhum comando encontrado.
              </p>
            ) : null}
          </div>
        </ScrollArea>

        <div className="space-y-2">
          <Input
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='Colar JSON: {"version":1,"preset":"premiere-windows","bindings":{}}'
            className="h-8 font-mono text-[11px]"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const result = parseOverrides(importText);
                if (!result.ok) {
                  toast.error("JSON inválido", { description: result.error });
                  return;
                }
                ui.importOverrides(result.overrides);
                toast.success("Atalhos importados");
              }}
            >
              Importar JSON
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const json = serializeOverrides(ui.overrides);
                void navigator.clipboard?.writeText(json).catch(() => undefined);
                setImportText(json);
                toast.success("JSON copiado para a área de transferência");
              }}
            >
              Exportar JSON
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                ui.resetBindings();
                toast.success(`Preset restaurado: ${PRESET_NAME}`);
              }}
            >
              Restaurar preset
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button size="sm" onClick={() => ui.setShortcutsOpen(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
