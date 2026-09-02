import { Link } from "@tanstack/react-router";
import {
  Activity,
  Clapperboard,
  Download,
  Redo2,
  Save,
  Undo2,
  GraduationCap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useEditor } from "@/core/store/editorStore";
import { ExportDialog } from "@/features/export/ExportDialog";
import { DiagnosticsDialog } from "@/features/setup/DiagnosticsDialog";

export function TopBar() {
  const { project, history, undo, redo, save, dirty, runtime } = useEditor();

  return (
    <header className="chrome-surface flex h-12 shrink-0 items-center gap-3 border-b px-3">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-sm bg-primary text-primary-foreground">
          <Clapperboard className="size-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">L30 CUT AI</span>
      </div>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm text-muted-foreground">{project.name}</span>
        {dirty ? (
          <Badge variant="outline" className="border-warning/40 text-warning">
            não salvo
          </Badge>
        ) : null}
      </div>

      <div className="ml-2 flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void save()}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <Save className="size-4" /> Salvar
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Desfazer"
          disabled={history.past.length === 0}
          onClick={undo}
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refazer"
          disabled={history.future.length === 0}
          onClick={redo}
        >
          <Redo2 className="size-4" />
        </Button>
        <span className="tabular text-[11px] text-muted-foreground">
          {history.past.length} passos
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Badge
          variant="outline"
          className={
            runtime.mode === "tauri"
              ? "border-success/40 text-success"
              : "border-accent/40 text-accent"
          }
        >
          {runtime.mode === "tauri" ? "Runtime local (Tauri)" : "Modo demonstração"}
        </Badge>
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to="/training">
            <GraduationCap className="size-4" /> Aprendizado
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to="/download">
            <Download className="size-4" /> Baixar app
          </Link>
        </Button>
        <DiagnosticsDialog
          trigger={
            <Button variant="secondary" size="sm" className="gap-1.5">
              <Activity className="size-4" /> Diagnóstico
            </Button>
          }
        />
        <ExportDialog />
      </div>
    </header>
  );
}
