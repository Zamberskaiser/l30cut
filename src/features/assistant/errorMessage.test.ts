import { describe, expect, it } from "vitest";
import { readableError } from "./errorMessage";

describe("readableError", () => {
  it("preserves string errors returned by Tauri", () => {
    expect(readableError("invalid mode txt2img")).toBe("invalid mode txt2img");
  });

  it("reads browser Error objects", () => {
    expect(readableError(new Error("modelo ausente"))).toBe("modelo ausente");
  });

  it("never leaks undefined into the conversation", () => {
    expect(readableError(undefined)).toBe("o motor local falhou sem informar o motivo");
  });
});