import { describe, expect, it } from "vitest";
import { createDemoProject } from "@/core/demo/demoProject";
import { activeSequence } from "@/core/contracts/domain";
import { parseAiEditPlan, type AiEditPlan } from "@/core/contracts/aiPlan";
import { previewPlan } from "./planPreview";

const runtime = {
  capabilities: {
    realFilesystem: false,
    ffmpeg: false,
    localTranscription: false,
    componentDownloads: false,
    secureKeyStorage: false,
    updater: false,
  },
};

function makePlan(operations: unknown[]): AiEditPlan {
  const parsed = parseAiEditPlan({
    id: "plan_preview_test",
    intent: "test",
    summary: "Plano de teste de prévia.",
    scope: { kind: "sequence", clipIds: [] },
    operations,
    warnings: [],
    estimatedImpact: {
      clipsAdded: 0,
      clipsRemoved: 0,
      clipsModified: 0,
      durationDeltaUs: 0,
      sequencesCreated: 0,
      captionsAdded: 0,
    },
    requiresConfirmation: false,
    rationale: "Teste.",
    modelInfo: { provider: "deterministic", model: "rules-v1" },
  });
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));
  return parsed.plan;
}

describe("previewPlan", () => {
  it("simulates a split without mutating the project", () => {
    const project = createDemoProject();
    const seq = activeSequence(project);
    const clip = seq.clips[0]!;
    const clipsBefore = seq.clips.length;
    const midpoint = clip.startUs + Math.floor((clip.sourceOutUs - clip.sourceInUs) / 2);

    const plan = makePlan([{ op: "splitAt", clipId: clip.id, atUs: midpoint }]);
    const preview = previewPlan(project, plan, runtime);

    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.before.clips).toBe(clipsBefore);
      expect(preview.after.clips).toBe(clipsBefore + 1);
    }
    // the real project must be untouched
    expect(activeSequence(project).clips.length).toBe(clipsBefore);
  });

  it("propagates validator failures instead of guessing", () => {
    const project = createDemoProject();
    const plan = makePlan([{ op: "splitAt", clipId: "clip_missing", atUs: 1_000_000 }]);
    const preview = previewPlan(project, plan, runtime);
    expect(preview.ok).toBe(false);
    if (!preview.ok) expect(preview.errors.join(" ")).toContain("clip_missing");
  });
});
