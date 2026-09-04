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
    id: "llama-server",
    name: "llama.cpp server",
    description: "Servidor de LLM local para o roteirista do criador de vídeos.",
    state: "missing",
    optional: true,
    sizeBytes: 40_000_000,
    source: "https://github.com/ggml-org/llama.cpp/releases",
  },
  {
    id: "llm-model",
    name: "Modelo de roteiro (Qwen2.5)",
    description: "Q4_K_M em GGUF: 3B no perfil Leve, 7B nos demais.",
    state: "missing",
    optional: true,
    sizeBytes: 4_700_000_000,
    source: "https://huggingface.co/bartowski",
  },
  {
    id: "piper",
    name: "Piper TTS",
    description: "Narração offline em português, rápida até em CPU.",
    state: "missing",
    optional: true,
    sizeBytes: 20_000_000,
    source: "https://github.com/rhasspy/piper/releases",
  },
  {
    id: "piper-voice",
    name: "Voz PT-BR (faber medium)",
    description: "Modelo de voz brasileira usado na narração.",
    state: "missing",
    optional: true,
    sizeBytes: 63_000_000,
    source: "https://huggingface.co/rhasspy/piper-voices",
  },
  {
    id: "stable-diffusion",
    name: "stable-diffusion.cpp",
    description: "Geração de imagens das cenas direto na sua máquina.",
    state: "missing",
    optional: true,
    sizeBytes: 30_000_000,
    source: "https://github.com/leejet/stable-diffusion.cpp/releases",
  },
  {
    id: "sd-model",
    name: "Modelo de imagem (SD 1.5)",
    description: "Checkpoint fp16 aberto, ~2 GB, roda em CPU.",
    state: "missing",
    optional: true,
    sizeBytes: 2_100_000_000,
    source: "https://huggingface.co/Comfy-Org/stable-diffusion-v1-5-archive",
  },
  {
    id: "llm-provider",
    name: "Provider de LLM externo",
    description: "Alternativa ao llama.cpp: Ollama ou LM Studio no endpoint local.",
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
