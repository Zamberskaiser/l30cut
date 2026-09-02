import { z } from "zod";

/**
 * Local-first behavioural training log.
 *
 * Every event stays on this machine (localStorage in the browser demo, the
 * same API will point at the app data dir under Tauri). Events feed two
 * things: the profile suggestions on /training and the exportable JSONL
 * dataset a user can take to fine-tune a local model. Nothing is uploaded.
 */

export const TRAINING_STORAGE_KEY = "l30cut.training.v1";
export const TRAINING_EVENT_LIMIT = 2000;

export const TrainingEventKindSchema = z.enum([
  "plan_proposed",
  "plan_applied",
  "plan_rejected",
  "plan_adjusted",
  "plan_validation_failed",
  "command_executed",
  "shortcut_used",
]);
export type TrainingEventKind = z.infer<typeof TrainingEventKindSchema>;

export const TrainingEventSchema = z
  .object({
    id: z.string().min(1).max(64),
    at: z.string().datetime(),
    kind: TrainingEventKindSchema,
    /** Where the sample came from — synthetic bootstrap data is never mixed
     *  silently with real usage when exporting datasets. */
    origin: z.enum(["synthetic-bootstrap", "real-usage"]),
    intent: z.string().max(120).optional(),
    planId: z.string().max(64).optional(),
    prompt: z.string().max(400).optional(),
    scopeKind: z.enum(["project", "sequence", "selection", "range", "transcript"]).optional(),
    operationCount: z.number().int().nonnegative().optional(),
    commandCount: z.number().int().nonnegative().optional(),
    provider: z.string().max(40).optional(),
    detail: z.string().max(240).optional(),
  })
  .strict();
export type TrainingEvent = z.infer<typeof TrainingEventSchema>;

type Listener = (events: TrainingEvent[]) => void;

const listeners = new Set<Listener>();
let cache: TrainingEvent[] | null = null;

/** Stable empty snapshot — required by useSyncExternalStore on the server. */
export const EMPTY_TRAINING_EVENTS: TrainingEvent[] = [];

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function load(): TrainingEvent[] {
  if (cache) return cache;
  if (!hasStorage()) return EMPTY_TRAINING_EVENTS;
  try {
    const raw = window.localStorage.getItem(TRAINING_STORAGE_KEY);
    if (!raw) return (cache = []);
    const parsed = z.array(TrainingEventSchema).safeParse(JSON.parse(raw));
    return (cache = parsed.success ? parsed.data : []);
  } catch {
    return (cache = []);
  }
}

function persist(events: TrainingEvent[]) {
  cache = events;
  if (hasStorage()) {
    try {
      window.localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify(events));
    } catch {
      /* quota exceeded — keep the in-memory ring only */
    }
  }
  for (const listener of listeners) listener(events);
}

export function listTrainingEvents(): TrainingEvent[] {
  return load();
}

export function subscribeTrainingEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let counter = 0;
function eventId(): string {
  counter += 1;
  return `tev_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/** Appends an event, keeping at most TRAINING_EVENT_LIMIT (ring buffer). */
export function recordTrainingEvent(
  event: Omit<TrainingEvent, "id" | "at" | "origin"> & { origin?: TrainingEvent["origin"] },
): TrainingEvent {
  const full = TrainingEventSchema.parse({
    ...event,
    id: eventId(),
    at: new Date().toISOString(),
    origin: event.origin ?? "real-usage",
  });
  const next = [...load(), full].slice(-TRAINING_EVENT_LIMIT);
  persist(next);
  return full;
}

export function clearTrainingEvents(): void {
  persist([]);
}

/** JSONL dataset — one validated event per line, filterable by origin. */
export function exportTrainingDataset(origin?: TrainingEvent["origin"]): {
  jsonl: string;
  count: number;
} {
  const events = load().filter((e) => (origin ? e.origin === origin : true));
  return { jsonl: events.map((e) => JSON.stringify(e)).join("\n"), count: events.length };
}

/** Validates and merges an imported JSONL dataset. Invalid lines are counted, never applied. */
export function importTrainingDataset(jsonl: string): { imported: number; rejected: number } {
  const existing = load();
  const seen = new Set(existing.map((e) => e.id));
  let imported = 0;
  let rejected = 0;
  const merged = [...existing];
  for (const line of jsonl.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = TrainingEventSchema.safeParse(JSON.parse(trimmed));
      if (parsed.success && !seen.has(parsed.data.id)) {
        merged.push(parsed.data);
        seen.add(parsed.data.id);
        imported += 1;
      } else if (!parsed.success) {
        rejected += 1;
      }
    } catch {
      rejected += 1;
    }
  }
  merged.sort((a, b) => a.at.localeCompare(b.at));
  persist(merged.slice(-TRAINING_EVENT_LIMIT));
  return { imported, rejected };
}

export function trainingEventStats(events: TrainingEvent[]) {
  const byKind = new Map<TrainingEventKind, number>();
  let synthetic = 0;
  for (const event of events) {
    byKind.set(event.kind, (byKind.get(event.kind) ?? 0) + 1);
    if (event.origin === "synthetic-bootstrap") synthetic += 1;
  }
  return { total: events.length, synthetic, real: events.length - synthetic, byKind };
}
