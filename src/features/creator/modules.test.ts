import { describe, expect, it } from "vitest";
import type { ComponentStatus, CreatorEngines } from "@/core/runtime/types";
import { describeGaps, missingCreatorModules } from "./modules";

const ready: CreatorEngines = { ffmpeg: true, narration: true, images: true, llm: true };

function component(id: ComponentStatus["id"], state: ComponentStatus["state"]): ComponentStatus {
  return { id, name: id, description: "", state };
}

describe("missingCreatorModules", () => {
  it("asks for nothing when every engine the render needs is ready", () => {
    expect(missingCreatorModules(ready, { narrate: true, images: true })).toEqual([]);
  });

  it("only installs narration when images are not requested", () => {
    const gaps = missingCreatorModules(
      { ...ready, narration: false, images: false },
      { narrate: true, images: false },
    );
    expect(gaps.map((gap) => gap.id)).toEqual(["piper", "piper-voice"]);
  });

  it("only installs images when narration is off", () => {
    const gaps = missingCreatorModules(
      { ...ready, narration: false, images: false },
      { narrate: false, images: true },
    );
    expect(gaps.map((gap) => gap.id)).toEqual(["stable-diffusion", "sd-model"]);
  });

  it("skips the pieces already installed", () => {
    const gaps = missingCreatorModules(
      { ...ready, narration: false },
      { narrate: true, images: false },
      [component("piper", "ready"), component("piper-voice", "missing")],
    );
    expect(gaps.map((gap) => gap.id)).toEqual(["piper-voice"]);
  });

  it("includes FFmpeg when the montage engine is missing", () => {
    const gaps = missingCreatorModules(
      { ...ready, ffmpeg: false },
      { narrate: false, images: false },
    );
    expect(gaps.map((gap) => gap.id)).toEqual(["ffmpeg", "ffprobe"]);
  });

  it("treats an unknown engine state as everything missing", () => {
    const gaps = missingCreatorModules(null, { narrate: true, images: true });
    expect(gaps).toHaveLength(6);
    expect(describeGaps(gaps)).toContain("Montador de vídeo");
  });
});
