import type { Aspect } from "@/core/contracts/domain";
import type { ComponentStatus, SetupProfile } from "./types";

export const ASPECT_RESOLUTIONS: Record<Aspect, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

/** Allowlisted origins. Any download outside this list is refused by the Rust side. */
export const ALLOWED_DOWNLOAD_ORIGINS = [
  "https://github.com",
  "https://objects.githubusercontent.com",
  "https://huggingface.co",
] as const;

export const COMPONENT_CATALOG: ComponentStatus[] = [
  {
    id: "ffmpeg",
    name: "FFmpeg",
    description: "Motor de mídia para decode, proxy e exportação H.264.",
    state: "missing",
    sizeBytes: 92_000_000,
    source: "https://github.com/BtbN/FFmpeg-Builds/releases",
    sha256: "definido no manifest de release",
  },
  {
    id: "ffprobe",
    name: "ffprobe",
    description: "Leitura de metadados, duração, fps e faixas de áudio.",
    state: "missing",
    sizeBytes: 88_000_000,
    source: "https://github.com/BtbN/FFmpeg-Builds/releases",
  },
  {
    id: "whisper.cpp",
    name: "whisper.cpp",
    description: "Transcrição local, sem enviar áudio para a internet.",
    state: "missing",
    sizeBytes: 6_000_000,
    source: "https://github.com/ggml-org/whisper.cpp/releases",
  },
  {
    id: "whisper-model",
    name: "Modelo de transcrição",
    description: "Peso GGML escolhido pelo perfil. Nunca baixado sem confirmação.",
    state: "missing",
    sizeBytes: 466_000_000,
    source: "https://huggingface.co/ggerganov/whisper.cpp",
  },
  {
    id: "llm-provider",
    name: "Provider de LLM local",
    description: "Endpoint compatível com OpenAI (Ollama / llama.cpp server).",
    state: "missing",
    optional: true,
    source: "http://127.0.0.1:11434",
  },
];

export const SETUP_PROFILES: SetupProfile[] = [
  {
    id: "light",
    name: "Leve",
    description: "Para máquinas modestas. Transcrição rápida, precisão menor.",
    whisperModel: "ggml-base.bin",
    downloadBytes: 148_000_000,
  },
  {
    id: "recommended",
    name: "Recomendado",
    description: "Equilíbrio entre velocidade e qualidade. Padrão sugerido.",
    whisperModel: "ggml-small.bin",
    downloadBytes: 466_000_000,
  },
  {
    id: "high-quality",
    name: "Alta qualidade",
    description: "Melhor transcrição, exige mais RAM e tempo de processamento.",
    whisperModel: "ggml-medium.bin",
    downloadBytes: 1_500_000_000,
  },
];

export const EXPORT_PRESET_IDS = ["16:9", "9:16", "1:1", "4:5"] as const;
