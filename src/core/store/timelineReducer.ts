import type { EditCommand, Transaction } from "../contracts/commands";
import {
  activeSequence,
  clipDuration,
  clipEnd,
  clipRate,
  clipSourceSpan,
  type Clip,
  type Project,
  type Sequence,
} from "../contracts/domain";

export class CommandError extends Error {}

export const MIN_CLIP_US = 40_000; // 40ms — nothing shorter is useful on a timeline

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}${Date.now().toString(36).slice(-4)}`;
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

function withSequence(project: Project, fn: (seq: Sequence, next: Project) => void): Project {
  const next = clone(project);
  const seq = next.sequences.find((s) => s.id === next.activeSequenceId);
  if (!seq) throw new CommandError("active sequence missing");
  fn(seq, next);
  seq.clips.sort((a, b) => a.startUs - b.startUs || a.trackId.localeCompare(b.trackId));
  next.updatedAt = new Date().toISOString();
  return next;
}

function requireClip(seq: Sequence, clipId: string): Clip {
  const clip = seq.clips.find((c) => c.id === clipId);
  if (!clip) throw new CommandError(`clip not found: ${clipId}`);
  return clip;
}

/** Blocks any mutation on a locked track. */
function requireUnlockedTrack(seq: Sequence, trackId: string): void {
  const track = seq.tracks.find((t) => t.id === trackId);
  if (!track) throw new CommandError(`track not found: ${trackId}`);
  if (track.locked) throw new CommandError(`trilha bloqueada: ${track.name}`);
}

function assetDurationUs(project: Project, clip: Clip): number | null {
  const asset = project.assets.find((a) => a.id === clip.assetId);
  return asset ? asset.durationUs : null;
}

/** Timeline-space edge trim: start edge moves startUs AND sourceInUs together. */
function applyEdgeTrim(
  project: Project,
  seq: Sequence,
  clip: Clip,
  edge: "start" | "end",
  toUs: number,
): void {
  requireUnlockedTrack(seq, clip.trackId);
  const rate = clipRate(clip);
  if (edge === "start") {
    if (toUs < 0) throw new CommandError("negative timeline position");
    if (toUs > clipEnd(clip) - MIN_CLIP_US) throw new CommandError("trim result too short");
    const deltaTimeline = toUs - clip.startUs;
    const newSourceIn = clip.sourceInUs + Math.round(deltaTimeline * rate);
    if (newSourceIn < 0) throw new CommandError("negative source in point");
    if (clip.sourceOutUs - newSourceIn < MIN_CLIP_US)
      throw new CommandError("trim result too short");
    clip.startUs = toUs;
    clip.sourceInUs = newSourceIn;
  } else {
    if (toUs < clip.startUs + MIN_CLIP_US) throw new CommandError("trim result too short");
    const newSourceOut = clip.sourceInUs + Math.round((toUs - clip.startUs) * rate);
    const maxSource = assetDurationUs(project, clip);
    if (maxSource !== null && newSourceOut > maxSource) {
      throw new CommandError("out point além da duração da mídia");
    }
    clip.sourceOutUs = newSourceOut;
  }
}

/** Pure command application. Never mutates the input project. */
export function applyCommand(project: Project, command: EditCommand): Project {
  switch (command.type) {
    case "splitClip":
      return withSequence(project, (seq) => {
        const clip = requireClip(seq, command.clipId);
        requireUnlockedTrack(seq, clip.trackId);
        const offset = command.atUs - clip.startUs;
        if (offset <= MIN_CLIP_US || offset >= clipDuration(clip) - MIN_CLIP_US) {
          throw new CommandError("split point is outside the clip body");
        }
        const sourceOffset = Math.round(offset * clipRate(clip));
        const right: Clip = {
          ...clip,
          id: newId("clip"),
          startUs: command.atUs,
          sourceInUs: clip.sourceInUs + sourceOffset,
        };
        clip.sourceOutUs = clip.sourceInUs + sourceOffset;
        seq.clips.push(right);
      });

    case "trimClip":
      return withSequence(project, (seq, next) => {
        const clip = requireClip(seq, command.clipId);
        requireUnlockedTrack(seq, clip.trackId);
        const nextIn = command.sourceInUs ?? clip.sourceInUs;
        const nextOut = command.sourceOutUs ?? clip.sourceOutUs;
        if (nextOut - nextIn < MIN_CLIP_US) throw new CommandError("trim result too short");
        if (nextIn < 0) throw new CommandError("negative source in point");
        const maxSource = assetDurationUs(next, clip);
        if (maxSource !== null && nextOut > maxSource) {
          throw new CommandError("out point além da duração da mídia");
        }
        clip.sourceInUs = nextIn;
        clip.sourceOutUs = nextOut;
      });

    case "trimClipEdge":
      return withSequence(project, (seq, next) => {
        const clip = requireClip(seq, command.clipId);
        applyEdgeTrim(next, seq, clip, command.edge, command.toUs);
      });

    case "rippleTrimClip":
      return withSequence(project, (seq, next) => {
        const clip = requireClip(seq, command.clipId);
        requireUnlockedTrack(seq, clip.trackId);
        const oldEnd = clipEnd(clip);
        const oldDuration = clipDuration(clip);
        if (command.edge === "end") {
          applyEdgeTrim(next, seq, clip, "end", command.toUs);
          const delta = clipDuration(clip) - oldDuration;
          for (const other of seq.clips) {
            if (other.id !== clip.id && other.trackId === clip.trackId && other.startUs >= oldEnd) {
              other.startUs = Math.max(0, other.startUs + delta);
            }
          }
        } else {
          // Ripple in-trim: in point moves, clip keeps its start, downstream closes the gap.
          const deltaTimeline = command.toUs - clip.startUs;
          const rate = clipRate(clip);
          const newSourceIn = clip.sourceInUs + Math.round(deltaTimeline * rate);
          if (newSourceIn < 0) throw new CommandError("negative source in point");
          if (clip.sourceOutUs - newSourceIn < MIN_CLIP_US) {
            throw new CommandError("trim result too short");
          }
          clip.sourceInUs = newSourceIn;
          for (const other of seq.clips) {
            if (other.id !== clip.id && other.trackId === clip.trackId && other.startUs >= oldEnd) {
              other.startUs = Math.max(0, other.startUs - deltaTimeline);
            }
          }
        }
      });

    case "rollingEdit":
      return withSequence(project, (seq, next) => {
        const left = requireClip(seq, command.leftClipId);
        const right = requireClip(seq, command.rightClipId);
        requireUnlockedTrack(seq, left.trackId);
        requireUnlockedTrack(seq, right.trackId);
        if (left.trackId !== right.trackId)
          throw new CommandError("rolling edit exige a mesma trilha");
        if (Math.abs(clipEnd(left) - right.startUs) > 1_000) {
          throw new CommandError("rolling edit exige clips adjacentes");
        }
        if (
          command.toUs < left.startUs + MIN_CLIP_US ||
          command.toUs > clipEnd(right) - MIN_CLIP_US
        ) {
          throw new CommandError("boundary fora dos limites dos clips");
        }
        const newLeftSourceOut =
          left.sourceInUs + Math.round((command.toUs - left.startUs) * clipRate(left));
        const leftMax = assetDurationUs(next, left);
        if (leftMax !== null && newLeftSourceOut > leftMax) {
          throw new CommandError("mídia do clip esquerdo insuficiente");
        }
        const deltaRight = command.toUs - right.startUs;
        const newRightSourceIn = right.sourceInUs + Math.round(deltaRight * clipRate(right));
        if (newRightSourceIn < 0) throw new CommandError("mídia do clip direito insuficiente");
        left.sourceOutUs = newLeftSourceOut;
        right.sourceInUs = newRightSourceIn;
        right.startUs = command.toUs;
      });

    case "rateStretchClip":
      return withSequence(project, (seq) => {
        const clip = requireClip(seq, command.clipId);
        requireUnlockedTrack(seq, clip.trackId);
        if (command.newDurationUs < MIN_CLIP_US) throw new CommandError("duração abaixo do mínimo");
        const rate = clipSourceSpan(clip) / command.newDurationUs;
        if (rate < 0.1 || rate > 10) {
          throw new CommandError("velocidade fora do intervalo permitido (0.1×–10×)");
        }
        clip.playbackRate = Math.round(rate * 10_000) / 10_000;
      });

    case "slipClip":
      return withSequence(project, (seq, next) => {
        const clip = requireClip(seq, command.clipId);
        requireUnlockedTrack(seq, clip.trackId);
        const newIn = clip.sourceInUs + command.deltaUs;
        const newOut = clip.sourceOutUs + command.deltaUs;
        if (newIn < 0) throw new CommandError("slip além do início da mídia");
        const maxSource = assetDurationUs(next, clip);
        if (maxSource !== null && newOut > maxSource) {
          throw new CommandError("slip além do fim da mídia");
        }
        clip.sourceInUs = newIn;
        clip.sourceOutUs = newOut;
      });

    case "slideClip":
      return withSequence(project, (seq, next) => {
        const clip = requireClip(seq, command.clipId);
        requireUnlockedTrack(seq, clip.trackId);
        const sameTrack = seq.clips
          .filter((c) => c.trackId === clip.trackId && c.id !== clip.id)
          .sort((a, b) => a.startUs - b.startUs);
        const prev = sameTrack.filter((c) => clipEnd(c) <= clip.startUs + 1_000).at(-1);
        const nextClip = sameTrack.find((c) => c.startUs >= clipEnd(clip) - 1_000);
        if (!prev || !nextClip) throw new CommandError("slide exige vizinhos adjacentes");
        if (
          Math.abs(clipEnd(prev) - clip.startUs) > 1_000 ||
          Math.abs(nextClip.startUs - clipEnd(clip)) > 1_000
        ) {
          throw new CommandError("slide exige vizinhos adjacentes");
        }
        const delta = command.deltaUs;
        // prev absorbs at its out point, next at its in point.
        const newPrevSourceOut = prev.sourceOutUs + Math.round(delta * clipRate(prev));
        const prevMax = assetDurationUs(next, prev);
        if (newPrevSourceOut - prev.sourceInUs < MIN_CLIP_US)
          throw new CommandError("vizinho anterior ficaria curto demais");
        if (prevMax !== null && newPrevSourceOut > prevMax)
          throw new CommandError("mídia do vizinho anterior insuficiente");
        const newNextSourceIn = nextClip.sourceInUs + Math.round(delta * clipRate(nextClip));
        if (newNextSourceIn < 0) throw new CommandError("mídia do próximo vizinho insuficiente");
        if (nextClip.sourceOutUs - newNextSourceIn < MIN_CLIP_US)
          throw new CommandError("próximo vizinho ficaria curto demais");
        if (clip.startUs + delta < 0) throw new CommandError("negative timeline position");
        prev.sourceOutUs = newPrevSourceOut;
        nextClip.sourceInUs = newNextSourceIn;
        nextClip.startUs = nextClip.startUs + delta;
        clip.startUs = clip.startUs + delta;
      });

    case "moveClip":
      return withSequence(project, (seq) => {
        const clip = requireClip(seq, command.clipId);
        requireUnlockedTrack(seq, clip.trackId);
        if (command.toStartUs < 0) throw new CommandError("negative timeline position");
        if (command.toTrackId) {
          const track = seq.tracks.find((t) => t.id === command.toTrackId);
          if (!track) throw new CommandError(`track not found: ${command.toTrackId}`);
          requireUnlockedTrack(seq, track.id);
          clip.trackId = track.id;
        }
        clip.startUs = command.toStartUs;
      });

    case "duplicateClip":
      return withSequence(project, (seq) => {
        const clip = requireClip(seq, command.clipId);
        const targetTrackId = command.toTrackId ?? clip.trackId;
        requireUnlockedTrack(seq, targetTrackId);
        const copy: Clip = {
          ...clip,
          id: command.newClipId ?? newId("clip"),
          trackId: targetTrackId,
          startUs: command.toStartUs ?? clipEnd(clip),
        };
        if (copy.startUs < 0) throw new CommandError("negative timeline position");
        seq.clips.push(copy);
      });

    case "deleteClip":
      return withSequence(project, (seq) => {
        const clip = requireClip(seq, command.clipId);
        requireUnlockedTrack(seq, clip.trackId);
        seq.clips = seq.clips.filter((c) => c.id !== command.clipId);
      });

    case "rippleDelete":
      return withSequence(project, (seq) => {
        const clip = requireClip(seq, command.clipId);
        requireUnlockedTrack(seq, clip.trackId);
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
        const clip = requireClip(seq, command.clipId);
        requireUnlockedTrack(seq, clip.trackId);
        clip.gainDb = command.gainDb;
      });

    case "setGainKeyframes":
      return withSequence(project, (seq) => {
        const clip = requireClip(seq, command.clipId);
        requireUnlockedTrack(seq, clip.trackId);
        const duration = clipDuration(clip);
        const sorted = [...command.keyframes].sort((a, b) => a.atUs - b.atUs);
        for (const kf of sorted) {
          if (kf.atUs > duration) throw new CommandError("keyframe fora do clip");
        }
        clip.gainKeyframes = sorted;
      });

    case "addCaption":
      return withSequence(project, (seq) => {
        if (command.segment.endUs <= command.segment.startUs) {
          throw new CommandError("caption range is empty");
        }
        seq.captions = [...seq.captions, command.segment].sort((a, b) => a.startUs - b.startUs);
      });

    case "addMarker":
      return withSequence(project, (seq) => {
        if (seq.markers.some((m) => m.id === command.marker.id)) {
          throw new CommandError("marker id already exists");
        }
        seq.markers = [...seq.markers, command.marker].sort((a, b) => a.atUs - b.atUs);
      });

    case "setTrackLock":
      return withSequence(project, (seq) => {
        const track = seq.tracks.find((t) => t.id === command.trackId);
        if (!track) throw new CommandError(`track not found: ${command.trackId}`);
        track.locked = command.locked;
      });

    case "setSequenceAspect":
      return withSequence(project, (seq) => {
        seq.aspect = command.aspect;
      });

    case "insertClip":
      return withSequence(project, (seq) => {
        const track = seq.tracks.find((t) => t.id === command.trackId);
        if (!track) throw new CommandError(`track not found: ${command.trackId}`);
        requireUnlockedTrack(seq, track.id);
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
