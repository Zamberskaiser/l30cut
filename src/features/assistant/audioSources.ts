/** Audio/video containers whisper.cpp can read after the FFmpeg conversion. */
export const TRANSCRIBABLE_EXTENSIONS = [
  "wav",
  "mp3",
  "m4a",
  "aac",
  "ogg",
  "opus",
  "flac",
  "wma",
  "mp4",
  "mov",
  "mkv",
  "avi",
  "webm",
  "mts",
  "m4v",
  "wmv",
] as const;

/** File picker filter for the "pull from a file" path. */
export const TRANSCRIBABLE_ACCEPT = TRANSCRIBABLE_EXTENSIONS.map((ext) => `.${ext}`).join(",");

/** Guard so a huge movie is not read into memory before FFmpeg sees it. */
export const MAX_TRANSCRIBE_BYTES = 2_000_000_000;

/** Lowercase extension without the dot, or "" when the name carries none. */
export function fileExtension(name: string): string {
  const clean = name.split(/[\\/]/).pop() ?? "";
  const dot = clean.lastIndexOf(".");
  if (dot <= 0 || dot === clean.length - 1) return "";
  return clean.slice(dot + 1).toLowerCase();
}

export function isTranscribableName(name: string): boolean {
  const ext = fileExtension(name);
  return (TRANSCRIBABLE_EXTENSIONS as readonly string[]).includes(ext);
}

/** Human explanation when a chosen file cannot be transcribed, else null. */
export function describeFileProblem(name: string, size: number): string | null {
  if (!isTranscribableName(name)) {
    return "Escolha um arquivo de áudio ou vídeo (MP4, MOV, MP3, WAV, M4A…).";
  }
  if (size <= 0) return "Esse arquivo está vazio.";
  if (size > MAX_TRANSCRIBE_BYTES) {
    return "Esse arquivo é grande demais. Corte um trecho menor e tente de novo.";
  }
  return null;
}

/** Joins transcript segment texts into one readable paragraph. */
export function joinSegments(segments: Array<{ text: string }>): string {
  return segments
    .map((segment) => segment.text.trim())
    .filter((text) => text.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
