import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Loader2,
  Send,
  Sparkles,
  ThumbsDown,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { AiEditPlan, PlanScope } from "@/core/contracts/aiPlan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration, sequenceDuration } from "@/core/contracts/domain";
import { useActiveSequence, useEditor, type AssistantMessage } from "@/core/store/editorStore";
import { newId } from "@/core/store/timelineReducer";
import { planDeterministically } from "./deterministicPlanner";
import { compilePlan } from "./planExecutor";
import { DEFAULT_PROVIDERS, requestPlanFromProvider } from "./provider";
import { ConfirmPlanDialog } from "./ConfirmPlanDialog";

const SCOPES: Array<{ value: PlanScope["kind"]; label: string }> = [
  { value: "project", label: "Projeto inteiro" },
  { value: "sequence", label: "Sequência atual" },
  { value: "selection", label: "Clips selecionados" },
  { value: "range", label: "Intervalo in/out" },
  { value: "transcript", label: "Transcrição" },
];

const SUGGESTIONS = [
  "remova pausas maiores que 700 ms",
  "crie 6 cortes de 30 a 60 segundos para Reels",
  "gere legendas a partir da transcrição",
  "converta a sequência para 9:16",
];

export function AssistantPanel() {
  const editor = useEditor();
  const sequence = useActiveSequence();
  const [prompt, setPrompt] = useState("");
  const [scopeKind, setScopeKind] = useState<PlanScope["kind"]>("sequence");
  const [providerId, setProviderId] = useState("deterministic");
  const [thinking, setThinking] = useState(false);
  const [confirming, setConfirming] = useState<{ plan: AiEditPlan; messageId: string } | null>(null);

  const scope: PlanScope = {
    kind: scopeKind,
    sequenceId: sequence.id,
    clipIds: scopeKind === "selection" ? editor.selection : [],
    inUs: editor.inOutUs?.[0],
    outUs: editor.inOutUs?.[1],
  };

  async function submit(override?: string) {
    const text = (override ?? prompt).trim();
    if (!text || thinking) return;
    setPrompt("");
    editor.pushMessage({ id: newId("msg"), role: "user", text, at: Date.now() });
    setThinking(true);
    const assistantId = newId("msg");
    try {
      let plan: AiEditPlan | null = null;
      const provider = DEFAULT_PROVIDERS.find((p) => p.id === providerId)!;
      if (provider.id !== "deterministic") {
        try {
          const response = await requestPlanFromProvider(provider, {
            prompt: text,
            contextJson: JSON.stringify(buildContext()),
          });
          plan = { ...response.plan, modelInfo: { ...response.plan.modelInfo, latencyMs: response.latencyMs } };
        } catch (error) {
          toast.warning("Provider local indisponível — usando planejador determinístico", {
            description: (error as Error).message,
          });
        }
      }
      plan =
        plan ??
        planDeterministically({
          prompt: text,
          project: editor.project,
          scope,
          defaults: editor.profile.defaults,
        });

      if (!plan) {
        editor.pushMessage({
          id: assistantId,
          role: "assistant",
          text: "Não consegui transformar esse pedido em um plano seguro. Tente algo como “remova pausas maiores que 700 ms” ou “crie 6 cortes de 30 a 60 segundos”.",
          at: Date.now(),
        });
        return;
      }
      editor.pushMessage({
        id: assistantId,
        role: "assistant",
        text: plan.summary,
        plan,
        planState: "pending",
        at: Date.now(),
      });
    } finally {
      setThinking(false);
    }
  }

  function buildContext() {
    return {
      sequence: {
        id: sequence.id,
        aspect: sequence.aspect,
        durationUs: sequenceDuration(sequence),
        clips: sequence.clips.map((c) => ({
          id: c.id,
          startUs: c.startUs,
          sourceInUs: c.sourceInUs,
          sourceOutUs: c.sourceOutUs,
        })),
      },
      assets: editor.project.assets.map((a) => ({ id: a.id, durationUs: a.durationUs })),
      transcript: editor.project.transcript.slice(0, 200),
      profileRules: editor.profile.rules,
    };
  }

  function applyPlan(plan: AiEditPlan, messageId: string, confirmed: boolean) {
    if (plan.requiresConfirmation && !confirmed) {
      setConfirming({ plan, messageId });
      return;
    }
    const compiled = compilePlan(editor.project, plan, editor.runtime);
    if (!compiled.ok) {
      editor.updateMessage(messageId, { planState: "failed" });
      toast.error("Plano rejeitado pelo validador", { description: compiled.errors.join(" · ") });
      return;
    }
    const entry = editor.dispatch(compiled.transaction);
    if (!entry) {
      editor.updateMessage(messageId, { planState: "failed" });
      return;
    }
    editor.updateMessage(messageId, { planState: "applied" });
    editor.recordPlanApplied(plan, compiled.transaction.commands.length);
    editor.addFeedback({
      planId: plan.id,
      intent: plan.intent,
      action: "accepted",
      suggestedOps: plan.operations.length,
      appliedOps: compiled.transaction.commands.length,
    });
    toast.success("Plano aplicado como uma transação", {
      description: `${compiled.transaction.commands.length} comandos · desfaça tudo com Ctrl+Z`,
      action: { label: "Desfazer", onClick: () => editor.undo() },
    });
  }

  function discard(plan: AiEditPlan, messageId: string) {
    editor.updateMessage(messageId, { planState: "discarded" });
    editor.addFeedback({
      planId: plan.id,
      intent: plan.intent,
      action: "rejected",
      suggestedOps: plan.operations.length,
      appliedOps: 0,
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Assistente
        </h2>
        <Badge variant="outline" className="ml-auto border-border-strong text-[10px] text-muted-foreground">
          {editor.runtime.mode === "tauri" ? "IA local" : "planejador local"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-border px-3 py-2">
        <div>
          <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Escopo</label>
          <Select value={scopeKind} onValueChange={(v) => setScopeKind(v as PlanScope["kind"])}>
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCOPES.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Provider</label>
          <Select value={providerId} onValueChange={setProviderId}>
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEFAULT_PROVIDERS.filter((p) => p.enabled).map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="col-span-2 text-[10px] leading-relaxed text-muted-foreground">
          Contexto: {sequence.clips.length} clips · {editor.selection.length} selecionados ·{" "}
          {formatDuration(sequenceDuration(sequence))} · {editor.project.transcript.length} segmentos
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1 scrollbar-thin-dark">
        <div className="space-y-3 p-3">
          {editor.messages.length === 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Peça uma edição em linguagem natural. A IA responde com um plano tipado, mostra o
                impacto e só aplica depois da sua confirmação.
              </p>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void submit(s)}
                  className="flex w-full items-center gap-1.5 rounded-sm border border-border bg-panel-raised/60 px-2 py-1.5 text-left text-[11px] hover:border-border-strong"
                >
                  <ChevronRight className="size-3 text-primary" /> {s}
                </button>
              ))}
            </div>
          ) : null}

          {editor.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onApply={(plan) => applyPlan(plan, message.id, false)}
              onDiscard={(plan) => discard(plan, message.id)}
            />
          ))}
          {thinking ? (
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Montando plano…
            </p>
          ) : null}
        </div>
      </ScrollArea>

      <div className="border-t border-border p-2">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={3}
          placeholder="Ex.: remova pausas maiores que 700 ms e gere legendas"
          className="resize-none text-xs"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Enter envia · Shift+Enter quebra linha</span>
          <Button size="sm" className="h-7 gap-1.5" onClick={() => void submit()} disabled={thinking}>
            <Send className="size-3.5" /> Enviar
          </Button>
        </div>
      </div>

      <ConfirmPlanDialog
        plan={confirming?.plan ?? null}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) applyPlan(confirming.plan, confirming.messageId, true);
          setConfirming(null);
        }}
      />
    </div>
  );
}

