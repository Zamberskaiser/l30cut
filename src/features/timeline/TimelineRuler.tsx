import { useMemo } from "react";
import { formatTimecode, SECOND } from "@/core/contracts/domain";
import { usToPx } from "./geometry";

interface Props {
  totalUs: number;
  pxPerSecond: number;
  inOutUs: [number, number] | null;
  onPointerDown: (event: React.PointerEvent) => void;
}

interface Tick {
  us: number;
  major: boolean;
  label: string | null;
}

/**
 * Builds ONE deterministic tick collection for the whole ruler.
 * Major ticks carry a timecode label; minor ticks are unlabeled subdivisions.
 * The density adapts to zoom so labels never overlap.
 */
export function buildTicks(totalUs: number, pxPerSecond: number): Tick[] {
  // seconds between major (labeled) ticks, chosen so labels are >= ~64px apart
  const majorStep = pxPerSecond >= 64 ? 1 : pxPerSecond >= 14 ? 5 : pxPerSecond >= 7 ? 10 : 30;
  // minor subdivisions between majors (only when there is room)
  const minorPerMajor = pxPerSecond >= 64 ? 4 : pxPerSecond >= 28 ? majorStep : 1;
  const minorStepUs = Math.round((majorStep * SECOND) / minorPerMajor);
  const endUs = Math.ceil(totalUs / (majorStep * SECOND)) * majorStep * SECOND;

  const ticks: Tick[] = [];
  for (let us = 0; us <= endUs; us += minorStepUs) {
    const major = us % (majorStep * SECOND) === 0;
    ticks.push({ us, major, label: major ? formatTimecode(us).slice(3, 8) : null });
  }
  return ticks;
}

export function TimelineRuler({ totalUs, pxPerSecond, inOutUs, onPointerDown }: Props) {
  const ticks = useMemo(() => buildTicks(totalUs, pxPerSecond), [totalUs, pxPerSecond]);

  return (
    <div
      className="relative h-6 cursor-col-resize select-none border-b border-border bg-chrome"
      onPointerDown={onPointerDown}
      data-timeline-ruler
    >
      {inOutUs ? (
        <div
          aria-hidden
          className="absolute inset-y-0 bg-primary/20"
          style={{
            left: usToPx(inOutUs[0], pxPerSecond),
            width: Math.max(2, usToPx(inOutUs[1] - inOutUs[0], pxPerSecond)),
          }}
        />
      ) : null}
      {ticks.map((tick) => (
        <div
          key={tick.us}
          aria-hidden
          className="absolute top-0 h-full"
          style={{ left: usToPx(tick.us, pxPerSecond) }}
        >
          <div className={tick.major ? "h-2 w-px bg-ruler" : "h-1 w-px bg-ruler/50"} />
          {tick.label ? (
            <span className="tabular ml-1 text-[9px] text-muted-foreground">{tick.label}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
