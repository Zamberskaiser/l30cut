import { useCallback, useState } from "react";
import { useEditor } from "@/core/store/editorStore";
import type { UpdateInfo } from "@/core/runtime/types";

export type UpdatePhase = "idle" | "checking" | "available" | "downloading" | "error";

export interface UpdaterState {
  phase: UpdatePhase;
  info: UpdateInfo | null;
  error: string | null;
}

export function useUpdater() {
  const { runtime } = useEditor();
  const [state, setState] = useState<UpdaterState>({ phase: "idle", info: null, error: null });
  const [dialogOpen, setDialogOpen] = useState(false);

  const enabled = runtime.capabilities.updater;

  const check = useCallback(async () => {
    if (!enabled) {
      setState({
        phase: "error",
        info: null,
        error: "Atualizações só funcionam no aplicativo instalado.",
      });
      setDialogOpen(true);
      return;
    }
    setState({ phase: "checking", info: null, error: null });
    setDialogOpen(true);
    try {
      const info = await runtime.checkForUpdate!();
      if (info) {
        setState({ phase: "available", info, error: null });
      } else {
        setState({ phase: "idle", info: null, error: null });
      }
    } catch (err) {
      setState({
        phase: "error",
        info: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [enabled, runtime]);

  const install = useCallback(async () => {
    if (!enabled) return;
    setState((s) => ({ ...s, phase: "downloading", error: null }));
    try {
      await runtime.installUpdate!();
      // If install completes without restart, mark idle; normally the app restarts.
      setState({ phase: "idle", info: null, error: null });
    } catch (err) {
      setState({
        phase: "error",
        info: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [enabled, runtime]);

  const close = useCallback(() => setDialogOpen(false), []);

  return { enabled, state, dialogOpen, check, install, close, setDialogOpen };
}
