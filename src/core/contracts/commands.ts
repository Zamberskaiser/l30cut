import { z } from "zod";
import {
  IdSchema,
  Micros,
  AspectSchema,
  CaptionSegmentSchema,
  GainKeyframeSchema,
  MarkerSchema,
} from "./domain";

/**
 * Deterministic, closed set of timeline commands.
 * The AI never emits these directly — a validated AiEditPlan is compiled into them.
 *
 * Trim semantics:
 * - `trimClip` operates in SOURCE space (used by silence cuts and precise edits).
 * - `trimClipEdge` operates in TIMELINE space: trimming the start edge updates
 *   `startUs` AND `sourceInUs` together, which is the correct editorial trim.
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
      type: z.literal("trimClipEdge"),
      clipId: IdSchema,
      edge: z.enum(["start", "end"]),
      /** New timeline position of the edited edge. */
      toUs: Micros,
    })
    .strict(),
  z
    .object({
      type: z.literal("rippleTrimClip"),
      clipId: IdSchema,
      edge: z.enum(["start", "end"]),
      toUs: Micros,
    })
    .strict(),
  z
    .object({
      type: z.literal("rollingEdit"),
      leftClipId: IdSchema,
      rightClipId: IdSchema,
      /** New boundary position between the two adjacent clips. */
      toUs: Micros,
    })
    .strict(),
  z
    .object({
      type: z.literal("rateStretchClip"),
      clipId: IdSchema,
      newDurationUs: Micros.min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("slipClip"),
      clipId: IdSchema,
      /** Source-space shift; start and duration on the timeline stay fixed. */
      deltaUs: z.number().int(),
    })
    .strict(),
  z
    .object({
      type: z.literal("slideClip"),
      clipId: IdSchema,
      /** Timeline shift absorbed by the adjacent neighbours. */
      deltaUs: z.number().int(),
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
      toTrackId: IdSchema.optional(),
      newClipId: IdSchema.optional(),
    })
    .strict(),
  z.object({ type: z.literal("deleteClip"), clipId: IdSchema }).strict(),
  z.object({ type: z.literal("rippleDelete"), clipId: IdSchema }).strict(),
  z
    .object({
      type: z.literal("changeGain"),
      clipId: IdSchema,
      gainDb: z.number().min(-60).max(12),
    })
    .strict(),
  z
    .object({
      type: z.literal("setGainKeyframes"),
      clipId: IdSchema,
      keyframes: z.array(GainKeyframeSchema).max(200),
    })
    .strict(),
  z.object({ type: z.literal("addCaption"), segment: CaptionSegmentSchema }).strict(),
  z.object({ type: z.literal("addMarker"), marker: MarkerSchema }).strict(),
  z
    .object({
      type: z.literal("setTrackLock"),
      trackId: IdSchema,
      locked: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("setTrackMute"),
      trackId: IdSchema,
      muted: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("linkClips"),
      clipIds: z.array(IdSchema).min(2).max(12),
      linkGroupId: IdSchema.optional(),
    })
    .strict(),
  z.object({ type: z.literal("unlinkClips"), clipId: IdSchema }).strict(),

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

  /* ---------- multi-sequence (Premiere-like tabs) ---------- */
  z.object({ type: z.literal("setActiveSequence"), sequenceId: IdSchema }).strict(),
  z
    .object({
      type: z.literal("renameSequence"),
      sequenceId: IdSchema,
      name: z.string().min(1).max(120),
    })
    .strict(),
  z.object({ type: z.literal("deleteSequence"), sequenceId: IdSchema }).strict(),
  z
    .object({
      type: z.literal("duplicateSequence"),
      sequenceId: IdSchema,
      newSequenceId: IdSchema,
      name: z.string().min(1).max(120),
      activate: z.boolean().default(true),
    })
    .strict(),

  /* ---------- tracks ---------- */
  z
    .object({
      type: z.literal("addTrack"),
      trackId: IdSchema,
      kind: TrackKindSchema,
      name: z.string().min(1).max(60),
      /** Insertion index inside the sequence track list; appended when absent. */
      index: z.number().int().min(0).max(64).optional(),
    })
    .strict(),
  z.object({ type: z.literal("removeTrack"), trackId: IdSchema }).strict(),
  z
    .object({
      type: z.literal("renameTrack"),
      trackId: IdSchema,
      name: z.string().min(1).max(60),
    })
    .strict(),
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
