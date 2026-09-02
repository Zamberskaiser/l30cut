import { describe, expect, it } from "vitest";
import { AI_PLAN_SCHEMA_VERSION, adaptPlanInput, parseAiEditPlan } from "./aiPlan";

const basePlan = {
  id: "plan_test_1",
  intent: "set-aspect",
  summary: "Converter a sequência para 9:16.",
  scope: { kind: "sequence" as const, clipIds: [] },
  operations: [{ op: "setAspect" as const, aspect: "9:16" as const }],
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
  modelInfo: { provider: "deterministic" as const, model: "rules-v1" },
};

describe("AiEditPlan v1 schema + adapter", () => {
  it("accepts a v1 plan with explicit version", () => {
    const result = parseAiEditPlan({ ...basePlan, version: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.version).toBe(AI_PLAN_SCHEMA_VERSION);
  });

  it("adapts legacy plans without a version tag", () => {
    const result = parseAiEditPlan(basePlan);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.version).toBe(1);
  });

  it("rejects unknown versions instead of coercing", () => {
    expect(parseAiEditPlan({ ...basePlan, version: 2 }).ok).toBe(false);
    expect(adaptPlanInput({ ...basePlan, version: 99 })).toMatchObject({ version: 99 });
  });

  it("rejects unknown operations and extra fields", () => {
    expect(
      parseAiEditPlan({ ...basePlan, operations: [{ op: "runShell", cmd: "rm -rf /" }] }).ok,
    ).toBe(false);
    expect(parseAiEditPlan({ ...basePlan, injected: true }).ok).toBe(false);
    expect(
      parseAiEditPlan({
        ...basePlan,
        operations: [{ op: "setAspect", aspect: "9:16", extra: 1 }],
      }).ok,
    ).toBe(false);
  });

  it("rejects out-of-range gain", () => {
    expect(
      parseAiEditPlan({
        ...basePlan,
        operations: [{ op: "setGain", clipId: "c1", gainDb: 40 }],
      }).ok,
    ).toBe(false);
  });
});
