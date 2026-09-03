import { ChevronsDownUp, ChevronsUpDown, Film, Music, Plus } from "lucide-react";
import { useActiveSequence, useEditor } from "@/core/store/editorStore";
import { newId } from "@/core/store/timelineReducer";
import { useUi } from "@/core/store/uiStore";

/**
 * Footer of the track header column: add video/audio tracks and change the
 * timeline's vertical zoom (lane height), Premiere-style.
 */
export function TrackControls() {
  const editor = useEditor();
  const sequence = useActiveSequence();
  const ui = useUi();

  const addTrack = (kind: "video" | "audio") => {
    const count = sequence.tracks.filter((t) => t.kind === kind).length + 1;
    const name = `${kind === "video" ? "V" : "A"}${count}`;
    const index =
      kind === "video"
        ? sequence.tracks.filter((t) => t.kind === "video").length
        : sequence.tracks.length;
    editor.run(
      [{ type: "addTrack", trackId: newId("track"), kind, name, index }],
      `Adicionar trilha ${name}`,
    );
  };

  return (
    <div className="flex items-center gap-1 border-b border-border px-1.5 py-1">
      <button
        type="button"
        aria-label="Adicionar trilha de vídeo"
        title="Adicionar trilha de vídeo"
        onClick={() => addTrack("video")}
        className="flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-panel-raised hover:text-foreground"
      >
        <Plus className="size-3" />
        <Film className="size-3" />
      </button>
      <button
        type="button"
        aria-label="Adicionar trilha de áudio"
        title="Adicionar trilha de áudio"
        onClick={() => addTrack("audio")}
        className="flex items-center gap-0.5 rounded-sm px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-panel-raised hover:text-foreground"
      >
        <Plus className="size-3" />
        <Music className="size-3" />
      </button>
      <span className="ml-auto flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Diminuir altura das trilhas"
          title="Diminuir altura das trilhas"
          onClick={() => ui.setTrackHeight((h) => h - 10)}
          className="rounded-sm p-0.5 text-muted-foreground hover:bg-panel-raised hover:text-foreground"
        >
          <ChevronsDownUp className="size-3" />
        </button>
        <button
          type="button"
          aria-label="Aumentar altura das trilhas"
          title="Aumentar altura das trilhas"
          onClick={() => ui.setTrackHeight((h) => h + 10)}
          className="rounded-sm p-0.5 text-muted-foreground hover:bg-panel-raised hover:text-foreground"
        >
          <ChevronsUpDown className="size-3" />
        </button>
      </span>
    </div>
  );
}
