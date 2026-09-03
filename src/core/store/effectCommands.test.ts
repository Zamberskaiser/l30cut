import { describe, expect, it } from "vitest";
import {
  activeSequence,
  clipDuration,
  clipTransitionOpacityAt,
  trackerBoxAt,
} from "@/core/contracts/domain";
import { createDemoProject } from "@/core/demo/demoProject";
import { applyCommand, CommandError } from "./timelineReducer";

const project = () => createDemoProject();
const firstClip = (p = project()) => activeSequence(p).clips[0]!;

describe("effect commands", () => {
  it("sets and removes edge transitions", () => {
    const before = project();
    const clip = activeSequence(before).clips[0]!;
    const withFade = applyCommand(before, {
      type: "setClipTransition",
      clipId: clip.id,
      edge: "in",
      transition: { kind: "fade", durationUs: 400_000 },
    });
    const edited = activeSequence(withFade).clips.find((c) => c.id === clip.id)!;
    expect(edited.transitionIn).toEqual({ kind: "fade", durationUs: 400_000 });

    const removed = applyCommand(withFade, {
      type: "setClipTransition",
      clipId: clip.id,
      edge: "in",
      transition: null,
    });
    expect(
      activeSequence(removed).clips.find((c) => c.id === clip.id)!.transitionIn,
    ).toBeUndefined();
  });

  it("rejects a transition longer than half the clip", () => {
    const before = project();
    const clip = activeSequence(before).clips[0]!;
    expect(() =>
      applyCommand(before, {
        type: "setClipTransition",
        clipId: clip.id,
        edge: "out",
        transition: { kind: "cross", durationUs: clipDuration(clip) },
      }),
    ).toThrow(CommandError);
  });

  it("interpolates the transition opacity ramp", () => {
    const clip = {
      ...firstClip(),
      transitionIn: { kind: "fade" as const, durationUs: 400_000 },
    };
    expect(clipTransitionOpacityAt(clip, 0)).toBe(0);
    expect(clipTransitionOpacityAt(clip, 200_000)).toBeCloseTo(0.5, 5);
    expect(clipTransitionOpacityAt(clip, 400_000)).toBe(1);
  });

  it("stores chroma key only on video clips and clears it with null", () => {
    const before = project();
    const clip = activeSequence(before).clips.find(
      (c) => activeSequence(before).tracks.find((t) => t.id === c.trackId)!.kind === "video",
    )!;
    const keyed = applyCommand(before, {
      type: "setClipChromaKey",
      clipId: clip.id,
      chroma: {
        enabled: true,
        colorHex: "#00b140",
        similarity: 0.4,
        smoothness: 0.1,
        spill: 0.2,
      },
    });
    expect(activeSequence(keyed).clips.find((c) => c.id === clip.id)!.chroma?.colorHex).toBe(
      "#00b140",
    );

    const audioClip = activeSequence(before).clips.find(
      (c) => activeSequence(before).tracks.find((t) => t.id === c.trackId)!.kind === "audio",
    );
    if (audioClip) {
      expect(() =>
        applyCommand(before, {
          type: "setClipChromaKey",
          clipId: audioClip.id,
          chroma: {
            enabled: true,
            colorHex: "#00b140",
            similarity: 0.4,
            smoothness: 0.1,
            spill: 0.2,
          },
        }),
      ).toThrow(CommandError);
    }

    const cleared = applyCommand(keyed, {
      type: "setClipChromaKey",
      clipId: clip.id,
      chroma: null,
    });
    expect(activeSequence(cleared).clips.find((c) => c.id === clip.id)!.chroma).toBeUndefined();
  });

  it("stores sorted tracker points and rejects points beyond the clip", () => {
    const before = project();
    const clip = activeSequence(before).clips[0]!;
    const tracked = applyCommand(before, {
      type: "setClipTracker",
      clipId: clip.id,
      tracker: {
        enabled: true,
        target: "blur",
        label: "",
        points: [
          { atUs: 200_000, x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
          { atUs: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
        ],
      },
    });
    const tracker = activeSequence(tracked).clips.find((c) => c.id === clip.id)!.tracker!;
    expect(tracker.points.map((p) => p.atUs)).toEqual([0, 200_000]);
    const box = trackerBoxAt(tracker, 100_000)!;
    expect(box.x).toBeCloseTo(0.3, 5);

    expect(() =>
      applyCommand(before, {
        type: "setClipTracker",
        clipId: clip.id,
        tracker: {
          enabled: true,
          target: "blur",
          label: "",
          points: [{ atUs: clipDuration(clip) + 1_000_000, x: 0.5, y: 0.5, w: 0.2, h: 0.2 }],
        },
      }),
    ).toThrow(CommandError);
  });
});
