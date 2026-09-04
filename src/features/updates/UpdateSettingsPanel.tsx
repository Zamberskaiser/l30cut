import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Github, Loader2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEditor } from "@/core/store/editorStore";
import type { GithubRepoRef, UpdateSettings } from "@/core/runtime/types";
import { pickUpdateRepo, repoCandidates } from "./pickRepo";

const EMPTY: UpdateSettings = { connected: false, repo: null, account: null };

/**
 * Settings block where the user connects their GitHub account and the app
 * picks the repository the updater should watch. The token is validated and
 * stored by the Rust side on this machine only.
 */
export function UpdateSettingsPanel() {
  const { runtime } = useEditor();
  const supported = runtime.mode === "tauri" && Boolean(runtime.connectGithub);

  const [settings, setSettings] = useState<UpdateSettings>(EMPTY);
  const [repos, setRepos] = useState<GithubRepoRef[]>([]);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"connect" | "repos" | "save" | "check" | null>(null);

  useEffect(() => {
    if (!runtime.getUpdateSettings) return;
    void runtime.getUpdateSettings().then(setSettings).catch(() => setSettings(EMPTY));
  }, [runtime]);

  /** Loads the repository list and preselects the most likely one. */
  const loadRepos = useCallback(
    async (current: string | null) => {
      if (!runtime.listGithubRepos) return;
      setBusy("repos");
      try {
        const list = await runtime.listGithubRepos();
        setRepos(list);
        if (current) return;
        let chosen: string | null = null;
        if (runtime.repoHasRelease) {
          for (const candidate of repoCandidates(list)) {
            if (await runtime.repoHasRelease(candidate)) {
              chosen = candidate;
              break;
            }
          }
        }
        chosen ??= pickUpdateRepo(list);
        if (chosen && runtime.setUpdateRepo) {
          setSettings(await runtime.setUpdateRepo(chosen));
          toast.success("Repositório selecionado", { description: chosen });
        }
      } catch (error) {
        toast.error("Não deu para ler seus repositórios", {
          description: (error as Error).message,
        });
      } finally {
        setBusy(null);
      }
    },
    [runtime],
  );

  useEffect(() => {
    if (settings.connected && repos.length === 0 && busy === null) {
      void loadRepos(settings.repo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.connected]);

  async function connect() {
    if (!runtime.connectGithub) return;
    setBusy("connect");
    try {
      const next = await runtime.connectGithub(token);
      setSettings(next);
      setToken("");
      toast.success(`Conta conectada: ${next.account?.login ?? ""}`);
      await loadRepos(next.repo);
    } catch (error) {
      toast.error("Não foi possível conectar", { description: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function chooseRepo(repo: string) {
    if (!runtime.setUpdateRepo) return;
    setBusy("save");
    try {
      setSettings(await runtime.setUpdateRepo(repo));
      toast.success("Repositório salvo", { description: repo });
    } catch (error) {
      toast.error("Não deu para salvar", { description: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!runtime.disconnectGithub) return;
    try {
      setSettings(await runtime.disconnectGithub());
      setRepos([]);
      toast.success("Conta desconectada deste computador");
    } catch (error) {
      toast.error("Não deu para desconectar", { description: (error as Error).message });
    }
  }

  async function checkNow() {
    if (!runtime.checkForUpdate) return;
    setBusy("check");
    try {
      const info = await runtime.checkForUpdate();
      if (info) {
        toast.success(`Versão ${info.version} disponível`, {
          description: "Use o menu do logo para instalar.",
        });
      } else {
        toast.success("Você já está na versão mais nova");
      }
    } catch (error) {
      toast.error("Falha ao verificar", { description: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <div className="flex items-center gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Atualizações automáticas
        </h2>
        {settings.repo ? (
          <Badge variant="outline" className="border-border-strong text-[10px]">
            {settings.repo}
          </Badge>
        ) : null}
      </div>

      <div className="mt-2 space-y-3 rounded-md border border-border bg-panel p-3">
        {settings.connected && settings.account ? (
          <div className="flex items-center gap-2">
            <Github className="size-4" />
            <div>
              <p className="text-sm font-medium">
                {settings.account.name ?? settings.account.login}
              </p>
              <p className="text-[11px] text-muted-foreground">@{settings.account.login}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 gap-1.5 text-[11px]"
                disabled={busy !== null}
                onClick={() => void loadRepos(null)}
              >
                {busy === "repos" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Detectar de novo
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 text-[11px]"
                onClick={() => void disconnect()}
              >
                <Unplug className="size-3.5" /> Desconectar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Conecte sua conta do GitHub para o programa achar sozinho o repositório com as novas
              versões. Crie um token em{" "}
              <span className="text-foreground">github.com/settings/tokens</span> com permissão de
              leitura de repositórios e cole abaixo — ele fica salvo apenas neste computador.
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="ghp_..."
                autoComplete="off"
                className="h-8 text-xs"
                disabled={!supported || busy !== null}
              />
              <Button
                size="sm"
                className="h-8 shrink-0 gap-1.5 text-[11px]"
                disabled={!supported || token.trim().length === 0 || busy !== null}
                onClick={() => void connect()}
              >
                {busy === "connect" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Github className="size-3.5" />
                )}
                Conectar conta
              </Button>
            </div>
          </div>
        )}

        {settings.connected ? (
          <div className="flex items-center gap-2">
            <Select value={settings.repo ?? ""} onValueChange={(v) => void chooseRepo(v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Escolha o repositório das atualizações" />
              </SelectTrigger>
              <SelectContent>
                {repos.map((repo) => (
                  <SelectItem key={repo.fullName} value={repo.fullName} className="text-xs">
                    {repo.fullName}
                    {repo.private ? " (privado)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 shrink-0 gap-1.5 text-[11px]"
              disabled={busy !== null || !settings.repo}
              onClick={() => void checkNow()}
            >
              {busy === "check" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              Verificar agora
            </Button>
          </div>
        ) : null}

        {!supported ? (
          <p className="text-[11px] text-warning">
            No navegador esta parte é só demonstração: conectar a conta e atualizar funcionam no
            programa instalado no Windows.
          </p>
        ) : null}
      </div>
    </section>
  );
}
