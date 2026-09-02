import { Ban, CheckCircle2, CircleAlert, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEditor } from "@/core/store/editorStore";

export function JobsBar() {
  const { jobs, cancelJob, clearFinishedJobs } = useEditor();
  const active = jobs.filter((j) => j.status === "running" || j.status === "queued");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Tarefas
        </h2>
        <span className="tabular text-[10px] text-muted-foreground">{active.length} ativas</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 gap-1 text-[10px]"
          onClick={clearFinishedJobs}
        >
          <Trash2 className="size-3" /> Limpar
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1 scrollbar-thin-dark">
        <ul className="space-y-1.5 p-2">
          {jobs.length === 0 ? (
            <li className="px-1 text-[11px] text-muted-foreground">
              Importações, análises, transcrições e exportações aparecem aqui com progresso e
              cancelamento.
            </li>
          ) : null}
          {[...jobs].reverse().map((job) => (
            <li key={job.id} className="rounded-md border border-border bg-panel px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                {job.status === "running" ? (
                  <Loader2 className="size-3 animate-spin text-primary" />
                ) : job.status === "succeeded" ? (
                  <CheckCircle2 className="size-3 text-success" />
                ) : job.status === "failed" ? (
                  <CircleAlert className="size-3 text-destructive" />
                ) : job.status === "canceled" ? (
                  <Ban className="size-3 text-muted-foreground" />
                ) : (
                  <span className="size-1.5 rounded-full bg-muted-foreground" />
                )}
                <span className="truncate text-[11px]">{job.label}</span>
                {job.status === "running" || job.status === "queued" ? (
                  <button
                    type="button"
                    onClick={() => cancelJob(job.id)}
                    className="ml-auto text-[10px] text-muted-foreground hover:text-destructive"
                  >
                    cancelar
                  </button>
                ) : (
                  <span className="tabular ml-auto text-[10px] text-muted-foreground">
                    {job.status}
                  </span>
                )}
              </div>
              {job.status === "running" || job.status === "queued" ? (
                <Progress value={Math.round(job.progress * 100)} className="mt-1.5 h-1" />
              ) : null}
              {job.detail ? (
                <p className="mt-1 truncate text-[10px] text-muted-foreground">{job.detail}</p>
              ) : null}
              {job.error ? (
                <p className="mt-1 text-[10px] text-destructive">{job.error}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
