import type { EditCommand } from "@/core/contracts/commands";
import { clipDuration, type Clip, type Sequence, type SilenceRange } from "@/core/contracts/domain";
import { newId } from "@/core/store/timelineReducer";

export interface SilenceCutOptions {
  minSilenceUs: number;
  paddingUs: number;
  minKeepUs?: number;
}

export interface SilenceCutPlan {
  commands: EditCommand[];
  removedUs: number;
  keptRanges: Array<{ clipId: string; sourceInUs: number; sourceOutUs: number }>;
}

/**
 * Deterministic silence removal: for each clip, intersect the asset silence
 * ranges with the clip's source range, then rebuild the clip as a set of
 * kept segments laid out back to back (ripple).
 *
 * Pure and fully testable — no LLM involved.
 */
export function buildSilenceCutPlan(
  sequence: Sequence,
  silencesByAsset: Record<string, SilenceRange[]>,
  options: SilenceCutOptions,
  clipIds?: string[],
): SilenceCutPlan {
  const minKeepUs = options.minKeepUs ?? 150_000;
  const commands: EditCommand[] = [];
  const keptRanges: SilenceCutPlan["keptRanges"] = [];
  let removedUs = 0;
  let cursorByTrack = new Map<string, number>();

  const targets = sequence.clips
    .filter((c) => (clipIds && clipIds.length > 0 ? clipIds.includes(c.id) : true))
    .slice()
    .sort((a, b) => a.startUs - b.startUs);

  for (const clip of targets) {
    const silences = (silencesByAsset[clip.assetId] ?? [])
      .map((s) => ({
        startUs: Math.max(s.startUs + options.paddingUs, clip.sourceInUs),
        endUs: Math.min(s.endUs - options.paddingUs, clip.sourceOutUs),
      }))
      .filter((s) => s.endUs - s.startUs >= options.minSilenceUs)
      .sort((a, b) => a.startUs - b.startUs);

    if (silences.length === 0) continue;

    const keeps: Array<{ inUs: number; outUs: number }> = [];
    let cursor = clip.sourceInUs;
    for (const s of silences) {
      if (s.startUs - cursor >= minKeepUs) keeps.push({ inUs: cursor, outUs: s.startUs });
      removedUs += Math.min(s.endUs, clip.sourceOutUs) - Math.max(s.startUs, cursor);
      cursor = Math.max(cursor, s.endUs);
    }
    if (clip.sourceOutUs - cursor >= minKeepUs) {
      keeps.push({ inUs: cursor, outUs: clip.sourceOutUs });
    }
    if (keeps.length === 0) {
      commands.push({ type: "deleteClip", clipId: clip.id });
      continue;
    }

    let start = cursorByTrack.get(clip.trackId) ?? clip.startUs;
    // First kept segment reuses the original clip (trim + move).
    const [first, ...rest] = keeps;
    if (!first) continue;
    commands.push({
      type: "trimClip",
      clipId: clip.id,
      sourceInUs: first.inUs,
      sourceOutUs: first.outUs,
    });
    commands.push({ type: "moveClip", clipId: clip.id, toStartUs: start });
    keptRanges.push({ clipId: clip.id, sourceInUs: first.inUs, sourceOutUs: first.outUs });
    start += first.outUs - first.inUs;

    for (const keep of rest) {
      const id = newId("clip");
      commands.push({
        type: "insertClip",
        clipId: id,
        trackId: clip.trackId,
        assetId: clip.assetId,
        startUs: start,
        sourceInUs: keep.inUs,
        sourceOutUs: keep.outUs,
        label: clip.label,
      });
      keptRanges.push({ clipId: id, sourceInUs: keep.inUs, sourceOutUs: keep.outUs });
      start += keep.outUs - keep.inUs;
    }
    cursorByTrack.set(clip.trackId, start);
  }

  return { commands, removedUs, keptRanges };
}

/** Final duration of a track after a silence cut plan, in microseconds. */
export function estimateFinalDuration(clips: Clip[], removedUs: number): number {
  const total = clips.reduce((sum, c) => sum + clipDuration(c), 0);
  return Math.max(0, total - removedUs);
}
