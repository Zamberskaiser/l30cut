import { formatTimecode, SECOND } from "@/core/contracts/domain";
import { usToPx } from "./geometry";

interface Props {
  totalUs: number;
  pxPerSecond: number;
  inOutUs: [number, number] | null;
  onPointerDown: (event: React.PointerEvent) => void;
}

export function TimelineRuler({ totalUs, pxPerSecond, inOutUs, onPointerDown }: Props) {
  const step = pxPerSecond < 10 ? 30 : pxPerSecond < 20 ? 10 : pxPerSecond < 45 ? 5 : 1;
  const ticks: number[] = [];
  for (let s = 0; s <= Math.ceil(totalUs / SECOND); s += step) ticks.push(s);

  return (
    <div
      className="relative h-6 cursor-col-resize select-none border-b border-border bg-chrome"
      onPointerDown={onPointerDown}
      role="slider"
      aria-label="Régua da timeline"
      aria-valuemin={0}
      aria-valuemax={Math.round(totalUs / SECOND)}
      aria-valuenow={0}
      tabIndex={-1}
    >
      {inOutUs ? (
        <div
          className="absolute inset-y-0 bg-primary/20"
          style={{
            left: usToPx(inOutUs[0], pxPerSecond),
            width: Math.max(2, usToPx(inOutUs[1] - inOutUs[0], pxPerSecond)),
          }}
        />
      ) : null}
      {ticks.map((s) => (
        <div
          key={s}
          className="absolute top-0 h-full"
          style={{ left: usToPx(s * SECOND, pxPerSecond) }}
        >
          <div className="h-2 w-px bg-ruler" />
          <span className="tabular ml-1 text-[9px] text-muted-foreground">
            {formatTimecode(s * SECOND).slice(3, 8)}
          </span>
        </div>
      ))}
    </div>
  );
}
