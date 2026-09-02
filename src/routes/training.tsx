import { useRef, useState, useSyncExternalStore } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BrainCircuit,
  Database,
  Download,
  FlaskConical,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TrainingProfileSchema } from "@/core/contracts/domain";
import {
  clearTrainingEvents,
  exportTrainingDataset,
  importTrainingDataset,
  listTrainingEvents,
  recordTrainingEvent,
  subscribeTrainingEvents,
  trainingEventStats,
  EMPTY_TRAINING_EVENTS,
  type TrainingEvent,
} from "@/core/training/trainingEvents";
import { useEditor } from "@/core/store/editorStore";

export const Route = createFileRoute("/training")({
  head: () => ({
    meta: [
      { title: "Aprendizado do assistente — L30 CUT AI" },
      {
        name: "description",
        content:
          "Ajuste as preferências de edição do assistente do L30 CUT AI: regras, padrões de corte, eventos de comportamento e datasets locais, sempre sob seu controle.",
      },
      { property: "og:title", content: "Aprendizado do assistente — L30 CUT AI" },
      {
        property: "og:description",
        content:
          "Regras de estilo, defaults de corte e datasets de treinamento armazenados apenas na sua máquina.",
      },
    ],
  }),
  component: TrainingPage,
});

const KIND_LABELS: Record<TrainingEvent["kind"], string> = {
  plan_proposed: "propostos",
  plan_applied: "aplicados",
  plan_rejected: "rejeitados",
  plan_adjusted: "ajustados",
  plan_validation_failed: "falhas de validação",
  command_executed: "comandos",
  shortcut_used: "atalhos",
};

