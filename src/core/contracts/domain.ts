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
    /** Bin (folder) that holds the asset; `undefined` means the project root. */
    binId: IdSchema.optional(),
  })
  .strict();
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

/**
 * Media bin — a project folder in the media panel. Bins are pure organization:
 * they never move files on disk and never affect clips, so deleting a bin only
 * reparents its contents.
 */
export const BinSchema = z
  .object({
    id: IdSchema,
    name: z.string().min(1).max(80),
    /** Parent bin id; `undefined` means a root-level bin. */
    parentId: IdSchema.optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })
  .strict();
export type Bin = z.infer<typeof BinSchema>;

/** Root-first depth-first order, so the panel renders a stable tree. */
export function binTree(bins: Bin[], parentId?: string): Array<{ bin: Bin; depth: number }> {
  const walk = (parent: string | undefined, depth: number): Array<{ bin: Bin; depth: number }> =>
    bins
      .filter((b) => (b.parentId ?? undefined) === parent)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .flatMap((bin) => [{ bin, depth }, ...walk(bin.id, depth + 1)]);
  return walk(parentId, 0);
}

/** Ids of `binId` plus every descendant, used to count/filter recursively. */
export function binWithDescendants(bins: Bin[], binId: string): string[] {
  const out = [binId];
  for (const bin of bins) {
    if (bin.parentId === binId) out.push(...binWithDescendants(bins, bin.id));
  }
  return out;
}

/** True when `candidate` is `binId` or lives inside it (prevents cyclic moves). */
export function isBinInside(bins: Bin[], candidate: string, binId: string): boolean {
  let current: string | undefined = candidate;
  while (current) {
    if (current === binId) return true;
    current = bins.find((b) => b.id === current)?.parentId;
  }
  return false;
}

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

/** Typed local gain keyframe. `atUs` is relative to the clip's timeline start. */
export const GainKeyframeSchema = z
  .object({
    id: IdSchema,
    atUs: Micros,
    gainDb: z.number().min(-60).max(12),
  })
  .strict();
export type GainKeyframe = z.infer<typeof GainKeyframeSchema>;

/* ---------- effects: transitions, chroma key, motion tracking ---------- */

export const TransitionKindSchema = z.enum(["fade", "cross", "dip"]);
export type TransitionKind = z.infer<typeof TransitionKindSchema>;

/** Fade/cross applied to one edge of a clip. Duration is timeline space. */
export const ClipTransitionSchema = z
  .object({
    kind: TransitionKindSchema,
    durationUs: Micros.min(40_000),
  })
  .strict();
export type ClipTransition = z.infer<typeof ClipTransitionSchema>;

/** Chroma key (green/blue screen) parameters. Values are normalized 0..1. */
export const ChromaKeySchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Key color as #rrggbb. */
    colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    similarity: z.number().min(0).max(1).default(0.35),
    smoothness: z.number().min(0).max(1).default(0.08),
    spill: z.number().min(0).max(1).default(0.1),
  })
  .strict();
export type ChromaKey = z.infer<typeof ChromaKeySchema>;

/** One tracked box. Coordinates are normalized 0..1 in the frame. */
export const TrackPointSchema = z
  .object({
    atUs: Micros,
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0.01).max(1),
    h: z.number().min(0.01).max(1),
  })
  .strict();
export type TrackPoint = z.infer<typeof TrackPointSchema>;

export const TrackerTargetSchema = z.enum(["box", "blur", "pixelate", "text"]);
export type TrackerTarget = z.infer<typeof TrackerTargetSchema>;

/** Motion tracking attached to a clip: a box that follows the subject. */
export const ClipTrackerSchema = z
  .object({
    enabled: z.boolean().default(true),
    target: TrackerTargetSchema.default("blur"),
    label: z.string().max(80).default(""),
    /** Sorted by atUs (clip-relative microseconds). */
    points: z.array(TrackPointSchema).min(1).max(2000),
  })
  .strict();
