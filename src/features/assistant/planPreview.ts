import type { AiEditPlan } from "@/core/contracts/aiPlan";
import type { RuntimeAdapter } from "@/core/runtime/types";
import {
  activeSequence,
  sequenceDuration,
  type Project,
  type Sequence,
} from "@/core/contracts/domain";
import { applyCommand } from "@/core/store/timelineReducer";
import { compilePlan } from "./planExecutor";

export interface SequenceSnapshot {
  clips: number;
  durationUs: number;
  captions: number;
  markers: number;
  sequences: number;
}

export interface PlanPreview {
  ok: true;
  commandCount: number;
  before: SequenceSnapshot;
  after: SequenceSnapshot;
}
export interface PlanPreviewFailure {
  ok: false;
  errors: string[];
}

function snapshot(project: Project, seq: Sequence): SequenceSnapshot {
  return {
    clips: seq.clips.length,
    durationUs: sequenceDuration(seq),
    captions: seq.captions.length,
    markers: seq.markers.length,
    sequences: project.sequences.length,
  };
}

/**
 * Non-mutating dry run: compiles the plan and folds the pure reducer over a
 * detached copy of the project. The editor store is never touched — the same
 * validation path that would reject the real apply rejects the preview.
 */
export function previewPlan(
  project: Project,
  plan: AiEditPlan,
  runtime: Pick<RuntimeAdapter, "capabilities">,
): PlanPreview | PlanPreviewFailure {
  const compiled = compilePlan(project, plan, runtime);
  if (!compiled.ok) return { ok: false, errors: compiled.errors };

  let next = project;
  try {
    for (const command of compiled.transaction.commands) {
      next = applyCommand(next, command);
    }
  } catch (error) {
    return { ok: false, errors: [(error as Error).message] };
  }

  return {
    ok: true,
    commandCount: compiled.transaction.commands.length,
    before: snapshot(project, activeSequence(project)),
    after: snapshot(next, activeSequence(next)),
  };
}