function MessageBubble({
  message,
  onApply,
  onDiscard,
}: {
  message: AssistantMessage;
  onApply: (plan: AiEditPlan) => void;
  onDiscard: (plan: AiEditPlan) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="rounded-md border border-border bg-panel-raised px-2.5 py-2 text-xs">
        {message.text}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-foreground/90">{message.text}</p>
      {message.plan ? (
        <PlanCard
          plan={message.plan}
          state={message.planState ?? "pending"}
          onApply={onApply}
          onDiscard={onDiscard}
        />
      ) : null}
    </div>
  );
}

function PlanCard({
  plan,
  state,
  onApply,
  onDiscard,
}: {
  plan: AiEditPlan;
  state: NonNullable<AssistantMessage["planState"]>;
  onApply: (plan: AiEditPlan) => void;
  onDiscard: (plan: AiEditPlan) => void;
}) {
  const impact = plan.estimatedImpact;
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <Badge className="bg-primary/15 text-[10px] text-primary">{plan.intent}</Badge>
        {typeof plan.confidence === "number" ? (
          <span className="tabular text-[10px] text-muted-foreground">
            confiança {Math.round(plan.confidence * 100)}%
          </span>
        ) : null}
        <span className="ml-auto text-[10px] text-muted-foreground">{plan.modelInfo.model}</span>
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{plan.rationale}</p>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        <Impact label="clips +" value={impact.clipsAdded} />
        <Impact label="clips −" value={impact.clipsRemoved} />
        <Impact label="modificados" value={impact.clipsModified} />
        <Impact label="legendas +" value={impact.captionsAdded} />
        <div className="col-span-2 flex justify-between">
          <dt className="text-muted-foreground">duração</dt>
          <dd className="tabular">
            {impact.durationDeltaUs >= 0 ? "+" : "−"}
            {formatDuration(Math.abs(impact.durationDeltaUs))}
          </dd>
        </div>
      </dl>

      <details className="mt-2">
        <summary className="cursor-pointer text-[10px] text-accent">
          {plan.operations.length} operação(ões) — ver JSON validado
        </summary>
        <pre className="tabular mt-1 max-h-40 overflow-auto rounded-sm bg-background/60 p-2 text-[9px] leading-relaxed">
          {JSON.stringify(plan.operations, null, 2)}
        </pre>
      </details>

      {plan.warnings.map((warning) => (
        <p key={warning} className="mt-1.5 flex items-start gap-1.5 text-[10px] text-warning">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {warning}
        </p>
      ))}

      {state === "pending" ? (
        <div className="mt-2 flex items-center gap-1.5">
          <Button size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => onApply(plan)}>
            <Check className="size-3.5" /> Aplicar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => onDiscard(plan)}
          >
            <X className="size-3.5" /> Descartar
          </Button>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {plan.requiresConfirmation ? "exige confirmação" : "reversível por undo"}
          </span>
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-[10px]">
          {state === "applied" ? (
            <>
              <Check className="size-3 text-success" /> aplicado como transação única
            </>
          ) : state === "discarded" ? (
            <>
              <ThumbsDown className="size-3 text-muted-foreground" /> descartado
            </>
          ) : (
            <>
              <AlertTriangle className="size-3 text-destructive" /> rejeitado na validação
            </>
          )}
        </p>
      )}
    </div>
  );
}

function Impact({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
