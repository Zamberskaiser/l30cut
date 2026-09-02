import { AlertTriangle } from "lucide-react";
import type { AiEditPlan } from "@/core/contracts/aiPlan";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDuration } from "@/core/contracts/domain";

export function ConfirmPlanDialog({
  plan,
  onConfirm,
  onCancel,
}: {
  plan: AiEditPlan | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={Boolean(plan)} onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="size-4 text-warning" /> Confirmar edição em massa
          </DialogTitle>
          <DialogDescription className="text-xs">
            Este plano altera muitos elementos da timeline. Nada é gravado nos arquivos originais —
            a edição é não destrutiva e pode ser desfeita com Ctrl+Z.
          </DialogDescription>
        </DialogHeader>
        {plan ? (
          <div className="space-y-2 rounded-md border border-border bg-panel p-3 text-xs">
            <p>{plan.summary}</p>
            <ul className="tabular space-y-1 text-[11px] text-muted-foreground">
              <li>operações: {plan.operations.length}</li>
              <li>clips adicionados: {plan.estimatedImpact.clipsAdded}</li>
              <li>clips removidos: {plan.estimatedImpact.clipsRemoved}</li>
              <li>clips modificados: {plan.estimatedImpact.clipsModified}</li>
              <li>legendas: +{plan.estimatedImpact.captionsAdded}</li>
              <li>
                variação de duração: {plan.estimatedImpact.durationDeltaUs >= 0 ? "+" : "−"}
                {formatDuration(Math.abs(plan.estimatedImpact.durationDeltaUs))}
              </li>
            </ul>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onConfirm}>
            Aplicar plano
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
