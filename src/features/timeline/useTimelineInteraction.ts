import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { EditCommand } from "@/core/contracts/commands";
import {
  clipDuration,
  clipEnd,
  clipRate,
  SECOND,
  type Clip,
  type Sequence,
} from "@/core/contracts/domain";
import { registerGestureCancel } from "@/core/commands/useCommandContext";
import { newId } from "@/core/store/timelineReducer";
import { useEditor } from "@/core/store/editorStore";
import { useUi } from "@/core/store/uiStore";
import {
  applySnap,
  DRAG_THRESHOLD_PX,
  clipZoneAt,
  pxToUs,
  snapTargets,
  SNAP_TOLERANCE_PX,
  TRACK_HEIGHT,
  usToPx,
  type ClipZone,
} from "./geometry";

export interface GhostMove {
  clipIds: string[];
  deltaUs: number;
  trackId: string | null;
  duplicate: boolean;
}

export interface GhostTrim {
  clipId: string;
  edge: "start" | "end";
  toUs: number;
  kind: "trim" | "ripple" | "rate" | "rolling";
}

export interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface BaseGesture {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
}

type Gesture =
  | (BaseGesture & { kind: "scrub" })
  | (BaseGesture & {
      kind: "move";
      clipIds: string[];
      originTrackId: string;
      duplicate: boolean;
    })
  | (BaseGesture & {
      kind: "trim";
      clipId: string;
      edge: "start" | "end";
      mode: "trim" | "ripple" | "rate";
    })
  | (BaseGesture & { kind: "rolling"; leftClipId: string; rightClipId: string })
  | (BaseGesture & { kind: "slip"; clipId: string })
  | (BaseGesture & { kind: "slide"; clipId: string })
  | (BaseGesture & { kind: "marquee"; startX: number; startY: number })
  | (BaseGesture & { kind: "pan"; startScrollLeft: number })
  | (BaseGesture & { kind: "press"; clipId: string });

export interface TimelineInteraction {
  ghostMove: GhostMove | null;
  ghostTrim: GhostTrim | null;
  ghostShift: { clipId: string; deltaUs: number; kind: "slip" | "slide" } | null;
  marquee: MarqueeRect | null;
  snapGuideUs: number | null;
  gestureKind: Gesture["kind"] | null;
  onRulerPointerDown: (event: React.PointerEvent) => void;
  onClipPointerDown: (event: React.PointerEvent, clip: Clip) => void;
  onLanePointerDown: (event: React.PointerEvent, trackId: string) => void;
  onLaneWheel: (event: React.WheelEvent) => void;
}

interface Params {
  /** Scrolling viewport element. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Content element (full timeline width) used for coordinate math. */
  contentRef: RefObject<HTMLDivElement | null>;
  sequence: Sequence;
}

const isLocked = (seq: Sequence, trackId: string): boolean =>
  Boolean(seq.tracks.find((t) => t.id === trackId)?.locked);

