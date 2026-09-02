import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Cpu, HardDrive, Monitor, ShieldCheck } from "lucide-react";
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
        content: "Instalador MSI, versão portátil, requisitos e verificação de integridade por checksum.",
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
                <Badge variant="outline" className="ml-auto border-border-strong text-[10px] text-muted-foreground">
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

        <section className="grid gap-2 md:grid-cols-2">
          <Requirement icon={<Monitor className="size-4" />} title="Sistema" text="Windows 10 21H2 ou Windows 11, 64 bits" />
          <Requirement icon={<Cpu className="size-4" />} title="Processador" text="4 núcleos; 8+ recomendado para 4K" />
          <Requirement icon={<HardDrive className="size-4" />} title="Disco" text="2 GB para o app e componentes, mais espaço para proxies" />
          <Requirement icon={<ShieldCheck className="size-4" />} title="Privacidade" text="Nenhum vídeo, áudio ou transcrição sai da máquina" />
        </section>

        <section className="rounded-md border border-border bg-panel p-4 text-[11px] leading-relaxed text-muted-foreground">
          <h3 className="text-xs font-semibold text-foreground">Depois de instalar</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Abra o app e siga a tela de configuração para preparar FFmpeg e whisper.cpp.</li>
            <li>Escolha um perfil: Leve, Recomendado ou Alta qualidade.</li>
            <li>Importe sua mídia — os arquivos originais nunca são modificados.</li>
            <li>Peça edições no chat e revise cada plano antes de aplicar.</li>
          </ol>
          <p className="mt-2">
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
