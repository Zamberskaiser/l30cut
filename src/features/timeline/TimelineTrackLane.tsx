import type { Clip, Project, Sequence, Track } from "@/core/contracts/domain";
import type { PeakData } from "@/core/audio/waveform";
import { useState } from "react";
import { ASSET_DND_MIME } from "./dnd";
import { pxToUs, usToPx } from "./geometry";
import { TimelineClip, type ClipActions } from "./TimelineClip";
import type { TimelineInteraction } from "./useTimelineInteraction";

interface Props {
  track: Track;
  sequence: Sequence;
  project: Project;
  selection: string[];
  pxPerSecond: number;
  /** Lane height in pixels (timeline vertical zoom). */
  height: number;
  pro: boolean;
  interaction: TimelineInteraction;
  actions: ClipActions;
  /** Audio peaks per assetId (real when decodable, synthesized otherwise). */
  peaks: Record<string, PeakData>;
}

export function TimelineTrackLane({
  track,
  sequence,
  project,
  selection,
  pxPerSecond,
  height,
  pro,
  interaction,
  actions,
  peaks,
  onDropAsset,
}: Props & { onDropAsset?: (trackId: string, assetId: string, startUs: number) => void }) {
  const [dropActive, setDropActive] = useState(false);
  const ghostMove = interaction.ghostMove;
  const ghostTrim = interaction.ghostTrim;
  const ghostShift = interaction.ghostShift;

  return (
    <div
      className={`relative border-b border-border ${dropActive ? "bg-primary/10 ring-1 ring-inset ring-primary" : ""}`}
      style={{ height }}
      data-track-id={track.id}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) interaction.onLanePointerDown(event, track.id);
      }}
      onDragOver={(event) => {
        if (!onDropAsset || track.locked) return;
        if (!event.dataTransfer.types.includes(ASSET_DND_MIME)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(event) => {
        setDropActive(false);
        if (!onDropAsset || track.locked) return;
        const assetId = event.dataTransfer.getData(ASSET_DND_MIME);
        if (!assetId) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const startUs = Math.max(0, pxToUs(event.clientX - rect.left, pxPerSecond));
        onDropAsset(track.id, assetId, startUs);
      }}
    >
      {track.kind === "caption"
        ? sequence.captions.map((cap) => (
            <div
              key={cap.id}
              className="absolute top-1.5 h-8 overflow-hidden rounded-sm border border-track-caption/60 bg-track-caption/25 px-1"
              style={{
                left: usToPx(cap.startUs, pxPerSecond),
                width: Math.max(6, usToPx(cap.endUs - cap.startUs, pxPerSecond)),
              }}
              title={cap.text}
            >
              <span className="truncate text-[10px] leading-7">{cap.text}</span>
            </div>
          ))
        : sequence.clips
            .filter((c: Clip) => c.trackId === track.id)
            .map((clip) => (
              <TimelineClip
                key={clip.id}
                clip={clip}
                asset={project.assets.find((a) => a.id === clip.assetId)}
                trackKind={track.kind}
                selected={selection.includes(clip.id)}
                locked={track.locked}
                pxPerSecond={pxPerSecond}
                pro={pro}
                ghostDeltaUs={
                  ghostMove && ghostMove.clipIds.includes(clip.id) ? ghostMove.deltaUs : 0
                }
                ghostTrim={
                  ghostTrim && ghostTrim.clipId === clip.id
                    ? { edge: ghostTrim.edge, toUs: ghostTrim.toUs }
                    : ghostShift && ghostShift.clipId === clip.id && ghostShift.kind === "slide"
                      ? { edge: "start", toUs: Math.max(0, clip.startUs + ghostShift.deltaUs) }
                      : null
                }
                peaks={track.kind === "audio" ? peaks[clip.assetId] : undefined}
                onPointerDown={interaction.onClipPointerDown}
                actions={actions}
              />
            ))}
    </div>
  );
}
