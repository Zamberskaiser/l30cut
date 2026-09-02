import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  clipDuration,
  formatTimecode,
  type Clip,
  type MediaAsset,
  type TrackKind,
} from "@/core/contracts/domain";
import { clipPeakSlice, type PeakData } from "@/core/audio/waveform";
import { usToPx } from "./geometry";

export interface ClipActions {
  onSplit: (clip: Clip) => void;
  onDuplicate: (clip: Clip) => void;
  onDelete: (clip: Clip) => void;
  onRippleDelete: (clip: Clip) => void;
  onGain: (clip: Clip) => void;
  onReveal: (clip: Clip) => void;
  onLink: (clip: Clip) => void;
  onUnlink: (clip: Clip) => void;
}

interface Props {
  clip: Clip;
  asset?: MediaAsset | undefined;
  trackKind: TrackKind;
  selected: boolean;
  locked: boolean;
  pxPerSecond: number;
  pro: boolean;
  /** Ghost offsets while a gesture is running (never mutates the project). */
  ghostDeltaUs?: number | undefined;
  ghostTrim?: { edge: "start" | "end"; toUs: number } | null | undefined;
  /** Asset peaks (real when decodable, synthesized otherwise). */
  peaks?: PeakData | undefined;
  onPointerDown: (event: React.PointerEvent, clip: Clip) => void;
  actions: ClipActions;
}

export function TimelineClip({
  clip,
  asset,
  trackKind,
  selected,
  locked,
  pxPerSecond,
  pro,
  ghostDeltaUs = 0,
  ghostTrim = null,
  peaks,
  onPointerDown,
  actions,
}: Props) {
  const duration = clipDuration(clip);
  const startUs = clip.startUs;
  const endUs = startUs + duration;
  const drawnStart = ghostTrim?.edge === "start" ? ghostTrim.toUs : startUs;
  const drawnEnd = ghostTrim?.edge === "end" ? ghostTrim.toUs : endUs;
  const left = usToPx(Math.max(0, Math.min(drawnStart, drawnEnd - 1)), pxPerSecond);
  const width = Math.max(6, usToPx(Math.max(1, drawnEnd - drawnStart), pxPerSecond));
  const label = clip.label || asset?.name || clip.id;
  const rate = clip.playbackRate ?? 1;

  const showWaveform = trackKind === "audio" && !!peaks && !!asset && width > 12;
  const wavePoints = showWaveform
    ? (() => {
        const samples = Math.max(8, Math.min(240, Math.round(width / 2)));
        const slice = clipPeakSlice(
          peaks.peaks,
          asset.durationUs,
          clip.sourceInUs,
          clip.sourceOutUs,
          samples,
        );
        const step = width / Math.max(1, samples - 1);
        const top = slice.map((v, i) => `${(i * step).toFixed(1)},${(16 - v * 14).toFixed(1)}`);
        const bottom = slice
          .map((v, i) => `${(i * step).toFixed(1)},${(16 + v * 14).toFixed(1)}`)
          .reverse();
        return [...top, ...bottom].join(" ");
      })()
    : null;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            data-clip-id={clip.id}
            aria-pressed={selected}
            aria-label={`${label} — ${formatTimecode(duration)}${clip.linkGroupId ? " — vinculado A/V" : ""}`}
            onPointerDown={(event) => onPointerDown(event, clip)}
            className={`absolute top-1.5 h-8 select-none overflow-hidden rounded-sm border px-1.5 text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              trackKind === "audio"
                ? "border-track-audio/60 bg-track-audio/25"
                : "border-track-video/60 bg-track-video/30"
            } ${selected ? "ring-2 ring-primary" : ""} ${locked ? "cursor-not-allowed opacity-60" : "cursor-grab active:cursor-grabbing"}`}
            style={{ left, width }}
            title={`${label} — ${formatTimecode(duration)}`}
          >
            <span className="block truncate text-[10px] leading-4">
              {clip.linkGroupId ? (
                <span aria-hidden className="mr-1 text-muted-foreground">
                  ⛓
                </span>
              ) : null}
              {label}
            </span>

            {pro ? (
              <span className="tabular block truncate text-[9px] text-muted-foreground">
                {formatTimecode(clip.sourceInUs).slice(3)} →{" "}
                {formatTimecode(clip.sourceOutUs).slice(3)}
                {clip.gainDb !== 0 ? ` · ${clip.gainDb} dB` : ""}
                {rate !== 1 ? ` · ${Math.round(rate * 100)}%` : ""}
              </span>
            ) : (
              <span className="tabular block text-[9px] text-muted-foreground">
                {formatTimecode(duration).slice(3, 8)}
                {rate !== 1 ? ` · ${Math.round(rate * 100)}%` : ""}
              </span>
            )}
            {wavePoints ? (
              <svg
                className={`pointer-events-none absolute inset-0 size-full ${
                  peaks?.simulated ? "text-track-audio/70" : "text-track-audio"
                }`}
                preserveAspectRatio="none"
                viewBox={`0 0 ${Math.max(1, width)} 32`}
                aria-hidden
              >
                <polygon points={wavePoints} fill="currentColor" fillOpacity={0.55} />
              </svg>
            ) : null}
            {trackKind === "audio" && clip.gainKeyframes?.length ? (
              <svg
                className="pointer-events-none absolute inset-0 size-full text-accent"
                preserveAspectRatio="none"
                viewBox={`0 0 ${Math.max(1, width)} 32`}
                aria-hidden
              >
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  points={clip.gainKeyframes
                    .map((kf) => `${usToPx(kf.atUs, pxPerSecond)},${((12 - kf.gainDb) / 18) * 32}`)
                    .join(" ")}
                />
              </svg>
            ) : null}
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-foreground/20"
            />
            <span
              aria-hidden
              className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-foreground/20"
            />
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem onSelect={() => actions.onSplit(clip)}>
            Cortar no playhead
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => actions.onDuplicate(clip)}>Duplicar</ContextMenuItem>
          <ContextMenuItem onSelect={() => actions.onGain(clip)}>Ganho de áudio</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => actions.onDelete(clip)}>
            Remover (deixa lacuna)
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => actions.onRippleDelete(clip)}>
            Ripple delete
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuSeparator />
          {clip.linkGroupId ? (
            <ContextMenuItem onSelect={() => actions.onUnlink(clip)}>
              Desvincular A/V (Ctrl+Shift+L)
            </ContextMenuItem>
          ) : (
            <ContextMenuItem onSelect={() => actions.onLink(clip)}>
              Vincular seleção A/V (Ctrl+L)
            </ContextMenuItem>
          )}
          <ContextMenuItem onSelect={() => actions.onReveal(clip)}>Revelar mídia</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {ghostDeltaUs !== 0 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute top-1.5 h-8 rounded-sm border border-dashed border-primary bg-primary/10"
          style={{ left: usToPx(Math.max(0, startUs + ghostDeltaUs), pxPerSecond), width }}
        />
      ) : null}
    </>
  );
}
