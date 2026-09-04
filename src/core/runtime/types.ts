import type {
  Aspect,
  ExportPreset,
  MediaAsset,
  Project,
  SilenceRange,
  TranscriptSegment,
} from "@/core/contracts/domain";

export type RuntimeMode = "browser-demo" | "tauri";

export interface SystemDiagnostics {
  mode: RuntimeMode;
  simulated: boolean;
  os: string;
  cpu: string;
  cores: number;
  ramGb: number;
  gpu: string | null;
  freeDiskGb: number;
  dataDir: string;
}

export type ComponentId =
  | "ffmpeg"
  | "ffprobe"
  | "whisper.cpp"
  | "whisper-model"
  | "llama-server"
  | "llm-model"
  | "piper"
  | "piper-voice"
  | "stable-diffusion"
  | "sd-model"
  | "llm-provider";
export type ComponentState = "missing" | "downloading" | "verifying" | "ready" | "error";

export interface ComponentStatus {
  id: ComponentId;
  name: string;
  description: string;
  state: ComponentState;
  version?: string;
  sizeBytes?: number;
  /** Allowlisted origin the binary/model may be fetched from. */
  source?: string;
  sha256?: string;
  progress?: number;
  error?: string;
  optional?: boolean;
}

export interface SetupProfile {
  id: "light" | "recommended" | "high-quality";
  name: string;
  description: string;
  whisperModel: string;
  downloadBytes: number;
}

export interface ProgressEvent {
  progress: number;
  detail?: string;
}

export type ProgressSink = (event: ProgressEvent) => void;

export interface ExportRequest {
  project: Project;
  sequenceId: string;
  preset: ExportPreset;
  outputName: string;
  overwrite: boolean;
}

export interface ExportResult {
  outputPath: string;
  bytes: number;
  simulated: boolean;
}

export interface ImportRequest {
  /** Browser: File objects. Tauri: canonicalized absolute paths. */
  files: Array<File | string>;
}

/**
 * Single boundary between UI and the machine. BrowserDemoRuntime simulates,
 * TauriRuntime invokes allowlisted, typed Rust commands.
 */
