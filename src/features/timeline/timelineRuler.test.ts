import { describe, expect, it } from "vitest";
import { SECOND } from "@/core/contracts/domain";
import { buildTicks } from "./TimelineRuler";

describe("buildTicks — single deterministic tick collection", () => {
  it("is deterministic for identical inputs", () => {
    const a = buildTicks(60 * SECOND, 28);
    const b = buildTicks(60 * SECOND, 28);
    expect(a).toEqual(b);
  });

  it("produces exactly 49 ticks for the canonical dense viewport (12 s at 64 px/s)", () => {
    // 12 s window at 64 px/s ≈ 768 px: major every 1 s, 4 subdivisions → 49 ticks.
    const ticks = buildTicks(12 * SECOND, 64);
    expect(ticks).toHaveLength(49);
    expect(ticks.filter((t) => t.major)).toHaveLength(13);
  });

  it("keeps ticks strictly increasing with labels only on majors", () => {
    const ticks = buildTicks(90 * SECOND, 28);
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i]!.us).toBeGreaterThan(ticks[i - 1]!.us);
    }
    for (const tick of ticks) {
      if (tick.major) expect(tick.label).toBeTruthy();
      else expect(tick.label).toBeNull();
    }
  });

  it("reduces density when zoomed out so labels cannot overlap", () => {
    const dense = buildTicks(60 * SECOND, 64).length;
    const medium = buildTicks(60 * SECOND, 28).length;
    const sparse = buildTicks(60 * SECOND, 6).length;
    expect(dense).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(sparse);
  });
});
