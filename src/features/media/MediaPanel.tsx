import { useEffect, useRef, useState } from "react";
import { Film, FileAudio, Image as ImageIcon, Pencil, Plus, Wand2, Waves } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  binWithDescendants,
  clipDuration,
  formatDuration,
  type MediaAsset,
} from "@/core/contracts/domain";
import { useActiveSequence, useEditor } from "@/core/store/editorStore";
import { newId } from "@/core/store/timelineReducer";
import { EmptyState } from "@/features/editor/EmptyState";
import { onAppEvent } from "@/core/commands/appEvents";
import { ASSET_DND_MIME } from "@/features/timeline/dnd";
import { BinTree } from "./BinTree";
import { insertAssetCommands, trackEndUs } from "./insertAsset";

const ACCEPTED = ".mp4,.mov,.wav,.mp3,.m4a,.png,.jpg,.jpeg";
const MAX_BYTES = 4 * 1024 * 1024 * 1024;

function assetIcon(kind: MediaAsset["kind"]) {
  if (kind === "audio") return FileAudio;
  if (kind === "image") return ImageIcon;
  return Film;
}

export function MediaPanel() {
  const { project, runtime, enqueue, addAsset, run, jobs } = useEditor();
  const sequence = useActiveSequence();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [selectedBinId, setSelectedBinId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  // Assets of the selected folder and of everything nested inside it.
  const visibleBinIds =
    selectedBinId === null ? null : new Set(binWithDescendants(project.bins, selectedBinId));
  const visibleAssets = project.assets.filter(
    (a) => visibleBinIds === null || (a.binId ? visibleBinIds.has(a.binId) : false),
  );
  const selectedBin = project.bins.find((b) => b.id === selectedBinId);

  const importJob = jobs.find((j) => j.kind === "import" && j.status === "running");

  // No app instalado o seletor nativo devolve caminhos absolutos; no navegador usamos <input type=file>.
  async function startImport() {
    if (busy) return;
    if (runtime.pickMediaFiles) {
      try {
        const paths = await runtime.pickMediaFiles();
        if (paths.length > 0) await importFiles(paths);
      } catch (error) {
        toast.error("Falha ao abrir o seletor de arquivos", {
          description: (error as Error).message,
        });
      }
      return;
    }
    inputRef.current?.click();
  }

  useEffect(() => onAppEvent("import", () => void startImport()));

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const tooBig = files.find((f) => f.size > MAX_BYTES);
    if (tooBig) {
      toast.error("Arquivo acima do limite de 4 GB", { description: tooBig.name });
      return;
    }
    await importFiles(files);
  }

  async function importFiles(files: Array<File | string>) {
    setBusy(true);
    const { done } = enqueue({
      kind: "import",
      label: `Importar ${files.length} arquivo(s)`,
      run: async ({ onProgress }) => {
        const assets = await runtime.importMedia({ files }, ({ progress, detail }) =>
          onProgress(progress, detail),
        );
        return assets;
      },
    });
    try {
      const assets = await done;
      addAsset(assets);
      // Imports land in the folder the user is looking at.
      if (selectedBinId && assets.length > 0) {
        run(
          [{ type: "moveAssetsToBin", assetIds: assets.map((a) => a.id), binId: selectedBinId }],
          "Importar para pasta",
        );
      }
      toast.success(`${assets.length} mídia(s) importada(s)`, {
        description:
          runtime.mode === "tauri"
            ? "Metadados lidos com ffprobe."
            : "Metadados lidos pelo navegador — proxy real só no app instalado.",
      });
      for (const asset of assets) {
        enqueue({
          kind: "proxy",
          label: `Proxy de ${asset.name}`,
          run: ({ onProgress, signal }) =>
            runtime.generateThumbnails(
              asset,
              ({ progress, detail }) => onProgress(progress, detail),
              signal,
            ),
        });
      }
    } catch (error) {
      toast.error("Falha na importação", { description: (error as Error).message });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function startRename(asset: MediaAsset) {
    setRenamingId(asset.id);
    setDraftName(asset.name);
  }

  // Renaming only changes the name shown in the app (and used to talk to the assistant).
  function commitRename(asset: MediaAsset) {
    const name = draftName.trim().slice(0, 120);
    setRenamingId(null);
    if (!name || name === asset.name) return;
    run([{ type: "renameAsset", assetId: asset.id, name }], "Renomear mídia");
  }

  function addToTimeline(asset: MediaAsset) {
    const track = sequence.tracks.find((t) =>
      asset.kind === "audio" ? t.kind === "audio" : t.kind === "video",
    );
    if (!track) return;
    const commands = insertAssetCommands(asset, sequence, trackEndUs(sequence, track.id), track.id);
    if (commands.length === 0) return;
    run(commands, `Inserir ${asset.name}`);
  }

  function analyzeSilence(asset: MediaAsset) {
    enqueue({
      kind: "analyze-silence",
      label: `Analisar silêncios — ${asset.name}`,
      run: async ({ onProgress, signal }) => {
        const ranges = await runtime.detectSilence(
          asset,
          -32,
          300_000,
          ({ progress, detail }) => onProgress(progress, detail),
          signal,
        );
        toast.success(`${ranges.length} faixas de silêncio detectadas`, {
          description: `Mídia: ${asset.name}`,
        });
        return ranges;
      },
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {selectedBin ? `Mídia · ${selectedBin.name}` : "Mídia"}
        </h2>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 gap-1.5"
          onClick={() => void startImport()}
          disabled={busy}
        >
          <Plus className="size-3.5" /> Importar
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {importJob ? (
        <div className="px-3 pb-2">
          <Progress value={importJob.progress * 100} className="h-1" />
          <p className="mt-1 text-[11px] text-muted-foreground">{importJob.detail}</p>
        </div>
      ) : null}

      <BinTree selectedBinId={selectedBinId} onSelect={setSelectedBinId} />

      <ScrollArea className="flex-1 scrollbar-thin-dark">
        <div className="space-y-1 px-2 pb-3">
          {visibleAssets.length === 0 ? (
            <EmptyState
              title={selectedBin ? `${selectedBin.name} está vazia` : "Nenhuma mídia"}
              description={
                selectedBin
                  ? "Arraste mídias para esta pasta ou importe direto nela."
                  : "Importe MP4, MOV, WAV ou imagem para começar."
              }
              action={
                <Button size="sm" variant="secondary" onClick={() => void startImport()}>
                  Importar arquivo
                </Button>
              }
            />
          ) : null}
          {visibleAssets.map((asset) => {
            const Icon = assetIcon(asset.kind);
            return (
              <div
                key={asset.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(ASSET_DND_MIME, asset.id);
                  event.dataTransfer.effectAllowed = "copy";
                }}
                title="Arraste para a timeline"
                className="group cursor-grab rounded-md border border-transparent bg-panel-raised/60 px-2 py-2 transition-colors hover:border-border-strong active:cursor-grabbing"
              >
                <div className="flex items-center gap-2">
                  <Icon className="size-4 shrink-0 text-accent" />
                  {renamingId === asset.id ? (
                    <Input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => commitRename(asset)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(asset);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-6 flex-1 text-xs"
                      aria-label="Novo nome do arquivo"
                    />
                  ) : (
                    <span
                      className="min-w-0 flex-1 truncate text-xs"
                      onDoubleClick={() => startRename(asset)}
                      title="Clique duas vezes para renomear"
                    >
                      {asset.name}
                    </span>
                  )}
                  <span className="tabular text-[11px] text-muted-foreground">
                    {formatDuration(asset.durationUs)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  {asset.demo ? (
                    <Badge variant="outline" className="border-accent/40 text-[10px] text-accent">
                      demo
                    </Badge>
                  ) : null}
                  <span className="tabular text-[10px] text-muted-foreground">
                    {asset.width}×{asset.height}
                  </span>
                  {asset.binId && selectedBinId === null ? (
                    <span className="truncate text-[10px] text-muted-foreground">
                      {project.bins.find((b) => b.id === asset.binId)?.name}
                    </span>
                  ) : null}
                  <div className="ml-auto flex opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      title="Renomear arquivo"
                      onClick={() => startRename(asset)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      title="Adicionar à timeline"
                      onClick={() => addToTimeline(asset)}
                    >
                      <Wand2 className="size-3.5" />
                    </Button>
                    {asset.kind === "image" ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        title="Baixar PNG com metadados"
                        onClick={() => void exportPng(asset)}
                      >
                        <Download className="size-3.5" />
                      </Button>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        title="Analisar silêncios"
                        onClick={() => analyzeSilence(asset)}
                      >
                        <Waves className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
