import { describe, expect, it } from "vitest";
import { activeSequence } from "@/core/contracts/domain";
import { createDemoProject } from "@/core/demo/demoProject";
import { applyCommand, CommandError } from "./timelineReducer";

const project = () => createDemoProject();

describe("multi-sequence commands", () => {
  it("creates and activates a new empty sequence keeping the existing one intact", () => {
    const before = project();
    const after = applyCommand(before, {
      type: "createSequence",
      sequenceId: "seq_two",
      name: "Sequência 2",
      aspect: "9:16",
      activate: true,
    });
    expect(after.sequences.length).toBe(before.sequences.length + 1);
    expect(after.activeSequenceId).toBe("seq_two");
    expect(activeSequence(after).clips.length).toBe(0);
    expect(after.sequences[0]!.clips.length).toBe(before.sequences[0]!.clips.length);
  });

  it("switches, renames and duplicates sequences with fresh clip ids", () => {
    let p = applyCommand(project(), {
      type: "duplicateSequence",
      sequenceId: project().activeSequenceId,
      newSequenceId: "seq_copy",
      name: "Cópia",
      activate: true,
    });
    const original = p.sequences[0]!;
    const copy = p.sequences.find((s) => s.id === "seq_copy")!;
    expect(copy.clips.length).toBe(original.clips.length);
    expect(copy.clips.some((c) => original.clips.some((o) => o.id === c.id))).toBe(false);

    p = applyCommand(p, { type: "setActiveSequence", sequenceId: original.id });
    expect(p.activeSequenceId).toBe(original.id);

    p = applyCommand(p, { type: "renameSequence", sequenceId: "seq_copy", name: "Vertical" });
    expect(p.sequences.find((s) => s.id === "seq_copy")!.name).toBe("Vertical");
  });

  it("deletes a sequence and falls back to a neighbour, never below one", () => {
    const withTwo = applyCommand(project(), {
      type: "createSequence",
      sequenceId: "seq_two",
      name: "Sequência 2",
      aspect: "16:9",
      activate: true,
    });
    const after = applyCommand(withTwo, { type: "deleteSequence", sequenceId: "seq_two" });
    expect(after.sequences.length).toBe(1);
    expect(after.activeSequenceId).toBe(after.sequences[0]!.id);
    expect(() =>
      applyCommand(after, { type: "deleteSequence", sequenceId: after.sequences[0]!.id }),
    ).toThrow(CommandError);
  });
});

describe("track commands", () => {
  it("inserts a track at the requested index", () => {
    const before = project();
    const after = applyCommand(before, {
      type: "addTrack",
      trackId: "track_v2",
      kind: "video",
      name: "V2",
      index: 1,
    });
    const tracks = activeSequence(after).tracks;
    expect(tracks.length).toBe(activeSequence(before).tracks.length + 1);
    expect(tracks[1]!.id).toBe("track_v2");
    expect(tracks[1]!.locked).toBe(false);
  });

  it("appends when no index is given and rejects duplicate ids", () => {
    const after = applyCommand(project(), {
      type: "addTrack",
      trackId: "track_a9",
      kind: "audio",
      name: "A9",
    });
    const tracks = activeSequence(after).tracks;
    expect(tracks[tracks.length - 1]!.id).toBe("track_a9");
    expect(() =>
      applyCommand(after, { type: "addTrack", trackId: "track_a9", kind: "audio", name: "A9" }),
    ).toThrow(CommandError);
  });

  it("removes a track together with its clips and renames tracks", () => {
    const before = project();
    const target = activeSequence(before).tracks[0]!;
    const after = applyCommand(before, { type: "removeTrack", trackId: target.id });
    const seq = activeSequence(after);
    expect(seq.tracks.some((t) => t.id === target.id)).toBe(false);
    expect(seq.clips.some((c) => c.trackId === target.id)).toBe(false);

    const renamed = applyCommand(after, {
      type: "renameTrack",
      trackId: seq.tracks[0]!.id,
      name: "Trilha principal",
    });
    expect(activeSequence(renamed).tracks[0]!.name).toBe("Trilha principal");
  });

  it("refuses to remove a locked track or an unknown track", () => {
    const before = project();
    const target = activeSequence(before).tracks[0]!;
    const locked = applyCommand(before, {
      type: "setTrackLock",
      trackId: target.id,
      locked: true,
    });
    expect(() => applyCommand(locked, { type: "removeTrack", trackId: target.id })).toThrow(
      CommandError,
    );
    expect(() => applyCommand(before, { type: "removeTrack", trackId: "nope" })).toThrow(
      CommandError,
    );
  });
});
