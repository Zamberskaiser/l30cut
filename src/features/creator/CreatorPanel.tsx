import { useEffect, useState } from "react";
import { Bot, Clapperboard, Image as ImageIcon, Loader2, Mic, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ASPECT_RESOLUTIONS } from "@/core/runtime/catalog";
import type { CreatorEngines, CreatorScene } from "@/core/runtime/types";
import { useActiveSequence, useEditor } from "@/core/store/editorStore";
import { insertAssetCommands, trackEndUs } from "@/features/media/insertAsset";
import {
  buildScriptPrompt,
  fallbackScenes,
  parseScriptJson,
  totalDurationUs,
  estimateDurationUs,
} from "./script";

/** Default local LLM endpoint (Ollama / llama.cpp server / LM Studio). */
const DEFAULT_ENDPOINT = "http://127.0.0.1:11434/v1";
const DEFAULT_MODEL = "qwen2.5:7b-instruct";

function seconds(us: number): string {
  return `${(us / 1_000_000).toFixed(1)}s`;
}

function EngineBadge({ ready, label }: { ready: boolean; label: string }) {
  return (
    <Badge variant={ready ? "secondary" : "outline"} className="gap-1 text-[10px]">
      {label}
      <span className={ready ? "text-emerald-400" : "text-muted-foreground"}>
        {ready ? "ok" : "—"}
      </span>
    </Badge>
  );
}

/**
 * AI video creator: script + narration + scene images + FFmpeg montage, all with
 * engines installed on the machine. It degrades gracefully — without the local
 * LLM the script comes from the deterministic splitter, and without the image
 * model the scenes are rendered as animated color cards, so the flow always
 * produces a real MP4 that lands on the timeline.
 */
