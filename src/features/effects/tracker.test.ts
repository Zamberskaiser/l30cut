import { describe, expect, it } from "vitest";
import { cropTemplate, matchTemplate, toGray, type GrayFrame } from "./tracker";

function frameWithSquare(width: number, height: number, sx: number, sy: number, size: number) {
  const data = new Float32Array(width * height).fill(0.1);
  for (let y = sy; y < sy + size; y += 1) {
    for (let x = sx; x < sx + size; x += 1) data[y * width + x] = 0.95;
  }
  return { width, height, data } satisfies GrayFrame;
}

describe("tracker", () => {
  it("converts rgba to normalized grayscale", () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const gray = toGray(rgba, 2, 1);
    expect(gray.data[0]).toBeCloseTo(1, 5);
    expect(gray.data[1]).toBeCloseTo(0, 5);
  });

  it("crops the template clamped to the frame bounds", () => {
    const frame = frameWithSquare(20, 20, 4, 4, 4);
    const tpl = cropTemplate(frame, { x: 18, y: 18, w: 10, h: 10 });
    expect(tpl.width).toBe(2);
    expect(tpl.height).toBe(2);
  });

  it("follows a moving square across frames", () => {
    const first = frameWithSquare(48, 48, 10, 10, 6);
    const tpl = cropTemplate(first, { x: 10, y: 10, w: 6, h: 6 });
    const moved = frameWithSquare(48, 48, 17, 13, 6);
    const found = matchTemplate(moved, tpl, 10, 10, 12);
    expect(found.x).toBe(17);
    expect(found.y).toBe(13);
    expect(found.score).toBeGreaterThan(0.99);
  });

  it("stays put when nothing matches better inside the radius", () => {
    const frame = frameWithSquare(32, 32, 4, 4, 4);
    const tpl = cropTemplate(frame, { x: 4, y: 4, w: 4, h: 4 });
    const found = matchTemplate(frame, tpl, 4, 4, 6);
    expect(found).toMatchObject({ x: 4, y: 4 });
  });
});
