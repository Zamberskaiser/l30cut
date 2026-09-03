import {
  Clapperboard,
  FileDown,
  FolderOpen,
  Keyboard,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditor } from "@/core/store/editorStore";
import { useUi } from "@/core/store/uiStore";
import { UpdateDialog } from "./UpdateDialog";
import { useUpdater } from "./useUpdater";

export function AppMenu() {
  const { newProject, save, saveAsFile, openFromFile, runtime } = useEditor();
  const ui = useUi();
  const updater = useUpdater();

  return (
    <>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-2 px-2 text-foreground hover:bg-accent"
            aria-label="Menu do aplicativo"
          >
            <span className="grid size-7 place-items-center rounded-sm bg-primary text-primary-foreground">
              <Clapperboard className="size-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">L30 CUT AI</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem
            onClick={() => newProject("Novo projeto")}
            className="gap-2"
          >
            <Sparkles className="size-4 text-muted-foreground" /> Novo projeto
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void openFromFile()} className="gap-2">
            <FolderOpen className="size-4 text-muted-foreground" /> Abrir...
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void save()} className="gap-2">
            <Save className="size-4 text-muted-foreground" /> Salvar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void saveAsFile()} className="gap-2">
            <FileDown className="size-4 text-muted-foreground" /> Salvar como...
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => ui.setShortcutsOpen(true)} className="gap-2">
            <Keyboard className="size-4 text-muted-foreground" /> Atalhos
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => void updater.check()}
            disabled={!runtime.capabilities.updater}
            className="gap-2"
          >
            <RefreshCw className="size-4 text-muted-foreground" /> Atualizar sistema
            {!runtime.capabilities.updater ? (
              <span className="ml-auto text-[10px] text-muted-foreground">app</span>
            ) : null}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UpdateDialog
        open={updater.dialogOpen}
        onOpenChange={updater.setDialogOpen}
        state={updater.state}
        onCheck={updater.check}
        onInstall={updater.install}
      />
    </>
  );
}
