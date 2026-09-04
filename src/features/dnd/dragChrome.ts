/**
 * Aparência única para arrastar qualquer coisa no programa.
 *
 * O navegador desenha, por padrão, um "fantasma" borrado da linha inteira, o
 * que fica feio e atrapalha a mira. Aqui montamos uma etiqueta pequena e nítida
 * com o nome do item, usada em todos os lugares (mídias, pastas, timeline).
 */

export type DragKind = "video" | "audio" | "image" | "folder" | "clip";

const ICON: Record<DragKind, string> = {
  video: "▶",
  audio: "♪",
  image: "▣",
  folder: "▤",
  clip: "▮",
};

/** Cria a etiqueta arrastada e agenda a limpeza dela. */
export function setDragChip(
  event: React.DragEvent,
  label: string,
  kind: DragKind,
  count = 1,
): void {
  if (typeof document === "undefined") return;
  const chip = document.createElement("div");
  chip.setAttribute("data-drag-chip", "true");
  chip.textContent = `${ICON[kind]}  ${label}${count > 1 ? `  +${count - 1}` : ""}`;
  chip.style.cssText = [
    "position:fixed",
    "top:-1000px",
    "left:-1000px",
    "padding:6px 10px",
    "border-radius:8px",
    "font:600 12px/1.2 var(--font-sans, system-ui)",
    "letter-spacing:.01em",
    "color:var(--color-foreground, #fff)",
    "background:color-mix(in oklab, var(--color-panel, #1b1b1f) 88%, transparent)",
    "border:1px solid var(--color-accent, #e08c2a)",
    "box-shadow:0 10px 24px rgb(0 0 0 / 45%)",
    "white-space:nowrap",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(chip);
  event.dataTransfer.setDragImage(chip, 14, 16);
  window.setTimeout(() => chip.remove(), 0);
}

/** Marca a origem enquanto ela está sendo arrastada (fica translúcida). */
export const DRAG_SOURCE_CLASS = "dnd-source";

/** Classe da área que aceita o item, animada quando o cursor está sobre ela. */
export function dropZoneClass(active: boolean): string {
  return active ? "dnd-zone-active" : "";
}
