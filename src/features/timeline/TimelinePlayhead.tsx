import { usToPx } from "./geometry";

interface Props {
  playheadUs: number;
  pxPerSecond: number;
  snapGuideUs: number | null;
  onPointerDown: (event: React.PointerEvent) => void;
}

export function TimelinePlayhead({ playheadUs, pxPerSecond, snapGuideUs, onPointerDown }: Props) {
  return (
    <>
      {snapGuideUs !== null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 z-10 w-px bg-accent/80"
          style={{ left: usToPx(snapGuideUs, pxPerSecond) }}
        />
      ) : null}
      <div
        className="absolute inset-y-0 z-20 w-px bg-playhead"
        style={{ left: usToPx(playheadUs, pxPerSecond) }}
      >
        <button
          type="button"
          aria-label="Arrastar playhead"
          onPointerDown={onPointerDown}
          className="absolute -top-0.5 size-3 -translate-x-1/2 cursor-col-resize rounded-sm bg-playhead"
        />
      </div>
    </>
  );
}
