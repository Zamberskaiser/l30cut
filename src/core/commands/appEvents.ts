/**
 * Tiny typed app event bus. Commands stay pure by requesting UI intents
 * (open the import picker, open the export dialog) instead of owning refs.
 */
export type AppEvent = "import" | "export";

type Listener = () => void;

const listeners = new Map<AppEvent, Set<Listener>>();

export function emitAppEvent(event: AppEvent): void {
  listeners.get(event)?.forEach((fn) => fn());
}

export function onAppEvent(event: AppEvent, listener: Listener): () => void {
  const set = listeners.get(event) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(event, set);
  return () => set.delete(listener);
}
