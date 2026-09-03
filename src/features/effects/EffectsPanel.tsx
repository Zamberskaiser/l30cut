import { useMemo, useRef, useState } from "react";
import { Crosshair, Eraser, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  clipDuration,
  formatDuration,
  SECOND,
  type ChromaKey,
  type Clip,
  type TransitionKind,
  type TrackerTarget,
} from "@/core/contracts/domain";
import { useActiveSequence, useEditor } from "@/core/store/editorStore";
import { runTracking } from "./runTracking";

const TRANSITION_KINDS: { id: TransitionKind; label: string }[] = [
  { id: "fade", label: "Fade" },
  { id: "cross", label: "Crossfade" },
  { id: "dip", label: "Dip to black" },
];

const TRACKER_TARGETS: { id: TrackerTarget; label: string }[] = [
  { id: "blur", label: "Desfoque" },
  { id: "pixelate", label: "Pixelar" },
  { id: "box", label: "Caixa" },
  { id: "text", label: "Texto" },
];

const DEFAULT_CHROMA: ChromaKey = {
  enabled: true,
  colorHex: "#00b140",
  similarity: 0.35,
  smoothness: 0.08,
  spill: 0.1,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-md border border-border bg-panel-raised/40 p-2.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function EffectsPanel() {
  const { project, selection, run } = useEditor();
  const sequence = useActiveSequence();
  const [progress, setProgress] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clip: Clip | undefined = useMemo(
    () => sequence.clips.find((c) => selection.includes(c.id)),
    [sequence, selection],
  );
  const asset = clip ? project.assets.find((a) => a.id === clip.assetId) : undefined;
  const duration = clip ? clipDuration(clip) : 0;
  const maxTransitionUs = Math.max(0, Math.floor(duration / 2));

  if (!clip) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <p className="text-xs text-muted-foreground">
          Selecione um clip na timeline para aplicar transições, chroma key e rastreamento.
        </p>
      </div>
    );
  }

  const setTransition = (edge: "in" | "out", kind: TransitionKind, seconds: number) => {
    const durationUs = Math.round(seconds * SECOND);
    if (durationUs > maxTransitionUs) {
      toast.error("Transição maior que metade do clip");
      return;
    }
    run(
      [{ type: "setClipTransition", clipId: clip.id, edge, transition: { kind, durationUs } }],
      edge === "in" ? "Transição de entrada" : "Transição de saída",
    );
  };

  const clearTransition = (edge: "in" | "out") =>
    run(
      [{ type: "setClipTransition", clipId: clip.id, edge, transition: null }],
      "Remover transição",
    );

  const patchChroma = (patch: Partial<ChromaKey>) =>
    run(
      [
        {
          type: "setClipChromaKey",
          clipId: clip.id,
          chroma: { ...(clip.chroma ?? DEFAULT_CHROMA), ...patch },
        },
      ],
      "Chroma key",
    );

  async function track() {
    if (!clip || !asset) return;
    if (asset.kind === "audio") {
      toast.error("Rastreamento só funciona em vídeo ou imagem");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress(0);
    try {
      const previous = clip.tracker?.points[0];
      const points = await runTracking({
        src: asset.path,
        sourceInUs: clip.sourceInUs,
        sourceOutUs: clip.sourceOutUs,
        clipDurationUs: clipDuration(clip),
        box: previous
          ? { x: previous.x, y: previous.y, w: previous.w, h: previous.h }
          : { x: 0.38, y: 0.32, w: 0.24, h: 0.32 },
        onProgress: setProgress,
        signal: controller.signal,
      });
      if (points.length === 0) throw new Error("nenhum quadro analisado");
      run(
        [
          {
            type: "setClipTracker",
            clipId: clip.id,
            tracker: {
              enabled: true,
              target: clip.tracker?.target ?? "blur",
              label: clip.tracker?.label ?? "",
              points,
            },
          },
        ],
        "Rastrear objeto",
      );
      toast.success(`Rastreamento pronto — ${points.length} pontos`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "falha no rastreamento");
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  }

  const inSeconds = (clip.transitionIn?.durationUs ?? 500_000) / SECOND;
  const outSeconds = (clip.transitionOut?.durationUs ?? 500_000) / SECOND;
  const chroma = clip.chroma;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2.5 p-2.5">
        <p className="truncate text-[11px] text-muted-foreground">
          {clip.label || asset?.name || "Clip"} · {formatDuration(duration)}
        </p>

        <Section title="Transições">
          {(["in", "out"] as const).map((edge) => {
            const current = edge === "in" ? clip.transitionIn : clip.transitionOut;
            const seconds = edge === "in" ? inSeconds : outSeconds;
            return (
              <div key={edge} className="space-y-1.5 border-b border-border/60 pb-2 last:border-0">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px]">
                    {edge === "in" ? "Entrada" : "Saída"}
                    {current ? ` · ${current.kind} ${(current.durationUs / SECOND).toFixed(2)}s` : ""}
                  </Label>
                  {current ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      onClick={() => clearTransition(edge)}
                    >
                      <Eraser className="mr-1 size-3" /> Remover
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  {TRANSITION_KINDS.map((k) => (
                    <Button
                      key={k.id}
                      size="sm"
                      variant={current?.kind === k.id ? "default" : "secondary"}
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setTransition(edge, k.id, seconds)}
                    >
                      {k.label}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Slider
                    aria-label={`Duração da transição de ${edge === "in" ? "entrada" : "saída"}`}
                    min={0.1}
                    max={Math.max(0.2, maxTransitionUs / SECOND)}
                    step={0.05}
                    value={[Math.min(seconds, Math.max(0.2, maxTransitionUs / SECOND))]}
                    onValueChange={([v]) => setTransition(edge, current?.kind ?? "fade", v ?? 0.5)}
                  />
                  <span className="tabular w-10 text-right text-[10px] text-muted-foreground">
                    {seconds.toFixed(2)}s
                  </span>
                </div>
              </div>
            );
          })}
        </Section>

        <Section title="Chroma key (fundo verde)">
          <div className="flex items-center justify-between">
            <Label htmlFor="chroma-on" className="text-[11px]">
              Ativar recorte
            </Label>
            <Switch
              id="chroma-on"
              checked={Boolean(chroma?.enabled)}
              onCheckedChange={(on) =>
                on
                  ? patchChroma({ enabled: true })
                  : run(
                      [{ type: "setClipChromaKey", clipId: clip.id, chroma: null }],
                      "Remover chroma key",
                    )
              }
            />
          </div>
          {chroma?.enabled ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="chroma-color" className="text-[11px]">
                  Cor
                </Label>
                <Input
                  id="chroma-color"
                  type="color"
                  value={chroma.colorHex}
                  className="h-7 w-14 p-1"
                  onChange={(e) => patchChroma({ colorHex: e.target.value })}
                />
                <span className="tabular text-[10px] text-muted-foreground">{chroma.colorHex}</span>
              </div>
              {(
                [
                  ["similarity", "Tolerância"],
                  ["smoothness", "Suavidade"],
                  ["spill", "Derrame"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-16 text-[10px] text-muted-foreground">{label}</span>
                  <Slider
                    aria-label={label}
                    min={0}
                    max={1}
                    step={0.01}
                    value={[chroma[key]]}
                    onValueChange={([v]) => patchChroma({ [key]: v ?? 0 } as Partial<ChromaKey>)}
                  />
                  <span className="tabular w-8 text-right text-[10px] text-muted-foreground">
                    {chroma[key].toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </Section>

        <Section title="Rastreamento (tracking)">
          <div className="flex flex-wrap gap-1">
            {TRACKER_TARGETS.map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant={clip.tracker?.target === t.id ? "default" : "secondary"}
                className="h-6 px-2 text-[10px]"
                disabled={!clip.tracker}
                onClick={() =>
                  clip.tracker &&
                  run(
                    [
                      {
                        type: "setClipTracker",
                        clipId: clip.id,
                        tracker: { ...clip.tracker, target: t.id },
                      },
                    ],
                    "Alvo do rastreio",
                  )
                }
              >
                {t.label}
              </Button>
            ))}
          </div>
          {clip.tracker?.target === "text" ? (
            <Input
              value={clip.tracker.label}
              placeholder="Texto que segue o objeto"
              className="h-7 text-[11px]"
              onChange={(e) =>
                clip.tracker &&
                run(
                  [
                    {
                      type: "setClipTracker",
                      clipId: clip.id,
                      tracker: { ...clip.tracker, label: e.target.value.slice(0, 80) },
                    },
                  ],
                  "Texto do rastreio",
                )
              }
            />
          ) : null}
          {progress !== null ? (
            <div className="space-y-1">
              <Progress value={Math.round(progress * 100)} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground">Analisando quadros…</p>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 flex-1 gap-1.5 text-[11px]"
              disabled={progress !== null || !asset}
              onClick={() => void track()}
            >
              {progress !== null ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Crosshair className="size-3.5" />
              )}
              {clip.tracker ? "Rastrear de novo" : "Rastrear objeto"}
            </Button>
            {clip.tracker ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() =>
                  run(
                    [{ type: "setClipTracker", clipId: clip.id, tracker: null }],
                    "Remover rastreio",
                  )
                }
              >
                Limpar
              </Button>
            ) : null}
          </div>
          {clip.tracker ? (
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Sparkles className="size-3" /> {clip.tracker.points.length} pontos rastreados — a
              máscara segue o objeto no monitor.
            </p>
          ) : (
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Wand2 className="size-3" /> O rastreio analisa o clip e cola a máscara no objeto.
            </p>
          )}
        </Section>
      </div>
    </ScrollArea>
  );
}
