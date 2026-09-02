import type { MediaAsset } from "@/core/contracts/domain";

/**
 * Audio peak extraction for timeline waveforms.
 *
 * Browser: real peaks via Web Audio (`decodeAudioData`) whenever the asset has
 * a fetchable URL. Demo assets (and any asset the browser cannot decode) fall
 * back to a deterministic synthesized envelope, always flagged `simulated` so
 * the UI never claims it drew real audio.
 *
 * Tauri: real extraction belongs to ffmpeg on the Rust side — that command does
 * not exist yet, so the desktop build currently shares this same path.
 */
export interface PeakData {
  /** Normalized 0..1 peak per bucket, in asset (source) time order. */
  peaks: number[];
  simulated: boolean;
}

export const DEFAULT_BUCKETS = 480;

/** Downsamples raw mono samples into `buckets` absolute peaks (pure). */
export function bucketPeaks(samples: ArrayLike<number>, buckets: number): number[] {
  const count = Math.max(1, Math.floor(buckets));
  const out = new Array<number>(count).fill(0);
  if (samples.length === 0) return out;
  const per = samples.length / count;
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor(i * per);
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor((i + 1) * per)));
    let peak = 0;
    for (let j = start; j < end; j += 1) {
      const v = Math.abs(samples[j] ?? 0);
      if (v > peak) peak = v;
    }
    out[i] = Math.min(1, peak);
  }
  return out;
}

/** Deterministic envelope derived from a string seed — same asset, same shape. */
export function synthesizePeaks(seed: string, buckets: number = DEFAULT_BUCKETS): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h ^ seed.charCodeAt(i)) * 16777619;
    h >>>= 0;
  }
  const count = Math.max(1, Math.floor(buckets));
  const out = new Array<number>(count);
  for (let i = 0; i < count; i += 1) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const noise = h / 0xffffffff;
    const speech = 0.55 + 0.35 * Math.sin((i / count) * Math.PI * 6);
    out[i] = Math.min(1, Math.max(0.04, speech * (0.45 + 0.55 * noise)));
  }
  return out;
}

const cache = new Map<string, PeakData>();
const inflight = new Map<string, Promise<PeakData>>();

function mixToMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  const first = buffer.getChannelData(0);
  if (channels === 1) return first;
  const mono = new Float32Array(first.length);
  for (let c = 0; c < channels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < mono.length; i += 1) mono[i] = (mono[i] ?? 0) + (data[i] ?? 0) / channels;
  }
  return mono;
}

async function decodePeaks(url: string, buckets: number): Promise<number[]> {
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("Web Audio indisponível");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const ctx = new Ctx();
  try {
    const buffer = await ctx.decodeAudioData(bytes);
    return bucketPeaks(mixToMono(buffer), buckets);
  } finally {
    void ctx.close();
  }
}

/** Peaks for an asset, cached per session. Never throws. */
export async function loadAssetPeaks(
  asset: MediaAsset,
  buckets: number = DEFAULT_BUCKETS,
): Promise<PeakData> {
  const key = `${asset.id}:${buckets}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;

  const decodable =
    typeof window !== "undefined" &&
    !asset.demo &&
    /^(blob:|https?:|data:|\/)/.test(asset.path) &&
    asset.audioChannels > 0;

  const task = (async (): Promise<PeakData> => {
    if (decodable) {
      try {
        return { peaks: await decodePeaks(asset.path, buckets), simulated: false };
      } catch {
        /* undecodable media — fall through to the synthesized envelope */
      }
    }
    return { peaks: synthesizePeaks(asset.id, buckets), simulated: true };
  })();

  inflight.set(key, task);
  const result = await task;
  inflight.delete(key);
  cache.set(key, result);
  return result;
}

export function __clearPeakCacheForTests() {
  cache.clear();
  inflight.clear();
}

/**
 * Slice of an asset's peaks covering a clip's source range, resampled to
 * `samples` points for rendering.
 */
export function clipPeakSlice(
  peaks: number[],
  assetDurationUs: number,
  sourceInUs: number,
  sourceOutUs: number,
  samples: number,
): number[] {
  const count = Math.max(1, Math.floor(samples));
  if (peaks.length === 0 || assetDurationUs <= 0) return new Array<number>(count).fill(0);
  const from = (Math.max(0, sourceInUs) / assetDurationUs) * peaks.length;
  const to = (Math.min(assetDurationUs, sourceOutUs) / assetDurationUs) * peaks.length;
  const span = Math.max(1e-6, to - from);
  const out = new Array<number>(count);
  for (let i = 0; i < count; i += 1) {
    const index = Math.min(peaks.length - 1, Math.max(0, Math.floor(from + (i / count) * span)));
    out[i] = peaks[index] ?? 0;
  }
  return out;
}
