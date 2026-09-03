import { Lock, LockOpen, Trash2, Volume2, VolumeX } from "lucide-react";
import type { Track } from "@/core/contracts/domain";

interface Props {
  track: Track;
  pro: boolean;
  /** Current vertical zoom of the timeline, in pixels. */
  height: number;
  onToggleLock: () => void;
  onToggleMute: () => void;
  onRename: () => void;
  onRemove: () => void;
}

export function TimelineTrackHeader({
  track,
  pro,
  height,
  onToggleLock,
  onToggleMute,
  onRename,
  onRemove,
}: Props) {
  return (
    <div
      className="flex items-center justify-between gap-1 border-b border-border px-2 text-[11px]"
      style={{ height }}
    >
      <button
        type="button"
        onDoubleClick={onRename}
        title={`${track.name} — duplo clique para renomear`}
        className="min-w-0 flex-1 truncate text-left font-medium"
      >
        {track.name}
      </button>
      {pro ? (
        <span className="flex items-center gap-1">
          <button
            type="button"
            aria-label={track.locked ? `Desbloquear ${track.name}` : `Bloquear ${track.name}`}
            aria-pressed={track.locked}
            onClick={onToggleLock}
            className={
              track.locked ? "text-warning" : "text-muted-foreground hover:text-foreground"
            }
          >
            {track.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
          </button>
          {track.kind === "caption" ? null : (
            <button
              type="button"
              aria-label={track.muted ? `Reativar som de ${track.name}` : `Silenciar ${track.name}`}
              aria-pressed={track.muted}
              onClick={onToggleMute}
              className={
                track.muted ? "text-destructive" : "text-muted-foreground hover:text-foreground"
              }
            >
              {track.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
            </button>
          )}
          <button
            type="button"
            aria-label={`Remover ${track.name}`}
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </span>
      ) : (
        <span className="text-[10px] uppercase text-muted-foreground">{track.kind[0]}</span>
      )}
    </div>
  );
}
