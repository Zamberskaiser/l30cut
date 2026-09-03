import { z } from "zod";
import { DEFAULT_OLLAMA_BASE_URL, normalizeOllamaBaseUrl } from "./ollama";

/**
 * Local generative-AI preferences. Persisted in localStorage only — the app
 * never uploads these, and no API keys are stored here (Ollama needs none).
 */
export const LlmSettingsSchema = z
  .object({
    /** false → deterministic rules only (default, zero downloads). */
    enabled: z.boolean().default(false),
    provider: z.literal("ollama").default("ollama"),
    baseUrl: z.string().min(1).default(DEFAULT_OLLAMA_BASE_URL),
    model: z.string().default(""),
    /** Falls back to the rule-based planner when the model fails or is offline. */
    fallbackToDeterministic: z.boolean().default(true),
    temperature: z.number().min(0).max(1).default(0.2),
  })
  .strict();

export type LlmSettings = z.infer<typeof LlmSettingsSchema>;

export const DEFAULT_LLM_SETTINGS: LlmSettings = LlmSettingsSchema.parse({});

const LS_KEY = "l30cut.llm.v1";

export function loadLlmSettings(): LlmSettings {
  if (typeof window === "undefined") return DEFAULT_LLM_SETTINGS;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_LLM_SETTINGS;
    const parsed = LlmSettingsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return DEFAULT_LLM_SETTINGS;
    return { ...parsed.data, baseUrl: normalizeOllamaBaseUrl(parsed.data.baseUrl) };
  } catch {
    return DEFAULT_LLM_SETTINGS;
  }
}

export function saveLlmSettings(settings: LlmSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable — settings stay in memory for this session */
  }
}

/** A generative plan is only attempted when explicitly enabled with a model. */
export function isGenerativeReady(settings: LlmSettings): boolean {
  return settings.enabled && settings.model.trim().length > 0;
}
