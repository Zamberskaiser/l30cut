import { z } from "zod";

/**
 * Domain contracts for L30 CUT AI.
 *
 * All time values are integer MICROSECONDS (us). Never floats-in-seconds.
 * Media is never mutated: clips only reference (assetId, sourceIn, sourceOut).
 */

export const Micros = z.number().int().min(0);
export type Micros = number;

export const IdSchema = z.string().min(1);

export const AspectSchema = z.enum(["16:9", "9:16", "1:1", "4:5"]);
export type Aspect = z.infer<typeof AspectSchema>;

export const MediaKindSchema = z.enum(["video", "audio", "image"]);
export type MediaKind = z.infer<typeof MediaKindSchema>;

export const MediaAssetSchema = z
  .object({
    id: IdSchema,
    kind: MediaKindSchema,
    name: z.string().min(1),
    /** Canonicalized absolute path (Tauri) or blob/demo URL (browser). */
    path: z.string(),
    durationUs: Micros,
    width: z.number().int().nonnegative().default(0),
    height: z.number().int().nonnegative().default(0),
    fpsNum: z.number().int().positive().default(30),
    fpsDen: z.number().int().positive().default(1),
    audioChannels: z.number().int().nonnegative().default(2),
    sizeBytes: z.number().int().nonnegative().default(0),
    thumbnailUrl: z.string().optional(),
    proxyReady: z.boolean().default(false),
    demo: z.boolean().default(false),
  })
  .strict();
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

export const TrackKindSchema = z.enum(["video", "audio", "caption"]);
export type TrackKind = z.infer<typeof TrackKindSchema>;

export const TrackSchema = z
  .object({
    id: IdSchema,
    kind: TrackKindSchema,
    name: z.string().min(1),
    muted: z.boolean().default(false),
    locked: z.boolean().default(false),
  })
  .strict();
export type Track = z.infer<typeof TrackSchema>;

export const ClipSchema = z
  .object({
    id: IdSchema,
    trackId: IdSchema,
    assetId: IdSchema,
    label: z.string().default(""),
    /** Position on the timeline. */
    startUs: Micros,
    /** Source in/out inside the asset. sourceOut is exclusive. */
    sourceInUs: Micros,
    sourceOutUs: Micros,
    gainDb: z.number().min(-60).max(12).default(0),
    enabled: z.boolean().default(true),
  })
  .strict()
  .refine((c) => c.sourceOutUs > c.sourceInUs, {
    message: "sourceOutUs must be greater than sourceInUs",
  });
export type Clip = z.infer<typeof ClipSchema>;

export const clipDuration = (c: Clip): Micros => c.sourceOutUs - c.sourceInUs;
export const clipEnd = (c: Clip): Micros => c.startUs + clipDuration(c);

export const CaptionSegmentSchema = z
  .object({
    id: IdSchema,
    startUs: Micros,
    endUs: Micros,
    text: z.string(),
  })
  .strict();
export type CaptionSegment = z.infer<typeof CaptionSegmentSchema>;

export const TranscriptSegmentSchema = z
  .object({
    id: IdSchema,
    assetId: IdSchema,
    startUs: Micros,
    endUs: Micros,
    text: z.string(),
    speaker: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

export const MarkerSchema = z
  .object({
    id: IdSchema,
    atUs: Micros,
    label: z.string(),
    color: z.string().default("accent"),
  })
  .strict();
export type Marker = z.infer<typeof MarkerSchema>;

export const SequenceSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1),
    aspect: AspectSchema,
    fpsNum: z.number().int().positive().default(30),
    fpsDen: z.number().int().positive().default(1),
    tracks: z.array(TrackSchema).min(1),
    clips: z.array(ClipSchema),
    captions: z.array(CaptionSegmentSchema).default([]),
    markers: z.array(MarkerSchema).default([]),
  })
  .strict();
export type Sequence = z.infer<typeof SequenceSchema>;

