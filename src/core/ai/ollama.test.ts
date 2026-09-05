import { describe, expect, it } from "vitest";
import {
  RECOMMENDED_OLLAMA_MODELS,
  checkOllama,
  hasModel,
  normalizeOllamaBaseUrl,
  ollamaChatEndpoint,
  parseOllamaTags,
  parsePullLine,
  pullOllamaModel,
  verifyGenerativeSetup,
  type PullProgress,
} from "./ollama";
import { DEFAULT_LLM_SETTINGS, LlmSettingsSchema, isGenerativeReady } from "./llmSettings";

describe("ollama base url", () => {
  it("normalizes trailing slashes and api suffixes", () => {
    expect(normalizeOllamaBaseUrl("http://127.0.0.1:11434/")).toBe("http://127.0.0.1:11434");
    expect(normalizeOllamaBaseUrl("http://localhost:11434/v1")).toBe("http://localhost:11434");
    expect(normalizeOllamaBaseUrl("http://localhost:11434/api/tags")).toBe(
      "http://localhost:11434",
    );
    expect(normalizeOllamaBaseUrl("")).toBe("http://127.0.0.1:11434");
  });

  it("builds the OpenAI-compatible endpoint", () => {
    expect(ollamaChatEndpoint("http://127.0.0.1:11434/")).toBe(
      "http://127.0.0.1:11434/v1/chat/completions",
    );
  });
});

describe("parseOllamaTags", () => {
  it("maps and sorts installed models", () => {
    const models = parseOllamaTags({
      models: [
        { name: "llama3.1:8b", size: 4_900_000_000, details: { parameter_size: "8B" } },
        {
          model: "qwen2.5:3b-instruct",
          size: 1_900_000_000,
          details: { parameter_size: "3B", quantization_level: "Q4_K_M" },
        },
        { size: 1 },
      ],
    });
    expect(models.map((m) => m.name)).toEqual(["llama3.1:8b", "qwen2.5:3b-instruct"]);
    expect(models[1]?.quantization).toBe("Q4_K_M");
    expect(models[0]?.quantization).toBeNull();
  });

  it("tolerates garbage payloads", () => {
    expect(parseOllamaTags(null)).toEqual([]);
    expect(parseOllamaTags({ models: "nope" })).toEqual([]);
  });
});

describe("parsePullLine", () => {
  it("computes progress from completed/total", () => {
    const first = parsePullLine(
      JSON.stringify({ status: "downloading", total: 1000, completed: 250 }),
      null,
    );
    expect(first?.progress).toBeCloseTo(0.25);
    const second = parsePullLine(JSON.stringify({ status: "success" }), first);
    expect(second?.progress).toBe(1);
  });

  it("ignores blank and malformed lines and throws on errors", () => {
    expect(parsePullLine("  ", null)).toBeNull();
    expect(parsePullLine("{not json", null)).toBeNull();
    expect(() => parsePullLine(JSON.stringify({ error: "model not found" }), null)).toThrow(
      /model not found/,
    );
  });
});

describe("checkOllama", () => {
  it("reports reachable servers with models", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/tags")) {
        return new Response(JSON.stringify({ models: [{ name: "llama3.1:8b", size: 10 }] }));
      }
      return new Response(JSON.stringify({ version: "0.5.0" }));
    }) as typeof fetch;
    const health = await checkOllama("http://127.0.0.1:11434", fetchImpl);
    expect(health.reachable).toBe(true);
    expect(health.version).toBe("0.5.0");
    expect(health.models).toHaveLength(1);
  });

  it("never throws when the server is offline", async () => {
    const fetchImpl = (async () => {
      throw new Error("connection refused");
    }) as typeof fetch;
    const health = await checkOllama("http://127.0.0.1:11434", fetchImpl);
    expect(health.reachable).toBe(false);
    expect(health.error).toMatch(/refused/);
    expect(health.models).toEqual([]);
  });
});

describe("pullOllamaModel", () => {
  it("streams NDJSON progress to the sink", async () => {
    const chunks = [
      '{"status":"pulling manifest"}\n{"status":"downloading","total":100,"completed":50}\n',
      '{"status":"downloading","total":100,"completed":100}\n{"status":"success"}',
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    const fetchImpl = (async () => new Response(body)) as typeof fetch;
    const seen: PullProgress[] = [];
    await pullOllamaModel(
      "http://127.0.0.1:11434",
      "llama3.1:8b",
      (p) => seen.push(p),
      undefined,
      fetchImpl,
    );
    expect(seen.at(-1)?.progress).toBe(1);
    expect(seen.some((p) => p.progress === 0.5)).toBe(true);
  });

  it("fails loudly on HTTP errors", async () => {
    const fetchImpl = (async () => new Response("no", { status: 500 })) as typeof fetch;
    await expect(
      pullOllamaModel("http://127.0.0.1:11434", "x", () => {}, undefined, fetchImpl),
    ).rejects.toThrow(/500/);
  });
});

describe("llm settings", () => {
  it("defaults to deterministic rules with no model", () => {
    expect(DEFAULT_LLM_SETTINGS.enabled).toBe(false);
    expect(isGenerativeReady(DEFAULT_LLM_SETTINGS)).toBe(false);
  });

  it("requires both enabled and a model", () => {
    expect(isGenerativeReady({ ...DEFAULT_LLM_SETTINGS, enabled: true, model: "" })).toBe(false);
    expect(isGenerativeReady({ ...DEFAULT_LLM_SETTINGS, enabled: true })).toBe(true);
  });

  it("defaults to the product model (Llama 3.1 8B), disabled until opt-in", () => {
    expect(DEFAULT_LLM_SETTINGS.model).toBe("llama3.1:8b");
    expect(DEFAULT_LLM_SETTINGS.enabled).toBe(false);
    expect(isGenerativeReady(DEFAULT_LLM_SETTINGS)).toBe(false);
  });

  it("rejects unknown fields and providers", () => {
    expect(LlmSettingsSchema.safeParse({ provider: "openai" }).success).toBe(false);
    expect(LlmSettingsSchema.safeParse({ apiKey: "secret" }).success).toBe(false);
  });

  it("recommends only local models with ids", () => {
    expect(RECOMMENDED_OLLAMA_MODELS.every((m) => m.id.includes(":"))).toBe(true);
  });
});

describe("verificação do motor generativo", () => {
  it("exige servidor aberto e modelo instalado", async () => {
    const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    const withModels = (async (url: string) =>
      String(url).includes("/api/tags")
        ? reply({ models: [{ name: "llama3.1:8b", size: 1 }] })
        : reply({ version: "0.5.0" })) as unknown as typeof fetch;
    const offline = (async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;

    expect((await verifyGenerativeSetup("http://127.0.0.1:11434", "llama3.1:8b", withModels)).ok).toBe(true);
    expect((await verifyGenerativeSetup("http://127.0.0.1:11434", "qwen2.5:7b", withModels)).ok).toBe(false);
    const down = await verifyGenerativeSetup("http://127.0.0.1:11434", "llama3.1:8b", offline);
    expect(down.ok).toBe(false);
    expect(down.reason).toContain("Ollama não respondeu");
  });

  it("aceita o modelo mesmo sem a etiqueta exata", () => {
    expect(hasModel([{ name: "llama3.1:8b", sizeBytes: 0, parameterSize: null, quantization: null }], "llama3.1")).toBe(true);
    expect(hasModel([], "llama3.1")).toBe(false);
  });
});
