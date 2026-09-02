import { BrowserDemoRuntime } from "./browserDemoRuntime";
import { hasTauri, TauriRuntime } from "./tauriRuntime";
import type { RuntimeAdapter } from "./types";

export type { RuntimeAdapter } from "./types";

let cached: RuntimeAdapter | null = null;

/** Resolves the runtime once per session: real Tauri IPC when present, demo otherwise. */
export function resolveRuntime(detect: () => boolean = hasTauri): RuntimeAdapter {
  if (!cached) cached = detect() ? new TauriRuntime() : new BrowserDemoRuntime();
  return cached;
}

export function __resetRuntimeForTests() {
  cached = null;
}

export { BrowserDemoRuntime, TauriRuntime, hasTauri };
