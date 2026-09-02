import type { Job, JobKind } from "@/core/contracts/domain";

export interface JobRunContext {
  onProgress: (progress: number, detail?: string) => void;
  signal: AbortSignal;
}

export interface JobSpec<T = unknown> {
  kind: JobKind;
  label: string;
  run: (ctx: JobRunContext) => Promise<T>;
}

type Listener = (jobs: Job[]) => void;

let jobCounter = 0;

/**
 * Small sequential job queue with real progress, cancellation and error states.
 * Concurrency is capped so a local machine is never flooded with FFmpeg runs.
 */
export class JobQueue {
  private jobs: Job[] = [];
  private controllers = new Map<string, AbortController>();
  private pending: string[] = [];
  private running = 0;
  private listeners = new Set<Listener>();
  private specs = new Map<string, JobSpec<unknown>>();

  constructor(private readonly concurrency = 2) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): Job[] {
    return this.jobs.map((j) => ({ ...j }));
  }

  private emit() {
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
  }

  private patch(id: string, patch: Partial<Job>) {
    this.jobs = this.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
    this.emit();
  }

  enqueue<T>(spec: JobSpec<T>): { id: string; done: Promise<T> } {
    jobCounter += 1;
    const id = `job_${jobCounter}`;
    this.jobs = [
      ...this.jobs,
      { id, kind: spec.kind, label: spec.label, status: "queued", progress: 0 },
    ];
    this.specs.set(id, spec as JobSpec<unknown>);
    this.pending.push(id);
    this.emit();
    const done = new Promise<T>((resolve, reject) => {
      this.resolvers.set(id, { resolve: resolve as (v: unknown) => void, reject });
    });
    void this.pump();
    return { id, done };
  }

  private resolvers = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: unknown) => void }
  >();

  cancel(id: string) {
    const job = this.jobs.find((j) => j.id === id);
    if (!job || job.status === "succeeded" || job.status === "failed") return;
    this.controllers.get(id)?.abort();
    this.pending = this.pending.filter((p) => p !== id);
    if (job.status === "queued") {
      this.patch(id, { status: "canceled", finishedAt: Date.now() });
      this.resolvers.get(id)?.reject(new Error("Cancelado"));
      this.resolvers.delete(id);
    }
  }

  clearFinished() {
    this.jobs = this.jobs.filter((j) => j.status === "queued" || j.status === "running");
    this.emit();
  }

  private async pump(): Promise<void> {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const id = this.pending.shift()!;
      const spec = this.specs.get(id);
      if (!spec) continue;
      this.running += 1;
      void this.execute(id, spec).finally(() => {
        this.running -= 1;
        void this.pump();
      });
    }
  }

  private async execute(id: string, spec: JobSpec<unknown>) {
    const controller = new AbortController();
    this.controllers.set(id, controller);
    this.patch(id, { status: "running", startedAt: Date.now(), progress: 0 });
    const resolver = this.resolvers.get(id);
    try {
      const value = await spec.run({
        signal: controller.signal,
        onProgress: (progress, detail) =>
          this.patch(id, { progress: Math.min(1, Math.max(0, progress)), detail: detail ?? "" }),
      });
      this.patch(id, { status: "succeeded", progress: 1, finishedAt: Date.now() });
      resolver?.resolve(value);
    } catch (error) {
      const canceled = controller.signal.aborted;
      this.patch(id, {
        status: canceled ? "canceled" : "failed",
        finishedAt: Date.now(),
        error: canceled ? "" : (error as Error).message,
      });
      resolver?.reject(error);
    } finally {
      this.resolvers.delete(id);
      this.controllers.delete(id);
      this.specs.delete(id);
    }
  }
}
