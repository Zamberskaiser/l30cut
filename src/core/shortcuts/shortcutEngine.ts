import {
  ShortcutOverridesSchema,
  type BindingMap,
  type ComboString,
  type CommandLike,
  type ConflictInfo,
  type KeyCombo,
  type PanelContext,
  type ShortcutOverrides,
} from "./types";

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

/** Normalizes a keyboard event to a canonical combo. Meta is treated as Ctrl. */
export function comboFromEvent(event: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): ComboString | null {
  if (!event.code || MODIFIER_CODES.has(event.code)) return null;
  return serializeCombo({
    ctrl: event.ctrlKey || event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey,
    code: event.code,
  });
}

export function serializeCombo(combo: KeyCombo): ComboString {
  const parts: string[] = [];
  if (combo.ctrl) parts.push("Ctrl");
  if (combo.alt) parts.push("Alt");
  if (combo.shift) parts.push("Shift");
  parts.push(combo.code);
  return parts.join("+");
}

export function parseCombo(input: string): KeyCombo | null {
  const tokens = input.split("+").filter(Boolean);
  const code = tokens[tokens.length - 1];
  if (!code) return null;
  const mods = new Set(tokens.slice(0, -1).map((t) => t.toLowerCase()));
  for (const m of mods) {
    if (m !== "ctrl" && m !== "alt" && m !== "shift" && m !== "meta" && m !== "cmd") return null;
  }
  return {
    ctrl: mods.has("ctrl") || mods.has("meta") || mods.has("cmd"),
    alt: mods.has("alt"),
    shift: mods.has("shift"),
    code,
  };
}

/** Canonical form (also upgrades Meta → Ctrl). Returns null for garbage. */
export function normalizeCombo(input: string): ComboString | null {
  const parsed = parseCombo(input);
  return parsed ? serializeCombo(parsed) : null;
}

const CODE_LABELS: Record<string, string> = {
  Space: "Espaço",
  Escape: "Esc",
  Delete: "Delete",
  Backspace: "Backspace",
  Enter: "Enter",
  Home: "Home",
  End: "End",
  PageUp: "PgUp",
  PageDown: "PgDn",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Equal: "=",
  Minus: "-",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backquote: "`",
  Tab: "Tab",
  NumpadAdd: "Num +",
  NumpadSubtract: "Num -",
};

/** Human readable label: "Ctrl+Shift+KeyK" → "Ctrl+Shift+K". */
export function formatCombo(combo: ComboString): string {
  const parsed = parseCombo(combo);
  if (!parsed) return combo;
  const parts: string[] = [];
  if (parsed.ctrl) parts.push("Ctrl");
  if (parsed.alt) parts.push("Alt");
  if (parsed.shift) parts.push("Shift");
  let key = parsed.code;
  if (key.startsWith("Key")) key = key.slice(3);
  else if (key.startsWith("Digit")) key = key.slice(5);
  else if (key.startsWith("Numpad") && /^Numpad\d$/.test(key)) key = `Num ${key.slice(6)}`;
  else key = CODE_LABELS[key] ?? key;
  parts.push(key);
  return parts.join("+");
}

/** True when the event target is an editable surface — edit shortcuts must not fire. */
export const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"], [data-editable="true"]';

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as { closest?: (selector: string) => unknown } | null;
  if (!el || typeof el.closest !== "function") return false;
  return Boolean(el.closest(EDITABLE_SELECTOR));
}

export function contextAllows(contexts: readonly PanelContext[], focused: PanelContext): boolean {
  return contexts.includes("global") || contexts.includes(focused);
}

export function mergeBindings(defaults: BindingMap, overrides: ShortcutOverrides): BindingMap {
  const merged: BindingMap = { ...defaults };
  for (const [id, combos] of Object.entries(overrides.bindings)) {
    const normalized = combos
      .map((c) => normalizeCombo(c))
      .filter((c): c is string => Boolean(c));
    merged[id] = normalized;
  }
  return merged;
}

export interface ResolveInput {
  combo: ComboString;
  focused: PanelContext;
  editable: boolean;
  commands: readonly CommandLike[];
  bindings: BindingMap;
}

/**
 * Resolves a combo to a command id. In editable targets only commands with
 * allowInEditable pass. Context-specific commands win over global ones.
 */
export function resolveCommand(input: ResolveInput): string | null {
  const candidates = input.commands.filter((cmd) => {
    if (input.editable && !cmd.allowInEditable) return false;
    const combos = input.bindings[cmd.id] ?? [];
    if (!combos.includes(input.combo)) return false;
    return contextAllows(cmd.contexts, input.focused);
  });
  if (candidates.length === 0) return null;
  const specific = candidates.find((c) => !c.contexts.includes("global"));
  return (specific ?? candidates[0])!.id;
}

function contextsOverlap(a: readonly PanelContext[], b: readonly PanelContext[]): boolean {
  if (a.includes("global") || b.includes("global")) return true;
  return a.some((ctx) => b.includes(ctx));
}

/** All commands that would clash with `commandId` if it were bound to `combo`. */
export function findConflicts(
  commandId: string,
  combo: ComboString,
  commands: readonly CommandLike[],
  bindings: BindingMap,
): string[] {
  const self = commands.find((c) => c.id === commandId);
  if (!self) return [];
  return commands
    .filter((c) => c.id !== commandId)
    .filter((c) => (bindings[c.id] ?? []).includes(combo))
    .filter((c) => contextsOverlap(c.contexts, self.contexts))
    .map((c) => c.id);
}

/** Full conflict scan of a binding map (used by the shortcuts editor). */
export function scanConflicts(
  commands: readonly CommandLike[],
  bindings: BindingMap,
): ConflictInfo[] {
  const byCombo = new Map<string, string[]>();
  for (const cmd of commands) {
    for (const combo of bindings[cmd.id] ?? []) {
      byCombo.set(combo, [...(byCombo.get(combo) ?? []), cmd.id]);
    }
  }
  const conflicts: ConflictInfo[] = [];
  for (const [combo, ids] of byCombo) {
    if (ids.length < 2) continue;
    const overlapping = ids.filter((id, i) =>
      ids.some((other, j) => {
        if (i === j) return false;
        const a = commands.find((c) => c.id === id);
        const b = commands.find((c) => c.id === other);
        return a && b ? contextsOverlap(a.contexts, b.contexts) : false;
      }),
    );
    if (overlapping.length >= 2) conflicts.push({ combo, commandIds: overlapping });
  }
  return conflicts;
}

export function serializeOverrides(overrides: ShortcutOverrides): string {
  return JSON.stringify(overrides, null, 2);
}

export function parseOverrides(json: string): { ok: true; overrides: ShortcutOverrides } | { ok: false; error: string } {
  try {
    const parsed = ShortcutOverridesSchema.safeParse(JSON.parse(json));
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    return { ok: true, overrides: parsed.data };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
