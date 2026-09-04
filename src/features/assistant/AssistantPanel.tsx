import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  FileAudio,
  FolderOpen,
  Loader2,
  Mic,
  Pencil,
  Send,
  Settings2,
  Square,
  Sparkles,
  ThumbsDown,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { AiEditPlan, PlanScope } from "@/core/contracts/aiPlan";
import { parseAiEditPlan } from "@/core/contracts/aiPlan";
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
import { buildAssistantContext } from "@/core/ai/contextBuilder";
import { recordTrainingEvent } from "@/core/training/trainingEvents";
import { useActiveSequence, useEditor, type AssistantMessage } from "@/core/store/editorStore";
import { newId } from "@/core/store/timelineReducer";
import { planDeterministically } from "./deterministicPlanner";
import { compilePlan } from "./planExecutor";
import { previewPlan, type PlanPreview, type PlanPreviewFailure } from "./planPreview";
import { requestPlanFromProvider, type ProviderConfig } from "./provider";
import { LlmSettingsDialog } from "./LlmSettingsDialog";
import { ollamaChatEndpoint } from "@/core/ai/ollama";
import {
  DEFAULT_LLM_SETTINGS,
  isGenerativeReady,
  loadLlmSettings,
  saveLlmSettings,
  type LlmSettings,
} from "@/core/ai/llmSettings";
import { ConfirmPlanDialog } from "./ConfirmPlanDialog";
import { useDictation } from "./useDictation";
import { detectChatIntent } from "./chatIntents";
import { useAssistantActions } from "./useAssistantActions";
import { useMediaTranscription } from "./useMediaTranscription";
import { TRANSCRIBABLE_ACCEPT } from "./audioSources";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SCOPES: Array<{ value: PlanScope["kind"]; label: string }> = [
  { value: "project", label: "Projeto inteiro" },
  { value: "sequence", label: "Sequência atual" },
  { value: "selection", label: "Clips selecionados" },
  { value: "range", label: "Intervalo in/out" },
  { value: "transcript", label: "Transcrição" },
];

const SUGGESTIONS = [
  "crie um vídeo com 4 cenas sobre pesca esportiva",
  "gere uma imagem de um barco ao amanhecer",
  "transcreva o áudio da entrevista",
  "pesquise na internet ideias de título para esse vídeo",
  "remova pausas maiores que 700 ms",
  "converta a sequência para 9:16",
];

