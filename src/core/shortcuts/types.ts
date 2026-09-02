import { z } from "zod";

/**
 * Shortcut architecture — single typed registry, no scattered listeners.
 *
 * A combo is stored canonically as "Ctrl+Alt+Shift+<event.code>", e.g.
 * "Ctrl+Shift+KeyK". Matching uses event.code (layout independent) and
 * normalizes Meta to Ctrl so the Windows preset also works on macOS demo.
 */

export type PanelContext = "global" | "timeline" | "monitor" | "media" | "transcript" | "chat";

export type CommandCategory =
  | "Ferramentas"
  | "Reprodução"
  | "Marcação"
  | "Edição"
  | "Seleção"
  | "Navegação"
  | "Visualização"
  | "Arquivo"
  | "Aplicação";

export interface KeyCombo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  code: string;
}

/** Canonical serialized combo, e.g. "Ctrl+Shift+KeyK". */
export type ComboString = string;

/** commandId → combos. */
export type BindingMap = Record<string, ComboString[]>;

export const ShortcutOverridesSchema = z
  .object({
    version: z.literal(1),
    preset: z.string().default("premiere-windows"),
    bindings: z.record(z.string(), z.array(z.string().min(1)).max(4)),
  })
  .strict();
export type ShortcutOverrides = z.infer<typeof ShortcutOverridesSchema>;

export const EMPTY_OVERRIDES: ShortcutOverrides = {
  version: 1,
  preset: "premiere-windows",
  bindings: {},
};

/** Minimal structural shape the engine needs — avoids registry coupling. */
export interface CommandLike {
  id: string;
  contexts: readonly PanelContext[];
  /** Allowed while typing in inputs/textarea/contenteditable (e.g. Escape). */
  allowInEditable?: boolean;
}

export interface ConflictInfo {
  combo: ComboString;
  commandIds: string[];
}
