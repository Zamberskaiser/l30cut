import type { Aspect, MediaAsset, Project, SilenceRange, TranscriptSegment } from "@/core/contracts/domain";
import { SECOND } from "@/core/contracts/domain";
import { createDemoProject } from "@/core/demo/demoProject";
import { ASPECT_RESOLUTIONS, COMPONENT_CATALOG, SETUP_PROFILES } from "./catalog";
import type {
  ComponentId,
  ComponentStatus,
  ExportRequest,
  ExportResult,
  ImportRequest,
  ProgressSink,
  RuntimeAdapter,
  SetupProfile,
  SystemDiagnostics,
} from "./types";

class Canceled extends Error {
  constructor() {
    super("Operação cancelada");
  }
}

async function simulate(
  ms: number,
  onProgress: ProgressSink,
  signal: AbortSignal | undefined,
  detail: string,
) {
  const steps = 20;
  for (let i = 1; i <= steps; i += 1) {
    if (signal?.aborted) throw new Canceled();
    await new Promise((r) => setTimeout(r, ms / steps));
    onProgress({ progress: i / steps, detail });
  }
}

const PROJECT_KEY = "l30cut.projects";

function readStore(): Record<string, Project> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(PROJECT_KEY) ?? "{}") as Record<string, Project>;
  } catch {
    return {};
  }
}

/**
 * Browser preview runtime. Everything here is SIMULATED and clearly labelled as
 * such in the UI — it never claims a native operation actually happened.
 */
export class BrowserDemoRuntime implements RuntimeAdapter {
  readonly mode = "browser-demo" as const;
  readonly capabilities = {
    realFilesystem: false,
    ffmpeg: false,
    localTranscription: false,
    componentDownloads: false,
    secureKeyStorage: false,
  };

  private components: ComponentStatus[] = COMPONENT_CATALOG.map((c) => ({ ...c, state: "missing" }));

  async diagnose(): Promise<SystemDiagnostics> {
    return {
      mode: this.mode,
      simulated: true,
      os: "Windows 11 (simulado)",
      cpu: "CPU de demonstração — 8 núcleos",
      cores: 8,
      ramGb: 16,
      gpu: "GPU não detectável no navegador",
      freeDiskGb: 214,
      dataDir: "%APPDATA%\\L30CutAI (no app instalado)",
    };
  }

  async listComponents(): Promise<ComponentStatus[]> {
    return this.components.map((c) => ({ ...c }));
  }

  async installComponent(
    id: ComponentId,
    profile: SetupProfile,
    onProgress: ProgressSink,
    signal: AbortSignal,
  ): Promise<ComponentStatus> {
    const idx = this.components.findIndex((c) => c.id === id);
    const base = this.components[idx];
    if (idx < 0 || !base) throw new Error(`componente desconhecido: ${id}`);
    let current: ComponentStatus = base;
    current = { ...current, state: "downloading", progress: 0 };
    this.components[idx] = current;
    try {
      await simulate(1400, onProgress, signal, `Simulando download (${profile.name})`);
      current = { ...current, state: "verifying", progress: 1 };
      this.components[idx] = current;
      await simulate(400, onProgress, signal, "Simulando verificação SHA-256");
      current = { ...current, state: "ready", progress: 1, version: "demo" };
      this.components[idx] = current;
    } catch (error) {
      current = {
        ...current,
        state: signal.aborted ? "missing" : "error",
        error: signal.aborted ? "" : (error as Error).message,
      };
      this.components[idx] = current;
      throw error;
    }
    return { ...current };
  }

  async prepareDataDirs(): Promise<string[]> {
    return ["models", "bin", "projects", "cache", "exports", "logs"].map(
      (d) => `%APPDATA%\\L30CutAI\\${d} (simulado)`,
    );
  }

