import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { COMPONENT_CATALOG, SETUP_PROFILES } from "@/core/runtime/catalog";
import type { ComponentStatus, SetupProfile } from "@/core/runtime/types";
import { useEditor } from "@/core/store/editorStore";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Configuração local — L30 CUT AI" },
      {
        name: "description",
        content:
          "Escolha um perfil de instalação e baixe FFmpeg, whisper.cpp e o modelo de transcrição para rodar o L30 CUT AI totalmente offline.",
      },
      { property: "og:title", content: "Configuração local — L30 CUT AI" },
      {
        property: "og:description",
        content:
          "Perfis Leve, Recomendado e Alta qualidade com download verificado dos componentes locais.",
      },
    ],
  }),
  component: SetupPage,
});

function SetupPage() {
  const { runtime } = useEditor();
  const [profile, setProfile] = useState<SetupProfile>(SETUP_PROFILES[1] as SetupProfile);
  const [components, setComponents] = useState<ComponentStatus[]>(COMPONENT_CATALOG);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [detail, setDetail] = useState("");

  useEffect(() => {
    void runtime.listComponents().then(setComponents);
  }, [runtime]);

  async function install(component: ComponentStatus) {
    const controller = new AbortController();
    setBusy(component.id);
    setProgress(0);
    try {
      const result = await runtime.installComponent(
        component.id,
        profile,
        (event) => {
          setProgress(event.progress);
          setDetail(event.detail ?? "");
        },
        controller.signal,
      );
      setComponents((prev) => prev.map((c) => (c.id === result.id ? result : c)));
      toast.success(`${component.name} pronto`, {
        description:
          runtime.mode === "tauri"
            ? "Binário verificado por checksum e registrado no diretório de dados."
            : "Instalação simulada no navegador: nenhum binário foi baixado ou gravado.",
      });
    } catch (error) {
      toast.error(`Falha ao preparar ${component.name}`, { description: (error as Error).message });
    } finally {
      setBusy(null);
      setDetail("");
    }
  }

  async function installAll() {
    const pending = components.filter((c) => c.state !== "ready");
    if (pending.length === 0) {
      toast.success("Tudo já está pronto");
      return;
    }
    let done = 0;
    for (const component of pending) {
      await install(component);
      done += 1;
    }
    const refreshed = await runtime.listComponents();
    setComponents(refreshed);
    const stillMissing = refreshed.filter((c) => c.state !== "ready");
    if (stillMissing.length === 0) {
      toast.success(`${done} item(ns) instalado(s)`, {
        description: "Todos os recursos locais estão prontos para uso.",
      });
    } else {
      toast.warning(`Faltam ${stillMissing.length} item(ns)`, {
        description: stillMissing.map((c) => c.name).join(", "),
      });
    }
  }

  const missing = components.filter((c) => c.state !== "ready" && !c.optional);
  const pendingCount = components.filter((c) => c.state !== "ready").length;

  return (
    <div className="min-h-screen bg-background">
      <header className="chrome-surface flex h-11 items-center gap-3 border-b px-3">
        <Button asChild size="sm" variant="ghost" className="h-7 gap-1.5 text-xs">
          <Link to="/">
            <ArrowLeft className="size-3.5" /> Editor
          </Link>
        </Button>
        <h1 className="text-sm font-semibold">Configuração local</h1>
        <Badge
          variant="outline"
          className="ml-auto border-border-strong text-[10px] text-muted-foreground"
        >
          {runtime.mode === "tauri" ? "desktop" : "navegador (simulado)"}
        </Badge>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Perfil de instalação
          </h2>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            {SETUP_PROFILES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setProfile(item)}
                className={`rounded-md border bg-panel p-3 text-left transition-colors ${
                  profile.id === item.id
                    ? "border-primary"
                    : "border-border hover:border-border-strong"
                }`}
              >
                <p className="text-sm font-medium">{item.name}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
                <p className="tabular mt-2 text-[10px] text-muted-foreground">
                  ~{Math.round(item.downloadBytes / 1_000_000)} MB · modelo {item.whisperModel}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Componentes
            </h2>
            <Button
              size="sm"
              className="ml-auto h-7 gap-1.5 text-[11px]"
              disabled={busy !== null || pendingCount === 0}
              onClick={() => void installAll()}
            >
              {busy !== null ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              {pendingCount === 0 ? "Tudo instalado" : `Instalar o que falta (${pendingCount})`}
            </Button>
          </div>
          <ul className="mt-2 space-y-2">
            {components.map((component) => (
              <li key={component.id} className="rounded-md border border-border bg-panel p-3">
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-sm font-medium">{component.name}</p>
                    <p className="text-[11px] text-muted-foreground">{component.description}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    {component.state === "ready" ? (
                      <span className="flex items-center gap-1 text-[11px] text-success">
                        <CheckCircle2 className="size-3.5" /> pronto
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 gap-1.5 text-[11px]"
                        disabled={busy !== null}
                        onClick={() => void install(component)}
                      >
                        {busy === component.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Download className="size-3.5" />
                        )}
                        Preparar
                      </Button>
                    )}
                  </div>
                </div>
                {busy === component.id ? (
                  <>
                    <Progress value={Math.round(progress * 100)} className="mt-2 h-1" />
                    <p className="mt-1 text-[10px] text-muted-foreground">{detail}</p>
                  </>
                ) : null}
                <p className="tabular mt-2 text-[10px] text-muted-foreground">
                  origem: {component.source} {component.optional ? "· opcional" : "· obrigatório"}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-md border border-border bg-panel p-3 text-[11px] leading-relaxed text-muted-foreground">
          <p>
            {missing.length === 0
              ? "Todos os componentes obrigatórios estão prontos."
              : `Faltam ${missing.length} componente(s) obrigatório(s).`}{" "}
            Downloads acontecem só a partir de origens autorizadas, com verificação de checksum, e
            podem ser cancelados a qualquer momento. Nada do seu material é enviado para a internet.
          </p>
          {runtime.mode !== "tauri" ? (
            <p className="mt-2 text-warning">
              No navegador esta tela é uma demonstração: nenhum binário é baixado. Baixe o app
              desktop para a instalação real.
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
