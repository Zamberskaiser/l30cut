/**
 * Minimal Ollama client used by the L30 CUT AI assistant.
 *
 * Everything here talks to a server the user runs on their own machine
 * (default http://127.0.0.1:11434). No prompt, transcript or media ever
 * leaves the computer. The client only reads model metadata, pulls models
 * and forwards chat requests — it never executes shell commands.
 */

export interface OllamaModel {
  name: string;
  sizeBytes: number;
  parameterSize: string | null;
  quantization: string | null;
}

export interface OllamaHealth {
  reachable: boolean;
  version: string | null;
  models: OllamaModel[];
  error: string | null;
}

export interface PullProgress {
  /** 0..1 — best effort; Ollama only reports totals for layer downloads. */
  progress: number;
  status: string;
  completedBytes: number;
  totalBytes: number;
}

export interface RecommendedModel {
  id: string;
  label: string;
  approxBytes: number;
  note: string;
}

/** Small instruct models that reliably emit JSON and fit consumer GPUs/CPUs. */
export const RECOMMENDED_OLLAMA_MODELS: RecommendedModel[] = [
  {
    id: "qwen2.5:7b-instruct",
    label: "Qwen 2.5 7B Instruct",
    approxBytes: 4_700_000_000,
    note: "Melhor equilíbrio para planos em JSON. Precisa de ~8 GB de RAM/VRAM.",
  },
  {
    id: "llama3.1:8b",
    label: "Llama 3.1 8B",
    approxBytes: 4_900_000_000,
    note: "Boa compreensão de português. ~8 GB de RAM/VRAM.",
  },
  {
    id: "qwen2.5:3b-instruct",
    label: "Qwen 2.5 3B Instruct",
    approxBytes: 1_900_000_000,
    note: "Opção leve para máquinas sem GPU dedicada.",
  },
  {
    id: "phi3.5:3.8b",
    label: "Phi 3.5 3.8B",
    approxBytes: 2_200_000_000,
    note: "Rápido e pequeno; planos simples.",
  },
];

export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

/** Strips trailing slashes and any accidental /v1 or /api suffix. */
export function normalizeOllamaBaseUrl(input: string): string {
  const trimmed = (input || DEFAULT_OLLAMA_BASE_URL).trim().replace(/\/+$/, "");
  return trimmed.replace(/\/(v1|api)(\/.*)?$/i, "");
}

/** OpenAI-compatible chat endpoint exposed by Ollama itself. */
export function ollamaChatEndpoint(baseUrl: string): string {
  return `${normalizeOllamaBaseUrl(baseUrl)}/v1/chat/completions`;
}

export function parseOllamaTags(payload: unknown): OllamaModel[] {
  const models = (payload as { models?: unknown })?.models;
  if (!Array.isArray(models)) return [];
  return models
    .map((raw) => {
      const item = raw as {
        name?: unknown;
        model?: unknown;
        size?: unknown;
        details?: { parameter_size?: unknown; quantization_level?: unknown };
      };
      const name = typeof item.name === "string" ? item.name : (item.model as string | undefined);
      if (!name) return null;
      return {
        name,
        sizeBytes: typeof item.size === "number" ? item.size : 0,
        parameterSize:
          typeof item.details?.parameter_size === "string" ? item.details.parameter_size : null,
        quantization:
          typeof item.details?.quantization_level === "string"
            ? item.details.quantization_level
            : null,
      } satisfies OllamaModel;
    })
    .filter((m): m is OllamaModel => m !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function parsePullLine(line: string, previous: PullProgress | null): PullProgress | null {
  const text = line.trim();
  if (!text) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const item = json as {
    status?: unknown;
    error?: unknown;
    total?: unknown;
    completed?: unknown;
  };
  if (typeof item.error === "string") throw new Error(item.error);
  const total = typeof item.total === "number" ? item.total : (previous?.totalBytes ?? 0);
  const completed = typeof item.completed === "number" ? item.completed : 0;
  const status = typeof item.status === "string" ? item.status : (previous?.status ?? "");
  const progress =
    total > 0 ? Math.min(1, completed / total) : /success/i.test(status) ? 1 : (previous?.progress ?? 0);
  return { progress, status, completedBytes: completed, totalBytes: total };
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`Ollama respondeu ${response.status}`);
  return response.json();
}

export async function checkOllama(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<OllamaHealth> {
  const base = normalizeOllamaBaseUrl(baseUrl);
  try {
    const [tags, version] = await Promise.all([
      fetchImpl(`${base}/api/tags`, { signal }).then(readJson),
      fetchImpl(`${base}/api/version`, { signal })
        .then(readJson)
        .catch(() => null),
    ]);
    return {
      reachable: true,
      version:
        typeof (version as { version?: unknown })?.version === "string"
          ? ((version as { version: string }).version)
          : null,
      models: parseOllamaTags(tags),
      error: null,
    };
  } catch (error) {
    return { reachable: false, version: null, models: [], error: (error as Error).message };
  }
}

/**
 * Downloads a model onto the user's machine, streaming NDJSON progress.
 * Fails loudly — the caller shows the error instead of silently degrading.
 */
export async function pullOllamaModel(
  baseUrl: string,
  model: string,
  onProgress: (progress: PullProgress) => void,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const base = normalizeOllamaBaseUrl(baseUrl);
  const response = await fetchImpl(`${base}/api/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, stream: true }),
    signal,
  });
  if (!response.ok) throw new Error(`Ollama respondeu ${response.status} ao baixar ${model}`);
  if (!response.body) throw new Error("Resposta de download sem corpo.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last: PullProgress | null = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const parsed = parsePullLine(line, last);
      if (parsed) {
        last = parsed;
        onProgress(parsed);
      }
    }
  }
  const tail = parsePullLine(buffer, last);
  if (tail) onProgress(tail);
}