  async importMedia(request: ImportRequest, onProgress: ProgressSink): Promise<MediaAsset[]> {
    const assets: MediaAsset[] = [];
    for (const file of request.files) {
      if (typeof file === "string") {
        throw new Error("Caminhos de disco só são suportados no aplicativo instalado.");
      }
      await simulate(500, onProgress, undefined, `Lendo metadados de ${file.name}`);
      const url = URL.createObjectURL(file);
      const meta = await probeInBrowser(url, file.type);
      assets.push({
        id: `asset_${Math.random().toString(36).slice(2, 9)}`,
        kind: meta.kind,
        name: file.name,
        path: url,
        durationUs: meta.durationUs,
        width: meta.width,
        height: meta.height,
        fpsNum: 30,
        fpsDen: 1,
        audioChannels: 2,
        sizeBytes: file.size,
        proxyReady: false,
        demo: false,
      });
    }
    return assets;
  }

  async generateThumbnails(asset: MediaAsset, onProgress: ProgressSink, signal: AbortSignal) {
    await simulate(900, onProgress, signal, `Gerando proxy simulado de ${asset.name}`);
    return [];
  }

  async detectSilence(
    asset: MediaAsset,
    _thresholdDb: number,
    minSilenceUs: number,
    onProgress: ProgressSink,
    signal: AbortSignal,
  ): Promise<SilenceRange[]> {
    await simulate(1000, onProgress, signal, "Analisando envelope de áudio (simulado)");
    const demo = createDemoProject();
    const known = demo.analysis.silences[asset.id];
    if (known) return known.filter((s) => s.endUs - s.startUs >= minSilenceUs);
    // Deterministic synthetic pattern for imported media in demo mode.
    const out: SilenceRange[] = [];
    for (let t = 4 * SECOND; t + SECOND < asset.durationUs; t += 7 * SECOND) {
      out.push({ startUs: t, endUs: t + Math.round(1.1 * SECOND) });
    }
    return out.filter((s) => s.endUs - s.startUs >= minSilenceUs);
  }

  async transcribe(
    asset: MediaAsset,
    onProgress: ProgressSink,
    signal: AbortSignal,
  ): Promise<TranscriptSegment[]> {
    await simulate(1600, onProgress, signal, "Transcrição simulada (whisper.cpp no app instalado)");
    const demo = createDemoProject();
    return demo.transcript.map((s) => ({ ...s, assetId: asset.id }));
  }

  async exportSequence(
    request: ExportRequest,
    onProgress: ProgressSink,
    signal: AbortSignal,
  ): Promise<ExportResult> {
    await simulate(2200, onProgress, signal, `Exportação simulada ${request.preset.aspect}`);
    return {
      outputPath: `exports\\${request.outputName}.mp4 (não gravado — modo demonstração)`,
      bytes: 0,
      simulated: true,
    };
  }

  async loadProject(id: string): Promise<Project | null> {
    return readStore()[id] ?? null;
  }

  async saveProject(project: Project): Promise<void> {
    if (typeof window === "undefined") return;
    const store = readStore();
    store[project.id] = project;
    window.localStorage.setItem(PROJECT_KEY, JSON.stringify(store));
  }

  aspectResolution(aspect: Aspect) {
    return ASPECT_RESOLUTIONS[aspect];
  }
}

async function probeInBrowser(
  url: string,
  mime: string,
): Promise<{ kind: MediaAsset["kind"]; durationUs: number; width: number; height: number }> {
  if (mime.startsWith("image/")) {
    return { kind: "image", durationUs: 5 * SECOND, width: 1920, height: 1080 };
  }
  const isAudio = mime.startsWith("audio/");
  const el = document.createElement(isAudio ? "audio" : "video");
  el.preload = "metadata";
  el.src = url;
  await new Promise<void>((resolve) => {
    el.onloadedmetadata = () => resolve();
    el.onerror = () => resolve();
    setTimeout(resolve, 4000);
  });
  const duration = Number.isFinite(el.duration) ? el.duration : 10;
  return {
    kind: isAudio ? "audio" : "video",
    durationUs: Math.max(SECOND, Math.round(duration * SECOND)),
    width: isAudio ? 0 : (el as HTMLVideoElement).videoWidth || 1920,
    height: isAudio ? 0 : (el as HTMLVideoElement).videoHeight || 1080,
  };
}

export { SETUP_PROFILES };
