import { describe, expect, it } from "vitest";
import { EDITOR_COMMANDS } from "@/core/commands/editorCommandRegistry";
import { PREMIERE_WINDOWS_PRESET } from "./premiereWindowsPreset";
import {
  comboFromEvent,
  findConflicts,
  formatCombo,
  isEditableTarget,
  mergeBindings,
  normalizeCombo,
  parseOverrides,
  resolveCommand,
  scanConflicts,
  serializeOverrides,
} from "./shortcutEngine";
import { EMPTY_OVERRIDES } from "./types";

const evt = (code: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("combo normalization", () => {
  it("serializes using event.code and normalizes Meta to Ctrl", () => {
    expect(comboFromEvent(evt("KeyK", { ctrlKey: true }))).toBe("Ctrl+KeyK");
    expect(comboFromEvent(evt("KeyK", { metaKey: true }))).toBe("Ctrl+KeyK");
    expect(comboFromEvent(evt("KeyZ", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+KeyZ");
    expect(comboFromEvent(evt("ShiftLeft", { shiftKey: true }))).toBeNull();
  });

  it("orders modifiers deterministically", () => {
    expect(normalizeCombo("shift+alt+ctrl+KeyA")).toBe("Ctrl+Alt+Shift+KeyA");
    expect(normalizeCombo("Meta+KeyS")).toBe("Ctrl+KeyS");
    expect(normalizeCombo("Hyper+KeyS")).toBeNull();
  });

  it("formats human readable labels", () => {
    expect(formatCombo("Ctrl+Shift+KeyK")).toBe("Ctrl+Shift+K");
    expect(formatCombo("Alt+ArrowLeft")).toBe("Alt+←");
    expect(formatCombo("Space")).toBe("Espaço");
  });
});

describe("editable targets", () => {
  const stub = (matches: boolean) => ({ closest: () => (matches ? {} : null) }) as unknown as EventTarget;

  it("detects editable surfaces and ignores plain elements", () => {
    expect(isEditableTarget(stub(true))).toBe(true);
    expect(isEditableTarget(stub(false))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({} as EventTarget)).toBe(false);
  });
});

describe("resolution", () => {
  const bindings = mergeBindings(PREMIERE_WINDOWS_PRESET, EMPTY_OVERRIDES);

  it("resolves preset tool combos", () => {
    for (const [combo, id] of [
      ["KeyV", "tool.selection"],
      ["KeyA", "tool.trackSelectForward"],
      ["KeyB", "tool.rippleEdit"],
      ["KeyN", "tool.rollingEdit"],
      ["KeyR", "tool.rateStretch"],
      ["KeyC", "tool.razor"],
      ["KeyY", "tool.slip"],
      ["KeyU", "tool.slide"],
      ["KeyP", "tool.pen"],
      ["KeyH", "tool.hand"],
      ["KeyZ", "tool.zoom"],
      ["Ctrl+KeyK", "edit.addEdit"],
      ["Shift+Delete", "edit.rippleDelete"],
      ["Alt+Backspace", "edit.rippleDelete"],
      ["Ctrl+Alt+KeyK", "app.shortcuts"],
    ] as const) {
      expect(
        resolveCommand({
          combo,
          focused: "timeline",
          editable: false,
          commands: EDITOR_COMMANDS,
          bindings,
        }),
      ).toBe(id);
    }
  });

  it("never fires edit shortcuts while typing, but allows Escape and the palette", () => {
    const typing = { focused: "chat" as const, editable: true, commands: EDITOR_COMMANDS, bindings };
    expect(resolveCommand({ combo: "KeyC", ...typing })).toBeNull();
    expect(resolveCommand({ combo: "Delete", ...typing })).toBeNull();
    expect(resolveCommand({ combo: "Space", ...typing })).toBeNull();
    expect(resolveCommand({ combo: "Escape", ...typing })).toBe("app.cancel");
    expect(resolveCommand({ combo: "Ctrl+Shift+KeyP", ...typing })).toBe("app.palette");
  });

  it("has no conflicts in the shipped preset", () => {
    expect(scanConflicts(EDITOR_COMMANDS, bindings)).toEqual([]);
  });

  it("detects a conflict before saving a new combo", () => {
    expect(findConflicts("tool.razor", "KeyV", EDITOR_COMMANDS, bindings)).toEqual([
      "tool.selection",
    ]);
    expect(findConflicts("tool.razor", "F13", EDITOR_COMMANDS, bindings)).toEqual([]);
  });

  it("applies user overrides and round-trips JSON", () => {
    const overrides = { version: 1 as const, preset: "premiere-windows", bindings: { "tool.razor": ["KeyX"] } };
    const merged = mergeBindings(PREMIERE_WINDOWS_PRESET, overrides);
    expect(
      resolveCommand({ combo: "KeyX", focused: "timeline", editable: false, commands: EDITOR_COMMANDS, bindings: merged }),
    ).toBe("tool.razor");
    expect(
      resolveCommand({ combo: "KeyC", focused: "timeline", editable: false, commands: EDITOR_COMMANDS, bindings: merged }),
    ).toBeNull();

    const parsed = parseOverrides(serializeOverrides(overrides));
    expect(parsed.ok).toBe(true);
    expect(parseOverrides("{oops}").ok).toBe(false);

    // resetting to the preset restores the default combo
    const reset = mergeBindings(PREMIERE_WINDOWS_PRESET, EMPTY_OVERRIDES);
    expect(reset["tool.razor"]).toEqual(["KeyC"]);
  });

  it("registers a binding for every command in the registry", () => {
    const missing = EDITOR_COMMANDS.filter((c) => !(bindings[c.id] ?? []).length).map((c) => c.id);
    expect(missing).toEqual(["edit.duplicate", "view.toggleMode"]);
  });
});
