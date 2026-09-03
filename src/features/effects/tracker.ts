/**
 * Motion tracking (rastreamento) — pure, testable template matching.
 *
 * The tracker follows a rectangular region across frames using normalized
 * sum-of-absolute-differences over a grayscale template, searching only a
 * small window around the previous position. No native dependency: it runs
 * on canvas pixels in the browser and on plain arrays in tests.
 */

export interface GrayFrame {
  width: number;
  height: number;
  data: Float32Array;
}

export interface BoxPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Converts RGBA pixels to a normalized grayscale frame (0..1). */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): GrayFrame {
  const data = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 1, p += 4) {
    data[i] = (0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!) / 255;
  }
  return { width, height, data };
}

/** Copies the pixels inside `box` out of a frame (clamped to bounds). */
export function cropTemplate(frame: GrayFrame, box: BoxPx): GrayFrame {
  const x0 = Math.max(0, Math.min(frame.width - 1, Math.round(box.x)));
  const y0 = Math.max(0, Math.min(frame.height - 1, Math.round(box.y)));
  const w = Math.max(1, Math.min(frame.width - x0, Math.round(box.w)));
  const h = Math.max(1, Math.min(frame.height - y0, Math.round(box.h)));
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      data[y * w + x] = frame.data[(y0 + y) * frame.width + (x0 + x)]!;
    }
  }
  return { width: w, height: h, data };
}

function meanAbsDiff(frame: GrayFrame, tpl: GrayFrame, ox: number, oy: number): number {
  let sum = 0;
  for (let y = 0; y < tpl.height; y += 1) {
    const fRow = (oy + y) * frame.width + ox;
    const tRow = y * tpl.width;
    for (let x = 0; x < tpl.width; x += 1) {
      sum += Math.abs(frame.data[fRow + x]! - tpl.data[tRow + x]!);
    }
  }
  return sum / (tpl.width * tpl.height);
}

export interface MatchResult {
  x: number;
  y: number;
  /** 1 = perfect match, 0 = worst. */
  score: number;
}

/**
 * Finds the template inside `frame`, searching `radius` pixels around
 * (`fromX`, `fromY`). Deterministic: ties resolve to the position closest to
 * the previous one (scan starts at the center offset).
 */
export function matchTemplate(
  frame: GrayFrame,
  tpl: GrayFrame,
  fromX: number,
  fromY: number,
  radius = 24,
  step = 1,
): MatchResult {
  const maxX = frame.width - tpl.width;
  const maxY = frame.height - tpl.height;
  if (maxX < 0 || maxY < 0) return { x: fromX, y: fromY, score: 0 };
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  let bestX = clamp(Math.round(fromX), maxX);
  let bestY = clamp(Math.round(fromY), maxY);
  let best = meanAbsDiff(frame, tpl, bestX, bestY);

  const offsets: number[] = [0];
  for (let d = step; d <= radius; d += step) offsets.push(d, -d);

  for (const dy of offsets) {
    for (const dx of offsets) {
      if (dx === 0 && dy === 0) continue;
      const x = clamp(Math.round(fromX) + dx, maxX);
      const y = clamp(Math.round(fromY) + dy, maxY);
      const diff = meanAbsDiff(frame, tpl, x, y);
      if (diff < best - 1e-6) {
        best = diff;
        bestX = x;
        bestY = y;
      }
    }
  }
  return { x: bestX, y: bestY, score: 1 - Math.min(1, best) };
}
