import { Lock, LockOpen, Volume2, VolumeX } from "lucide-react";
import type { Track } from "@/core/contracts/domain";
import { TRACK_HEIGHT } from "./geometry";

interface Props {
  track: Track;
  pro: boolean;
  onToggleLock: () => void;
  onToggleMute: () => void;
}

export function TimelineTrackHeader({ track, pro, onToggleLock, onToggleMute }: Props) {
  return (
    <div
      className="flex items-center justify-between gap-1 border-b border-border px-2 text-[11px]"
      style={{ height: TRACK_HEIGHT }}
    >
      <span className="truncate font-medium">{track.name}</span>
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
        </span>
      ) : (
        <span className="text-[10px] uppercase text-muted-foreground">{track.kind[0]}</span>
      )}
    </div>
  );
}
