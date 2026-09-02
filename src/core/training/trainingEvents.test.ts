import { beforeEach, describe, expect, it } from "vitest";
import {
  clearTrainingEvents,
  exportTrainingDataset,
  importTrainingDataset,
  listTrainingEvents,
  recordTrainingEvent,
  trainingEventStats,
  TRAINING_EVENT_LIMIT,
} from "./trainingEvents";

describe("trainingEvents", () => {
  beforeEach(() => clearTrainingEvents());

  it("records validated events with real-usage default origin", () => {
    const event = recordTrainingEvent({ kind: "plan_applied", intent: "remove-silences" });
    expect(event.origin).toBe("real-usage");
    expect(listTrainingEvents()).toHaveLength(1);
  });

  it("rejects invalid events at the schema gate", () => {
    expect(() =>
      recordTrainingEvent({
        kind: "plan_applied",
        intent: "x".repeat(200),
      }),
    ).toThrow();
    expect(listTrainingEvents()).toHaveLength(0);
  });

  it("separates synthetic bootstrap from real usage in exports", () => {
    recordTrainingEvent({ kind: "plan_proposed", origin: "synthetic-bootstrap" });
    recordTrainingEvent({ kind: "plan_applied", origin: "real-usage" });
    expect(exportTrainingDataset().count).toBe(2);
    expect(exportTrainingDataset("real-usage").count).toBe(1);
    const stats = trainingEventStats(listTrainingEvents());
    expect(stats.synthetic).toBe(1);
    expect(stats.real).toBe(1);
  });

  it("round-trips a JSONL dataset and skips invalid lines", () => {
    recordTrainingEvent({ kind: "plan_adjusted", detail: "menos legendas" });
    const { jsonl } = exportTrainingDataset();
    clearTrainingEvents();
    const result = importTrainingDataset(`${jsonl}\nnot json\n{"kind":"hack"}`);
    expect(result.imported).toBe(1);
    expect(result.rejected).toBe(2);
    expect(listTrainingEvents()).toHaveLength(1);
  });

  it("does not import duplicated ids twice", () => {
    recordTrainingEvent({ kind: "plan_applied" });
    const { jsonl } = exportTrainingDataset();
    const result = importTrainingDataset(jsonl);
    expect(result.imported).toBe(0);
    expect(listTrainingEvents()).toHaveLength(1);
  });

  it("caps the ring buffer at the event limit", () => {
    for (let i = 0; i < TRAINING_EVENT_LIMIT + 25; i += 1) {
      recordTrainingEvent({ kind: "shortcut_used" });
    }
    expect(listTrainingEvents()).toHaveLength(TRAINING_EVENT_LIMIT);
  });
});
