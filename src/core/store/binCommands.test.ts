import { describe, expect, it } from "vitest";
import { binTree, binWithDescendants, isBinInside } from "@/core/contracts/domain";
import { createDemoProject } from "@/core/demo/demoProject";
import { applyCommand, CommandError } from "./timelineReducer";

const project = () => createDemoProject();

describe("media bin commands", () => {
  it("creates nested bins and lists them depth-first", () => {
    let p = applyCommand(project(), { type: "createBin", binId: "bin_a", name: "Câmera A" });
    p = applyCommand(p, {
      type: "createBin",
      binId: "bin_a1",
      name: "Take 1",
      parentId: "bin_a",
    });
    const rows = binTree(p.bins);
    const a = rows.findIndex((r) => r.bin.id === "bin_a");
    const a1 = rows.findIndex((r) => r.bin.id === "bin_a1");
    expect(a1).toBe(a + 1);
    expect(rows[a1]!.depth).toBe(1);
    expect(binWithDescendants(p.bins, "bin_a").sort()).toEqual(["bin_a", "bin_a1"]);
    expect(() =>
      applyCommand(p, { type: "createBin", binId: "bin_a", name: "Duplicada" }),
    ).toThrow(CommandError);
  });

  it("moves assets between bins and back to the root", () => {
    const before = project();
    const assetId = before.assets[0]!.id;
    const moved = applyCommand(before, {
      type: "moveAssetsToBin",
      assetIds: [assetId],
      binId: "bin_trilhas",
    });
    expect(moved.assets[0]!.binId).toBe("bin_trilhas");

    const root = applyCommand(moved, {
      type: "moveAssetsToBin",
      assetIds: [assetId],
      binId: null,
    });
    expect(root.assets[0]!.binId).toBeUndefined();

    expect(() =>
      applyCommand(before, { type: "moveAssetsToBin", assetIds: [assetId], binId: "bin_x" }),
    ).toThrow(CommandError);
  });

  it("refuses to move a bin inside its own subtree", () => {
    const p = applyCommand(project(), {
      type: "moveBin",
      binId: "bin_trilhas",
      parentId: "bin_brutos",
    });
    expect(p.bins.find((b) => b.id === "bin_trilhas")!.parentId).toBe("bin_brutos");
    expect(isBinInside(p.bins, "bin_trilhas", "bin_brutos")).toBe(true);
    expect(() =>
      applyCommand(p, { type: "moveBin", binId: "bin_brutos", parentId: "bin_trilhas" }),
    ).toThrow(CommandError);
  });

  it("reparents children and assets when a bin is deleted", () => {
    let p = applyCommand(project(), {
      type: "createBin",
      binId: "bin_child",
      name: "Take 1",
      parentId: "bin_brutos",
    });
    p = applyCommand(p, {
      type: "moveAssetsToBin",
      assetIds: [p.assets[0]!.id],
      binId: "bin_child",
    });
    const deleted = applyCommand(p, { type: "deleteBin", binId: "bin_child" });
    expect(deleted.bins.some((b) => b.id === "bin_child")).toBe(false);
    expect(deleted.assets[0]!.binId).toBe("bin_brutos");

    const rootDeleted = applyCommand(deleted, { type: "deleteBin", binId: "bin_brutos" });
    expect(rootDeleted.assets[0]!.binId).toBeUndefined();
    expect(rootDeleted.sequences[0]!.clips.length).toBe(project().sequences[0]!.clips.length);
  });

  it("renames a bin without touching assets", () => {
    const p = applyCommand(project(), {
      type: "renameBin",
      binId: "bin_brutos",
      name: "Brutos 4K",
    });
    expect(p.bins.find((b) => b.id === "bin_brutos")!.name).toBe("Brutos 4K");
    expect(p.assets[0]!.binId).toBe("bin_brutos");
  });
});
