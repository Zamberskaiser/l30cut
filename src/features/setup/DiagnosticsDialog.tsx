import { useState, type ReactNode } from "react";
import { Activity, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ComponentStatus, SystemDiagnostics } from "@/core/runtime/types";
import { useEditor } from "@/core/store/editorStore";

export function DiagnosticsDialog({ trigger }: { trigger?: ReactNode }) {
  const { runtime } = useEditor();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [components, setComponents] = useState<ComponentStatus[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [diag, comps] = await Promise.all([runtime.diagnose(), runtime.listComponents()]);
      setDiagnostics(diag);
      setComponents(comps);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs">
            <Activity className="size-3.5" /> Diagnóstico
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Diagnóstico do ambiente</DialogTitle>
          <DialogDescription className="text-xs">
            Tudo é verificado localmente. Nenhum dado do seu projeto sai da máquina.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Coletando informações…
          </p>
        ) : diagnostics ? (
          <div className="space-y-3 text-xs">
            <dl className="tabular grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-border bg-panel p-3 text-[11px]">
              <Row
                label="Runtime"
                value={runtime.mode === "tauri" ? "Desktop (Tauri)" : "Navegador (demo)"}
              />
              <Row label="Plataforma" value={diagnostics.os} />
              <Row label="CPU" value={diagnostics.cpu} />
              <Row label="Núcleos" value={String(diagnostics.cores)} />
              <Row label="RAM total" value={`${diagnostics.ramGb} GB`} />
              <Row label="Disco livre" value={`${diagnostics.freeDiskGb} GB`} />
              <Row label="GPU" value={diagnostics.gpu ?? "não detectada"} />
              <Row label="Dados" value={diagnostics.dataDir} />
            </dl>

            <ul className="space-y-1">
              {components.map((component) => (
                <li
                  key={component.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-panel px-2.5 py-1.5"
                >
                  <span className="font-medium">{component.name}</span>
                  <span className="tabular text-[10px] text-muted-foreground">
                    {component.version ?? "—"}
                  </span>
                  <Badge
                    variant="outline"
                    className={`ml-auto text-[10px] ${
                      component.state === "ready"
                        ? "border-success/50 text-success"
                        : component.state === "error"
                          ? "border-destructive/50 text-destructive"
                          : "border-border-strong text-muted-foreground"
                    }`}
                  >
                    {component.state}
                  </Badge>
                </li>
              ))}
            </ul>

            {runtime.mode !== "tauri" ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-[10px] leading-relaxed text-warning">
                Estes números são simulados no navegador. O diagnóstico real (CPU, GPU, disco,
                versões de FFmpeg e whisper.cpp) é coletado pelo app desktop.
              </p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </>
  );
}
