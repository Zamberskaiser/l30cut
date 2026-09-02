import { useState } from "react";
import { Download, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDuration, sequenceDuration, type Aspect } from "@/core/contracts/domain";
import { useActiveSequence, useEditor } from "@/core/store/editorStore";

const ASPECTS: Aspect[] = ["16:9", "9:16", "1:1", "4:5"];

export function ExportDialog() {
  const editor = useEditor();
  const sequence = useActiveSequence();
  const [open, setOpen] = useState(false);
  const [aspect, setAspect] = useState<Aspect>(sequence.aspect);
  const [crf, setCrf] = useState(20);
  const [burnCaptions, setBurnCaptions] = useState(false);
  const [name, setName] = useState("l30-export");

  const preset = { ...editor.exportPresetFor(aspect), crf, burnCaptions };

  function start() {
    setOpen(false);
    const { done } = editor.enqueue({
      kind: "export",
      label: `Exportar ${name}.mp4 (${aspect})`,
      run: ({ onProgress, signal }) =>
        editor.runtime.exportSequence(
          {
            project: editor.project,
            sequenceId: sequence.id,
            preset,
            outputName: `${name}.mp4`,
            overwrite: false,
          },
          (event) => onProgress(event.progress, event.detail),
          signal,
        ),
    });
    void done
      .then((result) => {
        toast.success(result.simulated ? "Exportação simulada concluída" : "Exportação concluída", {
          description: result.simulated
            ? "No navegador o render é simulado: nenhum arquivo foi gravado em disco. Instale o app desktop para render real com FFmpeg."
            : `${result.outputPath} · ${(result.bytes / 1_048_576).toFixed(1)} MB`,
        });
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError")
          toast.error("Falha na exportação", { description: error.message });
      });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-7 gap-1.5 text-xs">
          <Download className="size-3.5" /> Exportar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Exportar sequência</DialogTitle>
          <DialogDescription className="text-xs">
            {sequence.name} · {formatDuration(sequenceDuration(sequence))} · {sequence.clips.length}{" "}
            clips
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-[11px]">Nome do arquivo</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-8 text-xs"
            />
          </div>

          <div>
            <Label className="text-[11px]">Formato</Label>
            <div className="mt-1 flex gap-1">
              {ASPECTS.map((a) => (
                <Button
                  key={a}
                  size="sm"
                  variant={aspect === a ? "default" : "outline"}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setAspect(a)}
                >
                  {a}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-[11px]">
              Qualidade — CRF {crf} ({crf <= 18 ? "alta" : crf <= 22 ? "equilibrada" : "compacta"})
            </Label>
            <Slider
              value={[crf]}
              min={14}
              max={30}
              step={1}
              className="mt-2"
              onValueChange={([v]) => setCrf(v ?? 20)}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-panel px-2.5 py-2">
            <Label className="text-[11px]">Queimar legendas no vídeo</Label>
            <Switch checked={burnCaptions} onCheckedChange={setBurnCaptions} />
          </div>

          <p className="tabular rounded-md border border-border bg-panel px-2.5 py-2 text-[10px] text-muted-foreground">
            {preset.width}×{preset.height} · H.264 · AAC {preset.audioBitrateKbps} kbps · MP4
          </p>

          {editor.runtime.mode !== "tauri" ? (
            <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-[10px] text-warning">
              <Info className="mt-0.5 size-3 shrink-0" />
              Modo demonstração no navegador: o render é simulado e nenhum arquivo é gravado. O
              render real com FFmpeg roda apenas no app desktop.
            </p>
          ) : (
            <Badge variant="outline" className="border-success/50 text-[10px] text-success">
              FFmpeg local disponível
            </Badge>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={start}>
            Enfileirar render
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
