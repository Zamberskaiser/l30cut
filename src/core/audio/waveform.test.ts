import { describe, expect, it } from "vitest";
import { bucketPeaks, clipPeakSlice, synthesizePeaks } from "./waveform";

describe("bucketPeaks", () => {
  it("keeps the absolute peak of each bucket", () => {
    const samples = [0, 0.2, -0.9, 0.1, 0.3, -0.4, 1, -0.05];
    expect(bucketPeaks(samples, 4)).toEqual([0.2, 0.9, 0.4, 1]);
  });

  it("returns the requested bucket count and stays normalized", () => {
    const peaks = bucketPeaks([2, -3, 0.5], 8);
    expect(peaks).toHaveLength(8);
    expect(peaks.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it("handles empty input", () => {
    expect(bucketPeaks([], 3)).toEqual([0, 0, 0]);
  });
});

describe("synthesizePeaks", () => {
  it("is deterministic per seed", () => {
    expect(synthesizePeaks("asset_a", 32)).toEqual(synthesizePeaks("asset_a", 32));
    expect(synthesizePeaks("asset_a", 32)).not.toEqual(synthesizePeaks("asset_b", 32));
  });

  it("stays inside the drawable range", () => {
    expect(synthesizePeaks("seed", 64).every((v) => v > 0 && v <= 1)).toBe(true);
  });
});

describe("clipPeakSlice", () => {
  const peaks = Array.from({ length: 100 }, (_, i) => i / 99);

  it("maps the clip source range onto the asset peaks", () => {
    const slice = clipPeakSlice(peaks, 1_000_000, 500_000, 1_000_000, 10);
    expect(slice).toHaveLength(10);
    expect(slice[0]).toBeCloseTo(peaks[50]!, 5);
    expect(slice[9]!).toBeGreaterThan(slice[0]!);
  });

  it("degrades to zeros without data", () => {
    expect(clipPeakSlice([], 1_000, 0, 1_000, 4)).toEqual([0, 0, 0, 0]);
    expect(clipPeakSlice(peaks, 0, 0, 10, 3)).toEqual([0, 0, 0]);
  });
});
