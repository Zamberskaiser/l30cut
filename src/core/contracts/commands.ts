import { z } from "zod";
import { IdSchema, Micros, AspectSchema, CaptionSegmentSchema } from "./domain";

/**
 * Deterministic, closed set of timeline commands.
 * The AI never emits these directly — a validated AiEditPlan is compiled into them.
 */
export const EditCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("splitClip"), clipId: IdSchema, atUs: Micros }).strict(),
  z
    .object({
      type: z.literal("trimClip"),
      clipId: IdSchema,
      sourceInUs: Micros.optional(),
      sourceOutUs: Micros.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("moveClip"),
      clipId: IdSchema,
      toStartUs: Micros,
      toTrackId: IdSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("duplicateClip"),
      clipId: IdSchema,
      toStartUs: Micros.optional(),
      newClipId: IdSchema.optional(),
    })
    .strict(),
  z.object({ type: z.literal("deleteClip"), clipId: IdSchema }).strict(),
  z.object({ type: z.literal("rippleDelete"), clipId: IdSchema }).strict(),
  z
    .object({ type: z.literal("changeGain"), clipId: IdSchema, gainDb: z.number().min(-60).max(12) })
    .strict(),
  z.object({ type: z.literal("addCaption"), segment: CaptionSegmentSchema }).strict(),
  z
    .object({
      type: z.literal("createSequence"),
      sequenceId: IdSchema,
      name: z.string().min(1),
      aspect: AspectSchema,
      activate: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      type: z.literal("insertClip"),
      clipId: IdSchema,
      trackId: IdSchema,
      assetId: IdSchema,
      startUs: Micros,
      sourceInUs: Micros,
      sourceOutUs: Micros,
      label: z.string().default(""),
    })
    .strict(),
  z.object({ type: z.literal("setSequenceAspect"), aspect: AspectSchema }).strict(),
]);

export type EditCommand = z.infer<typeof EditCommandSchema>;
export type EditCommandType = EditCommand["type"];

export interface Transaction {
  label: string;
  commands: EditCommand[];
  /** Origin of the transaction, used for audit + learning history. */
  source: "user" | "ai" | "system";
  planId?: string;
}
