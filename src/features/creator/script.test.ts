import { describe, expect, it } from "vitest";
import {
  buildScriptPrompt,
  estimateDurationUs,
  fallbackScenes,
  parseScriptJson,
  totalDurationUs,
} from "./script";

describe("creator script", () => {
  it("cria uma cena por bloco do briefing sem depender de IA", () => {
    const scenes = fallbackScenes(
      "Uma cidade ao amanhecer. O trânsito acorda. As luzes apagam.",
      3,
    );
    expect(scenes).toHaveLength(3);
    expect(scenes[0]!.narration).toContain("cidade");
    expect(totalDurationUs(scenes)).toBeGreaterThan(0);
    expect(new Set(scenes.map((s) => s.id)).size).toBe(3);
  });

  it("devolve vazio para briefing vazio", () => {
    expect(fallbackScenes("   ", 4)).toEqual([]);
  });

  it("cada cena tem no mínimo 2,4 s de duração", () => {
    expect(estimateDurationUs("oi")).toBe(2_400_000);
  });

  it("extrai JSON mesmo com texto em volta", () => {
    const scenes = parseScriptJson(
      'Claro! ```json {"scenes":[{"title":"Abertura","narration":"Bem-vindo ao canal.","imagePrompt":"sunrise"}]} ```',
    );
    expect(scenes).not.toBeNull();
    expect(scenes![0]!.title).toBe("Abertura");
    expect(scenes![0]!.imagePrompt).toBe("sunrise");
  });

  it("rejeita resposta sem cenas utilizáveis", () => {
    expect(parseScriptJson("desculpe, não sei")).toBeNull();
    expect(parseScriptJson('{"scenes":[]}')).toBeNull();
  });

  it("leva a personalidade da Cut ao roteirista local", () => {
    const prompt = buildScriptPrompt("um computador", 2);
    expect(prompt).toContain("Você escreve como a Cut");
    expect(prompt).toContain("português do Brasil");
    expect(prompt).toContain("exatamente 2 cenas");
  });
});
