import { clipEnd, SECOND, type Marker, type Sequence } from "@/core/contracts/domain";

/** Default lane height; the live value comes from the UI store (vertical zoom). */
export const TRACK_HEIGHT = 44;
export const HEADER_WIDTH = 96;
export const RULER_HEIGHT = 24;
/** Pointer must travel this far before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 4;
/** Edge handle width for trim gestures. */
export const EDGE_HANDLE_PX = 8;
/** Snap tolerance in screen pixels (converted to microseconds per zoom). */
export const SNAP_TOLERANCE_PX = 8;

export const usToPx = (us: number, pxPerSecond: number): number => (us / SECOND) * pxPerSecond;
export const pxToUs = (px: number, pxPerSecond: number): number =>
  Math.round((px / pxPerSecond) * SECOND);

export interface SnapContext {
  sequence: Sequence;
  playheadUs: number;
  inOutUs: [number, number] | null;
  /** Clips being dragged — their own edges must not attract themselves. */
  excludeClipIds?: readonly string[];
}

/** Deterministic, sorted list of magnetic points on the timeline. */
export function snapTargets(ctx: SnapContext): number[] {
  const exclude = new Set(ctx.excludeClipIds ?? []);
  const set = new Set<number>([0, Math.round(ctx.playheadUs)]);
  for (const clip of ctx.sequence.clips) {
    if (exclude.has(clip.id)) continue;
    set.add(clip.startUs);
    set.add(clipEnd(clip));
  }
  for (const marker of ctx.sequence.markers as Marker[]) set.add(marker.atUs);
  for (const caption of ctx.sequence.captions) {
    set.add(caption.startUs);
    set.add(caption.endUs);
  }
  if (ctx.inOutUs) {
    set.add(ctx.inOutUs[0]);
    set.add(ctx.inOutUs[1]);
  }
  return [...set].filter((v) => v >= 0).sort((a, b) => a - b);
}

export interface SnapResult {
  us: number;
  snappedTo: number | null;
}

/** Nearest target within tolerance wins; ties resolve to the smaller value. */
export function applySnap(us: number, targets: readonly number[], toleranceUs: number): SnapResult {
  let best: number | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const dist = Math.abs(target - us);
    if (dist <= toleranceUs && dist < bestDist) {
      best = target;
      bestDist = dist;
    }
  }
  return best === null ? { us, snappedTo: null } : { us: best, snappedTo: best };
}

export type ClipZone = "start" | "end" | "body";

/** Hit test inside a clip rect: which zone did the pointer land on. */
export function clipZoneAt(offsetPx: number, widthPx: number): ClipZone {
  const handle = Math.max(4, Math.min(EDGE_HANDLE_PX, Math.floor(widthPx / 3)));
  if (offsetPx <= handle) return "start";
  if (offsetPx >= widthPx - handle) return "end";
  return "body";
}

export const trackIndexFromY = (y: number, trackHeight: number = TRACK_HEIGHT): number =>
  Math.floor(y / trackHeight);
