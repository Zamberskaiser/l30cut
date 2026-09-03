import { clipDuration, type Clip } from "@/core/contracts/domain";

/**
 * Deterministic ffmpeg filter chain for a clip's effects. The preview renders
 * the same parameters on canvas; the export pipeline consumes this string, so
 * both stay in sync and the result is reproducible.
 */
export function clipVideoFilters(clip: Clip): string[] {
  const filters: string[] = [];
  const durationS = clipDuration(clip) / 1_000_000;

  const chroma = clip.chroma;
  if (chroma?.enabled) {
    const color = `0x${chroma.colorHex.replace("#", "")}`;
    filters.push(
      `colorkey=${color}:${chroma.similarity.toFixed(3)}:${chroma.smoothness.toFixed(3)}`,
    );
    if (chroma.spill > 0) filters.push(`despill=type=green:mix=${chroma.spill.toFixed(3)}`);
  }

  const inT = clip.transitionIn;
  if (inT) {
    const d = (inT.durationUs / 1_000_000).toFixed(3);
    filters.push(
      inT.kind === "dip" ? `fade=t=in:st=0:d=${d}:color=black` : `fade=t=in:st=0:d=${d}`,
    );
  }
  const outT = clip.transitionOut;
  if (outT) {
    const d = outT.durationUs / 1_000_000;
    const st = Math.max(0, durationS - d).toFixed(3);
    filters.push(
      outT.kind === "dip"
        ? `fade=t=out:st=${st}:d=${d.toFixed(3)}:color=black`
        : `fade=t=out:st=${st}:d=${d.toFixed(3)}`,
    );
  }

  return filters;
}

/** Tracked-region filters (blur/pixelate) as timed enable expressions. */
export function clipTrackerFilters(clip: Clip, frameWidth: number, frameHeight: number): string[] {
  const tracker = clip.tracker;
  if (!tracker?.enabled || tracker.target === "box" || tracker.target === "text") return [];
  const out: string[] = [];
  const pts = [...tracker.points].sort((a, b) => a.atUs - b.atUs);
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]!;
    const nextAt = pts[i + 1]?.atUs ?? clipDuration(clip);
    const from = (p.atUs / 1_000_000).toFixed(3);
    const to = (nextAt / 1_000_000).toFixed(3);
    const x = Math.round(p.x * frameWidth);
    const y = Math.round(p.y * frameHeight);
    const w = Math.max(2, Math.round(p.w * frameWidth));
    const h = Math.max(2, Math.round(p.h * frameHeight));
    const effect =
      tracker.target === "pixelate"
        ? `pixelize=w=${w}:h=${h}:x=${x}:y=${y}`
        : `boxblur=10:1:cr=0:ar=0`;
    out.push(`${effect}:enable='between(t,${from},${to})'`);
  }
  return out;
}