export function AssistantPanel() {
  const editor = useEditor();
  const sequence = useActiveSequence();
  const [prompt, setPrompt] = useState("");
  const [scopeKind, setScopeKind] = useState<PlanScope["kind"]>("sequence");
  const [llm, setLlm] = useState<LlmSettings>(DEFAULT_LLM_SETTINGS);
  const [llmOpen, setLlmOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [confirming, setConfirming] = useState<{ plan: AiEditPlan; messageId: string } | null>(
    null,
  );

  /**
   * Voice command: the recording is transcribed locally and sent straight to the
   * assistant, so the user only has to say what should happen.
   */
  const dictation = useDictation((spoken) => {
    setPrompt(spoken);
    toast.success("Comando ouvido", { description: spoken });
    void submit(spoken);
  });

  /**
   * Creation lives in the chat: the assistant itself decides whether the request
   * is a new video, a picture, a transcription, a web lookup or a timeline edit.
   */
  const actions = useAssistantActions({
    endpoint: `${llm.baseUrl.replace(/\/+$/, "")}/v1`,
    model: llm.model,
  });

  /** Same text box, but fed by an audio/video file already on the machine. */
  const media = useMediaTranscription((text) => setPrompt(text));

  // Preferences live in localStorage; read after hydration only.
  useEffect(() => setLlm(loadLlmSettings()), []);

  function updateLlm(next: LlmSettings) {
    setLlm(next);
    saveLlmSettings(next);
  }

  const generative = isGenerativeReady(llm);

  const scope: PlanScope = {
    kind: scopeKind,
    sequenceId: sequence.id,
    clipIds: scopeKind === "selection" ? editor.selection : [],
    inUs: editor.inOutUs?.[0],
    outUs: editor.inOutUs?.[1],
  };

  const learning = editor.profile.learningEnabled;

  async function submit(override?: string) {
    const text = (override ?? prompt).trim();
    if (!text || thinking) return;
    setPrompt("");
    editor.pushMessage({ id: newId("msg"), role: "user", text, at: Date.now() });
    setThinking(true);
    const assistantId = newId("msg");
    try {
      // Creation, transcription and research never become edit plans — the
      // assistant performs them and files the result in the media bin.
      const intent = detectChatIntent(text);
      if (intent.kind !== "edit") {
        const outcome = await actions.perform(intent);
        if (outcome.text.length > 0) {
          editor.pushMessage({
            id: assistantId,
            role: "assistant",
            text: outcome.text,
            at: Date.now(),
          });
          return;
        }
      }

      let plan: AiEditPlan | null = null;
      if (generative) {
        // Local Ollama server on the user's own machine — nothing leaves it.
        const provider: ProviderConfig = {
          id: "ollama",
          label: `Ollama · ${llm.model}`,
          endpoint: ollamaChatEndpoint(llm.baseUrl),
          model: llm.model,
          enabled: true,
          requiresKey: false,
        };
        try {
          const { context } = buildAssistantContext(
            editor.project,
            scope,
            editor.profile,
            editor.selection,
          );
          const response = await requestPlanFromProvider(provider, {
            prompt: text,
            contextJson: JSON.stringify(context),
          });
          plan = {
            ...response.plan,
            modelInfo: { ...response.plan.modelInfo, latencyMs: response.latencyMs },
          };
        } catch (error) {
          if (!llm.fallbackToDeterministic) {
            editor.pushMessage({
              id: assistantId,
              role: "assistant",
              text: `A IA local não respondeu: ${(error as Error).message}. Verifique se o Ollama está rodando em ${llm.baseUrl}.`,
              at: Date.now(),
            });
            return;
          }
          toast.warning("IA local indisponível — usando planejador determinístico", {
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
      if (learning) {
        recordTrainingEvent({
          kind: "plan_proposed",
          intent: plan.intent,
          planId: plan.id,
          prompt: text.slice(0, 400),
          scopeKind: scope.kind,
          operationCount: plan.operations.length,
          provider: plan.modelInfo.provider,
        });
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

  async function applyPlan(plan: AiEditPlan, messageId: string, confirmed: boolean) {
    if (plan.requiresConfirmation && !confirmed) {
      setConfirming({ plan, messageId });
      return;
    }
    const compiled = compilePlan(editor.project, plan, editor.runtime);
    if (!compiled.ok) {
      editor.updateMessage(messageId, { planState: "failed" });
      if (learning) {
        recordTrainingEvent({
          kind: "plan_validation_failed",
          intent: plan.intent,
          planId: plan.id,
          detail: compiled.errors.slice(0, 2).join(" · ").slice(0, 240),
        });
      }
      toast.error("Plano rejeitado pelo validador", { description: compiled.errors.join(" · ") });
      return;
    }
    // Desktop: the Rust allowlist (src-tauri/src/ai_ops.rs) is the security
    // boundary. In the browser demo this method doesn't exist and the Zod
    // layer is all there is — documented as convenience, not security.
    if (editor.runtime.validateAiTransaction) {
      try {
        const report = await editor.runtime.validateAiTransaction(
          JSON.stringify(compiled.transaction.commands),
        );
        if (!report.ok) {
          editor.updateMessage(messageId, { planState: "failed" });
          toast.error("Transação rejeitada pela validação nativa", {
            description: report.errors.join(" · "),
          });
          return;
        }
      } catch (error) {
        editor.updateMessage(messageId, { planState: "failed" });
        toast.error("Validação nativa indisponível", { description: (error as Error).message });
        return;
      }
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
    if (learning) {
      recordTrainingEvent({
        kind: "plan_applied",
        intent: plan.intent,
        planId: plan.id,
        operationCount: plan.operations.length,
        commandCount: compiled.transaction.commands.length,
        provider: plan.modelInfo.provider,
      });
    }
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
    if (learning) {
      recordTrainingEvent({
        kind: "plan_rejected",
        intent: plan.intent,
        planId: plan.id,
        operationCount: plan.operations.length,
      });
    }
  }

  function adjust(previous: AiEditPlan, adjusted: AiEditPlan, messageId: string) {
    editor.updateMessage(messageId, { plan: adjusted, planState: "pending" });
    editor.addFeedback({
      planId: previous.id,
      intent: previous.intent,
      action: "adjusted",
      suggestedOps: previous.operations.length,
      appliedOps: adjusted.operations.length,
    });
    if (learning) {
      recordTrainingEvent({
        kind: "plan_adjusted",
        intent: adjusted.intent,
        planId: adjusted.id,
        operationCount: adjusted.operations.length,
        detail: `de ${previous.operations.length} para ${adjusted.operations.length} operações`,
      });
    }
    toast.success("Plano ajustado e revalidado", {
      description: "Revise a prévia antes de aplicar.",
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Assistente
        </h2>
        <Badge
          variant="outline"
          className="ml-auto border-border-strong text-[10px] text-muted-foreground"
        >
          {generative ? "IA local (Ollama)" : "regras locais"}
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
          <label className="mb-1 block text-[10px] uppercase text-muted-foreground">Motor</label>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full justify-start gap-1.5 text-[11px]"
            onClick={() => setLlmOpen(true)}
            title="Configurar IA generativa local (Ollama)"
          >
            <Settings2 className="size-3.5" />
            <span className="truncate">
              {generative ? `Ollama · ${llm.model}` : "Regras determinísticas"}
            </span>
          </Button>
        </div>
        <p className="col-span-2 text-[10px] leading-relaxed text-muted-foreground">
          Contexto: {sequence.clips.length} clips · {editor.selection.length} selecionados ·{" "}
          {formatDuration(sequenceDuration(sequence))} · {editor.project.transcript.length}{" "}
          segmentos
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
              onApply={(plan) => void applyPlan(plan, message.id, false)}
              onDiscard={(plan) => discard(plan, message.id)}
              onAdjust={(previous, adjusted) => adjust(previous, adjusted, message.id)}
              onPreview={(plan) => previewPlan(editor.project, plan, editor.runtime)}
            />
          ))}
          {thinking ? (
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> {actions.busy ?? "Montando plano"}…
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
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10px] leading-tight text-muted-foreground">
            {dictation.state === "recording"
              ? "Gravando… fale o comando e clique para parar"
              : dictation.state === "transcribing"
                ? "Transcrevendo sua voz aqui no computador…"
                : media.busy
                  ? `Ouvindo o áudio de ${media.busy}…`
                  : actions.busy
                    ? `${actions.busy}…`
                    : "Enter envia · Shift+Enter quebra linha"}
          </span>
          <div className="flex items-center gap-1.5">
            <input
              ref={media.input}
              type="file"
              accept={TRANSCRIBABLE_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void media.fromFile(file);
              }}
            />
            <div className="flex items-center">
              <Button
                size="sm"
                variant={dictation.state === "recording" ? "destructive" : "outline"}
                className="h-7 gap-1.5 rounded-r-none border-r-0"
                onClick={dictation.toggle}
                disabled={thinking || dictation.state === "transcribing" || media.busy !== null}
                aria-label={dictation.state === "recording" ? "Parar gravação" : "Falar o comando"}
                title={
                  dictation.supported
                    ? "Fale o comando em vez de digitar"
                    : "Disponível no programa instalado, com microfone liberado"
                }
              >
                {dictation.state === "transcribing" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : dictation.state === "recording" ? (
                  <Square className="size-3.5" />
                ) : (
                  <Mic className="size-3.5" />
                )}
                {dictation.state === "recording" ? "Parar" : "Falar"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-6 rounded-l-none px-0"
                    disabled={thinking || dictation.state !== "idle" || media.busy !== null}
                    aria-label="Outras formas de transcrever"
                    title="Transcrever um arquivo ou uma mídia do projeto"
                  >
                    {media.busy ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <ChevronDown className="size-3" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="text-[11px]">De onde vem a fala</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => void dictation.start()}>
                    <Mic className="size-3.5" /> Falar no microfone
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => media.pickFile()}>
                    <FolderOpen className="size-3.5" /> Escolher áudio ou vídeo do computador…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[11px]">Mídias do projeto</DropdownMenuLabel>
                  {media.assets.length === 0 ? (
                    <DropdownMenuItem disabled>Nenhuma mídia importada</DropdownMenuItem>
                  ) : (
                    media.assets.slice(0, 12).map((asset) => (
                      <DropdownMenuItem
                        key={asset.id}
                        onSelect={() => void media.fromAsset(asset)}
                        className="truncate"
                      >
                        <FileAudio className="size-3.5 shrink-0" />
                        <span className="truncate">{asset.name}</span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Button
              size="sm"
              className="h-7 gap-1.5"
              onClick={() => void submit()}
              disabled={thinking || dictation.state !== "idle"}
            >
              <Send className="size-3.5" /> Enviar
            </Button>
          </div>
        </div>
      </div>

      <ConfirmPlanDialog
        plan={confirming?.plan ?? null}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) void applyPlan(confirming.plan, confirming.messageId, true);
          setConfirming(null);
        }}
      />

      <LlmSettingsDialog
        open={llmOpen}
        onOpenChange={setLlmOpen}
        settings={llm}
        onChange={updateLlm}
        desktop={editor.runtime.mode === "tauri"}
      />
    </div>
  );
}

function MessageBubble({
  message,
  onApply,
  onDiscard,
  onAdjust,
  onPreview,
}: {
  message: AssistantMessage;
  onApply: (plan: AiEditPlan) => void;
  onDiscard: (plan: AiEditPlan) => void;
  onAdjust: (previous: AiEditPlan, adjusted: AiEditPlan) => void;
  onPreview: (plan: AiEditPlan) => PlanPreview | PlanPreviewFailure;
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
          onAdjust={onAdjust}
          onPreview={onPreview}
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
  onAdjust,
  onPreview,
}: {
  plan: AiEditPlan;
  state: NonNullable<AssistantMessage["planState"]>;
  onApply: (plan: AiEditPlan) => void;
  onDiscard: (plan: AiEditPlan) => void;
  onAdjust: (previous: AiEditPlan, adjusted: AiEditPlan) => void;
  onPreview: (plan: AiEditPlan) => PlanPreview | PlanPreviewFailure;
}) {
  const impact = plan.estimatedImpact;
  const [preview, setPreview] = useState<PlanPreview | PlanPreviewFailure | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftErrors, setDraftErrors] = useState<string[]>([]);

  function startAdjust() {
    setDraft(JSON.stringify(plan.operations, null, 2));
    setDraftErrors([]);
    setEditing(true);
  }

  function saveAdjust() {
    let operations: unknown;
    try {
      operations = JSON.parse(draft);
    } catch (error) {
      setDraftErrors([`JSON inválido: ${(error as Error).message}`]);
      return;
    }
    const candidate = { ...plan, operations };
    const parsed = parseAiEditPlan(candidate);
    if (!parsed.ok) {
      setDraftErrors(parsed.errors.slice(0, 6));
      return;
    }
    setEditing(false);
    setPreview(null);
    onAdjust(plan, parsed.plan);
  }

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

      {preview ? (
        preview.ok ? (
          <div className="mt-2 rounded-sm border border-border bg-background/50 px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Prévia (nada foi aplicado)
            </p>
            <dl className="tabular mt-1 grid grid-cols-3 gap-x-2 text-[10px]">
              <dt className="text-muted-foreground">clips</dt>
              <dd>{preview.before.clips}</dd>
              <dd className="text-accent">→ {preview.after.clips}</dd>
              <dt className="text-muted-foreground">duração</dt>
              <dd>{formatDuration(preview.before.durationUs)}</dd>
              <dd className="text-accent">→ {formatDuration(preview.after.durationUs)}</dd>
              <dt className="text-muted-foreground">legendas</dt>
              <dd>{preview.before.captions}</dd>
              <dd className="text-accent">→ {preview.after.captions}</dd>
            </dl>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {preview.commandCount} comandos em 1 transação · reversível com Ctrl+Z
            </p>
          </div>
        ) : (
          <p className="mt-2 flex items-start gap-1.5 text-[10px] text-destructive">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            Prévia falhou: {preview.errors.slice(0, 3).join(" · ")}
          </p>
        )
      ) : null}

      {editing ? (
        <div className="mt-2 space-y-1.5">
          <label
            className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            htmlFor={`adjust-${plan.id}`}
          >
            Ajustar operações (JSON revalidado pelo schema)
          </label>
          <Textarea
            id={`adjust-${plan.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            className="tabular resize-none text-[10px]"
          />
          {draftErrors.map((error) => (
            <p key={error} className="text-[10px] text-destructive">
              {error}
            </p>
          ))}
          <div className="flex gap-1.5">
            <Button size="sm" className="h-6 text-[10px]" onClick={saveAdjust}>
              Revalidar e salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px]"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {state === "pending" ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => onApply(plan)}>
            <Check className="size-3.5" /> Aplicar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => setPreview(onPreview(plan))}
          >
            <Eye className="size-3.5" /> Prévia
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-[11px]"
            onClick={startAdjust}
            disabled={editing}
          >
            <Pencil className="size-3.5" /> Ajustar
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
      <dt className="tabular text-muted-foreground">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
