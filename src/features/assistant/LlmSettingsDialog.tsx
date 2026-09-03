import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Loader2, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DEFAULT_OLLAMA_BASE_URL,
  RECOMMENDED_OLLAMA_MODELS,
  checkOllama,
  normalizeOllamaBaseUrl,
  pullOllamaModel,
  type OllamaHealth,
} from "@/core/ai/ollama";
import type { LlmSettings } from "@/core/ai/llmSettings";

const gb = (bytes: number) => `${(bytes / 1_000_000_000).toFixed(1)} GB`;

export interface LlmSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: LlmSettings;
  onChange: (settings: LlmSettings) => void;
  /** Browser demo cannot reach localhost servers reliably (CORS). */
  desktop: boolean;
}

export function LlmSettingsDialog({
  open,
  onOpenChange,
  settings,
  onChange,
  desktop,
}: LlmSettingsDialogProps) {
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [health, setHealth] = useState<OllamaHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [pulling, setPulling] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState(0);
  const [pullStatus, setPullStatus] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) setBaseUrl(settings.baseUrl);
  }, [open, settings.baseUrl]);

  async function test(url = baseUrl) {
    setChecking(true);
    try {
      const result = await checkOllama(url);
      setHealth(result);
      if (result.reachable) {
        onChange({ ...settings, baseUrl: normalizeOllamaBaseUrl(url) });
        toast.success("Ollama encontrado", {
          description: `${result.models.length} modelo(s) instalado(s)${
            result.version ? ` · versão ${result.version}` : ""
          }`,
        });
      } else {
        toast.error("Não conseguimos falar com o Ollama", { description: result.error ?? "" });
      }
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void test(settings.baseUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function pull(model: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPulling(model);
    setPullProgress(0);
    setPullStatus("iniciando");
    try {
      await pullOllamaModel(
        baseUrl,
        model,
        (p) => {
          setPullProgress(Math.round(p.progress * 100));
          setPullStatus(p.status);
        },
        controller.signal,
      );
      toast.success(`Modelo ${model} baixado`, {
        description: "Ele fica salvo no seu computador e roda offline.",
      });
      onChange({ ...settings, model, enabled: true });
      await test();
    } catch (error) {
      if (!controller.signal.aborted) {
        toast.error(`Falha ao baixar ${model}`, { description: (error as Error).message });
      }
    } finally {
      setPulling(null);
      setPullStatus("");
    }
  }

  const installed = health?.models ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-sm">IA generativa local (Ollama)</DialogTitle>
          <DialogDescription className="text-xs">
            O modelo roda no seu computador. Nada do seu vídeo, transcrição ou pedido sai da
            máquina. Sem o modelo, o assistente continua funcionando por regras determinísticas.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 scrollbar-thin-dark">
          <div className="space-y-5 px-5 py-4">
            <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-panel p-3">
              <div>
                <Label htmlFor="llm-enabled" className="text-xs font-medium">
                  Usar IA generativa nos planos
                </Label>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Quando ativa, o pedido em linguagem natural é interpretado pelo modelo local e
                  validado pelo mesmo schema fechado das regras.
                </p>
              </div>
              <Switch
                id="llm-enabled"
                checked={settings.enabled}
                onCheckedChange={(enabled) => onChange({ ...settings, enabled })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="llm-url" className="text-[11px] uppercase text-muted-foreground">
                Servidor Ollama
              </Label>
              <div className="flex gap-2">
                <Input
                  id="llm-url"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder={DEFAULT_OLLAMA_BASE_URL}
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => void test()}
                  disabled={checking}
                >
                  {checking ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Testar
                </Button>
              </div>
              {health ? (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {health.reachable ? (
                    <CheckCircle2 className="size-3.5 text-primary" />
                  ) : (
                    <XCircle className="size-3.5 text-destructive" />
                  )}
                  {health.reachable
                    ? `Conectado${health.version ? ` · v${health.version}` : ""} · ${installed.length} modelo(s)`
                    : `Sem conexão: ${health.error ?? "servidor não respondeu"}`}
                </p>
              ) : null}
              {!desktop ? (
                <p className="text-[11px] leading-relaxed text-amber-500">
                  No preview do navegador o acesso a 127.0.0.1 costuma ser bloqueado por CORS. Use o
                  app instalado, ou inicie o Ollama com OLLAMA_ORIGINS=* para testar aqui.
                </p>
              ) : null}
              {health && !health.reachable ? (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Instale o Ollama em ollama.com/download, deixe-o rodando e clique em Testar.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-[11px] uppercase text-muted-foreground">Modelos instalados</p>
              {installed.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Nenhum modelo detectado. Baixe um dos recomendados abaixo.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {installed.map((model) => {
                    const active = settings.model === model.name;
                    return (
                      <button
                        key={model.name}
                        type="button"
                        onClick={() => onChange({ ...settings, model: model.name, enabled: true })}
                        className={`flex w-full items-center gap-2 rounded-sm border px-2 py-1.5 text-left text-[11px] transition-colors ${
                          active
                            ? "border-primary bg-primary/10"
                            : "border-border bg-panel hover:border-border-strong"
                        }`}
                      >
                        <span className="font-medium">{model.name}</span>
                        <span className="text-muted-foreground">
                          {model.parameterSize ?? ""} {model.quantization ?? ""}
                        </span>
                        <span className="tabular ml-auto text-muted-foreground">
                          {model.sizeBytes ? gb(model.sizeBytes) : ""}
                        </span>
                        {active ? <Badge className="h-4 px-1 text-[9px]">em uso</Badge> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-[11px] uppercase text-muted-foreground">Baixar no computador</p>
              <div className="space-y-1.5">
                {RECOMMENDED_OLLAMA_MODELS.map((model) => {
                  const has = installed.some((m) => m.name.startsWith(model.id.split(":")[0]!));
                  return (
                    <div
                      key={model.id}
                      className="rounded-sm border border-border bg-panel px-2 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] font-medium">{model.label}</p>
                        <span className="tabular text-[10px] text-muted-foreground">
                          ~{gb(model.approxBytes)}
                        </span>
                        {has ? (
                          <Badge variant="outline" className="h-4 px-1 text-[9px]">
                            já instalado
                          </Badge>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto h-6 gap-1.5 text-[10px]"
                          disabled={pulling !== null || !health?.reachable}
                          onClick={() => void pull(model.id)}
                        >
                          {pulling === model.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Download className="size-3" />
                          )}
                          Baixar
                        </Button>
                      </div>
                      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                        {model.note} · id {model.id}
                      </p>
                      {pulling === model.id ? (
                        <div className="mt-2 space-y-1">
                          <Progress value={pullProgress} className="h-1" />
                          <p className="tabular text-[10px] text-muted-foreground">
                            {pullProgress}% · {pullStatus}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-panel p-3">
              <div>
                <Label htmlFor="llm-fallback" className="text-xs font-medium">
                  Voltar para as regras se o modelo falhar
                </Label>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Recomendado: se o Ollama estiver desligado ou devolver um plano inválido, o
                  planejador determinístico assume.
                </p>
              </div>
              <Switch
                id="llm-fallback"
                checked={settings.fallbackToDeterministic}
                onCheckedChange={(fallbackToDeterministic) =>
                  onChange({ ...settings, fallbackToDeterministic })
                }
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-border px-5 py-3">
          {pulling ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => abortRef.current?.abort()}
            >
              Cancelar download
            </Button>
          ) : null}
          <Button size="sm" className="text-xs" onClick={() => onOpenChange(false)}>
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
