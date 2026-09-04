import { describe, expect, it } from "vitest";
import { findAssetByName, resolveReferences, type ReferenceScene } from "./reference";

const scene: ReferenceScene = {
  clips: [
    { id: "clip_a", assetId: "asset_1", label: "Abertura", startUs: 0 },
    { id: "clip_b", assetId: "asset_2", label: "Entrevista", startUs: 5_000_000 },
    { id: "clip_c", assetId: "asset_2", label: "Final", startUs: 10_000_000 },
  ],
  assets: [
    { id: "asset_1", name: "abertura.mp4", kind: "video" },
    { id: "asset_2", name: "entrevista.mp4", kind: "video" },
  ],
  selection: [],
  playheadUs: 7_000_000,
};

describe("resolveReferences", () => {
  it('turns "aqui" into the playhead position and the clip under it', () => {
    const hints = resolveReferences("corta aqui", scene);
    expect(hints.atUs).toBe(7_000_000);
    expect(hints.clipIds).toEqual(["clip_b"]);
  });

  it("understands an ordinal", () => {
    expect(resolveReferences("apaga o segundo pedaço", scene).clipIds).toEqual(["clip_b"]);
    expect(resolveReferences("deixa só o primeiro", scene).clipIds).toEqual(["clip_a"]);
  });

  it('resolves "esse" to the current selection', () => {
    const hints = resolveReferences("aumenta o som desse", { ...scene, selection: ["clip_c"] });
    expect(hints.clipIds).toEqual(["clip_c"]);
    expect(hints.assetId).toBe("asset_2");
  });

  it("finds a file by name even without the extension", () => {
    expect(findAssetByName("sobe o volume da entrevista", scene.assets)).toBe("asset_2");
    expect(findAssetByName("nada a ver", scene.assets)).toBeUndefined();
  });
});
