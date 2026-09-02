import { useEffect, useRef } from "react";
import { EDITOR_COMMANDS, type CommandContext } from "@/core/commands/editorCommandRegistry";
import { useUi } from "@/core/store/uiStore";
import { comboFromEvent, isEditableTarget, resolveCommand } from "./shortcutEngine";

/**
 * Single global keydown listener for the whole editor. It resolves a canonical
 * combo to a registered command, honours panel focus and editable targets, and
 * only calls preventDefault when a command actually executes.
 */
export function useEditorShortcuts(ctx: CommandContext): void {
  const ui = useUi();
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const uiRef = useRef(ui);
  uiRef.current = ui;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const combo = comboFromEvent(event);
      if (!combo) return;
      const editable = isEditableTarget(event.target);
      const current = uiRef.current;
      const commandId = resolveCommand({
        combo,
        focused: current.focused,
        editable,
        commands: EDITOR_COMMANDS,
        bindings: current.bindings,
      });
      if (!commandId) return;
      const command = EDITOR_COMMANDS.find((c) => c.id === commandId);
      if (!command) return;
      if (event.repeat && !command.repeatable) {
        event.preventDefault();
        return;
      }
      const commandCtx = ctxRef.current;
      if (!command.canExecute(commandCtx)) return;
      event.preventDefault();
      command.execute(commandCtx);
      current.setLastCommand(command.label);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
