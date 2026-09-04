/**
 * Turns a media path into something the webview can actually load.
 *
 * Inside the desktop app a raw Windows path (`C:\videos\a.mp4`) is not a URL,
 * so the webview refuses it and the preview stays black. Tauri exposes local
 * files through the asset protocol, which on Windows is served from
 * `http://asset.localhost/<encoded path>` (same shape as `convertFileSrc`).
 */
export function toWebMediaSrc(path: string, insideTauri: boolean): string {
  if (path.length === 0) return path;
  if (/^(blob:|data:|https?:|asset:)/i.test(path)) return path;
  if (!insideTauri) return path;
  return `http://asset.localhost/${encodeURIComponent(path)}`;
}

/** True when running inside the compiled desktop app. */
export function hasTauriHost(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Convenience wrapper used by modules that have no runtime instance at hand. */
export function webMediaSrc(path: string): string {
  return toWebMediaSrc(path, hasTauriHost());
}
