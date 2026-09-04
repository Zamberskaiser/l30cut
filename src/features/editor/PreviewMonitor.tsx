import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Pause, Play, SkipBack, SkipForward, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  clipDuration,
  clipEnd,
  clipGainDbAt,
  clipTransitionOpacityAt,
  dbToAmplitude,
  formatTimecode,
  sequenceDuration,
  trackerBoxAt,
  type Aspect,
} from "@/core/contracts/domain";
import { useChromaKeyCanvas } from "@/features/effects/useChromaKeyCanvas";

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
  const chromaCanvasRef = useRef<HTMLCanvasElement>(null);
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
  // Desktop paths need the asset protocol before the webview can load them.
  const assetSrc = asset ? runtime.mediaSrc(asset.path) : undefined;
  const caption = sequence.captions.find((c) => playheadUs >= c.startUs && playheadUs < c.endUs);

  const clipOffsetUs = activeClip ? playheadUs - activeClip.startUs : 0;
  const opacity = activeClip ? clipTransitionOpacityAt(activeClip, clipOffsetUs) : 1;
  const dipToBlack =
    activeClip?.transitionIn?.kind === "dip" || activeClip?.transitionOut?.kind === "dip";
  const trackerBox = trackerBoxAt(activeClip?.tracker, clipOffsetUs);
  const chroma = activeClip?.chroma?.enabled ? activeClip.chroma : undefined;

  useChromaKeyCanvas(videoRef, chromaCanvasRef, chroma, playing);

  // Keep the <video> aligned with the playhead. While playing, the element runs
  // on its own clock: seeking on every frame is what made playback stutter, so
  // we only correct a real drift and let scrubbing be precise when paused.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !activeClip) return;
    const sourceUs = activeClip.sourceInUs + (playheadUs - activeClip.startUs);
    const target = sourceUs / 1_000_000;
    const tolerance = playing ? 0.6 : 0.05;
    if (el.seeking) return;
    if (Math.abs(el.currentTime - target) > tolerance) el.currentTime = target;
  }, [activeClip, playheadUs, playing]);

  // Gain automation (pen keyframes) drives the playback volume — only write to
  // the element when the value actually moved.
  const lastVolumeRef = useRef(-1);
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !activeClip) return;
    const db = clipGainDbAt(activeClip, playheadUs - activeClip.startUs);
    const volume = Math.min(1, Math.max(0, dbToAmplitude(db)));
    if (Math.abs(volume - lastVolumeRef.current) < 0.01) return;
    lastVolumeRef.current = volume;
    el.volume = volume;
  }, [activeClip, playheadUs]);

  // Playback clock. Commits to the store at ~30 Hz instead of every animation
  // frame: the whole editor re-renders on each commit, and 60 Hz commits were
  // the main source of dropped frames during playback.
  useEffect(() => {
    if (!playing) return;
    const COMMIT_MS = 1000 / 30;
    let raf = 0;
    let last = performance.now();
    let pending = 0;
    const tick = (now: number) => {
      pending += now - last;
      last = now;
      if (pending >= COMMIT_MS) {
        const delta = pending * 1000 * ui.playRate;
        pending = 0;
        setPlayhead((prev) => {
          const next = prev + delta;
          if (next <= 0) return 0;
          return next >= total ? total : next;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total, setPlayhead, ui.playRate]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = Math.min(4, Math.max(0.25, Math.abs(ui.playRate)));
    if (playing && activeClip && ui.playRate > 0) {
      void el.play().catch((error: unknown) => {
        setPlaying(false);
        toast.error("Reprodução bloqueada", {
          description: error instanceof Error ? error.message : "tente clicar em play novamente",
        });
      });
    } else el.pause();
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
              <img src={assetSrc} alt={asset.name} className="size-full object-cover" />
            ) : (
              <>
                <video
                  ref={videoRef}
                  src={assetSrc}
                  muted={sequence.tracks.some((t) => t.kind === "audio" && t.muted)}
                  playsInline
                  className={`size-full object-cover ${chroma ? "invisible" : ""}`}
                  crossOrigin={chroma ? "anonymous" : undefined}
                  onError={() => {
                    setPlaying(false);
                    toast.error("Não foi possível reproduzir este arquivo", {
                      description: `${asset.name} — verifique se o arquivo ainda existe em ${asset.path}`,
                    });
                  }}
                  style={{ opacity }}
                />
                {chroma ? (
                  <canvas
                    ref={chromaCanvasRef}
                    aria-label="Pré-visualização com chroma key"
                    className="absolute inset-0 size-full object-cover"
                    style={{ opacity }}
                  />
                ) : null}
              </>
            )
          ) : (
            <div className="grid size-full min-h-[16rem] min-w-[20rem] place-items-center px-6 text-center">
              <p className="text-xs text-muted-foreground">
                Nada sob o playhead. Adicione um clip na timeline ou mova o cursor.
              </p>
            </div>
          )}
          {trackerBox && activeClip?.tracker ? (
            <div
              aria-label="Área rastreada"
              className={
                activeClip.tracker.target === "box"
                  ? "pointer-events-none absolute rounded-sm border-2 border-accent"
                  : activeClip.tracker.target === "text"
                    ? "pointer-events-none absolute grid place-items-center"
                    : "pointer-events-none absolute rounded-sm backdrop-blur-md"
              }
              style={{
                left: `${trackerBox.x * 100}%`,
                top: `${trackerBox.y * 100}%`,
                width: `${trackerBox.w * 100}%`,
                height: `${trackerBox.h * 100}%`,
                ...(activeClip.tracker.target === "pixelate"
                  ? { backdropFilter: "blur(10px) contrast(1.4)" }
                  : {}),
              }}
            >
              {activeClip.tracker.target === "text" ? (
                <span className="rounded-sm bg-background/80 px-1.5 py-0.5 text-[10px] leading-none">
                  {activeClip.tracker.label || "Rastreado"}
                </span>
              ) : null}
            </div>
          ) : null}
          {dipToBlack && opacity < 1 ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-black"
              style={{ opacity: 1 - opacity }}
            />
          ) : null}
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
