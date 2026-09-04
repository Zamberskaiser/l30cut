import { describe, expect, it } from "vitest";
import { concatChunks, downsample, encodeWav, peakLevel } from "./wav";

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return Array.from(bytes.slice(offset, offset + length))
    .map((code) => String.fromCharCode(code))
    .join("");
}

describe("dictation wav encoder", () => {
  it("writes a RIFF/WAVE header describing mono 16-bit audio", () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5]), 16_000);
    const view = new DataView(wav.buffer);
    expect(readAscii(wav, 0, 4)).toBe("RIFF");
    expect(readAscii(wav, 8, 4)).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1); // channels
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(view.getUint32(40, true)).toBe(6); // data bytes
    expect(wav.length).toBe(44 + 6);
  });

  it("keeps sample values recoverable after encoding", () => {
    const wav = encodeWav(new Float32Array([1, -1]), 16_000);
    const view = new DataView(wav.buffer);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });

  it("downsamples to the target rate and leaves lower rates untouched", () => {
    const input = new Float32Array(48_000).fill(0.25);
    const out = downsample(input, 48_000, 16_000);
    expect(out.length).toBe(16_000);
    expect(out[0]).toBeCloseTo(0.25, 5);
    expect(downsample(input, 16_000, 16_000)).toBe(input);
  });

  it("merges chunks and reports the peak level", () => {
    const merged = concatChunks([new Float32Array([0.1, -0.2]), new Float32Array([0.9])]);
    expect(Array.from(merged)).toEqual([0.1, -0.2, 0.9]);
    expect(peakLevel(merged)).toBeCloseTo(0.9, 5);
    expect(peakLevel(new Float32Array(10))).toBe(0);
  });
});
