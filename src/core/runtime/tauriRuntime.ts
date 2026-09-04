import type {
  Aspect,
  MediaAsset,
  Project,
  SilenceRange,
  TranscriptSegment,
} from "@/core/contracts/domain";
import {
  MediaAssetSchema,
  ProjectSchema,
  SilenceRangeSchema,
  TranscriptSegmentSchema,
} from "@/core/contracts/domain";
import { z } from "zod";
import { toWebMediaSrc } from "./mediaSrc";
import {
  parseProjectFile,
  projectFileName,
  serializeProjectFile,
  PROJECT_FILE_EXTENSION,
} from "@/core/project/projectFile";
import { ASPECT_RESOLUTIONS } from "./catalog";
import type {
  AiValidationReport,
  CreatorEngines,
  CreatorRenderOptions,
  CreatorResult,
  CreatorScene,
  ComponentId,
  ComponentStatus,
  ExportRequest,
  ExportResult,
  ImportRequest,
  ProgressSink,
  RuntimeAdapter,
  SetupProfile,
  SystemDiagnostics,
  UpdateInfo,
  UpdateSettings,
  GithubRepoRef,
  SearchHit,
} from "./types";

/**
 * Allowlist of Tauri commands. The assistant can never reach anything outside
 * this map, and it can never pass free-form shell strings — only typed args.
 */
export const TAURI_COMMANDS = {
  diagnose: "diagnose_system",
  listComponents: "list_components",
  installComponent: "install_component",
  prepareDirs: "prepare_data_dirs",
  probeMedia: "probe_media",
  makeProxy: "generate_proxy",
  detectSilence: "detect_silence",
  transcribe: "transcribe_asset",
  transcribeSpeech: "transcribe_speech",
  export: "export_sequence",
  loadProject: "load_project",
  saveProject: "save_project",
  writeProjectFile: "write_project_file",
  readProjectFile: "read_project_file",
  validateAiTransaction: "validate_ai_transaction",
  checkForUpdate: "check_for_update",
  updateSettings: "update_settings",
  githubConnect: "github_connect",
  githubRepos: "github_repos",
  githubRepoHasRelease: "github_repo_has_release",
  setUpdateRepo: "set_update_repo",
  githubDisconnect: "github_disconnect",
  installUpdate: "install_update",
  listAiEngines: "list_ai_engines",
  llmGenerate: "llm_generate",
  createVideo: "create_ai_video",
  createImage: "create_ai_image",
  createAudio: "create_ai_audio",
  saveTextFile: "save_text_file",
  exportPng: "export_png",
  webSearch: "web_search",
} as const;

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

export function hasTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function getInvoke(): Promise<Invoke> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: Invoke } })
    .__TAURI_INTERNALS__;
  if (!internals?.invoke) throw new Error("Tauri IPC indisponível");
  return internals.invoke;
}

