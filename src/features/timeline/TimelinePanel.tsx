import { useRef } from "react";
import { toast } from "sonner";
import { clipEnd, formatTimecode, SECOND, sequenceDuration } from "@/core/contracts/domain";
import { useActiveSequence, useEditor } from "@/core/store/editorStore";
import { useUi } from "@/core/store/uiStore";
import { HEADER_WIDTH, usToPx } from "./geometry";
import { TimelinePlayhead } from "./TimelinePlayhead";
import { TimelineRuler } from "./TimelineRuler";
import { TimelineToolbar } from "./TimelineToolbar";
import { TimelineTrackHeader } from "./TimelineTrackHeader";
import { TimelineTrackLane } from "./TimelineTrackLane";
import { useTimelineInteraction } from "./useTimelineInteraction";
import { useAssetPeaks } from "./useAssetPeaks";
import type { ClipActions } from "./TimelineClip";

export function TimelinePanel() {
  const editor = useEditor();
  const sequence = useActiveSequence();
  const ui = useUi();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);

  const peaks = useAssetPeaks(editor.project.assets);

  const interaction = useTimelineInteraction({ scrollRef, contentRef: lanesRef, sequence });

  const totalUs = Math.max(sequenceDuration(sequence), 20 * SECOND);
  const width = usToPx(totalUs, ui.pxPerSecond);
  const pro = ui.mode === "pro";

  const actions: ClipActions = {
    onSplit: (clip) =>
      editor.run(
        [{ type: "splitClip", clipId: clip.id, atUs: Math.round(editor.playheadUs) }],
        "Cortar clip",
      ),
    onDuplicate: (clip) =>
      editor.run([{ type: "duplicateClip", clipId: clip.id }], "Duplicar clip"),
    onDelete: (clip) => {
      editor.run([{ type: "deleteClip", clipId: clip.id }], "Remover clip");
      editor.setSelection([]);
    },
    onRippleDelete: (clip) => {
      editor.run([{ type: "rippleDelete", clipId: clip.id }], "Ripple delete");
      editor.setSelection([]);
    },
    onGain: (clip) =>
      editor.run(
        [{ type: "changeGain", clipId: clip.id, gainDb: clip.gainDb === 0 ? -6 : 0 }],
        "Ajustar ganho",
      ),
    onLink: (clip) => {
      const ids = Array.from(new Set([clip.id, ...editor.selection])).slice(0, 12);
      if (ids.length < 2) {
        toast.info("Selecione ao menos dois clips para vincular", {
          description: "Use Ctrl+clique para somar clips à seleção.",
        });
        return;
      }
      editor.run([{ type: "linkClips", clipIds: ids }], "Vincular clips");
    },
    onUnlink: (clip) => {
      if (!clip.linkGroupId) return;
      editor.run([{ type: "unlinkClips", clipId: clip.id }], "Desvincular clips");
    },
    onReveal: (clip) => {
      const asset = editor.project.assets.find((a) => a.id === clip.assetId);
      toast.info(asset ? `Mídia: ${asset.name}` : "Mídia não encontrada", {
        description: asset?.path,
      });
    },
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col border-t border-border bg-panel"
      onPointerDownCapture={() => ui.setFocused("timeline")}
    >
      <TimelineToolbar />

      <div className="flex min-h-0 flex-1">
        <div className="shrink-0 border-r border-border" style={{ width: HEADER_WIDTH }}>
          <div className="h-6 border-b border-border" />
          {sequence.tracks.map((track) => (
            <TimelineTrackHeader
              key={track.id}
              track={track}
              pro={pro}
              onToggleLock={() =>
                editor.run(
                  [{ type: "setTrackLock", trackId: track.id, locked: !track.locked }],
                  track.locked ? "Desbloquear trilha" : "Bloquear trilha",
                )
              }
              onToggleMute={() =>
                editor.run(
                  [{ type: "setTrackMute", trackId: track.id, muted: !track.muted }],
                  track.muted ? "Reativar som da trilha" : "Silenciar trilha",
                )
              }
            />
          ))}
        </div>

        <div
          ref={scrollRef}
          className={`min-h-0 flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin-dark ${
            ui.tool === "hand" ? "cursor-grab" : ui.tool === "zoom" ? "cursor-zoom-in" : ""
          }`}
          onWheel={interaction.onLaneWheel}
        >
          <div ref={contentRef} style={{ width }} className="relative">
            <TimelineRuler
              totalUs={totalUs}
              pxPerSecond={ui.pxPerSecond}
              inOutUs={editor.inOutUs}
              onPointerDown={interaction.onRulerPointerDown}
            />

            <div ref={lanesRef} className="relative">
              {sequence.tracks.map((track) => (
                <TimelineTrackLane
                  key={track.id}
                  track={track}
                  sequence={sequence}
                  project={editor.project}
                  selection={editor.selection}
                  pxPerSecond={ui.pxPerSecond}
                  pro={pro}
                  interaction={interaction}
                  actions={actions}
                  peaks={peaks}
                />
              ))}

              {interaction.marquee ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute z-30 border border-primary bg-primary/10"
                  style={{
                    left: interaction.marquee.left,
                    top: interaction.marquee.top,
                    width: interaction.marquee.width,
                    height: interaction.marquee.height,
                  }}
                />
              ) : null}
            </div>

            {sequence.markers.map((marker) => (
              <div
                key={marker.id}
                className="absolute top-0 z-10 h-6 w-1 rounded-b-sm bg-accent"
                style={{ left: usToPx(marker.atUs, ui.pxPerSecond) }}
                title={marker.label}
              />
            ))}

            <TimelinePlayhead
              playheadUs={editor.playheadUs}
              pxPerSecond={ui.pxPerSecond}
              snapGuideUs={interaction.snapGuideUs}
              onPointerDown={interaction.onRulerPointerDown}
            />
          </div>
        </div>
      </div>

      {pro ? (
        <div className="flex h-7 shrink-0 items-center gap-3 border-t border-border px-2 text-[10px] text-muted-foreground">
          <span className="tabular">clips: {sequence.clips.length}</span>
          <span className="tabular">legendas: {sequence.captions.length}</span>
          <span className="tabular">duração: {formatTimecode(sequenceDuration(sequence))}</span>
          <span className="tabular">
            fim do último clip:{" "}
            {formatTimecode(sequence.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0))}
          </span>
        </div>
      ) : null}
    </section>
  );
}
