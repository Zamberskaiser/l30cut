import { z } from "zod";
import { AspectSchema, IdSchema, Micros } from "./domain";

/** Explicit chat scope — the assistant only ever sees what the user selected. */
export const PlanScopeSchema = z
  .object({
    kind: z.enum(["project", "sequence", "selection", "range", "transcript"]),
    sequenceId: IdSchema.optional(),
    clipIds: z.array(IdSchema).default([]),
    inUs: Micros.optional(),
    outUs: Micros.optional(),
  })
  .strict();
export type PlanScope = z.infer<typeof PlanScopeSchema>;

/** Closed enumeration of operations the assistant may propose. */
export const PlanOperationSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("removeSilences"),
      minSilenceUs: Micros.min(100_000),
      paddingUs: Micros.max(2_000_000).default(60_000),
      ripple: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      op: z.literal("createClipsFromRanges"),
      assetId: IdSchema,
      ranges: z
        .array(z.object({ startUs: Micros, endUs: Micros, label: z.string().default("") }).strict())
        .min(1)
        .max(50),
      newSequencePerRange: z.boolean().default(false),
      aspect: AspectSchema.optional(),
    })
    .strict(),
  z.object({ op: z.literal("splitAt"), clipId: IdSchema, atUs: Micros }).strict(),
  z
    .object({
      op: z.literal("trim"),
      clipId: IdSchema,
      sourceInUs: Micros.optional(),
      sourceOutUs: Micros.optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("move"),
      clipId: IdSchema,
      toStartUs: Micros,
      toTrackId: IdSchema.optional(),
    })
    .strict(),
  z.object({ op: z.literal("duplicate"), clipId: IdSchema, toStartUs: Micros.optional() }).strict(),
  z
    .object({ op: z.literal("remove"), clipId: IdSchema, ripple: z.boolean().default(false) })
    .strict(),
  z
    .object({ op: z.literal("setGain"), clipId: IdSchema, gainDb: z.number().min(-60).max(12) })
    .strict(),
  z
    .object({
      op: z.literal("addCaptions"),
      segments: z
        .array(z.object({ startUs: Micros, endUs: Micros, text: z.string().max(400) }).strict())
        .min(1)
        .max(2000),
    })
    .strict(),
  z
    .object({
      op: z.literal("createSequence"),
      name: z.string().min(1).max(80),
      aspect: AspectSchema,
    })
    .strict(),
  z.object({ op: z.literal("setAspect"), aspect: AspectSchema }).strict(),
  z
    .object({
      op: z.literal("keepTranscriptTopic"),
      query: z.string().min(2).max(200),
      minDurationUs: Micros.default(1_500_000),
    })
    .strict(),
]);
export type PlanOperation = z.infer<typeof PlanOperationSchema>;
export type PlanOperationKind = PlanOperation["op"];

export const EstimatedImpactSchema = z
  .object({
    clipsAdded: z.number().int().nonnegative().default(0),
    clipsRemoved: z.number().int().nonnegative().default(0),
    clipsModified: z.number().int().nonnegative().default(0),
    durationDeltaUs: z.number().int().default(0),
    sequencesCreated: z.number().int().nonnegative().default(0),
    captionsAdded: z.number().int().nonnegative().default(0),
  })
  .strict();
export type EstimatedImpact = z.infer<typeof EstimatedImpactSchema>;

/** Current wire-format version of the plan contract. */
export const AI_PLAN_SCHEMA_VERSION = 1 as const;

export const AiEditPlanSchema = z
  .object({
    /** Closed version tag — v1 is the only accepted wire format. */
    version: z.literal(AI_PLAN_SCHEMA_VERSION),
    id: IdSchema,
    intent: z.string().min(2).max(120),
    summary: z.string().min(2).max(400),
    scope: PlanScopeSchema,
    operations: z.array(PlanOperationSchema).min(1).max(200),
    warnings: z.array(z.string().max(240)).default([]),
    estimatedImpact: EstimatedImpactSchema,
    requiresConfirmation: z.boolean(),
    confidence: z.number().min(0).max(1).optional(),
    rationale: z.string().max(300),
    modelInfo: z
      .object({
        provider: z.enum(["deterministic", "local-openai", "ollama", "llama.cpp", "openai"]),
        model: z.string().max(80),
        latencyMs: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();
export type AiEditPlan = z.infer<typeof AiEditPlanSchema>;

export type PlanParseResult = { ok: true; plan: AiEditPlan } | { ok: false; errors: string[] };

/**
 * Adapter for pre-v1 payloads (plans emitted before the `version` tag existed).
 * The ONLY tolerated difference is the missing tag; everything else stays
 * strict. Unknown versions are rejected, never coerced.
 */
export function adaptPlanInput(input: unknown): unknown {
  if (input && typeof input === "object" && !Array.isArray(input) && !("version" in input)) {
    return { ...(input as Record<string, unknown>), version: AI_PLAN_SCHEMA_VERSION };
  }
  return input;
}

/** Strict gate for anything coming out of a model. Unknown fields are rejected. */
export function parseAiEditPlan(input: unknown): PlanParseResult {
  const parsed = AiEditPlanSchema.safeParse(adaptPlanInput(input));
  if (parsed.success) return { ok: true, plan: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}
