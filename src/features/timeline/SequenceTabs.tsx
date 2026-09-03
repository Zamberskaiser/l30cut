import { Copy, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useEditor } from "@/core/store/editorStore";
import { newId } from "@/core/store/timelineReducer";

/**
 * Premiere-style sequence tabs: every sequence is an independent timeline
 * inside the same project, and switching is a normal undoable command.
 */
export function SequenceTabs() {
  const editor = useEditor();
  const { project } = editor;

  const create = () => {
    const active = project.sequences.find((s) => s.id === project.activeSequenceId);
    const name = `Sequência ${project.sequences.length + 1}`;
    editor.run(
      [
        {
          type: "createSequence",
          sequenceId: newId("seq"),
          name,
          aspect: active?.aspect ?? "16:9",
          activate: true,
        },
      ],
      `Nova ${name}`,
    );
  };

  const duplicate = (id: string, name: string) =>
    editor.run(
      [
        {
          type: "duplicateSequence",
          sequenceId: id,
          newSequenceId: newId("seq"),
          name: `${name} cópia`,
          activate: true,
        },
      ],
      "Duplicar sequência",
    );

  const rename = (id: string, current: string) => {
    const next = window.prompt("Nome da sequência", current);
    if (!next || next.trim() === current) return;
    editor.run(
      [{ type: "renameSequence", sequenceId: id, name: next.trim().slice(0, 120) }],
      "Renomear sequência",
    );
  };

  const remove = (id: string) => {
    if (project.sequences.length <= 1) {
      toast.info("O projeto precisa de pelo menos uma sequência");
      return;
    }
    editor.run([{ type: "deleteSequence", sequenceId: id }], "Remover sequência");
  };

  return (
    <div
      role="tablist"
      aria-label="Sequências do projeto"
      className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-panel-raised/50 px-2 scrollbar-thin-dark"
    >
      {project.sequences.map((seq) => {
        const active = seq.id === project.activeSequenceId;
        return (
          <div
            key={seq.id}
            className={`group flex h-6 shrink-0 items-center gap-1 rounded-sm border px-2 text-[11px] ${
              active
                ? "border-border-strong bg-panel text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() =>
                active
                  ? rename(seq.id, seq.name)
                  : editor.run(
                      [{ type: "setActiveSequence", sequenceId: seq.id }],
                      `Abrir ${seq.name}`,
                    )
              }
              title={active ? "Clique para renomear" : "Abrir sequência"}
              className="max-w-40 truncate"
            >
              {seq.name}
            </button>
            <button
              type="button"
              aria-label={`Duplicar ${seq.name}`}
              onClick={() => duplicate(seq.id, seq.name)}
              className="opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
            >
              <Copy className="size-3" />
            </button>
            <button
              type="button"
              aria-label={`Fechar ${seq.name}`}
              onClick={() => remove(seq.id)}
              className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        aria-label="Nova sequência"
        onClick={create}
        className="flex h-6 items-center gap-1 rounded-sm px-1.5 text-[11px] text-muted-foreground hover:bg-panel hover:text-foreground"
      >
        <Plus className="size-3" /> Sequência
      </button>
    </div>
  );
}
