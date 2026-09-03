import { Check, Download, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UpdaterState } from "./useUpdater";

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: UpdaterState;
  onCheck: () => void;
  onInstall: () => void;
}

export function UpdateDialog({ open, onOpenChange, state, onCheck, onInstall }: UpdateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {state.phase === "available" ? (
              <Download className="size-5 text-primary" />
            ) : state.phase === "error" ? (
              <XCircle className="size-5 text-destructive" />
            ) : state.phase === "checking" ? (
              <Loader2 className="size-5 animate-spin text-primary" />
            ) : (
              <RefreshCw className="size-5 text-primary" />
            )}
            Atualizar sistema
          </DialogTitle>
          <DialogDescription>
            {state.phase === "checking"
              ? "Consultando a última versão no GitHub Releases..."
              : state.phase === "available" && state.info
                ? `Nova versão disponível: ${state.info.version}`
                : state.phase === "downloading"
                  ? "Baixando e instalando a atualização. O app será reiniciado em seguida."
                  : state.phase === "error"
                    ? "Não foi possível verificar ou instalar a atualização."
                    : "Clique em verificar para consultar se existe uma nova versão do L30 CUT AI."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          {state.phase === "available" && state.info ? (
            <>
              {state.info.date ? (
                <p className="text-muted-foreground">Publicada em: {state.info.date}</p>
              ) : null}
              {state.info.body ? (
                <div className="max-h-32 overflow-auto rounded border bg-muted/50 p-2 text-xs">
                  <pre className="whitespace-pre-wrap font-mono">{state.info.body}</pre>
                </div>
              ) : null}
            </>
          ) : null}

          {state.phase === "error" && state.error ? (
            <div className="rounded border border-destructive/30 bg-destructive/10 p-2 text-destructive">
              {state.error}
            </div>
          ) : null}

          {state.phase === "idle" ? (
            <p className="text-muted-foreground">
              O app busca novas versões publicadas no GitHub Releases. Se houver uma atualização,
              você pode baixá-la e instalá-la com um clique.
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={state.phase === "downloading"}>
            {state.phase === "downloading" ? "Aguarde..." : "Fechar"}
          </Button>

          {state.phase === "available" ? (
            <Button onClick={onInstall} className="gap-2">
              <Check className="size-4" />
              Baixar e instalar
            </Button>
          ) : (
            <Button onClick={onCheck} disabled={state.phase === "checking" || state.phase === "downloading"} className="gap-2">
              {state.phase === "checking" || state.phase === "downloading" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Verificar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
