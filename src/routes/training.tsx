import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BrainCircuit, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useEditor } from "@/core/store/editorStore";

export const Route = createFileRoute("/training")({
  head: () => ({
    meta: [
      { title: "Aprendizado do assistente — L30 CUT AI" },
      {
        name: "description",
        content:
          "Ajuste as preferências de edição do assistente do L30 CUT AI: regras, padrões de corte e feedback local, sempre sob seu controle.",
      },
      { property: "og:title", content: "Aprendizado do assistente — L30 CUT AI" },
      {
        property: "og:description",
        content:
          "Regras de estilo, defaults de corte e histórico de feedback armazenados apenas na sua máquina.",
      },
    ],
  }),
  component: TrainingPage,
});

function TrainingPage() {
  const editor = useEditor();
  const [rule, setRule] = useState("");
  const profile = editor.profile;

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

  const accepted = editor.feedback.filter((f) => f.action === "accepted").length;
  const rejected = editor.feedback.filter((f) => f.action === "rejected").length;

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

      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <section className="rounded-md border border-border bg-panel p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Aprender com o meu uso
              </h2>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Quando ativado, o app guarda localmente quais planos você aceitou ou descartou para
                ajustar os padrões sugeridos. Nada é enviado para servidores.
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
            />
          </div>
          <p className="tabular mt-3 text-[11px] text-muted-foreground">
            planos aceitos: {accepted} · descartados: {rejected} · aplicados nesta sessão:{" "}
            {editor.planHistory.length}
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
                <span className="flex-1">{item}</span>
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
          <div className="mt-3 flex gap-2">
            <Input
              value={rule}
              onChange={(e) => setRule(e.target.value)}
              placeholder="Ex.: nunca cortar no meio de uma frase"
              className="h-8 text-xs"
            />
            <Button size="sm" className="h-8 gap-1.5 text-[11px]" onClick={addRule}>
              <Plus className="size-3.5" /> Adicionar
            </Button>
          </div>
        </section>

        <section className="rounded-md border border-border bg-panel p-4">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Perfil exportável (JSON)
          </Label>
          <Textarea
            readOnly
            rows={8}
            value={JSON.stringify(profile, null, 2)}
            className="tabular mt-2 resize-none text-[10px]"
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
