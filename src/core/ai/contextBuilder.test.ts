import { describe, expect, it } from "vitest";
import { createDemoProject } from "@/core/demo/demoProject";
import { DEFAULT_TRAINING_PROFILE } from "@/core/store/editorStore";
import { activeSequence } from "@/core/contracts/domain";
import { buildAssistantContext, CONTEXT_LIMITS } from "./contextBuilder";

const scope = { kind: "sequence" as const, clipIds: [] };

describe("buildAssistantContext", () => {
  it("is deterministic for identical inputs", () => {
    const project = createDemoProject();
    const a = buildAssistantContext(project, scope, DEFAULT_TRAINING_PROFILE, []);
    const b = buildAssistantContext(project, scope, DEFAULT_TRAINING_PROFILE, []);
    expect(JSON.stringify(a.context)).toBe(JSON.stringify(b.context));
  });

  it("never exposes filesystem paths", () => {
    const project = createDemoProject();
    const { context } = buildAssistantContext(project, scope, DEFAULT_TRAINING_PROFILE, []);
    const json = JSON.stringify(context);
    expect(json).not.toContain('"path"');
    for (const asset of project.assets) {
      if (asset.path.length > 0) expect(json).not.toContain(asset.path);
    }
  });

  it("respects the selection scope", () => {
    const project = createDemoProject();
    const seq = activeSequence(project);
    const first = seq.clips[0]!;
    const { context } = buildAssistantContext(
      project,
      { kind: "selection", clipIds: [first.id] },
      DEFAULT_TRAINING_PROFILE,
      [first.id],
    );
    expect(context.sequence.clips).toHaveLength(1);
    expect(context.sequence.clips[0]!.id).toBe(first.id);
    expect(context.sequence.clips[0]!.selected).toBe(true);
  });

  it("bounds transcript segments and characters", () => {
    const project = createDemoProject();
    const bloated = {
      ...project,
      transcript: Array.from({ length: 1000 }, (_, i) => ({
        id: `t_${i}`,
        assetId: project.assets[0]!.id,
        startUs: i * 1_000_000,
        endUs: i * 1_000_000 + 900_000,
        text: "palavra ".repeat(50),
        confidence: 0.9,
      })),
    };
    const { context, stats } = buildAssistantContext(
      bloated,
      scope,
      DEFAULT_TRAINING_PROFILE,
      [],
    );
    expect(context.transcript.length).toBeLessThanOrEqual(CONTEXT_LIMITS.maxTranscriptSegments);
    expect(context.transcriptTruncated).toBe(true);
    const chars = context.transcript.reduce((s, t) => s + t.text.length, 0);
    expect(chars).toBeLessThanOrEqual(CONTEXT_LIMITS.maxTranscriptChars);
    expect(stats.transcriptSegments).toBe(context.transcript.length);
  });
});
