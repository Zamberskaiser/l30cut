import type { ComponentId, ComponentStatus, CreatorEngines } from "@/core/runtime/types";

/** What the user asked the render to do, which decides what must be installed. */
export interface CreatorNeeds {
  /** Narrate the scenes with the local voice (Piper). */
  narrate: boolean;
  /** Generate a picture per scene with the local diffusion model. */
  images: boolean;
}

export interface ModuleGap {
  id: ComponentId;
  /** Plain-language name shown while installing. */
  label: string;
}

const FFMPEG_GAPS: ModuleGap[] = [
  { id: "ffmpeg", label: "Montador de vídeo" },
  { id: "ffprobe", label: "Leitor de mídia" },
];

const NARRATION_GAPS: ModuleGap[] = [
  { id: "piper", label: "Voz local" },
  { id: "piper-voice", label: "Voz em português" },
];

const IMAGE_GAPS: ModuleGap[] = [
  { id: "stable-diffusion", label: "Gerador de imagens" },
  { id: "sd-model", label: "Modelo de imagens" },
];

function isReady(components: ComponentStatus[] | undefined, id: ComponentId): boolean | undefined {
  const found = components?.find((component) => component.id === id);
  return found ? found.state === "ready" : undefined;
}

/**
 * Single source of truth for "what is missing before this render can run".
 * Engine flags decide whether a capability works at all; the component list,
 * when available, narrows the install to the individual pieces still missing so
 * a user who already has the voice binary only downloads the voice file.
 */
export function missingCreatorModules(
  engines: CreatorEngines | null,
  needs: CreatorNeeds,
  components?: ComponentStatus[],
): ModuleGap[] {
  const gaps: ModuleGap[] = [];
  const push = (candidates: ModuleGap[]) => {
    for (const gap of candidates) {
      if (isReady(components, gap.id) === true) continue;
      if (gaps.some((existing) => existing.id === gap.id)) continue;
      gaps.push(gap);
    }
  };

  if (!engines || !engines.ffmpeg) push(FFMPEG_GAPS);
  if (needs.narrate && (!engines || !engines.narration)) push(NARRATION_GAPS);
  if (needs.images && (!engines || !engines.images)) push(IMAGE_GAPS);
  return gaps;
}

/** Short sentence describing the pending downloads, for the confirmation toast. */
export function describeGaps(gaps: ModuleGap[]): string {
  return gaps.map((gap) => gap.label).join(", ");
}
