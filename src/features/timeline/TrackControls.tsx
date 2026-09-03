import { Film, Music, Plus } from "lucide-react";
import { useActiveSequence, useEditor } from "@/core/store/editorStore";
import { newId } from "@/core/store/timelineReducer";

/** Footer of the track header column: add video/audio tracks, Premiere-style. */
export function TrackControls() {
  const editor = useEditor();
  const sequence = useActiveSequence();

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
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 overflow-hidden border-b border-border px-1 py-1">
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
    </div>
  );
}
