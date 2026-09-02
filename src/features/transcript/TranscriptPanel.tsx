import { useMemo, useState } from "react";
import { Mic, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { formatTimecode } from "@/core/contracts/domain";
import { useEditor } from "@/core/store/editorStore";
import { EmptyState } from "@/features/editor/EmptyState";

export function TranscriptPanel() {
  const { project, runtime, enqueue, jobs, setPlayhead, setInOut } = useEditor();
  const [query, setQuery] = useState("");
  const job = jobs.find((j) => j.kind === "transcribe" && j.status === "running");

  const segments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return project.transcript;
    return project.transcript.filter((s) => s.text.toLowerCase().includes(needle));
  }, [project.transcript, query]);

  function transcribe() {
    const asset = project.assets[0];
    if (!asset) {
      toast.error("Importe uma mídia antes de transcrever");
      return;
    }
    enqueue({
      kind: "transcribe",
      label: `Transcrever ${asset.name}`,
      run: async ({ onProgress, signal }) => {
        const segs = await runtime.transcribe(
          asset,
          ({ progress, detail }) => onProgress(progress, detail),
          signal,
        );
        toast.success(`${segs.length} segmentos transcritos`, {
          description:
            runtime.mode === "tauri"
              ? "whisper.cpp local."
              : "Transcrição de demonstração — whisper.cpp roda no app instalado.",
        });
        return segs;
      },
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Transcrição
        </h2>
        <Button size="sm" variant="secondary" className="h-7 gap-1.5" onClick={transcribe}>
          <Mic className="size-3.5" /> Transcrever
        </Button>
      </div>

      {job ? (
        <div className="px-3 pb-2">
          <Progress value={job.progress * 100} className="h-1" />
          <p className="mt-1 text-[11px] text-muted-foreground">{job.detail}</p>
        </div>
      ) : null}

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar fala…"
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 scrollbar-thin-dark">
        <div className="space-y-0.5 px-2 pb-3">
          {project.transcript.length === 0 ? (
            <EmptyState
              title="Sem transcrição"
              description="Gere a transcrição local para buscar falas e criar cortes por assunto."
            />
          ) : null}
          {segments.map((segment) => (
            <button
              key={segment.id}
              type="button"
              onClick={() => {
                setPlayhead(segment.startUs);
                setInOut([segment.startUs, segment.endUs]);
              }}
              className="w-full rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-panel-raised"
            >
              <span className="tabular mr-2 text-[10px] text-accent">
                {formatTimecode(segment.startUs)}
              </span>
              <span className="text-[11px] leading-relaxed text-foreground/90">{segment.text}</span>
            </button>
          ))}
          {project.transcript.length > 0 && segments.length === 0 ? (
            <p className="px-2 py-3 text-[11px] text-muted-foreground">
              Nenhuma fala encontrada para “{query}”.
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