function useTrainingEvents(): TrainingEvent[] {
  return useSyncExternalStore(
    (onChange) => subscribeTrainingEvents(() => onChange()),
    listTrainingEvents,
    () => EMPTY_TRAINING_EVENTS,
  );
}

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function TrainingPage() {
  const editor = useEditor();
  const [rule, setRule] = useState("");
  const profile = editor.profile;
  const events = useTrainingEvents();
  const stats = trainingEventStats(events);
  const datasetInputRef = useRef<HTMLInputElement>(null);
  const profileInputRef = useRef<HTMLInputElement>(null);

  function addRule() {
    const text = rule.trim();
    if (!text) return;
    editor.setProfile({
      ...profile,
      rules: [...profile.rules, text],
      version: profile.version + 1,
    });
    setRule("");
    toast.success("Regra adicionada ao perfil");
  }

  function removeRule(index: number) {
    editor.setProfile({
      ...profile,
      rules: profile.rules.filter((_, i) => i !== index),
      version: profile.version + 1,
    });
  }

  function setDefault(key: keyof typeof profile.defaults, ms: number) {
    editor.setProfile({
      ...profile,
      defaults: { ...profile.defaults, [key]: Math.max(0, Math.round(ms * 1000)) },
      version: profile.version + 1,
    });
  }

  function seedSyntheticBootstrap() {
    const samples: Array<Parameters<typeof recordTrainingEvent>[0]> = [
      {
        kind: "plan_proposed",
        origin: "synthetic-bootstrap",
        intent: "remove-silences",
        prompt: "remova pausas maiores que 700 ms",
        scopeKind: "sequence",
        operationCount: 1,
        provider: "deterministic",
      },
      {
        kind: "plan_applied",
        origin: "synthetic-bootstrap",
        intent: "remove-silences",
        operationCount: 1,
        commandCount: 14,
        provider: "deterministic",
      },
      {
        kind: "plan_proposed",
        origin: "synthetic-bootstrap",
        intent: "create-short-cuts",
        prompt: "crie 6 cortes de 30 a 60 segundos para Reels",
        scopeKind: "sequence",
        operationCount: 2,
        provider: "deterministic",
      },
      {
        kind: "plan_rejected",
        origin: "synthetic-bootstrap",
        intent: "create-short-cuts",
        operationCount: 2,
        detail: "usuário preferiu cortes mais curtos",
      },
      {
        kind: "plan_adjusted",
        origin: "synthetic-bootstrap",
        intent: "add-captions",
        operationCount: 1,
        detail: "reduziu legendas para os primeiros 60 s",
      },
    ];
    samples.forEach((s) => recordTrainingEvent(s));
    toast.success("5 exemplos sintéticos adicionados", {
      description: "Marcados como synthetic-bootstrap — nunca se misturam ao uso real no export.",
    });
  }

  function importDatasetFile(file: File) {
    void file.text().then((text) => {
      const result = importTrainingDataset(text);
      if (result.imported > 0) {
        toast.success(`${result.imported} eventos importados`, {
          description: result.rejected > 0 ? `${result.rejected} linhas inválidas ignoradas` : "",
        });
      } else {
        toast.error("Nenhum evento válido no arquivo", {
          description: `${result.rejected} linhas rejeitadas pelo schema`,
        });
      }
    });
  }

  function importProfileFile(file: File) {
    void file.text().then((text) => {
      try {
        const parsed = TrainingProfileSchema.safeParse(JSON.parse(text));
        if (!parsed.success) {
          toast.error("Perfil rejeitado pelo schema", {
            description: parsed.error.issues
              .slice(0, 3)
              .map((i) => i.path.join("."))
              .join(" · "),
          });
          return;
        }
        editor.setProfile({ ...parsed.data, version: parsed.data.version + 1 });
        toast.success("Perfil importado e validado");
      } catch {
        toast.error("Arquivo de perfil não é JSON válido");
      }
    });
  }

  const accepted = editor.feedback.filter((f) => f.action === "accepted").length;
  const rejected = editor.feedback.filter((f) => f.action === "rejected").length;
  const adjusted = editor.feedback.filter((f) => f.action === "adjusted").length;
  const recent = events.slice(-8).reverse();

  return (
    <div className="min-h-screen bg-background">
      <header className="chrome-surface flex h-11 items-center gap-3 border-b px-3">
        <Button asChild size="sm" variant="ghost" className="h-7 gap-1.5 text-xs">
          <Link to="/">
            <ArrowLeft className="size-3.5" /> Editor
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-sm font-semibold">
          <BrainCircuit className="size-4 text-primary" /> Aprendizado do assistente
        </h1>
        <Badge
          variant="outline"
          className="ml-auto border-border-strong text-[10px] text-muted-foreground"
        >
          perfil v{profile.version}
        </Badge>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-4 pb-16 sm:p-6">
        <section className="rounded-md border border-border bg-panel p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Aprender com o meu uso
              </h2>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Quando ativado, o app guarda localmente quais planos você aceitou, ajustou ou
                descartou para ajustar os padrões sugeridos. Nada é enviado para servidores.
              </p>
            </div>
            <Switch
              checked={profile.learningEnabled}
              onCheckedChange={(checked) =>
                editor.setProfile({
                  ...profile,
                  learningEnabled: checked,
                  version: profile.version + 1,
                })
              }
              aria-label="Ativar aprendizado com o uso"
            />
          </div>
          <p className="tabular mt-3 text-[11px] text-muted-foreground">
            nesta sessão — aceitos: {accepted} · ajustados: {adjusted} · descartados: {rejected} ·
            aplicados: {editor.planHistory.length}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-7 gap-1.5 text-[11px] text-destructive"
            onClick={editor.clearLearningData}
          >
            <Trash2 className="size-3.5" /> Apagar dados de aprendizado
          </Button>
        </section>

        <section className="rounded-md border border-border bg-panel p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Database className="size-3.5" /> Eventos de comportamento (dataset local)
            </h2>
            <span className="tabular ml-auto text-[10px] text-muted-foreground">
              {stats.total} eventos · {stats.real} uso real · {stats.synthetic} sintéticos
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Cada proposta, ajuste, aplicação ou rejeição vira um evento tipado validado por schema.
            Exporte como JSONL para treinar um modelo local — eventos sintéticos de bootstrap ficam
            marcados e podem ser excluídos do export.
          </p>

          {stats.total > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...stats.byKind.entries()].map(([kind, count]) => (
                <Badge
                  key={kind}
                  variant="outline"
                  className="tabular border-border-strong text-[10px] text-muted-foreground"
                >
                  {KIND_LABELS[kind]}: {count}
                </Badge>
              ))}
            </div>
          ) : null}

          {recent.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {recent.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-sm border border-border bg-panel-raised/60 px-2 py-1 text-[10px]"
                >
                  <span className="font-medium">{KIND_LABELS[event.kind]}</span>
                  {event.intent ? <span className="text-accent">{event.intent}</span> : null}
                  {event.detail ? (
                    <span className="text-muted-foreground">{event.detail}</span>
                  ) : null}
                  <span className="tabular ml-auto text-muted-foreground">
                    {event.origin === "synthetic-bootstrap" ? "sintético · " : ""}
                    {new Date(event.at).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-sm border border-dashed border-border px-2 py-2 text-[11px] text-muted-foreground">
              Nenhum evento ainda. Ative o aprendizado e use o assistente, ou gere exemplos
              sintéticos para ver o formato do dataset.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-[11px]"
              disabled={stats.total === 0}
              onClick={() => {
                const { jsonl, count } = exportTrainingDataset();
                downloadText("l30cut-dataset.jsonl", jsonl, "application/x-ndjson");
                toast.success(`Dataset exportado (${count} eventos)`);
              }}
            >
              <Download className="size-3.5" /> Exportar JSONL
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-[11px]"
              disabled={stats.real === 0}
              onClick={() => {
                const { jsonl, count } = exportTrainingDataset("real-usage");
                downloadText("l30cut-dataset-real.jsonl", jsonl, "application/x-ndjson");
                toast.success(`Dataset exportado (${count} eventos de uso real)`);
              }}
            >
              <Download className="size-3.5" /> Exportar só uso real
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-[11px]"
              onClick={() => datasetInputRef.current?.click()}
            >
              <Upload className="size-3.5" /> Importar JSONL
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-[11px]"
              onClick={seedSyntheticBootstrap}
            >
              <FlaskConical className="size-3.5" /> Gerar exemplos sintéticos
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-[11px] text-destructive"
              disabled={stats.total === 0}
              onClick={() => {
                clearTrainingEvents();
                toast.success("Eventos apagados");
              }}
            >
              <Trash2 className="size-3.5" /> Limpar eventos
            </Button>
          </div>
          <input
            ref={datasetInputRef}
            type="file"
            accept=".jsonl,.txt,.json"
            className="hidden"
            aria-label="Importar dataset JSONL"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importDatasetFile(file);
              e.target.value = "";
            }}
          />
        </section>

        <section className="rounded-md border border-border bg-panel p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Padrões de corte
          </h2>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <NumberField
              label="Silêncio mínimo (ms)"
              value={Math.round(profile.defaults.minSilenceUs / 1000)}
              onChange={(v) => setDefault("minSilenceUs", v)}
            />
            <NumberField
              label="Respiro antes/depois (ms)"
              value={Math.round(profile.defaults.paddingUs / 1000)}
              onChange={(v) => setDefault("paddingUs", v)}
            />
            <NumberField
              label="Clip mínimo (ms)"
              value={Math.round(profile.defaults.clipMinUs / 1000)}
              onChange={(v) => setDefault("clipMinUs", v)}
            />
            <NumberField
              label="Clip máximo (ms)"
              value={Math.round(profile.defaults.clipMaxUs / 1000)}
              onChange={(v) => setDefault("clipMaxUs", v)}
            />
          </div>
        </section>

        <section className="rounded-md border border-border bg-panel p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Regras de estilo
          </h2>
          <ul className="mt-2 space-y-1.5">
            {profile.rules.map((item, index) => (
              <li
                key={`${item}-${index}`}
                className="flex items-start gap-2 rounded-md border border-border bg-panel-raised px-2.5 py-1.5 text-[11px]"
              >
                <span className="min-w-0 flex-1 break-words">{item}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => removeRule(index)}
                  aria-label="Remover regra"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              value={rule}
              onChange={(e) => setRule(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addRule();
              }}
              placeholder="Ex.: nunca cortar no meio de uma frase"
              className="h-8 text-xs"
            />
            <Button size="sm" className="h-8 shrink-0 gap-1.5 text-[11px]" onClick={addRule}>
              <Plus className="size-3.5" /> Adicionar
            </Button>
          </div>
        </section>

        <section className="rounded-md border border-border bg-panel p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Perfil exportável (JSON)
            </Label>
            <div className="ml-auto flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-[11px]"
                onClick={() => {
                  downloadText(
                    "l30cut-perfil.json",
                    JSON.stringify(profile, null, 2),
                    "application/json",
                  );
                  toast.success("Perfil exportado");
                }}
              >
                <Download className="size-3.5" /> Baixar perfil
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-[11px]"
                onClick={() => profileInputRef.current?.click()}
              >
                <Upload className="size-3.5" /> Importar perfil
              </Button>
            </div>
          </div>
          <Textarea
            readOnly
            rows={8}
            value={JSON.stringify(profile, null, 2)}
            className="tabular mt-2 resize-none text-[10px]"
          />
          <input
            ref={profileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            aria-label="Importar perfil JSON"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importProfileFile(file);
              e.target.value = "";
            }}
          />
        </section>
      </main>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <Label className="text-[11px]">{label}</Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-8 text-xs"
      />
    </div>
  );
}
