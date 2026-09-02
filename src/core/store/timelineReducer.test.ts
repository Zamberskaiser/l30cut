import { describe, expect, it } from "vitest";
import { activeSequence, clipDuration, clipEnd, SECOND } from "@/core/contracts/domain";
import { createDemoProject } from "@/core/demo/demoProject";
import { applyCommand, applyTransaction, emptyHistory, redo, undo } from "./timelineReducer";

const project = () => createDemoProject();

describe("timeline commands", () => {
  it("splits a clip into two contiguous clips without changing total duration", () => {
    const before = project();
    const clip = activeSequence(before).clips[0];
    const at = clip.startUs + Math.floor(clipDuration(clip) / 2);
    const after = applyCommand(before, { type: "splitClip", clipId: clip.id, atUs: at });
    const seq = activeSequence(after);
    const parts = seq.clips.filter((c) => c.trackId === clip.trackId);
    expect(parts.length).toBe(activeSequence(before).clips.filter((c) => c.trackId === clip.trackId).length + 1);
    const total = parts.reduce((sum, c) => sum + clipDuration(c), 0);
    const originalTotal = activeSequence(before)
      .clips.filter((c) => c.trackId === clip.trackId)
      .reduce((sum, c) => sum + clipDuration(c), 0);
    expect(total).toBe(originalTotal);
  });

  it("never mutates the input project", () => {
    const before = project();
    const snapshot = JSON.stringify(before);
    const clip = activeSequence(before).clips[0];
    applyCommand(before, { type: "changeGain", clipId: clip.id, gainDb: -8 });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("rejects a split outside the clip bounds", () => {
    const before = project();
    const clip = activeSequence(before).clips[0];
    expect(() => applyCommand(before, { type: "splitClip", clipId: clip.id, atUs: clipEnd(clip) })).toThrow();
  });

  it("rejects unknown clip ids", () => {
    expect(() => applyCommand(project(), { type: "deleteClip", clipId: "nope" })).toThrow();
  });

  it("ripple delete closes the gap left by the removed clip", () => {
    const before = project();
    const seq = activeSequence(before);
    const track = seq.tracks.find((t) => t.kind === "video")!;
    const clips = seq.clips.filter((c) => c.trackId === track.id).sort((a, b) => a.startUs - b.startUs);
    if (clips.length < 2) return;
    const removed = clips[0];
    const after = applyCommand(before, { type: "rippleDelete", clipId: removed.id });
    const nextAfter = activeSequence(after).clips.find((c) => c.id === clips[1].id)!;
    expect(nextAfter.startUs).toBe(clips[1].startUs - clipDuration(removed));
  });

  it("applies a transaction atomically: one bad command rolls back everything", () => {
    const before = project();
    const clip = activeSequence(before).clips[0];
    expect(() =>
      applyTransaction(before, emptyHistory, {
        label: "misto",
        source: "ai",
        commands: [
          { type: "changeGain", clipId: clip.id, gainDb: -3 },
          { type: "deleteClip", clipId: "missing" },
        ],
      }),
    ).toThrow();
  });

  it("undo and redo restore exact snapshots", () => {
    const before = project();
    const clip = activeSequence(before).clips[0];
    const result = applyTransaction(before, emptyHistory, {
      label: "ganho",
      source: "user",
      commands: [{ type: "changeGain", clipId: clip.id, gainDb: -6 }],
    });
    const undone = undo(result.history)!;
    expect(JSON.stringify(undone.project)).toBe(JSON.stringify(before));
    const redone = redo(undone.history)!;
    expect(JSON.stringify(redone.project)).toBe(JSON.stringify(result.project));
  });

  it("changes the sequence aspect without touching clips", () => {
    const before = project();
    const after = applyCommand(before, { type: "setSequenceAspect", aspect: "9:16" });
    expect(activeSequence(after).aspect).toBe("9:16");
    expect(activeSequence(after).clips.length).toBe(activeSequence(before).clips.length);
  });

  it("keeps timecodes as integer microseconds after a trim", () => {
    const before = project();
    const clip = activeSequence(before).clips[0];
    const after = applyCommand(before, {
      type: "trimClip",
      clipId: clip.id,
      sourceInUs: clip.sourceInUs + SECOND / 2,
    });
    const trimmed = activeSequence(after).clips.find((c) => c.id === clip.id)!;
    expect(Number.isInteger(trimmed.sourceInUs)).toBe(true);
  });
});
