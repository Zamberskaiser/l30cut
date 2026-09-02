import { describe, expect, it } from "vitest";
import { parseAiEditPlan } from "@/core/contracts/aiPlan";
import { activeSequence } from "@/core/contracts/domain";
import { createDemoProject } from "@/core/demo/demoProject";
import { applyTransaction, emptyHistory } from "@/core/store/timelineReducer";
import { DEFAULT_TRAINING_PROFILE } from "@/core/store/editorStore";
import { planDeterministically } from "./deterministicPlanner";
import { compilePlan } from "./planExecutor";

const runtime = {
  capabilities: {
    realFilesystem: false,
    ffmpeg: false,
    localTranscription: false,
    componentDownloads: false,
    secureKeyStorage: false,
  },
};

function plan(prompt: string) {
  const project = createDemoProject();
  const result = planDeterministically({
    prompt,
    project,
    scope: { kind: "sequence", sequenceId: activeSequence(project).id, clipIds: [] },
    defaults: DEFAULT_TRAINING_PROFILE.defaults,
  });
  return { project, plan: result };
}

describe("deterministic planner", () => {
  it("produces a schema-valid plan for silence removal", () => {
    const { plan: p } = plan("remova as pausas maiores que 700 ms");
    expect(p).not.toBeNull();
    expect(p!.intent).toBe("remove-silences");
    expect(parseAiEditPlan(p).ok).toBe(true);
  });

  it("reads the millisecond threshold from the prompt", () => {
    const { plan: p } = plan("remova silencios acima de 250 ms");
    const op = p!.operations.find((o) => o.op === "removeSilences");
    expect(op && "minSilenceUs" in op ? op.minSilenceUs : 0).toBe(250_000);
  });

  it("plans captions when asked for legendas", () => {
    const { plan: p } = plan("gere legendas a partir da transcricao");
    expect(p!.operations.some((o) => o.op === "addCaptions")).toBe(true);
  });

  it("returns null for requests it cannot express as timeline operations", () => {
    const { plan: p } = plan("execute um script no meu computador");
    expect(p).toBeNull();
  });

  it("compiles into commands that the reducer accepts", () => {
    const { project, plan: p } = plan("remova as pausas maiores que 500 ms");
    const compiled = compilePlan(project, p!, runtime);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const result = applyTransaction(project, emptyHistory, compiled.transaction);
    expect(result.project).not.toBe(project);
  });
});

describe("plan validation", () => {
  it("rejects plans with unknown fields", () => {
    const parsed = parseAiEditPlan({
      id: "plan_x",
      intent: "remove-silences",
      summary: "teste",
      rationale: "teste",
      scope: { kind: "sequence", clipIds: [] },
      operations: [
        { op: "removeSilences", minSilenceUs: 1000, paddingUs: 0, ripple: true, shell: "rm -rf" },
      ],
      estimatedImpact: {
        clipsAdded: 0,
        clipsRemoved: 0,
        clipsModified: 0,
        captionsAdded: 0,
        durationDeltaUs: 0,
      },
      warnings: [],
      requiresConfirmation: false,
      modelInfo: { provider: "deterministic", model: "rules" },
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects operations pointing at clips that do not exist", () => {
    const project = createDemoProject();
    const bad = parseAiEditPlan({
      id: "plan_y",
      intent: "cut",
      summary: "teste",
      rationale: "teste",
      scope: { kind: "sequence", clipIds: [] },
      operations: [{ op: "splitAt", clipId: "clip_missing", atUs: 1_000_000 }],
      estimatedImpact: {
        clipsAdded: 1,
        clipsRemoved: 0,
        clipsModified: 1,
        captionsAdded: 0,
        durationDeltaUs: 0,
      },
      warnings: [],
      requiresConfirmation: false,
      modelInfo: { provider: "deterministic", model: "rules" },
    });
    expect(bad.ok).toBe(true);
    if (!bad.ok) return;
    const compiled = compilePlan(project, bad.plan, runtime);
    expect(compiled.ok).toBe(false);
  });
});