export type ClipTracker = z.infer<typeof ClipTrackerSchema>;

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
    /**
     * Playback speed. Backwards compatible: absent means 1.0.
     * Timeline duration = source span / playbackRate.
     */
    playbackRate: z.number().min(0.1).max(10).optional(),
    /** Optional typed gain automation (pen tool). Sorted by atUs. */
    gainKeyframes: z.array(GainKeyframeSchema).optional(),
    /**
     * A/V link group. Clips sharing a linkGroupId move, trim, split and are
     * deleted together. Absent means the clip is independent.
     */
    linkGroupId: z.string().min(1).optional(),
    /** Transition on the incoming/outgoing edge (absent = hard cut). */
    transitionIn: ClipTransitionSchema.optional(),
    transitionOut: ClipTransitionSchema.optional(),
    /** Chroma key (green screen removal). */
    chroma: ChromaKeySchema.optional(),
    /** Motion tracking data produced by the tracking tool. */
    tracker: ClipTrackerSchema.optional(),
    enabled: z.boolean().default(true),
  })
  .strict()
  .refine((c) => c.sourceOutUs > c.sourceInUs, {
    message: "sourceOutUs must be greater than sourceInUs",
  });
export type Clip = z.infer<typeof ClipSchema>;

export const clipRate = (c: Clip): number => c.playbackRate ?? 1;
export const clipSourceSpan = (c: Clip): Micros => c.sourceOutUs - c.sourceInUs;
export const clipDuration = (c: Clip): Micros => Math.round(clipSourceSpan(c) / clipRate(c));
export const clipEnd = (c: Clip): Micros => c.startUs + clipDuration(c);

/**
 * Effective gain at a clip-relative offset, linearly interpolated between
 * keyframes. Without keyframes it is simply the static clip gain.
 */
export function clipGainDbAt(c: Clip, offsetUs: Micros): number {
  const kfs = c.gainKeyframes;
  if (!kfs || kfs.length === 0) return c.gainDb;
  const sorted = [...kfs].sort((a, b) => a.atUs - b.atUs);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (offsetUs <= first.atUs) return first.gainDb;
  if (offsetUs >= last.atUs) return last.gainDb;
  for (let i = 1; i < sorted.length; i += 1) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    if (offsetUs <= b.atUs) {
      const span = b.atUs - a.atUs;
      if (span <= 0) return b.gainDb;
      const t = (offsetUs - a.atUs) / span;
      return a.gainDb + (b.gainDb - a.gainDb) * t;
    }
  }
  return last.gainDb;
}

/**
 * Opacity multiplier (0..1) produced by the clip's edge transitions at a
 * clip-relative offset. Without transitions it is always 1.
 */
export function clipTransitionOpacityAt(c: Clip, offsetUs: Micros): number {
  const duration = clipDuration(c);
  let opacity = 1;
  const inT = c.transitionIn;
  if (inT && offsetUs < inT.durationUs) {
    opacity = Math.min(opacity, Math.max(0, offsetUs) / inT.durationUs);
  }
  const outT = c.transitionOut;
  if (outT && offsetUs > duration - outT.durationUs) {
    opacity = Math.min(opacity, Math.max(0, duration - offsetUs) / outT.durationUs);
  }
  return Math.min(1, Math.max(0, opacity));
}

/** Interpolated tracker box at a clip-relative offset, or null when absent. */
export function trackerBoxAt(
  tracker: ClipTracker | undefined,
  offsetUs: Micros,
): { x: number; y: number; w: number; h: number } | null {
  if (!tracker || !tracker.enabled || tracker.points.length === 0) return null;
  const pts = [...tracker.points].sort((a, b) => a.atUs - b.atUs);
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (offsetUs <= first.atUs) return { x: first.x, y: first.y, w: first.w, h: first.h };
  if (offsetUs >= last.atUs) return { x: last.x, y: last.y, w: last.w, h: last.h };
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (offsetUs <= b.atUs) {
      const span = b.atUs - a.atUs;
      const t = span <= 0 ? 1 : (offsetUs - a.atUs) / span;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        w: a.w + (b.w - a.w) * t,
        h: a.h + (b.h - a.h) * t,
      };
    }
  }
  return { x: last.x, y: last.y, w: last.w, h: last.h };
}

/** Linear amplitude multiplier for a dB value (0 dB → 1). */
export const dbToAmplitude = (db: number): number => 10 ** (db / 20);

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
    bins: z.array(BinSchema).default([]),
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
