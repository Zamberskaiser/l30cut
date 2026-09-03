import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  clipDuration,
  clipEnd,
  formatTimecode,
  SECOND,
  type Clip,
} from "@/core/contracts/domain";
import { useActiveSequence, useEditor } from "@/core/store/editorStore";
import { useUi } from "@/core/store/uiStore";

const STEPS = [-5, -1, 1, 5];

/**
 * Advanced trim window (Premiere's "Aparar"): frame-accurate trim of both
 * edges, optional ripple, and rolling edit against the next clip.
 */
export function TrimDialog() {
  const ui = useUi();
  const { selection, playheadUs, run } = useEditor();
  const sequence = useActiveSequence();

  const clip: Clip | undefined = useMemo(
    () =>
      sequence.clips.find((c) => selection.includes(c.id)) ??
      sequence.clips.find((c) => playheadUs >= c.startUs && playheadUs < clipEnd(c)),
    [sequence, selection, playheadUs],
  );

  const frameUs = Math.max(1, Math.round((SECOND * sequence.fpsDen) / sequence.fpsNum));
  const next = clip
    ? sequence.clips
        .filter((c) => c.trackId === clip.trackId && c.startUs >= clipEnd(clip))
        .sort((a, b) => a.startUs - b.startUs)[0]
    : undefined;

  function trim(edge: "start" | "end", frames: number) {
    if (!clip) return;
    const base = edge === "start" ? clip.startUs : clipEnd(clip);
    const toUs = Math.max(0, base + frames * frameUs);
    try {
      run(
        [
          {
            type: ui.trimRipple ? "rippleTrimClip" : "trimClipEdge",
            clipId: clip.id,
            edge,
            toUs,
          },
        ],
        `Aparar ${edge === "start" ? "entrada" : "saída"} ${frames > 0 ? "+" : ""}${frames}f`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "não foi possível aparar");
    }
  }

  function roll(frames: number) {
    if (!clip || !next) return;
    try {
      run(
        [
          {
            type: "rollingEdit",
            leftClipId: clip.id,
            rightClipId: next.id,
            toUs: Math.max(0, clipEnd(clip) + frames * frameUs),
          },
        ],
        `Rolling ${frames > 0 ? "+" : ""}${frames}f`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "não foi possível rolar o corte");
    }
  }

  return (
    <Dialog open={ui.trimOpen} onOpenChange={ui.setTrimOpen}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aparar (trim avançado)</DialogTitle>
          <DialogDescription>
            Ajuste as bordas quadro a quadro, com ripple opcional e rolling contra o próximo clip.
          </DialogDescription>
        </DialogHeader>

        {!clip ? (
          <p className="text-xs text-muted-foreground">
            Selecione um clip na timeline (ou posicione o playhead sobre ele) para aparar.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-panel-raised/40 p-2 text-[11px]">
              <p className="truncate font-medium">{clip.label || clip.id}</p>
              <p className="tabular text-muted-foreground">
                {formatTimecode(clip.startUs, sequence.fpsNum)} →{" "}
                {formatTimecode(clipEnd(clip), sequence.fpsNum)} · dur{" "}
                {formatTimecode(clipDuration(clip), sequence.fpsNum)}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="trim-ripple" className="text-xs">
                Ripple (fecha o espaço)
              </Label>
              <Switch id="trim-ripple" checked={ui.trimRipple} onCheckedChange={ui.setTrimRipple} />
            </div>

            {(
              [
                ["start", "Entrada"],
                ["end", "Saída"],
              ] as const
            ).map(([edge, label]) => (
              <div key={edge} className="flex items-center gap-2">
                <span className="w-16 text-xs text-muted-foreground">{label}</span>
                {STEPS.map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant="secondary"
                    className="tabular h-7 flex-1 text-[11px]"
                    aria-label={`Aparar ${label.toLowerCase()} ${f} quadros`}
                    onClick={() => trim(edge, f)}
                  >
                    {f > 0 ? `+${f}` : f}f
                  </Button>
                ))}
              </div>
            ))}

            <div className="flex items-center gap-2">
              <span className="w-16 text-xs text-muted-foreground">Rolling</span>
              {STEPS.map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant="secondary"
                  className="tabular h-7 flex-1 text-[11px]"
                  disabled={!next}
                  aria-label={`Rolling ${f} quadros`}
                  onClick={() => roll(f)}
                >
                  {f > 0 ? `+${f}` : f}f
                </Button>
              ))}
            </div>
            {!next ? (
              <p className="text-[10px] text-muted-foreground">
                Não há clip adjacente à direita para rolling nesta trilha.
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
