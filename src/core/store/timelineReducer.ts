import type { EditCommand, Transaction } from "../contracts/commands";
import {
  activeSequence,
  clipDuration,
  clipEnd,
  type Clip,
  type Project,
  type Sequence,
} from "../contracts/domain";

export class CommandError extends Error {}

const MIN_CLIP_US = 40_000; // 40ms — nothing shorter is useful on a timeline

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}${Date.now().toString(36).slice(-4)}`;
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

function withSequence(project: Project, fn: (seq: Sequence) => void): Project {
  const next = clone(project);
  const seq = next.sequences.find((s) => s.id === next.activeSequenceId);
  if (!seq) throw new CommandError("active sequence missing");
  fn(seq);
  seq.clips.sort((a, b) => a.startUs - b.startUs || a.trackId.localeCompare(b.trackId));
  next.updatedAt = new Date().toISOString();
  return next;
}

function requireClip(seq: Sequence, clipId: string): Clip {
  const clip = seq.clips.find((c) => c.id === clipId);
  if (!clip) throw new CommandError(`clip not found: ${clipId}`);
  return clip;
}

/** Pure command application. Never mutates the input project. */
export function applyCommand(project: Project, command: EditCommand): Project {
  switch (command.type) {
    case "splitClip":
      return withSequence(project, (seq) => {
        const clip = requireClip(seq, command.clipId);
        const offset = command.atUs - clip.startUs;
        if (offset <= MIN_CLIP_US || offset >= clipDuration(clip) - MIN_CLIP_US) {
          throw new CommandError("split point is outside the clip body");
        }
        const right: Clip = {
          ...clip,
          id: newId("clip"),
          startUs: command.atUs,
          sourceInUs: clip.sourceInUs + offset,
        };
        clip.sourceOutUs = clip.sourceInUs + offset;
        seq.clips.push(right);
      });

    case "trimClip":
      return withSequence(project, (seq) => {
        const clip = requireClip(seq, command.clipId);
        const nextIn = command.sourceInUs ?? clip.sourceInUs;
        const nextOut = command.sourceOutUs ?? clip.sourceOutUs;
        if (nextOut - nextIn < MIN_CLIP_US) throw new CommandError("trim result too short");
        if (nextIn < 0) throw new CommandError("negative source in point");
        clip.sourceInUs = nextIn;
        clip.sourceOutUs = nextOut;
      });

    case "moveClip":
      return withSequence(project, (seq) => {
        const clip = requireClip(seq, command.clipId);
        if (command.toStartUs < 0) throw new CommandError("negative timeline position");
        if (command.toTrackId) {
          const track = seq.tracks.find((t) => t.id === command.toTrackId);
          if (!track) throw new CommandError(`track not found: ${command.toTrackId}`);
          clip.trackId = track.id;
        }
        clip.startUs = command.toStartUs;
      });

    case "duplicateClip":
      return withSequence(project, (seq) => {
        const clip = requireClip(seq, command.clipId);
        const copy: Clip = {
          ...clip,
          id: command.newClipId ?? newId("clip"),
          startUs: command.toStartUs ?? clipEnd(clip),
        };
        seq.clips.push(copy);
      });

    case "deleteClip":
      return withSequence(project, (seq) => {
        requireClip(seq, command.clipId);
        seq.clips = seq.clips.filter((c) => c.id !== command.clipId);
      });

    case "rippleDelete":
      return withSequence(project, (seq) => {
        const clip = requireClip(seq, command.clipId);
        const gap = clipDuration(clip);
        const trackId = clip.trackId;
        const from = clip.startUs;
        seq.clips = seq.clips
          .filter((c) => c.id !== clip.id)
          .map((c) =>
            c.trackId === trackId && c.startUs > from
              ? { ...c, startUs: Math.max(0, c.startUs - gap) }
              : c,
          );
      });

    case "changeGain":
      return withSequence(project, (seq) => {
        requireClip(seq, command.clipId).gainDb = command.gainDb;
      });

    case "addCaption":
      return withSequence(project, (seq) => {
        if (command.segment.endUs <= command.segment.startUs) {
          throw new CommandError("caption range is empty");
        }
        seq.captions = [...seq.captions, command.segment].sort((a, b) => a.startUs - b.startUs);
      });

    case "setSequenceAspect":
      return withSequence(project, (seq) => {
        seq.aspect = command.aspect;
      });

    case "insertClip":
      return withSequence(project, (seq) => {
        const track = seq.tracks.find((t) => t.id === command.trackId);
        if (!track) throw new CommandError(`track not found: ${command.trackId}`);
        if (!project.assets.some((a) => a.id === command.assetId)) {
          throw new CommandError(`asset not found: ${command.assetId}`);
        }
        if (command.sourceOutUs - command.sourceInUs < MIN_CLIP_US) {
          throw new CommandError("clip range too short");
        }
        seq.clips.push({
          id: command.clipId,
          trackId: command.trackId,
          assetId: command.assetId,
          label: command.label,
          startUs: command.startUs,
          sourceInUs: command.sourceInUs,
          sourceOutUs: command.sourceOutUs,
          gainDb: 0,
          enabled: true,
        });
      });

    case "createSequence": {
      const next = clone(project);
      if (next.sequences.some((s) => s.id === command.sequenceId)) {
        throw new CommandError("sequence id already exists");
      }
      const base = activeSequence(project);
      next.sequences.push({
        id: command.sequenceId,
        name: command.name,
        aspect: command.aspect,
        fpsNum: base.fpsNum,
        fpsDen: base.fpsDen,
        tracks: clone(base.tracks),
        clips: [],
        captions: [],
        markers: [],
      });
      if (command.activate) next.activeSequenceId = command.sequenceId;
      next.updatedAt = new Date().toISOString();
      return next;
    }
  }
}

export interface HistoryEntry {
  id: string;
  label: string;
  source: Transaction["source"];
  planId?: string;
  before: Project;
  after: Project;
  at: number;
  commandCount: number;
}

export interface EditorHistory {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const emptyHistory: EditorHistory = { past: [], future: [] };

export interface TransactionResult {
  project: Project;
  history: EditorHistory;
  entry: HistoryEntry;
}

/**
 * Applies a whole transaction atomically: any failing command rolls the
 * entire batch back and throws, so history never contains partial edits.
 */
export function applyTransaction(
  project: Project,
  history: EditorHistory,
  tx: Transaction,
): TransactionResult {
  if (tx.commands.length === 0) throw new CommandError("empty transaction");
  let draft = project;
  for (const command of tx.commands) {
    draft = applyCommand(draft, command);
  }
  const entry: HistoryEntry = {
    id: newId("tx"),
    label: tx.label,
    source: tx.source,
    ...(tx.planId ? { planId: tx.planId } : {}),
    before: project,
    after: draft,
    at: Date.now(),
    commandCount: tx.commands.length,
  };
  return {
    project: draft,
    history: { past: [...history.past, entry], future: [] },
    entry,
  };
}

export function undo(history: EditorHistory): { project: Project; history: EditorHistory } | null {
  const entry = history.past.at(-1);
  if (!entry) return null;
  return {
    project: entry.before,
    history: { past: history.past.slice(0, -1), future: [entry, ...history.future] },
  };
}

export function redo(history: EditorHistory): { project: Project; history: EditorHistory } | null {
  const entry = history.future[0];
  if (!entry) return null;
  return {
    project: entry.after,
    history: { past: [...history.past, entry], future: history.future.slice(1) },
  };
}
