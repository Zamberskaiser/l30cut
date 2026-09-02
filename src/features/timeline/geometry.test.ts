import { describe, expect, it } from "vitest";
import { SECOND, type Sequence } from "@/core/contracts/domain";
import { applySnap, clipZoneAt, pxToUs, snapTargets, usToPx } from "./geometry";

const sequence: Sequence = {
  id: "seq",
  name: "Seq",
  aspect: "16:9",
  fpsNum: 30,
  fpsDen: 1,
  tracks: [
    { id: "v1", kind: "video", name: "V1", muted: false, locked: false },
    { id: "a1", kind: "audio", name: "A1", muted: false, locked: true },
  ],
  clips: [
    {
      id: "c1",
      trackId: "v1",
      assetId: "asset",
      label: "",
      startUs: 0,
      sourceInUs: 0,
      sourceOutUs: 2 * SECOND,
      gainDb: 0,
      enabled: true,
    },
    {
      id: "c2",
      trackId: "v1",
      assetId: "asset",
      label: "",
      startUs: 5 * SECOND,
      sourceInUs: 0,
      sourceOutUs: SECOND,
      gainDb: 0,
      enabled: true,
    },
  ],
  captions: [],
  markers: [{ id: "m1", atUs: 8 * SECOND, label: "m", color: "accent" }],
};

describe("coordinates", () => {
  it("converts px and microseconds symmetrically", () => {
    expect(usToPx(2 * SECOND, 30)).toBe(60);
    expect(pxToUs(60, 30)).toBe(2 * SECOND);
  });
});

describe("snap", () => {
  it("collects deterministic targets and excludes dragged clips", () => {
    const targets = snapTargets({ sequence, playheadUs: 3 * SECOND, inOutUs: [1 * SECOND, 4 * SECOND] });
    expect(targets).toEqual([0, SECOND, 2 * SECOND, 3 * SECOND, 4 * SECOND, 5 * SECOND, 6 * SECOND, 8 * SECOND]);
    const withoutC2 = snapTargets({ sequence, playheadUs: 0, inOutUs: null, excludeClipIds: ["c2"] });
    expect(withoutC2).toEqual([0, 2 * SECOND, 8 * SECOND]);
  });

  it("snaps to the nearest target inside tolerance only", () => {
    const targets = [0, 5 * SECOND];
    expect(applySnap(5 * SECOND + 1000, targets, 50_000)).toEqual({
      us: 5 * SECOND,
      snappedTo: 5 * SECOND,
    });
    expect(applySnap(3 * SECOND, targets, 50_000)).toEqual({ us: 3 * SECOND, snappedTo: null });
  });
});

describe("hit testing", () => {
  it("maps pointer offsets to trim handles and body", () => {
    expect(clipZoneAt(2, 200)).toBe("start");
    expect(clipZoneAt(100, 200)).toBe("body");
    expect(clipZoneAt(198, 200)).toBe("end");
    // tiny clips still expose usable handles without losing the body
    expect(clipZoneAt(5, 12)).toBe("body");
  });
});
