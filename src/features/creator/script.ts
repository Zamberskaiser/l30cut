import type { CreatorScene } from "@/core/runtime/types";

/**
 * Deterministic script builder. The local LLM (llama.cpp / Ollama) improves the
 * wording, but the creator must work on ANY machine — so when no model answers
 * we still produce a usable scene list from the user's brief.
 */

/** Palette used for the generated cards, aligned with the app's dark theme. */
export const SCENE_COLORS = ["#101828", "#16233d", "#1f2937", "#241a3a", "#12312c", "#3a2418"];

const SENTENCE_SPLIT = /(?<=[.!?…])\s+|\n+/;

export function splitBrief(brief: string): string[] {
  return brief
    .split(SENTENCE_SPLIT)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** ~2.7 words per second of narration in Portuguese, floor of 2s per scene. */
export function estimateDurationUs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  const seconds = Math.max(2.4, words / 2.7);
  return Math.round(Math.min(seconds, 30) * 1_000_000);
}

export function buildScriptPrompt(brief: string, sceneCount: number): string {
  return [
    `Crie o roteiro de um vídeo curto com exatamente ${sceneCount} cenas sobre: "${brief}".`,
    "Responda SOMENTE com JSON no formato:",
    '{"scenes":[{"title":"texto curto na tela","narration":"fala da cena","imagePrompt":"descrição visual em inglês"}]}',
    "A narração de cada cena deve ter no máximo 2 frases, em português do Brasil.",
  ].join("\n");
}

function scene(index: number, title: string, narration: string, imagePrompt: string): CreatorScene {
  return {
    id: `scene-${index + 1}`,
    title: title.slice(0, 90),
    narration,
    imagePrompt,
    durationUs: estimateDurationUs(narration || title),
    color: SCENE_COLORS[index % SCENE_COLORS.length]!,
  };
}

/** Fallback script: splits the brief into scenes without any model involved. */
export function fallbackScenes(brief: string, sceneCount: number): CreatorScene[] {
  const clean = brief.trim();
  const count = Math.max(1, Math.min(12, Math.round(sceneCount)));
  if (clean.length === 0) return [];
  const sentences = splitBrief(clean);
  const chunks: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const from = Math.floor((i * sentences.length) / count);
    const to = Math.max(from + 1, Math.floor(((i + 1) * sentences.length) / count));
    const chunk = sentences.slice(from, to).join(" ").trim();
    chunks.push(chunk.length > 0 ? chunk : clean);
  }
  return chunks.map((chunk, index) => {
    const title = index === 0 ? clean.split(SENTENCE_SPLIT)[0]!.slice(0, 60) : `Parte ${index + 1}`;
    return scene(index, title, chunk, `cinematic still about: ${chunk.slice(0, 120)}`);
  });
}

/**
 * Parses the local model's answer. Models like to wrap JSON in prose or code
 * fences, so we extract the first balanced object before parsing.
 */
export function parseScriptJson(raw: string): CreatorScene[] | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const list = (parsed as { scenes?: unknown })?.scenes;
  if (!Array.isArray(list) || list.length === 0) return null;
  const scenes = list
    .slice(0, 12)
    .map((item, index) => {
      const row = item as Record<string, unknown>;
      const narration = typeof row.narration === "string" ? row.narration.trim() : "";
      const title = typeof row.title === "string" ? row.title.trim() : `Parte ${index + 1}`;
      const imagePrompt =
        typeof row.imagePrompt === "string" && row.imagePrompt.trim().length > 0
          ? row.imagePrompt.trim()
          : `cinematic still about: ${narration || title}`;
      if (narration.length === 0 && title.length === 0) return null;
      return scene(index, title, narration, imagePrompt);
    })
    .filter((item): item is CreatorScene => item !== null);
  return scenes.length > 0 ? scenes : null;
}

export function totalDurationUs(scenes: CreatorScene[]): number {
  return scenes.reduce((sum, item) => sum + item.durationUs, 0);
}
