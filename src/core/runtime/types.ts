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

export type ComponentId = "ffmpeg" | "ffprobe" | "whisper.cpp" | "whisper-model" | "llm-provider";
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
export interface RuntimeAdapter {
  readonly mode: RuntimeMode;
  readonly capabilities: {
    realFilesystem: boolean;
    ffmpeg: boolean;
    localTranscription: boolean;
    componentDownloads: boolean;
    secureKeyStorage: boolean;
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
  exportSequence(
    request: ExportRequest,
    onProgress: ProgressSink,
    signal: AbortSignal,
  ): Promise<ExportResult>;
  loadProject(id: string): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;
  aspectResolution(aspect: Aspect): { width: number; height: number };
}