/** GitHub account connected inside the app for the updater. */
export interface GithubAccount {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface GithubRepoRef {
  fullName: string;
  private: boolean;
  pushedAt: string | null;
}

export interface UpdateSettings {
  connected: boolean;
  repo: string | null;
  account: GithubAccount | null;
}

export interface RuntimeAdapter {
  readonly mode: RuntimeMode;
  readonly capabilities: {
    realFilesystem: boolean;
    ffmpeg: boolean;
    localTranscription: boolean;
    componentDownloads: boolean;
    secureKeyStorage: boolean;
    /** True when the host can check/install app updates. */
    updater: boolean;
    /** True when the host can render an AI video with local engines. */
    videoCreator: boolean;
  };
  diagnose(): Promise<SystemDiagnostics>;
  listComponents(): Promise<ComponentStatus[]>;
  installComponent(
    id: ComponentId,
    profile: SetupProfile,
    onProgress: ProgressSink,
    signal: AbortSignal,
  ): Promise<ComponentStatus>;
  prepareDataDirs(): Promise<string[]>;
  /** Native file picker (installed app only). Returns absolute paths, [] on cancel. */
  pickMediaFiles?(): Promise<string[]>;
  importMedia(request: ImportRequest, onProgress: ProgressSink): Promise<MediaAsset[]>;
  generateThumbnails(
    asset: MediaAsset,
    onProgress: ProgressSink,
    signal: AbortSignal,
  ): Promise<string[]>;
  detectSilence(
    asset: MediaAsset,
    thresholdDb: number,
    minSilenceUs: number,
    onProgress: ProgressSink,
    signal: AbortSignal,
  ): Promise<SilenceRange[]>;
  transcribe(
    asset: MediaAsset,
    onProgress: ProgressSink,
    signal: AbortSignal,
  ): Promise<TranscriptSegment[]>;
  /**
   * Transcribes a microphone recording locally (whisper.cpp) so the user can
   * speak a command instead of typing it. Absent in the browser demo.
   */
  transcribeSpeech?(audio: Uint8Array, extension: string): Promise<string>;
  exportSequence(
    request: ExportRequest,
    onProgress: ProgressSink,
    signal: AbortSignal,
  ): Promise<ExportResult>;
  loadProject(id: string): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;
  /**
   * Writes a real `*.l30cut` file. Tauri opens the native save dialog and
   * writes through an allowlisted Rust command; the browser demo downloads it.
   * Returns the target path/file name, or null when the user cancels.
   */
  saveProjectToFile?(project: Project): Promise<string | null>;
  /** Opens a `*.l30cut` file from disk. Returns null when the user cancels. */
  openProjectFromFile?(): Promise<{ project: Project; path: string } | null>;
  aspectResolution(aspect: Aspect): { width: number; height: number };
  /**
   * URL the webview can actually load for a media file. On the desktop the raw
   * Windows path (C:\...) is not loadable, so it is converted to the
   * asset protocol; in the browser the path is already a URL.
   */
  mediaSrc(path: string): string;
  /**
   * Native (Rust) allowlist validation of an AI-proposed command transaction.
   * Present only on the Tauri runtime — in the browser demo the TypeScript/Zod
   * layer is all there is, and that is documented as NOT a security boundary.
   */
  validateAiTransaction?(commandsJson: string): Promise<AiValidationReport>;
  /** Checks the configured updater endpoint. Returns null when no update is available. */
  checkForUpdate?(): Promise<UpdateInfo | null>;
  /** Downloads, installs and restarts the app. */
  installUpdate?(): Promise<void>;
  /** Saved GitHub account + repository used by the updater (token never leaves the machine). */
  getUpdateSettings?(): Promise<UpdateSettings>;
  /** Validates a GitHub token and stores it locally. */
  connectGithub?(token: string): Promise<UpdateSettings>;
  /** Repositories the connected account can see, newest activity first. */
  listGithubRepos?(): Promise<GithubRepoRef[]>;
  /** True when the repository publishes a Windows installer release. */
  repoHasRelease?(repo: string): Promise<boolean>;
  /** Stores the repository the updater should watch. */
  setUpdateRepo?(repo: string): Promise<UpdateSettings>;
  /** Forgets the token, account and repository on this machine. */
  disconnectGithub?(): Promise<UpdateSettings>;
  /** Which local creator engines are installed (FFmpeg, Piper, diffusion, LLM). */
  listAiEngines?(): Promise<CreatorEngines>;
  /** Asks a LOCAL OpenAI-compatible endpoint for a scene script. */
  generateScript?(endpoint: string, model: string, prompt: string): Promise<string>;
  /** Renders one still with the local diffusion model. Returns its path. */
  createImage?(prompt: string, width: number, height: number, outputName: string): Promise<string>;
  /** Speaks a text with the local voice and returns the WAV path. */
  createAudio?(text: string, outputName: string): Promise<string>;
  /** Writes a transcript/script/note file next to the exports. Returns its path. */
  saveTextFile?(name: string, extension: string, text: string): Promise<string>;
  /**
   * Saves a still as PNG with embedded metadata (title, description, date) and
   * an automatic file name, preferring the user's Downloads folder.
   */
  exportPng?(source: string, title: string, description?: string): Promise<string>;
  /**
   * Public web search, used only when the user asks the assistant to look
   * something up. Sends the query text and nothing else.
   */
  webSearch?(query: string): Promise<SearchHit[]>;
  /** Renders the scene list into a real MP4 with FFmpeg + local engines. */
  createVideo?(
    scenes: CreatorScene[],
    options: CreatorRenderOptions,
    onProgress: ProgressSink,
  ): Promise<CreatorResult>;
}

/** One result of an assistant web search. */
export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

/** Local engines the AI video creator can use. */
export interface CreatorEngines {
  ffmpeg: boolean;
  narration: boolean;
  images: boolean;
  llm: boolean;
}

export interface CreatorScene {
  id: string;
  /** Text burned on screen (optional). */
  title: string;
  /** Narration read by the local TTS. */
  narration: string;
  /** Prompt for the local image model. */
  imagePrompt: string;
  /** Existing still on disk, when the user brings their own picture. */
  imagePath?: string;
  durationUs: number;
  /** Card background when no image model is installed. */
  color: string;
}

export interface CreatorRenderOptions {
  width: number;
  height: number;
  outputName: string;
  narrate: boolean;
  burnTitles: boolean;
}

export interface CreatorResult {
  outputPath: string;
  bytes: number;
  usedNarration: boolean;
  usedImageModel: boolean;
  sceneCount: number;
}

export interface UpdateInfo {
  version: string;
  date: string | null;
  body: string | null;
}

export interface AiValidationReport {
  ok: boolean;
  opCount: number;
  errors: string[];
}
