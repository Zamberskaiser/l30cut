import { describe, expect, it } from "vitest";
import { activeSequence } from "@/core/contracts/domain";
import { createDemoProject } from "@/core/demo/demoProject";
import { clipTrackerFilters, clipVideoFilters } from "./ffmpegFilters";

const baseClip = () => activeSequence(createDemoProject()).clips[0]!;

describe("ffmpeg effect filters", () => {
  it("renders chroma key and fades deterministically", () => {
    const clip = {
      ...baseClip(),
      chroma: {
        enabled: true,
        colorHex: "#00b140",
        similarity: 0.35,
        smoothness: 0.08,
        spill: 0.1,
      },
      transitionIn: { kind: "fade" as const, durationUs: 500_000 },
      transitionOut: { kind: "dip" as const, durationUs: 500_000 },
    };
    const filters = clipVideoFilters(clip);
    expect(filters[0]).toBe("colorkey=0x00b140:0.350:0.080");
    expect(filters[1]).toBe("despill=type=green:mix=0.100");
    expect(filters[2]).toBe("fade=t=in:st=0:d=0.500");
    expect(filters[3]).toMatch(/^fade=t=out:st=\d+\.\d{3}:d=0\.500:color=black$/);
    expect(clipVideoFilters(baseClip())).toEqual([]);
  });

  it("emits one timed blur segment per tracker point", () => {
    const clip = {
      ...baseClip(),
      tracker: {
        enabled: true,
        target: "pixelate" as const,
        label: "",
        points: [
          { atUs: 0, x: 0.25, y: 0.5, w: 0.1, h: 0.2 },
          { atUs: 1_000_000, x: 0.5, y: 0.5, w: 0.1, h: 0.2 },
        ],
      },
    };
    const filters = clipTrackerFilters(clip, 1920, 1080);
    expect(filters.length).toBe(2);
    expect(filters[0]).toContain("pixelize=w=192:h=216:x=480:y=540");
    expect(filters[0]).toContain("between(t,0.000,1.000)");
    expect(clipTrackerFilters(baseClip(), 1920, 1080)).toEqual([]);
  });
});