export function useTimelineInteraction({
  scrollRef,
  contentRef,
  sequence,
}: Params): TimelineInteraction {
  const editor = useEditor();
  const ui = useUi();
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [ghostMove, setGhostMove] = useState<GhostMove | null>(null);
  const [ghostTrim, setGhostTrim] = useState<GhostTrim | null>(null);
  const [ghostShift, setGhostShift] = useState<TimelineInteraction["ghostShift"]>(null);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const [snapGuideUs, setSnapGuideUs] = useState<number | null>(null);

  const stateRef = useRef({ editor, ui, sequence, gesture });
  stateRef.current = { editor, ui, sequence, gesture };

  const clearGhosts = useCallback(() => {
    setGhostMove(null);
    setGhostTrim(null);
    setGhostShift(null);
    setMarquee(null);
    setSnapGuideUs(null);
  }, []);

  const cancel = useCallback(() => {
    if (!stateRef.current.gesture) return false;
    setGesture(null);
    clearGhosts();
    return true;
  }, [clearGhosts]);

  useEffect(() => registerGestureCancel(cancel), [cancel]);

  const usAtClientX = useCallback(
    (clientX: number) => {
      const rect = contentRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      return Math.max(0, pxToUs(clientX - rect.left, stateRef.current.ui.pxPerSecond));
    },
    [contentRef],
  );

  const trackIdAtClientY = useCallback(
    (clientY: number): string | null => {
      const rect = contentRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const lanesTop = rect.top;
      const index = Math.floor((clientY - lanesTop) / TRACK_HEIGHT);
      return stateRef.current.sequence.tracks[index]?.id ?? null;
    },
    [contentRef],
  );

  const snapUs = useCallback(
    (us: number, excludeClipIds: string[] = []) => {
      const { ui: u, editor: e, sequence: seq } = stateRef.current;
      if (!u.snap) return { us, snappedTo: null as number | null };
      const toleranceUs = pxToUs(SNAP_TOLERANCE_PX, u.pxPerSecond);
      return applySnap(
        us,
        snapTargets({
          sequence: seq,
          playheadUs: e.playheadUs,
          inOutUs: e.inOutUs,
          excludeClipIds,
        }),
        toleranceUs,
      );
    },
    [],
  );

  /* ---------------- pointer down handlers ---------------- */

  const beginScrub = useCallback(
    (event: React.PointerEvent) => {
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      stateRef.current.editor.setPlayhead(usAtClientX(event.clientX));
      setGesture({
        kind: "scrub",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
      });
    },
    [usAtClientX],
  );

  const onRulerPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      beginScrub(event);
    },
    [beginScrub],
  );

  const onLanePointerDown = useCallback(
    (event: React.PointerEvent, _trackId: string) => {
      if (event.button !== 0) return;
      const { ui: u, editor: e } = stateRef.current;
      const base: BaseGesture = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
      };
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);

      if (u.tool === "hand") {
        setGesture({ ...base, kind: "pan", startScrollLeft: scrollRef.current?.scrollLeft ?? 0 });
        return;
      }
      if (u.tool === "zoom") {
        const anchorUs = usAtClientX(event.clientX);
        u.setPxPerSecond((prev) => (event.altKey ? prev / 1.4 : prev * 1.4));
        e.setPlayhead(anchorUs);
        u.setLastCommand(event.altKey ? "Zoom out" : "Zoom in");
        return;
      }
      const rect = contentRef.current?.getBoundingClientRect();
      setGesture({
        ...base,
        kind: "marquee",
        startX: event.clientX - (rect?.left ?? 0),
        startY: event.clientY - (rect?.top ?? 0),
      });
      e.setSelection([]);
      e.setPlayhead(usAtClientX(event.clientX));
    },
    [contentRef, scrollRef, usAtClientX],
  );

  const onClipPointerDown = useCallback(
    (event: React.PointerEvent, clip: Clip) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      const { ui: u, editor: e, sequence: seq } = stateRef.current;
      const el = event.currentTarget as HTMLElement;
      el.setPointerCapture?.(event.pointerId);
      const rect = el.getBoundingClientRect();
      const zone: ClipZone = clipZoneAt(event.clientX - rect.left, rect.width);
      const locked = isLocked(seq, clip.trackId);
      const base: BaseGesture = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
      };

      /* ---- tools with immediate, click-based behaviour ---- */
      if (u.tool === "razor") {
        const atUs = Math.round(usAtClientX(event.clientX));
        const targets = event.shiftKey
          ? seq.clips.filter(
              (c) => !isLocked(seq, c.trackId) && atUs > c.startUs && atUs < clipEnd(c),
            )
          : locked
            ? []
            : [clip];
        if (targets.length) {
          e.run(
            targets.map((c) => ({ type: "splitClip" as const, clipId: c.id, atUs })),
            event.shiftKey ? "Corte em todas as trilhas" : "Cortar clip",
          );
          u.setLastCommand("Razor");
        }
        return;
      }
      if (u.tool === "zoom") {
        u.setPxPerSecond((prev) => (event.altKey ? prev / 1.4 : prev * 1.4));
        return;
      }
      if (u.tool === "hand") {
        setGesture({ ...base, kind: "pan", startScrollLeft: scrollRef.current?.scrollLeft ?? 0 });
        return;
      }
      if (u.tool === "trackSelect") {
        const from = clip.startUs;
        const ids = seq.clips
          .filter((c) => c.startUs >= from)
          .filter((c) =>
            event.shiftKey ? !isLocked(seq, c.trackId) : c.trackId === clip.trackId,
          )
          .map((c) => c.id);
        e.setSelection(ids);
        u.setLastCommand("Selecionar trilha");
        return;
      }
      if (u.tool === "pen") {
        const track = seq.tracks.find((t) => t.id === clip.trackId);
        if (track?.kind !== "audio" || locked) return;
        const atUs = Math.max(0, Math.round(usAtClientX(event.clientX)) - clip.startUs);
        const ratio = 1 - (event.clientY - rect.top) / rect.height;
        const gainDb = Math.round((ratio * 18 - 12) * 10) / 10;
        const keyframes = [
          ...(clip.gainKeyframes ?? []),
          { id: newId("kf"), atUs, gainDb: Math.max(-60, Math.min(12, gainDb)) },
        ].sort((a, b) => a.atUs - b.atUs);
        e.run([{ type: "setGainKeyframes", clipId: clip.id, keyframes }], "Keyframe de ganho");
        u.setLastCommand("Pen");
        return;
      }

      /* ---- selection handling for drag tools ---- */
      if (u.tool === "selection" || u.tool === "rippleEdit" || u.tool === "rateStretch") {
        if (event.ctrlKey || event.metaKey) {
          e.setSelection(
            e.selection.includes(clip.id)
              ? e.selection.filter((id) => id !== clip.id)
              : [...e.selection, clip.id],
          );
        } else if (event.shiftKey && e.selection.length) {
          const ordered = seq.clips
            .filter((c) => c.trackId === clip.trackId)
            .sort((a, b) => a.startUs - b.startUs);
          const anchorIndex = ordered.findIndex((c) => e.selection.includes(c.id));
          const clickIndex = ordered.findIndex((c) => c.id === clip.id);
          if (anchorIndex >= 0 && clickIndex >= 0) {
            const [from, to] = [
              Math.min(anchorIndex, clickIndex),
              Math.max(anchorIndex, clickIndex),
            ];
            e.setSelection(ordered.slice(from, to + 1).map((c) => c.id));
          }
        } else if (!e.selection.includes(clip.id)) {
          e.setSelection([clip.id]);
        }
      } else {
        e.setSelection([clip.id]);
      }

      if (locked) return;

      if (u.tool === "rollingEdit") {
        const sameTrack = seq.clips
          .filter((c) => c.trackId === clip.trackId)
          .sort((a, b) => a.startUs - b.startUs);
        const index = sameTrack.findIndex((c) => c.id === clip.id);
        const pair =
          zone === "start" && index > 0
            ? [sameTrack[index - 1]!, clip]
            : zone === "end" && index < sameTrack.length - 1
              ? [clip, sameTrack[index + 1]!]
              : null;
        if (!pair || !pair[0] || !pair[1]) return;
        setGesture({ ...base, kind: "rolling", leftClipId: pair[0]!.id, rightClipId: pair[1]!.id });
        return;
      }
      if (u.tool === "slip") {
        setGesture({ ...base, kind: "slip", clipId: clip.id });
        return;
      }
      if (u.tool === "slide") {
        setGesture({ ...base, kind: "slide", clipId: clip.id });
        return;
      }
      if (zone !== "body") {
        const mode = u.tool === "rippleEdit" ? "ripple" : u.tool === "rateStretch" ? "rate" : "trim";
        setGesture({ ...base, kind: "trim", clipId: clip.id, edge: zone, mode });
        return;
      }

      const ids = e.selection.includes(clip.id)
        ? [...new Set([...e.selection, clip.id])]
        : [clip.id];
      setGesture({
        ...base,
        kind: "move",
        clipIds: ids.filter((id) => {
          const c = seq.clips.find((x) => x.id === id);
          return c ? !isLocked(seq, c.trackId) : false;
        }),
        originTrackId: clip.trackId,
        duplicate: event.altKey,
      });
    },
    [scrollRef, usAtClientX],
  );

  const onLaneWheel = useCallback(
    (event: React.WheelEvent) => {
      if (!(event.ctrlKey || event.altKey || event.metaKey)) return;
      event.preventDefault();
      const { ui: u } = stateRef.current;
      const anchorUs = usAtClientX(event.clientX);
      const viewport = scrollRef.current;
      const offsetInViewport = viewport
        ? event.clientX - viewport.getBoundingClientRect().left
        : 0;
      const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2;
      u.setPxPerSecond((prev) => {
        const next = Math.min(400, Math.max(2, prev * factor));
        // keep the time under the cursor stable
        requestAnimationFrame(() => {
          if (!viewport) return;
          viewport.scrollLeft = Math.max(0, usToPx(anchorUs, next) - offsetInViewport);
        });
        return next;
      });
    },
    [scrollRef, usAtClientX],
  );

  /* ---------------- global move / up ---------------- */

  useEffect(() => {
    if (!gesture) return;

    function onMove(event: PointerEvent) {
      const g = stateRef.current.gesture;
      if (!g || event.pointerId !== g.pointerId) return;
      const dx = event.clientX - g.startClientX;
      const dy = event.clientY - g.startClientY;
      const passed = g.moved || Math.abs(dx) >= DRAG_THRESHOLD_PX || Math.abs(dy) >= DRAG_THRESHOLD_PX;
      const { ui: u, editor: e, sequence: seq } = stateRef.current;

      if (g.kind === "scrub") {
        e.setPlayhead(usAtClientX(event.clientX));
        return;
      }
      if (g.kind === "pan") {
        if (scrollRef.current) scrollRef.current.scrollLeft = g.startScrollLeft - dx;
        return;
      }
      if (!passed) return;
      if (!g.moved) setGesture({ ...g, moved: true });

      if (g.kind === "marquee") {
        const rect = contentRef.current?.getBoundingClientRect();
        const x = event.clientX - (rect?.left ?? 0);
        const y = event.clientY - (rect?.top ?? 0);
        const box = {
          left: Math.min(g.startX, x),
          top: Math.min(g.startY, y),
          width: Math.abs(x - g.startX),
          height: Math.abs(y - g.startY),
        };
        setMarquee(box);
        const fromUs = pxToUs(box.left, u.pxPerSecond);
        const toUs = pxToUs(box.left + box.width, u.pxPerSecond);
        const firstTrack = Math.floor(box.top / TRACK_HEIGHT);
        const lastTrack = Math.floor((box.top + box.height) / TRACK_HEIGHT);
        const trackIds = new Set(
          seq.tracks.slice(Math.max(0, firstTrack), lastTrack + 1).map((t) => t.id),
        );
        e.setSelection(
          seq.clips
            .filter((c) => trackIds.has(c.trackId) && clipEnd(c) > fromUs && c.startUs < toUs)
            .map((c) => c.id),
        );
        return;
      }

      const deltaUsRaw = pxToUs(dx, u.pxPerSecond);

      if (g.kind === "move") {
        const clips = seq.clips.filter((c) => g.clipIds.includes(c.id));
        if (!clips.length) return;
        const minStart = Math.min(...clips.map((c) => c.startUs));
        let delta = Math.max(-minStart, deltaUsRaw);
        const lead = clips.find((c) => c.startUs === minStart)!;
        const snapped = snapUs(lead.startUs + delta, g.clipIds);
        if (snapped.snappedTo !== null) delta = snapped.snappedTo - lead.startUs;
        else {
          const tail = snapUs(clipEnd(lead) + delta, g.clipIds);
          if (tail.snappedTo !== null) delta = tail.snappedTo - clipEnd(lead);
        }
        setSnapGuideUs(snapped.snappedTo);
        const hoveredTrack = trackIdAtClientY(event.clientY);
        const originKind = seq.tracks.find((t) => t.id === g.originTrackId)?.kind;
        const targetTrack =
          hoveredTrack &&
          hoveredTrack !== g.originTrackId &&
          g.clipIds.length === 1 &&
          seq.tracks.find((t) => t.id === hoveredTrack)?.kind === originKind &&
          !isLocked(seq, hoveredTrack)
            ? hoveredTrack
            : null;
        setGhostMove({
          clipIds: g.clipIds,
          deltaUs: Math.max(-minStart, delta),
          trackId: targetTrack,
          duplicate: g.duplicate,
        });
        return;
      }

      if (g.kind === "trim") {
        const clip = seq.clips.find((c) => c.id === g.clipId);
        if (!clip) return;
        const anchor = g.edge === "start" ? clip.startUs : clipEnd(clip);
        const snapped = snapUs(Math.max(0, anchor + deltaUsRaw), [clip.id]);
        setSnapGuideUs(snapped.snappedTo);
        setGhostTrim({ clipId: clip.id, edge: g.edge, toUs: snapped.us, kind: g.mode });
        return;
      }

      if (g.kind === "rolling") {
        const left = seq.clips.find((c) => c.id === g.leftClipId);
        if (!left) return;
        const snapped = snapUs(Math.max(0, clipEnd(left) + deltaUsRaw), [
          g.leftClipId,
          g.rightClipId,
        ]);
        setSnapGuideUs(snapped.snappedTo);
        setGhostTrim({ clipId: g.leftClipId, edge: "end", toUs: snapped.us, kind: "rolling" });
        return;
      }

      if (g.kind === "slip" || g.kind === "slide") {
        setGhostShift({ clipId: g.clipId, deltaUs: deltaUsRaw, kind: g.kind });
      }
    }

    function onUp(event: PointerEvent) {
      const g = stateRef.current.gesture;
      if (!g || event.pointerId !== g.pointerId) return;
      const { editor: e, ui: u, sequence: seq } = stateRef.current;
      const commands: EditCommand[] = [];
      let label = "";

      if (g.kind === "move" && ghostMoveRef.current) {
        const ghost = ghostMoveRef.current;
        if (ghost.deltaUs !== 0 || ghost.trackId) {
          for (const id of ghost.clipIds) {
            const clip = seq.clips.find((c) => c.id === id);
            if (!clip) continue;
            const toStartUs = Math.max(0, clip.startUs + ghost.deltaUs);
            if (ghost.duplicate) {
              commands.push({
                type: "duplicateClip",
                clipId: id,
                toStartUs,
                ...(ghost.trackId ? { toTrackId: ghost.trackId } : {}),
                newClipId: newId("clip"),
              });
            } else {
              commands.push({
                type: "moveClip",
                clipId: id,
                toStartUs,
                ...(ghost.trackId ? { toTrackId: ghost.trackId } : {}),
              });
            }
          }
          label = ghost.duplicate ? "Duplicar e mover" : "Mover clip";
        }
      } else if (g.kind === "trim" && ghostTrimRef.current) {
        const ghost = ghostTrimRef.current;
        const clip = seq.clips.find((c) => c.id === ghost.clipId);
        if (clip) {
          if (ghost.kind === "rate") {
            const newDuration =
              ghost.edge === "end"
                ? ghost.toUs - clip.startUs
                : clipEnd(clip) - ghost.toUs;
            if (newDuration > 0 && newDuration !== clipDuration(clip)) {
              commands.push({
                type: "rateStretchClip",
                clipId: clip.id,
                newDurationUs: Math.round(newDuration),
              });
              label = "Rate stretch";
            }
          } else if (ghost.kind === "ripple") {
            commands.push({
              type: "rippleTrimClip",
              clipId: clip.id,
              edge: ghost.edge,
              toUs: Math.round(ghost.toUs),
            });
            label = "Ripple trim";
          } else {
            commands.push({
              type: "trimClipEdge",
              clipId: clip.id,
              edge: ghost.edge,
              toUs: Math.round(ghost.toUs),
            });
            label = ghost.edge === "start" ? "Aparar entrada" : "Aparar saída";
          }
        }
      } else if (g.kind === "rolling" && ghostTrimRef.current) {
        commands.push({
          type: "rollingEdit",
          leftClipId: g.leftClipId,
          rightClipId: g.rightClipId,
          toUs: Math.round(ghostTrimRef.current.toUs),
        });
        label = "Rolling edit";
      } else if ((g.kind === "slip" || g.kind === "slide") && ghostShiftRef.current) {
        const ghost = ghostShiftRef.current;
        const clip = seq.clips.find((c) => c.id === ghost.clipId);
        if (clip && ghost.deltaUs !== 0) {
          if (g.kind === "slip") {
            commands.push({
              type: "slipClip",
              clipId: clip.id,
              deltaUs: -Math.round(ghost.deltaUs * clipRate(clip)),
            });
            label = "Slip";
          } else {
            commands.push({
              type: "slideClip",
              clipId: clip.id,
              deltaUs: Math.round(ghost.deltaUs),
            });
            label = "Slide";
          }
        }
      }

      if (commands.length) {
        e.run(commands, label);
        u.setLastCommand(label);
      }
      setGesture(null);
      clearGhosts();
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [gesture, clearGhosts, contentRef, scrollRef, snapUs, trackIdAtClientY, usAtClientX]);

  const ghostMoveRef = useRef<GhostMove | null>(null);
  ghostMoveRef.current = ghostMove;
  const ghostTrimRef = useRef<GhostTrim | null>(null);
  ghostTrimRef.current = ghostTrim;
  const ghostShiftRef = useRef<TimelineInteraction["ghostShift"]>(null);
  ghostShiftRef.current = ghostShift;

  return {
    ghostMove,
    ghostTrim,
    ghostShift,
    marquee,
    snapGuideUs,
    gestureKind: gesture?.kind ?? null,
    onRulerPointerDown,
    onClipPointerDown,
    onLanePointerDown,
    onLaneWheel,
  };
}

export const SECOND_US = SECOND;