const UpdateSettingsSchema = z
  .object({
    connected: z.boolean(),
    repo: z.string().nullable().optional(),
    account: z
      .object({
        login: z.string(),
        name: z.string().nullable().optional(),
        avatarUrl: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .transform((raw) => ({
    connected: raw.connected,
    repo: raw.repo ?? null,
    account: raw.account
      ? {
          login: raw.account.login,
          name: raw.account.name ?? null,
          avatarUrl: raw.account.avatarUrl ?? null,
        }
      : null,
  }));

const DiagnosticsSchema = z.object({
  os: z.string(),
  cpu: z.string(),
  cores: z.number().int(),
  ramGb: z.number(),
  gpu: z.string().nullable(),
  freeDiskGb: z.number(),
  dataDir: z.string(),
});

/**
 * Real desktop runtime. Only reachable inside the compiled Tauri app; every
 * response is re-validated on the TypeScript side before it touches the store.
 */
export class TauriRuntime implements RuntimeAdapter {
  readonly mode = "tauri" as const;
  readonly capabilities = {
    realFilesystem: true,
    ffmpeg: true,
    localTranscription: true,
    componentDownloads: true,
    secureKeyStorage: true,
    updater: true,
    videoCreator: true,
  };

  async diagnose(): Promise<SystemDiagnostics> {
    const invoke = await getInvoke();
    const raw = DiagnosticsSchema.parse(await invoke(TAURI_COMMANDS.diagnose));
    return { ...raw, mode: this.mode, simulated: false };
  }

  async listComponents(): Promise<ComponentStatus[]> {
    const invoke = await getInvoke();
    return invoke<ComponentStatus[]>(TAURI_COMMANDS.listComponents);
  }

  async installComponent(
    id: ComponentId,
    profile: SetupProfile,
    onProgress: ProgressSink,
    signal: AbortSignal,
  ): Promise<ComponentStatus> {
    const invoke = await getInvoke();
    signal.addEventListener("abort", () => {
      void invoke(TAURI_COMMANDS.installComponent, { componentId: id, cancel: true });
    });
    onProgress({ progress: 0, detail: "Baixando componente" });
    return invoke<ComponentStatus>(TAURI_COMMANDS.installComponent, {
      componentId: id,
      profileId: profile.id,
      model: profile.whisperModel,
    });
  }

  async prepareDataDirs(): Promise<string[]> {
    const invoke = await getInvoke();
    return invoke<string[]>(TAURI_COMMANDS.prepareDirs);
  }

  async pickMediaFiles(): Promise<string[]> {
    const invoke = await getInvoke();
    const picked = await invoke<unknown>("plugin:dialog|open", {
      options: {
        multiple: true,
        directory: false,
        title: "Importar mídia",
        filters: [
          {
            name: "Mídia",
            extensions: ["mp4", "mov", "mkv", "wav", "mp3", "m4a", "png", "jpg", "jpeg"],
          },
        ],
      },
    });
    if (picked == null) return [];
    const list = Array.isArray(picked) ? picked : [picked];
    return list
      .map((item) =>
        typeof item === "string"
          ? item
          : typeof (item as { path?: unknown })?.path === "string"
            ? (item as { path: string }).path
            : null,
      )
      .filter((p): p is string => Boolean(p));
  }

  async importMedia(request: ImportRequest, onProgress: ProgressSink): Promise<MediaAsset[]> {
    const invoke = await getInvoke();
    const assets: MediaAsset[] = [];
    for (const file of request.files) {
      if (typeof file !== "string") {
        throw new Error("No aplicativo instalado a importação usa caminhos de arquivo.");
      }
      onProgress({ progress: 0.4, detail: `ffprobe ${file}` });
      assets.push(MediaAssetSchema.parse(await invoke(TAURI_COMMANDS.probeMedia, { path: file })));
    }
    onProgress({ progress: 1 });
    return assets;
  }

  async generateThumbnails(asset: MediaAsset, onProgress: ProgressSink): Promise<string[]> {
    const invoke = await getInvoke();
    onProgress({ progress: 0.1, detail: "Gerando proxy" });
    return invoke<string[]>(TAURI_COMMANDS.makeProxy, { assetId: asset.id, path: asset.path });
  }

  async detectSilence(
    asset: MediaAsset,
    thresholdDb: number,
    minSilenceUs: number,
  ): Promise<SilenceRange[]> {
    const invoke = await getInvoke();
    const raw = await invoke<unknown>(TAURI_COMMANDS.detectSilence, {
      path: asset.path,
      thresholdDb,
      minSilenceUs,
    });
    return z.array(SilenceRangeSchema).parse(raw);
  }

  async transcribe(asset: MediaAsset): Promise<TranscriptSegment[]> {
    const invoke = await getInvoke();
    const raw = await invoke<unknown>(TAURI_COMMANDS.transcribe, {
      assetId: asset.id,
      path: asset.path,
    });
    return z.array(TranscriptSegmentSchema).parse(raw);
  }

  async transcribeSpeech(audio: Uint8Array, extension: string): Promise<string> {
    const invoke = await getInvoke();
    // Tauri serializes args as JSON, so the bytes travel as a number array.
    const spoken = await invoke<string>(TAURI_COMMANDS.transcribeSpeech, {
      audio: Array.from(audio),
      extension,
    });
    return z.string().parse(spoken).trim();
  }

  async exportSequence(request: ExportRequest, onProgress: ProgressSink): Promise<ExportResult> {
    const invoke = await getInvoke();
    onProgress({ progress: 0.05, detail: "Montando grafo FFmpeg" });
    const result = await invoke<ExportResult>(TAURI_COMMANDS.export, {
      sequenceId: request.sequenceId,
      preset: request.preset,
      outputName: request.outputName,
      overwrite: request.overwrite,
      project: request.project,
    });
    return { ...result, simulated: false };
  }

  async loadProject(id: string): Promise<Project | null> {
    const invoke = await getInvoke();
    const raw = await invoke<unknown>(TAURI_COMMANDS.loadProject, { projectId: id });
    return raw ? ProjectSchema.parse(raw) : null;
  }

  async saveProject(project: Project): Promise<void> {
    const invoke = await getInvoke();
    await invoke(TAURI_COMMANDS.saveProject, { project });
  }

  /** Native "Salvar como": OS save dialog + allowlisted Rust write. */
  async saveProjectToFile(project: Project): Promise<string | null> {
    const invoke = await getInvoke();
    const path = await invoke<string | null>("plugin:dialog|save", {
      options: {
        title: "Salvar projeto",
        defaultPath: projectFileName(project),
        filters: [{ name: "Projeto L30 CUT AI", extensions: [PROJECT_FILE_EXTENSION] }],
      },
    });
    if (!path) return null;
    await invoke(TAURI_COMMANDS.writeProjectFile, {
      path,
      contents: serializeProjectFile(project),
    });
    return path;
  }

  async openProjectFromFile(): Promise<{ project: Project; path: string } | null> {
    const invoke = await getInvoke();
    const picked = await invoke<unknown>("plugin:dialog|open", {
      options: {
        multiple: false,
        directory: false,
        title: "Abrir projeto",
        filters: [{ name: "Projeto L30 CUT AI", extensions: [PROJECT_FILE_EXTENSION, "json"] }],
      },
    });
    const path =
      typeof picked === "string"
        ? picked
        : typeof (picked as { path?: unknown })?.path === "string"
          ? (picked as { path: string }).path
          : null;
    if (!path) return null;
    const contents = await invoke<string>(TAURI_COMMANDS.readProjectFile, { path });
    return { project: parseProjectFile(contents), path };
  }

  /** Native allowlist gate (src-tauri/src/ai_ops.rs) for AI transactions. */
  async validateAiTransaction(commandsJson: string): Promise<AiValidationReport> {
    const invoke = await getInvoke();
    const raw = await invoke<unknown>(TAURI_COMMANDS.validateAiTransaction, {
      json: commandsJson,
    });
    return z
      .object({ ok: z.boolean(), opCount: z.number().int(), errors: z.array(z.string()) })
      .parse(raw);
  }

  mediaSrc(path: string) {
    return toWebMediaSrc(path, true);
  }

  aspectResolution(aspect: Aspect) {
    return ASPECT_RESOLUTIONS[aspect];
  }

  async checkForUpdate(): Promise<UpdateInfo | null> {
    const invoke = await getInvoke();
    const raw = await invoke<unknown>(TAURI_COMMANDS.checkForUpdate);
    if (raw == null) return null;
    const parsed = z
      .object({
        version: z.string(),
        date: z.string().nullable().optional(),
        body: z.string().nullable().optional(),
      })
      .parse(raw);
    return { version: parsed.version, date: parsed.date ?? null, body: parsed.body ?? null };
  }

  async installUpdate(): Promise<void> {
    const invoke = await getInvoke();
    await invoke(TAURI_COMMANDS.installUpdate);
  }

  async getUpdateSettings(): Promise<UpdateSettings> {
    const invoke = await getInvoke();
    return UpdateSettingsSchema.parse(await invoke(TAURI_COMMANDS.updateSettings));
  }

  async connectGithub(token: string): Promise<UpdateSettings> {
    const invoke = await getInvoke();
    return UpdateSettingsSchema.parse(await invoke(TAURI_COMMANDS.githubConnect, { token }));
  }

  async listGithubRepos(): Promise<GithubRepoRef[]> {
    const invoke = await getInvoke();
    return z
      .array(
        z.object({
          fullName: z.string(),
          private: z.boolean(),
          pushedAt: z.string().nullable().optional(),
        }),
      )
      .parse(await invoke(TAURI_COMMANDS.githubRepos))
      .map((r) => ({ fullName: r.fullName, private: r.private, pushedAt: r.pushedAt ?? null }));
  }

  async repoHasRelease(repo: string): Promise<boolean> {
    const invoke = await getInvoke();
    return z.boolean().parse(await invoke(TAURI_COMMANDS.githubRepoHasRelease, { repo }));
  }

  async setUpdateRepo(repo: string): Promise<UpdateSettings> {
    const invoke = await getInvoke();
    return UpdateSettingsSchema.parse(await invoke(TAURI_COMMANDS.setUpdateRepo, { repo }));
  }

  async disconnectGithub(): Promise<UpdateSettings> {
    const invoke = await getInvoke();
    return UpdateSettingsSchema.parse(await invoke(TAURI_COMMANDS.githubDisconnect));
  }

  async listAiEngines(): Promise<CreatorEngines> {
    const invoke = await getInvoke();
    return z
      .object({
        ffmpeg: z.boolean(),
        narration: z.boolean(),
        images: z.boolean(),
        llm: z.boolean(),
      })
      .parse(await invoke(TAURI_COMMANDS.listAiEngines));
  }

  async generateScript(endpoint: string, model: string, prompt: string): Promise<string> {
    const invoke = await getInvoke();
    return invoke<string>(TAURI_COMMANDS.llmGenerate, { endpoint, model, prompt });
  }

  async createVideo(
    scenes: CreatorScene[],
    options: CreatorRenderOptions,
    onProgress: ProgressSink,
  ): Promise<CreatorResult> {
    const invoke = await getInvoke();
    onProgress({ progress: 0.05, detail: `Montando ${scenes.length} cena(s) com FFmpeg` });
    const result = await invoke<CreatorResult>(TAURI_COMMANDS.createVideo, { scenes, options });
    onProgress({ progress: 1, detail: "Vídeo pronto" });
    return result;
  }

  async createImage(
    prompt: string,
    width: number,
    height: number,
    outputName: string,
  ): Promise<string> {
    const invoke = await getInvoke();
    return invoke<string>(TAURI_COMMANDS.createImage, { prompt, width, height, outputName });
  }

  async createAudio(text: string, outputName: string): Promise<string> {
    const invoke = await getInvoke();
    return invoke<string>(TAURI_COMMANDS.createAudio, { text, outputName });
  }

  async saveTextFile(name: string, extension: string, text: string): Promise<string> {
    const invoke = await getInvoke();
    return invoke<string>(TAURI_COMMANDS.saveTextFile, { name, extension, text });
  }

  async exportPng(source: string, title: string, description?: string): Promise<string> {
    const invoke = await getInvoke();
    return invoke<string>(TAURI_COMMANDS.exportPng, { source, title, description });
  }

  async webSearch(query: string): Promise<SearchHit[]> {
    const invoke = await getInvoke();
    return z
      .array(z.object({ title: z.string(), url: z.string(), snippet: z.string() }))
      .parse(await invoke(TAURI_COMMANDS.webSearch, { query }));
  }
}
