import { useEffect, useMemo, useRef } from "react";
import { Pause, Play, SkipBack, SkipForward, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  clipDuration,
  clipEnd,
  formatTimecode,
  sequenceDuration,
  type Aspect,
} from "@/core/contracts/domain";
import { useActiveSequence, useEditor } from "@/core/store/editorStore";
import { useUi } from "@/core/store/uiStore";

const ASPECTS: Aspect[] = ["16:9", "9:16", "1:1", "4:5"];

const ASPECT_STYLE: Record<Aspect, string> = {
  "16:9": "aspect-video max-h-full",
  "9:16": "aspect-[9/16] max-h-full",
  "1:1": "aspect-square max-h-full",
  "4:5": "aspect-[4/5] max-h-full",
};

export function PreviewMonitor() {
  const { project, playheadUs, setPlayhead, run, selection, runtime } = useEditor();
  const sequence = useActiveSequence();
  const videoRef = useRef<HTMLVideoElement>(null);
  const ui = useUi();
  const playing = ui.playing;
  const setPlaying = ui.setPlaying;
  const total = sequenceDuration(sequence);

  const activeClip = useMemo(
    () =>
      sequence.clips
        .filter((c) => c.trackId === sequence.tracks.find((t) => t.kind === "video")?.id)
        .find((c) => playheadUs >= c.startUs && playheadUs < clipEnd(c)),
    [sequence, playheadUs],
  );

  const asset = activeClip ? project.assets.find((a) => a.id === activeClip.assetId) : undefined;
  const caption = sequence.captions.find((c) => playheadUs >= c.startUs && playheadUs < c.endUs);

  // Keep the <video> element aligned with the timeline playhead (source time).
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !activeClip) return;
    const sourceUs = activeClip.sourceInUs + (playheadUs - activeClip.startUs);
    const target = sourceUs / 1_000_000;
    if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = target;
  }, [activeClip, playheadUs]);

  // Gain automation (pen keyframes) drives the demo playback volume.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !activeClip) return;
    const db = clipGainDbAt(activeClip, playheadUs - activeClip.startUs);
    el.volume = Math.min(1, Math.max(0, dbToAmplitude(db)));
  }, [activeClip, playheadUs]);


  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) * 1000 * ui.playRate;
      last = now;
      setPlayhead((prev) => {
        const next = prev + delta;
        if (next <= 0) return 0;
        return next >= total ? total : next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total, setPlayhead, ui.playRate]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = Math.min(4, Math.max(0.25, Math.abs(ui.playRate)));
    if (playing && activeClip && ui.playRate > 0) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, [playing, activeClip, ui.playRate, setPlaying]);

  useEffect(() => {
    if (playheadUs >= total && total > 0) setPlaying(false);
  }, [playheadUs, total, setPlaying]);

  function splitAtPlayhead() {
    const clip =
      sequence.clips.find(
        (c) => selection.includes(c.id) && playheadUs > c.startUs && playheadUs < clipEnd(c),
      ) ?? activeClip;
    if (!clip) return;
    run(
      [{ type: "splitClip", clipId: clip.id, atUs: Math.round(playheadUs) }],
      "Cortar no playhead",
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Monitor — {sequence.name}
        </h2>
        <Badge variant="outline" className="border-border-strong text-[10px] text-muted-foreground">
          {runtime.aspectResolution(sequence.aspect).width}×
          {runtime.aspectResolution(sequence.aspect).height}
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          {ASPECTS.map((aspect) => (
            <Button
              key={aspect}
              size="sm"
              variant={sequence.aspect === aspect ? "default" : "ghost"}
              className="h-6 px-2 text-[11px]"
              onClick={() => run([{ type: "setSequenceAspect", aspect }], `Formato ${aspect}`)}
            >
              {aspect}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 place-items-center rounded-md border border-border bg-black/60">
        <div
          className={`relative overflow-hidden rounded-sm bg-black ${ASPECT_STYLE[sequence.aspect]}`}
        >
          {asset && asset.kind !== "audio" ? (
            asset.kind === "image" ? (
              <img src={asset.path} alt={asset.name} className="size-full object-cover" />
            ) : (
              <video
                ref={videoRef}
                src={asset.path}
                muted={sequence.tracks.some((t) => t.kind === "audio" && t.muted)}
                playsInline
                className="size-full object-cover"
                crossOrigin="anonymous"
              />
            )
          ) : (
            <div className="grid size-full min-h-[16rem] min-w-[20rem] place-items-center px-6 text-center">
              <p className="text-xs text-muted-foreground">
                Nada sob o playhead. Adicione um clip na timeline ou mova o cursor.
              </p>
            </div>
          )}
          {caption ? (
            <div className="absolute inset-x-0 bottom-3 px-4">
              <p className="mx-auto max-w-[90%] rounded-sm bg-background/80 px-2 py-1 text-center text-[11px] leading-snug">
                {caption.text}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-md border border-border bg-panel px-2 py-1.5">
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Início"
          onClick={() => setPlayhead(0)}
        >
          <SkipBack className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          className="size-7"
          aria-label={playing ? "Pausar" : "Reproduzir"}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Fim"
          onClick={() => setPlayhead(total)}
        >
          <SkipForward className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={splitAtPlayhead}>
          <Scissors className="size-3.5" /> Cortar
        </Button>
        {playing && ui.playRate !== 1 ? (
          <span className="tabular text-[10px] text-accent">{ui.playRate}×</span>
        ) : null}
        <span className="tabular ml-auto text-xs text-foreground">
          {formatTimecode(playheadUs, sequence.fpsNum)}
        </span>
        <span className="tabular text-xs text-muted-foreground">
          / {formatTimecode(total, sequence.fpsNum)}
        </span>
        {activeClip ? (
          <span className="tabular text-[10px] text-muted-foreground">
            clip {formatTimecode(clipDuration(activeClip), sequence.fpsNum)}
          </span>
        ) : null}
      </div>
    </section>
  );
}
