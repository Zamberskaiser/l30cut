import { describe, expect, it } from "vitest";
import {
  activeSequence,
  clipDuration,
  clipEnd,
  clipGainDbAt,
  dbToAmplitude,
  type Project,
} from "@/core/contracts/domain";
import { createDemoProject } from "@/core/demo/demoProject";
import { applyCommand } from "./timelineReducer";

/** Links the demo video clip to a matching audio clip on A1. */
function linkedProject(): { project: Project; ids: [string, string] } {
  const base = createDemoProject();
  const a = activeSequence(base).clips[0]!;
  const withAudio = applyCommand(base, {
    type: "insertClip",
    clipId: "clip_audio",
    trackId: "a1",
    assetId: a.assetId,
    startUs: a.startUs,
    sourceInUs: a.sourceInUs,
    sourceOutUs: a.sourceOutUs,
    label: "entrevista_demo (A)",
  });
  const project = applyCommand(withAudio, {
    type: "linkClips",
    clipIds: [a.id, "clip_audio"],
  });
  return { project, ids: [a.id, "clip_audio"] };
}


const find = (project: Project, id: string) => activeSequence(project).clips.find((c) => c.id === id);

describe("A/V linked clips", () => {
  it("assigns a shared link group to the selected clips", () => {
    const { project, ids } = linkedProject();
    const a = find(project, ids[0])!;
    const b = find(project, ids[1])!;
    expect(a.linkGroupId).toBeTruthy();
    expect(a.linkGroupId).toBe(b.linkGroupId);
  });

  it("moves linked partners by the same offset", () => {
    const { project, ids } = linkedProject();
    const a = find(project, ids[0])!;
    const b = find(project, ids[1])!;
    const delta = 500_000;
    const after = applyCommand(project, {
      type: "moveClip",
      clipId: a.id,
      toStartUs: a.startUs + delta,
    });
    expect(find(after, ids[0])!.startUs).toBe(a.startUs + delta);
    expect(find(after, ids[1])!.startUs).toBe(b.startUs + delta);
  });

  it("deletes linked partners together", () => {
    const { project, ids } = linkedProject();
    const after = applyCommand(project, { type: "deleteClip", clipId: ids[0] });
    expect(find(after, ids[0])).toBeUndefined();
    expect(find(after, ids[1])).toBeUndefined();
  });

  it("unlinks the whole group", () => {
    const { project, ids } = linkedProject();
    const after = applyCommand(project, { type: "unlinkClips", clipId: ids[0] });
    expect(find(after, ids[0])!.linkGroupId).toBeUndefined();
    expect(find(after, ids[1])!.linkGroupId).toBeUndefined();
  });

  it("keeps a duplicate independent from the original group", () => {
    const { project, ids } = linkedProject();
    const before = activeSequence(project).clips.map((c) => c.id);
    const after = applyCommand(project, { type: "duplicateClip", clipId: ids[0] });
    const copy = activeSequence(after).clips.find((c) => !before.includes(c.id))!;
    expect(copy.linkGroupId).toBeUndefined();
  });

  it("splits a linked partner that overlaps the same timeline point", () => {
    const base = createDemoProject();
    const seq = activeSequence(base);
    const a = seq.clips[0]!;
    const twin = seq.clips.find(
      (c) => c.id !== a.id && c.startUs === a.startUs && clipEnd(c) === clipEnd(a),
    );
    const at = a.startUs + Math.floor(clipDuration(a) / 2);
    const project = twin
      ? applyCommand(base, { type: "linkClips", clipIds: [a.id, twin.id] })
      : base;
    const after = applyCommand(project, { type: "splitClip", clipId: a.id, atUs: at });
    expect(clipEnd(find(after, a.id)!)).toBe(at);
    if (twin) expect(clipEnd(find(after, twin.id)!)).toBe(at);
  });
});

describe("gain automation", () => {
  it("returns the static gain without keyframes", () => {
    const clip = activeSequence(createDemoProject()).clips[0]!;
    expect(clipGainDbAt(clip, 0)).toBe(clip.gainDb);
  });

  it("interpolates linearly between keyframes and clamps outside", () => {
    const clip = {
      ...activeSequence(createDemoProject()).clips[0]!,
      gainKeyframes: [
        { atUs: 0, gainDb: -12 },
        { atUs: 1_000_000, gainDb: 0 },
      ],
    };
    expect(clipGainDbAt(clip, -5)).toBe(-12);
    expect(clipGainDbAt(clip, 500_000)).toBeCloseTo(-6, 6);
    expect(clipGainDbAt(clip, 9_000_000)).toBe(0);
  });

  it("maps 0 dB to unity amplitude", () => {
    expect(dbToAmplitude(0)).toBe(1);
    expect(dbToAmplitude(-6)).toBeCloseTo(0.501, 3);
  });
});
