import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Cpu, Download, HardDrive, Monitor, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Baixar o L30 CUT AI para Windows" },
      {
        name: "description",
        content:
          "Instalador MSI e build portátil do L30 CUT AI: editor de vídeo local-first com IA offline, cortes por silêncio e legendas automáticas.",
      },
      { property: "og:title", content: "Baixar o L30 CUT AI para Windows" },
      {
        property: "og:description",
        content:
          "Instalador MSI, versão portátil, requisitos e verificação de integridade por checksum.",
      },
    ],
  }),
  component: DownloadPage,
});

const BUILDS = [
  {
    name: "Instalador Windows (MSI)",
    file: "L30-CUT-AI_x64_setup.msi",
    detail: "Instalação padrão com atalho, associação de projetos .l30 e atualizações assinadas.",
  },
  {
    name: "Portátil (ZIP)",
    file: "L30-CUT-AI_x64_portable.zip",
    detail: "Roda de uma pasta ou pendrive, sem instalar. Ideal para máquinas restritas.",
  },
];

function downloadFile(path: string, filename: string) {
  fetch(path)
    .then((res) => {
      if (!res.ok) throw new Error(`Falha ao baixar (${res.status})`);
      return res.blob();
    })
    .then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch((err: unknown) => {
      alert(err instanceof Error ? err.message : "Falha ao baixar o arquivo");
    });
}

function DownloadPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="chrome-surface flex h-11 items-center gap-3 border-b px-3">
        <Button asChild size="sm" variant="ghost" className="h-7 gap-1.5 text-xs">
          <Link to="/">
            <ArrowLeft className="size-3.5" /> Editor
          </Link>
        </Button>
        <h1 className="text-sm font-semibold">Download para Windows</h1>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <section className="rounded-md border border-border bg-panel p-4">
          <h2 className="text-base font-semibold">L30 CUT AI — desktop</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            O app desktop roda 100% na sua máquina: FFmpeg local para render, whisper.cpp local para
            transcrição e um provider de IA local opcional. A versão web que você acabou de usar é
            uma demonstração navegável, com processamento simulado.
          </p>
          <div className="mt-3 space-y-2">
            {BUILDS.map((build) => (
              <div
                key={build.file}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-panel-raised px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium">{build.name}</p>
                  <p className="text-[11px] text-muted-foreground">{build.detail}</p>
                  <p className="tabular mt-0.5 text-[10px] text-muted-foreground">{build.file}</p>
                </div>
                <Badge
                  variant="outline"
                  className="ml-auto border-border-strong text-[10px] text-muted-foreground"
                >
                  publicado pelo release CI
                </Badge>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-warning">
            Os artefatos são gerados pelo workflow de release (Tauri + Windows runner) e anexados à
            tag do GitHub junto do arquivo de checksums. Enquanto nenhuma tag tiver sido publicada,
            não há binário para baixar — esta página descreve exatamente o que o release entrega.
          </p>
        </section>

        <section className="rounded-md border border-border bg-panel p-4">
          <h2 className="text-base font-semibold">Baixar os materiais agora</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Pacote com todo o código-fonte do editor, o projeto Tauri (src-tauri), a documentação de
            arquitetura/release e os workflows de CI. Dentro dele há o{" "}
            <span className="tabular">build-windows.bat</span>: dê dois cliques no Windows e ele
            instala as dependências, roda os testes e gera o MSI/EXE automaticamente.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => downloadFile("/l30-cut-ai-source.zip", "l30-cut-ai-source.zip")}
            >
              <Download className="size-4" /> Baixar pacote (.zip)
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() =>
                document.getElementById("como-instalar")?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Como instalar
            </Button>
          </div>
        </section>

        <section className="grid gap-2 md:grid-cols-2">
          <Requirement
            icon={<Monitor className="size-4" />}
            title="Sistema"
            text="Windows 10 21H2 ou Windows 11, 64 bits"
          />
          <Requirement
            icon={<Cpu className="size-4" />}
            title="Processador"
            text="4 núcleos; 8+ recomendado para 4K"
          />
          <Requirement
            icon={<HardDrive className="size-4" />}
            title="Disco"
            text="2 GB para o app e componentes, mais espaço para proxies"
          />
          <Requirement
            icon={<ShieldCheck className="size-4" />}
            title="Privacidade"
            text="Nenhum vídeo, áudio ou transcrição sai da máquina"
          />
        </section>

        <section
          id="como-instalar"
          className="rounded-md border border-border bg-panel p-4 text-[11px] leading-relaxed text-muted-foreground"
        >
          <h3 className="text-xs font-semibold text-foreground">Depois de instalar</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4">
            <li>
              <strong className="text-foreground">Instale o app.</strong> Dê dois cliques no arquivo{" "}
              <span className="tabular">.msi</span> gerado pelo build e siga o assistente. Um atalho{" "}
              <span className="italic">L30 CUT AI</span> aparece no menu Iniciar.
            </li>
            <li>
              <strong className="text-foreground">Abra o app.</strong> Na primeira execução, a tela
              de setup pede para baixar FFmpeg, ffprobe e whisper.cpp.
            </li>
            <li>
              <strong className="text-foreground">Escolha um perfil.</strong> Leve, Recomendado ou
              Alta qualidade. O app baixa e verifica os componentes automaticamente.
            </li>
            <li>
              <strong className="text-foreground">Crie um projeto</strong> e importe sua mídia. Os
              arquivos originais nunca são modificados — todas as edições são não destrutivas.
            </li>
            <li>
              <strong className="text-foreground">Use o chat</strong> para pedir cortes, legendas ou
              ajustes. Revise o plano antes de aplicar.
            </li>
          </ol>
          <p className="mt-3">
            Dica: dentro do pacote-fonte, <span className="tabular">run-windows.bat</span> localiza
            o app instalado e o abre para você.
          </p>
          <p className="mt-1">
            Verifique a integridade comparando o SHA-256 do arquivo baixado com o publicado no
            release.
          </p>
        </section>
      </main>
    </div>
  );
}

function Requirement({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-panel p-3">
      <span className="text-primary">{icon}</span>
      <div>
        <p className="text-xs font-medium">{title}</p>
        <p className="text-[11px] text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
