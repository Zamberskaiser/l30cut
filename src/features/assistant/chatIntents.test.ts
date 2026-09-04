import { describe, expect, it } from "vitest";
import { detectChatIntent, parseSceneCount } from "./chatIntents";

describe("detectChatIntent", () => {
  it("routes video creation", () => {
    const intent = detectChatIntent("crie um vídeo com 6 cenas sobre pesca esportiva");
    expect(intent.kind).toBe("video");
    expect(intent.sceneCount).toBe(6);
    expect(intent.subject).toContain("pesca");
  });

  it("routes image creation", () => {
    const intent = detectChatIntent("gera uma imagem de um barco ao amanhecer");
    expect(intent.kind).toBe("image");
    expect(intent.subject).toBe("um barco ao amanhecer");
  });

  it("routes web research", () => {
    expect(detectChatIntent("pesquise na internet preço de drones").kind).toBe("search");
    expect(detectChatIntent("procure referências de thumbnails de games").kind).toBe("search");
  });

  it("routes transcription", () => {
    expect(detectChatIntent("transcreva o áudio da entrevista").kind).toBe("transcribe");
  });

  it("keeps timeline edits on the editing path", () => {
    expect(detectChatIntent("remova pausas maiores que 700 ms").kind).toBe("edit");
    expect(detectChatIntent("aumenta o som do entrevista em 4 dB").kind).toBe("edit");
    expect(detectChatIntent("corte o vídeo em 6 partes de 30s").kind).toBe("edit");
  });

  it("reads the scene count only when stated", () => {
    expect(parseSceneCount("3 cenas")).toBe(3);
    expect(parseSceneCount("sem número")).toBeUndefined();
    expect(parseSceneCount("99 cenas")).toBe(12);
  });
});

describe("typos", () => {
  it("understands a misspelled picture request", () => {
    const intent = detectChatIntent("cria uma iagem para mim de uma pessoa no celular");
    expect(intent.kind).toBe("image");
    expect(intent.subject).toContain("pessoa no celular");
  });

  it("keeps edit requests out of the image path", () => {
    expect(detectChatIntent("crie 6 cortes de 30 a 60 segundos").kind).toBe("edit");
  });
});
