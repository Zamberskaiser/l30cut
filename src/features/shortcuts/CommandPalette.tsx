import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { EDITOR_COMMANDS } from "@/core/commands/editorCommandRegistry";
import { useCommandContext } from "@/core/commands/useCommandContext";
import { formatCombo } from "@/core/shortcuts/shortcutEngine";
import { useUi } from "@/core/store/uiStore";

export function CommandPalette() {
  const ui = useUi();
  const ctx = useCommandContext();
  const categories = [...new Set(EDITOR_COMMANDS.map((c) => c.category))];

  return (
    <CommandDialog open={ui.paletteOpen} onOpenChange={ui.setPaletteOpen}>
      <CommandInput placeholder="Buscar comando do editor…" />
      <CommandList>
        <CommandEmpty>Nenhum comando encontrado.</CommandEmpty>
        {categories.map((category) => (
          <CommandGroup key={category} heading={category}>
            {EDITOR_COMMANDS.filter((c) => c.category === category).map((command) => {
              const combo = ui.bindings[command.id]?.[0];
              const enabled = command.canExecute(ctx);
              return (
                <CommandItem
                  key={command.id}
                  value={`${command.label} ${command.description} ${command.category}`}
                  disabled={!enabled}
                  onSelect={() => {
                    ui.setPaletteOpen(false);
                    if (!command.canExecute(ctx)) return;
                    command.execute(ctx);
                    ui.setLastCommand(command.label);
                  }}
                >
                  <span className="flex-1 truncate">{command.label}</span>
                  {combo ? (
                    <span className="tabular text-[10px] text-muted-foreground">
                      {formatCombo(combo)}
                    </span>
                  ) : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
