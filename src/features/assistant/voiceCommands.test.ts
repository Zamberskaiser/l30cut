import { describe, expect, it } from "vitest";
import { parseQuickCommand } from "./voiceCommands";

describe("parseQuickCommand", () => {
  it("catches the three urgent commands, with or without accents", () => {
    expect(parseQuickCommand("pare de falar")).toBe("stopSpeaking");
    expect(parseQuickCommand("cancele a exportação")).toBe("cancel");
    expect(parseQuickCommand("desfaça")).toBe("undo");
    expect(parseQuickCommand("desfaca!")).toBe("undo");
    expect(parseQuickCommand("refazer")).toBe("redo");
  });

  it("leaves a real request alone", () => {
    expect(parseQuickCommand("crie um vídeo sobre pesca")).toBeNull();
    expect(parseQuickCommand("pare de falar sobre o produto no final")).toBeNull();
  });
});
