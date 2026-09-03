import { describe, expect, it } from "vitest";
import type { MediaAsset, Sequence } from "@/core/contracts/domain";
import { insertAssetCommands } from "./insertAsset";

const sequence: Sequence = {
  id: "seq-1",
  name: "Sequência 1",
  aspect: "16:9",
  fpsNum: 30,
  fpsDen: 1,
  tracks: [
    { id: "v1", kind: "video", name: "V1", muted: false, locked: false },
    { id: "a1", kind: "audio", name: "A1", muted: false, locked: false },
  ],
  clips: [],
  markers: [],
  playheadUs: 0,
} as unknown as Sequence;

function asset(over: Partial<MediaAsset>): MediaAsset {
  return {
    id: "asset-1",
    kind: "video",
    name: "entrevista.mp4",
    path: "C:/videos/entrevista.mp4",
    durationUs: 10_000_000,
    width: 1920,
    height: 1080,
    fpsNum: 30,
    fpsDen: 1,
    audioChannels: 2,
    sizeBytes: 100,
    proxyReady: false,
    demo: false,
    ...over,
  } as MediaAsset;
}

describe("insertAssetCommands", () => {
  it("splits a video with audio into linked video + audio clips", () => {
    const commands = insertAssetCommands(asset({}), sequence, 1_000_000, "v1");
    expect(commands.filter((c) => c.type === "insertClip")).toHaveLength(2);
    const link = commands.find((c) => c.type === "linkClips");
    expect(link).toBeDefined();
    const tracks = commands
      .filter((c) => c.type === "insertClip")
      .map((c) => (c as { trackId: string }).trackId);
    expect(tracks).toEqual(["v1", "a1"]);
  });

  it("keeps a mute video on the video track only", () => {
    const commands = insertAssetCommands(asset({ audioChannels: 0 }), sequence, 0, "v1");
    expect(commands).toHaveLength(1);
    expect((commands[0] as { trackId: string }).trackId).toBe("v1");
  });

  it("puts audio-only media on an audio track", () => {
    const commands = insertAssetCommands(
      asset({ kind: "audio", name: "voz.wav" }),
      sequence,
      0,
      "a1",
    );
    expect(commands).toHaveLength(1);
    expect((commands[0] as { trackId: string }).trackId).toBe("a1");
  });
});
