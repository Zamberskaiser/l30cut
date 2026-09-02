import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ToolId } from "@/core/commands/tools";
import { PREMIERE_WINDOWS_PRESET, PRESET_ID } from "@/core/shortcuts/premiereWindowsPreset";
import { mergeBindings, normalizeCombo } from "@/core/shortcuts/shortcutEngine";
import {
  EMPTY_OVERRIDES,
  ShortcutOverridesSchema,
  type BindingMap,
  type PanelContext,
  type ShortcutOverrides,
} from "@/core/shortcuts/types";

export type EditorMode = "essential" | "pro";

const LS_KEY = "l30cut.ui.v1";

interface PersistedUi {
  mode: EditorMode;
  snap: boolean;
  overrides: ShortcutOverrides;
  assistantCollapsed: boolean;
}

function loadPersisted(): Partial<PersistedUi> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<PersistedUi>;
    const overrides = ShortcutOverridesSchema.safeParse(parsed.overrides);
    return { ...parsed, overrides: overrides.success ? overrides.data : EMPTY_OVERRIDES };
  } catch {
    return {};
  }
}

export interface UiStore {
  tool: ToolId;
  setTool: (tool: ToolId) => void;
  snap: boolean;
  setSnap: (snap: boolean) => void;
  mode: EditorMode;
  setMode: (mode: EditorMode) => void;
  focused: PanelContext;
  setFocused: (panel: PanelContext) => void;
  lastCommand: string | null;
  setLastCommand: (label: string | null) => void;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  playRate: number;
  setPlayRate: (rate: number) => void;
  pxPerSecond: number;
  setPxPerSecond: (px: number | ((prev: number) => number)) => void;
  assistantCollapsed: boolean;
  setAssistantCollapsed: (collapsed: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** commandId → combos, preset merged with user overrides. */
  bindings: BindingMap;
  overrides: ShortcutOverrides;
  setBinding: (commandId: string, combos: string[]) => void;
  resetBindings: () => void;
  importOverrides: (overrides: ShortcutOverrides) => void;
}

const UiContext = createContext<UiStore | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [tool, setToolState] = useState<ToolId>("selection");
  const [snap, setSnap] = useState(true);
  const [mode, setMode] = useState<EditorMode>("essential");
  const [focused, setFocused] = useState<PanelContext>("timeline");
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playRate, setPlayRate] = useState(1);
  const [pxPerSecond, setPxPerSecondState] = useState(28);
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [overrides, setOverrides] = useState<ShortcutOverrides>(EMPTY_OVERRIDES);
  const [hydrated, setHydrated] = useState(false);

  // Read persisted preferences after hydration (never during render).
  useEffect(() => {
    const p = loadPersisted();
    if (p.mode) setMode(p.mode);
    if (typeof p.snap === "boolean") setSnap(p.snap);
    if (typeof p.assistantCollapsed === "boolean") setAssistantCollapsed(p.assistantCollapsed);
    if (p.overrides) setOverrides(p.overrides);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const payload: PersistedUi = { mode, snap, overrides, assistantCollapsed };
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch {
      /* storage unavailable — preferences stay in memory only */
    }
  }, [hydrated, mode, snap, overrides, assistantCollapsed]);

  const bindings = useMemo(() => mergeBindings(PREMIERE_WINDOWS_PRESET, overrides), [overrides]);

  const setPxPerSecond = useCallback((next: number | ((prev: number) => number)) => {
    setPxPerSecondState((prev) => {
      const raw = typeof next === "function" ? next(prev) : next;
      return Math.min(400, Math.max(2, raw));
    });
  }, []);

  const setTool = useCallback((next: ToolId) => setToolState(next), []);

  const setBinding = useCallback((commandId: string, combos: string[]) => {
    const normalized = combos.map((c) => normalizeCombo(c)).filter((c): c is string => Boolean(c));
    setOverrides((prev) => ({
      ...prev,
      preset: PRESET_ID,
      bindings: { ...prev.bindings, [commandId]: normalized },
    }));
  }, []);

  const value: UiStore = {
    tool,
    setTool,
    snap,
    setSnap,
    mode,
    setMode,
    focused,
    setFocused,
    lastCommand,
    setLastCommand,
    playing,
    setPlaying,
    playRate,
    setPlayRate,
    pxPerSecond,
    setPxPerSecond,
    assistantCollapsed,
    setAssistantCollapsed,
    shortcutsOpen,
    setShortcutsOpen,
    paletteOpen,
    setPaletteOpen,
    bindings,
    overrides,
    setBinding,
    resetBindings: () => setOverrides(EMPTY_OVERRIDES),
    importOverrides: (next) => setOverrides(next),
  };

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiStore {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi deve ser usado dentro de UiProvider");
  return ctx;
}
