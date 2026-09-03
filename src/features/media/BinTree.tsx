import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { binTree, binWithDescendants, type Bin, type MediaAsset } from "@/core/contracts/domain";
import { useEditor } from "@/core/store/editorStore";
import { newId } from "@/core/store/timelineReducer";
import { ASSET_DND_MIME, BIN_DND_MIME } from "@/features/timeline/dnd";

export interface BinTreeProps {
  /** `null` = project root ("Todas as mídias"). */
  selectedBinId: string | null;
  onSelect: (binId: string | null) => void;
}

/** Recursive asset count so a parent folder shows everything it contains. */
function countAssets(assets: MediaAsset[], bins: Bin[], binId: string | null): number {
  if (binId === null) return assets.length;
  const ids = new Set(binWithDescendants(bins, binId));
  return assets.filter((a) => a.binId && ids.has(a.binId)).length;
}

export function BinTree({ selectedBinId, onSelect }: BinTreeProps) {
  const { project, run } = useEditor();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [dropTarget, setDropTarget] = useState<string | null | undefined>(undefined);

  const rows = binTree(project.bins).filter(({ bin }) => {
    let parent = bin.parentId;
    while (parent) {
      if (collapsed[parent]) return false;
      parent = project.bins.find((b) => b.id === parent)?.parentId;
    }
    return true;
  });

  function createBin(parentId?: string) {
    const binId = newId("bin");
    const siblings = project.bins.filter((b) => (b.parentId ?? undefined) === parentId).length;
    run(
      [
        {
          type: "createBin",
          binId,
          name: `Pasta ${siblings + 1}`,
          ...(parentId ? { parentId } : {}),
        },
      ],
      "Nova pasta",
    );
    onSelect(binId);
    setRenaming(binId);
    setDraft(`Pasta ${siblings + 1}`);
  }

  function commitRename(binId: string) {
    const name = draft.trim();
    setRenaming(null);
    if (!name || name === project.bins.find((b) => b.id === binId)?.name) return;
    run([{ type: "renameBin", binId, name }], "Renomear pasta");
  }

  function drop(event: React.DragEvent, binId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(undefined);
    const assetId = event.dataTransfer.getData(ASSET_DND_MIME);
    if (assetId) {
      run([{ type: "moveAssetsToBin", assetIds: [assetId], binId }], "Mover mídia para pasta");
      return;
    }
    const draggedBin = event.dataTransfer.getData(BIN_DND_MIME);
    if (draggedBin && draggedBin !== binId) {
      try {
        run([{ type: "moveBin", binId: draggedBin, parentId: binId }], "Mover pasta");
      } catch (error) {
        toast.error("Não foi possível mover a pasta", { description: (error as Error).message });
      }
    }
  }

  function acceptsDrag(event: React.DragEvent): boolean {
    return (
      event.dataTransfer.types.includes(ASSET_DND_MIME) ||
      event.dataTransfer.types.includes(BIN_DND_MIME)
    );
  }

  return (
    <div className="border-b border-border/60 pb-1">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Pastas
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          title="Nova pasta"
          onClick={() => createBin(selectedBinId ?? undefined)}
        >
          <FolderPlus className="size-3.5" />
        </Button>
      </div>

      <div className="max-h-48 overflow-y-auto scrollbar-thin-dark px-1">
        <button
          type="button"
          onClick={() => onSelect(null)}
          onDragOver={(e) => {
            if (!acceptsDrag(e)) return;
            e.preventDefault();
            setDropTarget(null);
          }}
          onDragLeave={() => setDropTarget(undefined)}
          onDrop={(e) => drop(e, null)}
          className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors ${
            selectedBinId === null ? "bg-panel-raised text-foreground" : "text-muted-foreground"
          } ${dropTarget === null ? "ring-1 ring-accent" : ""}`}
        >
          <FolderOpen className="size-3.5 text-accent" />
          <span className="flex-1 truncate">Todas as mídias</span>
          <span className="tabular text-[10px]">{project.assets.length}</span>
        </button>

        {rows.map(({ bin, depth }) => {
          const hasChildren = project.bins.some((b) => b.parentId === bin.id);
          const isOpen = !collapsed[bin.id];
          const active = selectedBinId === bin.id;
          return (
            <div
              key={bin.id}
              draggable={renaming !== bin.id}
              onDragStart={(e) => {
                e.dataTransfer.setData(BIN_DND_MIME, bin.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!acceptsDrag(e)) return;
                e.preventDefault();
                setDropTarget(bin.id);
              }}
              onDragLeave={() => setDropTarget(undefined)}
              onDrop={(e) => drop(e, bin.id)}
              className={`group flex items-center gap-1 rounded-md px-1 py-1 text-xs transition-colors ${
                active ? "bg-panel-raised text-foreground" : "text-muted-foreground"
              } ${dropTarget === bin.id ? "ring-1 ring-accent" : ""}`}
              style={{ paddingLeft: 6 + depth * 12 }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  className="shrink-0"
                  title={isOpen ? "Recolher" : "Expandir"}
                  onClick={() => setCollapsed((c) => ({ ...c, [bin.id]: isOpen }))}
                >
                  {isOpen ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </button>
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              <Folder className="size-3.5 shrink-0 text-accent" />

              {renaming === bin.id ? (
                <Input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitRename(bin.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(bin.id);
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  className="h-6 flex-1 px-1 text-xs"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(bin.id)}
                  onDoubleClick={() => {
                    setRenaming(bin.id);
                    setDraft(bin.name);
                  }}
                  className="min-w-0 flex-1 truncate text-left"
                  title="Arraste mídias para cá; duplo clique renomeia"
                >
                  {bin.name}
                </button>
              )}

              <span className="tabular text-[10px]">
                {countAssets(project.assets, project.bins, bin.id)}
              </span>
              <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-5"
                  title="Subpasta"
                  onClick={() => createBin(bin.id)}
                >
                  <FolderPlus className="size-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-5"
                  title="Renomear"
                  onClick={() => {
                    setRenaming(bin.id);
                    setDraft(bin.name);
                  }}
                >
                  <Pencil className="size-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-5"
                  title="Excluir pasta (as mídias sobem um nível)"
                  onClick={() => {
                    run([{ type: "deleteBin", binId: bin.id }], "Excluir pasta");
                    if (selectedBinId === bin.id) onSelect(null);
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
