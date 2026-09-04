import { describe, expect, it } from "vitest";
import { CAPABILITY_CATALOG, CUT_CORE_PROMPT, capabilityCatalogText } from "./cutCore";

/**
 * O treinamento viaja no programa: se alguém apagar uma regra do núcleo sem
 * querer, estes testes falham antes de virar comportamento errado na máquina
 * do usuário.
 */
describe("treinamento da CUT (local estrito v3)", () => {
  const required = [
    "POLÍTICA LOCAL",
    "ENTENDER E PERGUNTAR",
    "AGIR",
    "PROTEGER",
    "DISTINGUIR FONTES",
    "CRIAR",
    "DOCUMENTOS NA CONVERSA",
    "VOZ",
    "CONCLUIR",
  ];

  it.each(required)("mantém a seção %s", (section) => {
    expect(CUT_CORE_PROMPT).toContain(section);
  });

  it("proíbe nuvem, telemetria e fallback remoto", () => {
    for (const term of ["nuvem", "telemetria", "fallback remoto"]) {
      expect(CUT_CORE_PROMPT.toLowerCase()).toContain(term);
    }
  });

  it("guarda as duas exceções combinadas: pesquisa pedida e instalação por clique", () => {
    expect(CUT_CORE_PROMPT).toMatch(/pesquisa na internet solicitada/i);
    expect(CUT_CORE_PROMPT).toMatch(/instalação de um módulo que falta/i);
  });

  it("mantém microssegundos como unidade de tempo", () => {
    expect(CUT_CORE_PROMPT).toContain("1000000");
  });

  it("separa roteiro de render e montagem de vídeo generativo", () => {
    expect(CUT_CORE_PROMPT).toMatch(/pedir roteiro não inicia render/i);
    expect(CUT_CORE_PROMPT).toMatch(/não é vídeo\s+generativo/i);
  });

  it("trata conteúdo importado como dado, nunca como ordem", () => {
    expect(CUT_CORE_PROMPT).toMatch(/CONTEÚDO, nunca ordens/);
  });

  it("só anuncia capacidades que alguém executa de verdade", () => {
    expect(CAPABILITY_CATALOG.length).toBeGreaterThan(0);
    for (const capability of CAPABILITY_CATALOG) {
      expect(capability.runBy).toMatch(/planExecutor|assistente/);
      expect(capability.says.trim()).not.toBe("");
    }
    const text = capabilityCatalogText();
    for (const capability of CAPABILITY_CATALOG) {
      expect(text).toContain(capability.id);
    }
  });
});