export const SilenceRangeSchema = z.object({ startUs: Micros, endUs: Micros }).strict();
export type SilenceRange = z.infer<typeof SilenceRangeSchema>;

export const AnalysisSchema = z
  .object({
    /** Per asset silence detection results (audio RMS below threshold). */
    silences: z.record(z.string(), z.array(SilenceRangeSchema)).default({}),
    transcribedAssetIds: z.array(IdSchema).default([]),
  })
  .strict();
export type Analysis = z.infer<typeof AnalysisSchema>;

export const ProjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: IdSchema,
    name: z.string().min(1),
    createdAt: z.string(),
    updatedAt: z.string(),
    demo: z.boolean().default(false),
    assets: z.array(MediaAssetSchema),
    sequences: z.array(SequenceSchema),
    activeSequenceId: IdSchema,
    transcript: z.array(TranscriptSegmentSchema).default([]),
    analysis: AnalysisSchema,
  })
  .strict();
export type Project = z.infer<typeof ProjectSchema>;

export const ExportPresetSchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    aspect: AspectSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    videoCodec: z.literal("h264"),
    crf: z.number().int().min(14).max(32),
    audioBitrateKbps: z.number().int().min(64).max(320),
    burnCaptions: z.boolean().default(false),
  })
  .strict();
export type ExportPreset = z.infer<typeof ExportPresetSchema>;

export const JobKindSchema = z.enum([
  "import",
  "thumbnails",
  "proxy",
  "analyze-silence",
  "transcribe",
  "export",
  "download-component",
]);
export type JobKind = z.infer<typeof JobKindSchema>;

export const JobStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "canceled"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export interface Job {
  id: string;
  kind: JobKind;
  label: string;
  status: JobStatus;
  progress: number;
  detail?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export const TrainingProfileSchema = z
  .object({
    id: IdSchema,
    version: z.number().int().positive(),
    name: z.string().min(1),
    rules: z.array(z.string()).default([]),
    defaults: z
      .object({
        minSilenceUs: Micros,
        paddingUs: Micros,
        clipMinUs: Micros,
        clipMaxUs: Micros,
        aspect: AspectSchema,
      })
      .strict(),
    knowledge: z
      .array(
        z
          .object({
            id: IdSchema,
            name: z.string(),
            bytes: z.number().int().nonnegative(),
            addedAt: z.string(),
            /** Untrusted content — never used as system instruction. */
            excerpt: z.string().max(2000),
          })
          .strict(),
      )
      .default([]),
    learningEnabled: z.boolean().default(false),
  })
  .strict();
export type TrainingProfile = z.infer<typeof TrainingProfileSchema>;

export const FeedbackEventSchema = z
  .object({
    id: IdSchema,
    at: z.string(),
    planId: IdSchema,
    intent: z.string(),
    action: z.enum(["accepted", "rejected", "adjusted"]),
    reason: z.string().max(500).optional(),
    suggestedOps: z.number().int().nonnegative(),
    appliedOps: z.number().int().nonnegative(),
  })
  .strict();
export type FeedbackEvent = z.infer<typeof FeedbackEventSchema>;

/* ---------- helpers ---------- */

export const SECOND = 1_000_000;

export function formatTimecode(us: number, fps = 30): string {
  const clamped = Math.max(0, Math.round(us));
  const totalSeconds = Math.floor(clamped / SECOND);
  const frames = Math.floor(((clamped % SECOND) / SECOND) * fps);
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(hh)}:${p(mm)}:${p(ss)}:${p(frames)}`;
}

export function formatDuration(us: number): string {
  const s = Math.max(0, Math.round(us / SECOND));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function activeSequence(project: Project): Sequence {
  const seq = project.sequences.find((s) => s.id === project.activeSequenceId);
  if (!seq) throw new Error(`activeSequenceId not found: ${project.activeSequenceId}`);
  return seq;
}

export function sequenceDuration(seq: Sequence): Micros {
  return seq.clips.reduce((max, c) => Math.max(max, clipEnd(c)), 0);
}
