import { useMemo, useRef, useState } from "react";
import { Copy, Scissors, Trash2, ZoomIn, ZoomOut, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  clipDuration,
  clipEnd,
  formatTimecode,
  SECOND,
  sequenceDuration,
} from "@/core/contracts/domain";
import { useActiveSequence, useEditor } from "@/core/store/editorStore";

const TRACK_HEIGHT = 44;
const HEADER_WIDTH = 96;

export function TimelinePanel() {
  const { playheadUs, setPlayhead, selection, setSelection, run, project } = useEditor();
  const sequence = useActiveSequence();
  const [pxPerSecond, setPxPerSecond] = useState(28);
  const laneRef = useRef<HTMLDivElement>(null);

  const total = Math.max(sequenceDuration(sequence), 20 * SECOND);
  const width = (total / SECOND) * pxPerSecond;
  const toPx = (us: number) => (us / SECOND) * pxPerSecond;

  const ticks = useMemo(() => {
    const step = pxPerSecond < 14 ? 10 : pxPerSecond < 30 ? 5 : 1;
    const out: number[] = [];
    for (let s = 0; s <= Math.ceil(total / SECOND); s += step) out.push(s);
    return out;
  }, [total, pxPerSecond]);

  function seekFromEvent(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left + (laneRef.current?.scrollLeft ?? 0);
    setPlayhead(Math.max(0, Math.round((x / pxPerSecond) * SECOND)));
  }

  const selectedClips = sequence.clips.filter((c) => selection.includes(c.id));

  function act(kind: "split" | "duplicate" | "delete" | "ripple" | "gain") {
    if (selectedClips.length === 0) return;
    const clip = selectedClips[0];
    if (!clip) return;
    if (kind === "split") {
      run([{ type: "splitClip", clipId: clip.id, atUs: Math.round(playheadUs) }], "Cortar clip");
    } else if (kind === "duplicate") {
      run([{ type: "duplicateClip", clipId: clip.id }], "Duplicar clip");
    } else if (kind === "delete") {
      run(
        selectedClips.map((c) => ({ type: "deleteClip" as const, clipId: c.id })),
        "Remover clips",
      );
      setSelection([]);
    } else if (kind === "ripple") {
      run([{ type: "rippleDelete", clipId: clip.id }], "Ripple delete");
      setSelection([]);
    } else {
      run(
        [{ type: "changeGain", clipId: clip.id, gainDb: clip.gainDb === 0 ? -6 : 0 }],
        "Ajustar ganho",
      );
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col border-t border-border bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Timeline
        </h2>
        <div className="ml-2 flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            disabled={!selectedClips.length}
            onClick={() => act("split")}
          >
            <Scissors className="size-3.5" /> Cortar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            disabled={!selectedClips.length}
            onClick={() => act("duplicate")}
          >
            <Copy className="size-3.5" /> Duplicar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            disabled={!selectedClips.length}
            onClick={() => act("gain")}
          >
            <Volume2 className="size-3.5" /> Ganho
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            disabled={!selectedClips.length}
            onClick={() => act("ripple")}
          >
            Ripple
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs text-destructive"
            disabled={!selectedClips.length}
            onClick={() => act("delete")}
          >
            <Trash2 className="size-3.5" /> Remover
          </Button>
        </div>
        <div className="ml-auto flex w-48 items-center gap-2">
          <ZoomOut className="size-3.5 text-muted-foreground" />
          <Slider
            value={[pxPerSecond]}
            min={4}
            max={140}
            step={2}
            onValueChange={([v]) => setPxPerSecond(v ?? 28)}
          />
          <ZoomIn className="size-3.5 text-muted-foreground" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="shrink-0 border-r border-border" style={{ width: HEADER_WIDTH }}>
          <div className="h-6 border-b border-border" />
          {sequence.tracks.map((track) => (
            <div
              key={track.id}
              className="flex items-center justify-between border-b border-border px-2 text-[11px]"
              style={{ height: TRACK_HEIGHT }}
            >
              <span className="font-medium">{track.name}</span>
              <span className="text-[10px] uppercase text-muted-foreground">{track.kind[0]}</span>
            </div>
          ))}
        </div>

        <div
          ref={laneRef}
          className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin-dark"
        >
          <div style={{ width }} className="relative">
            <div
              className="relative h-6 cursor-col-resize border-b border-border bg-chrome"
              onMouseDown={seekFromEvent}
              role="presentation"
            >
              {ticks.map((s) => (
                <div key={s} className="absolute top-0 h-full" style={{ left: toPx(s * SECOND) }}>
                  <div className="h-2 w-px bg-ruler" />
                  <span className="tabular ml-1 text-[9px] text-muted-foreground">
                    {formatTimecode(s * SECOND).slice(3, 8)}
                  </span>
                </div>
              ))}
            </div>

            {sequence.tracks.map((track) => (
              <div
                key={track.id}
                className="relative border-b border-border"
                style={{ height: TRACK_HEIGHT }}
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) {
                    setSelection([]);
                    seekFromEvent(e);
                  }
                }}
              >
                {track.kind === "caption"
                  ? sequence.captions.map((cap) => (
                      <div
                        key={cap.id}
                        className="absolute top-1.5 h-8 overflow-hidden rounded-sm border border-track-caption/60 bg-track-caption/25 px-1"
                        style={{
                          left: toPx(cap.startUs),
                          width: Math.max(6, toPx(cap.endUs - cap.startUs)),
                        }}
                        title={cap.text}
                      >
                        <span className="truncate text-[10px] leading-7">{cap.text}</span>
                      </div>
                    ))
                  : sequence.clips
                      .filter((c) => c.trackId === track.id)
                      .map((clip) => {
                        const selected = selection.includes(clip.id);
                        const asset = project.assets.find((a) => a.id === clip.assetId);
                        return (
                          <button
                            key={clip.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelection(
                                e.shiftKey
                                  ? selection.includes(clip.id)
                                    ? selection.filter((id) => id !== clip.id)
                                    : [...selection, clip.id]
                                  : [clip.id],
                              );
                              setPlayhead(clip.startUs);
                            }}
                            className={`absolute top-1.5 h-8 overflow-hidden rounded-sm border px-1.5 text-left transition-shadow ${
                              track.kind === "audio"
                                ? "border-track-audio/60 bg-track-audio/25"
                                : "border-track-video/60 bg-track-video/30"
                            } ${selected ? "ring-2 ring-primary" : ""}`}
                            style={{
                              left: toPx(clip.startUs),
                              width: Math.max(8, toPx(clipDuration(clip))),
                            }}
                            title={`${clip.label || asset?.name || clip.id} — ${formatTimecode(clipDuration(clip))}`}
                          >
                            <span className="block truncate text-[10px] leading-4">
                              {clip.label || asset?.name || clip.id}
                            </span>
                            <span className="tabular block truncate text-[9px] text-muted-foreground">
                              {formatTimecode(clip.sourceInUs).slice(3)} →{" "}
                              {formatTimecode(clip.sourceOutUs).slice(3)}
                              {clip.gainDb !== 0 ? ` · ${clip.gainDb} dB` : ""}
                            </span>
                          </button>
                        );
                      })}
              </div>
            ))}

            {sequence.markers.map((marker) => (
              <div
                key={marker.id}
                className="absolute top-0 z-10 h-6 w-1 rounded-b-sm bg-accent"
                style={{ left: toPx(marker.atUs) }}
                title={marker.label}
              />
            ))}

            <div
              className="pointer-events-none absolute inset-y-0 z-20 w-px bg-playhead"
              style={{ left: toPx(playheadUs) }}
            >
              <div className="size-2 -translate-x-1/2 rounded-sm bg-playhead" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-7 shrink-0 items-center gap-3 border-t border-border px-2 text-[10px] text-muted-foreground">
        <span className="tabular">clips: {sequence.clips.length}</span>
        <span className="tabular">legendas: {sequence.captions.length}</span>
        <span className="tabular">duração: {formatTimecode(sequenceDuration(sequence))}</span>
        <span className="tabular">
          fim do último clip:{" "}
          {formatTimecode(sequence.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0))}
        </span>
      </div>
    </section>
  );
}