export function CreatorPanel() {
  const { project, runtime, enqueue, addAsset, run } = useEditor();
  const sequence = useActiveSequence();
  const supported = runtime.capabilities.videoCreator;

  const [brief, setBrief] = useState("");
  const [sceneCount, setSceneCount] = useState(4);
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [narrate, setNarrate] = useState(true);
  const [burnTitles, setBurnTitles] = useState(true);
  const [scenes, setScenes] = useState<CreatorScene[]>([]);
  const [engines, setEngines] = useState<CreatorEngines | null>(null);
  const [thinking, setThinking] = useState(false);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!runtime.listAiEngines) return;
    void runtime
      .listAiEngines()
      .then(setEngines)
      .catch(() => setEngines(null));
  }, [runtime]);

  async function generateScript() {
    if (brief.trim().length === 0) {
      toast.error("Descreva o vídeo que você quer criar");
      return;
    }
    setThinking(true);
    try {
      let next: CreatorScene[] | null = null;
      if (runtime.generateScript) {
        try {
          const raw = await runtime.generateScript(
            endpoint,
            model,
            buildScriptPrompt(brief, sceneCount),
          );
          next = parseScriptJson(raw);
        } catch (error) {
          toast.message("Roteirista local indisponível", {
            description: `${(error as Error).message} — usando o roteiro determinístico.`,
          });
        }
      }
      const result = next ?? fallbackScenes(brief, sceneCount);
      setScenes(result);
      toast.success(`Roteiro com ${result.length} cena(s)`, {
        description: next ? "Gerado pelo modelo local." : "Gerado sem IA, a partir do seu texto.",
      });
    } finally {
      setThinking(false);
    }
  }

  function patchScene(id: string, patch: Partial<CreatorScene>) {
    setScenes((current) =>
      current.map((scene) => (scene.id === id ? { ...scene, ...patch } : scene)),
    );
  }

  async function render() {
    if (!runtime.createVideo || scenes.length === 0) return;
    const resolution = ASPECT_RESOLUTIONS[project.aspect] ?? { width: 1920, height: 1080 };
    const outputName = `criacao-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;
    setRendering(true);
    const { done } = enqueue({
      kind: "export",
      label: `Criar vídeo — ${scenes.length} cena(s)`,
      run: async ({ onProgress }) =>
        runtime.createVideo!(scenes, { ...resolution, outputName, narrate, burnTitles }, (event) =>
          onProgress(event.progress, event.detail),
        ),
    });
    try {
      const result = await done;
      // The render is imported like any other media, so it lands in the bin and
      // on the timeline with linked video + audio clips.
      const assets = await runtime.importMedia({ files: [result.outputPath] }, () => {});
      addAsset(assets);
      const asset = assets[0];
      if (asset) {
        const track = sequence.tracks.find((t) => t.kind === "video");
        if (track) {
          const commands = insertAssetCommands(
            asset,
            sequence,
            trackEndUs(sequence, track.id),
            track.id,
          );
          if (commands.length > 0) run(commands, "Inserir vídeo criado");
        }
      }
      toast.success("Vídeo criado e inserido na timeline", {
        description: [
          result.outputPath,
          result.usedNarration ? "com narração local" : "sem narração",
          result.usedImageModel ? "imagens geradas" : "cartelas animadas",
        ].join(" · "),
      });
    } catch (error) {
      toast.error("Falha ao criar o vídeo", { description: (error as Error).message });
    } finally {
      setRendering(false);
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center gap-2">
          <Clapperboard className="size-4 text-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-wide">Criador de vídeo</h2>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Roteiro, narração, imagens e montagem com as IAs instaladas no seu computador. Sem nuvem e
          sem conta.
        </p>

        <div className="flex flex-wrap gap-1.5">
          <EngineBadge ready={engines?.ffmpeg ?? false} label="FFmpeg" />
          <EngineBadge ready={engines?.narration ?? false} label="Narração (Piper)" />
          <EngineBadge ready={engines?.images ?? false} label="Imagens (SD)" />
          <EngineBadge ready={Boolean(runtime.generateScript)} label="Roteirista (LLM)" />
        </div>

        {supported ? null : (
          <p className="rounded-md border border-border bg-muted/40 p-2 text-[11px] text-muted-foreground">
            No navegador isso é apenas a demonstração da interface: a renderização usa FFmpeg local
            e só roda no aplicativo instalado.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="creator-brief" className="text-[11px]">
            O que o vídeo deve dizer
          </Label>
          <Textarea
            id="creator-brief"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            rows={4}
            placeholder="Ex.: 3 dicas rápidas para gravar melhor com o celular."
            className="text-[12px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="creator-scenes" className="text-[11px]">
              Cenas
            </Label>
            <Input
              id="creator-scenes"
              type="number"
              min={1}
              max={12}
              value={sceneCount}
              onChange={(event) => setSceneCount(Number(event.target.value) || 1)}
              className="h-8 text-[12px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="creator-model" className="text-[11px]">
              Modelo local
            </Label>
            <Input
              id="creator-model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="h-8 text-[12px]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="creator-endpoint" className="text-[11px]">
            Endpoint do LLM (somente local)
          </Label>
          <Input
            id="creator-endpoint"
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
            className="h-8 text-[12px]"
          />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-2">
          <span className="flex items-center gap-1.5 text-[11px]">
            <Mic className="size-3.5" /> Narrar com voz local
          </span>
          <Switch checked={narrate} onCheckedChange={setNarrate} />
        </div>
        <div className="flex items-center justify-between rounded-md border border-border p-2">
          <span className="flex items-center gap-1.5 text-[11px]">
            <ImageIcon className="size-3.5" /> Gravar títulos na imagem
          </span>
          <Switch checked={burnTitles} onCheckedChange={setBurnTitles} />
        </div>

        <Button size="sm" className="h-8 gap-1.5 text-[11px]" onClick={() => void generateScript()}>
          {thinking ? <Loader2 className="size-3.5 animate-spin" /> : <Bot className="size-3.5" />}
          Gerar roteiro
        </Button>

        {scenes.length > 0 ? (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide">
                Cenas ({scenes.length})
              </h3>
              <span className="text-[11px] text-muted-foreground">
                ~{seconds(totalDurationUs(scenes))}
              </span>
            </div>
            {scenes.map((scene, index) => (
              <div key={scene.id} className="flex flex-col gap-1.5 rounded-md border border-border p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium">Cena {index + 1}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {seconds(scene.durationUs)}
                  </span>
                </div>
                <Input
                  value={scene.title}
                  onChange={(event) => patchScene(scene.id, { title: event.target.value })}
                  placeholder="Título na tela"
                  className="h-7 text-[11px]"
                />
                <Textarea
                  value={scene.narration}
                  onChange={(event) =>
                    patchScene(scene.id, {
                      narration: event.target.value,
                      durationUs: estimateDurationUs(event.target.value),
                    })
                  }
                  rows={2}
                  placeholder="Narração"
                  className="text-[11px]"
                />
                <Input
                  value={scene.imagePrompt}
                  onChange={(event) => patchScene(scene.id, { imagePrompt: event.target.value })}
                  placeholder="Prompt da imagem"
                  className="h-7 text-[11px]"
                />
              </div>
            ))}
            <Button
              size="sm"
              variant="secondary"
              className="h-8 gap-1.5 text-[11px]"
              disabled={!supported || rendering}
              onClick={() => void render()}
            >
              {rendering ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Wand2 className="size-3.5" />
              )}
              Criar vídeo e enviar para a timeline
            </Button>
            <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
              <Sparkles className="mt-0.5 size-3 shrink-0" />
              Sem modelo de imagem instalado as cenas viram cartelas animadas (Ken Burns); com
              stable-diffusion.cpp instalado, cada cena ganha uma imagem gerada.
            </p>
          </>
        ) : null}
      </div>
    </ScrollArea>
  );
}
