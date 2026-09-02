/** Editor tools. Original iconography lives in src/features/timeline/icons.tsx. */
export type ToolId =
  | "selection"
  | "trackSelect"
  | "rippleEdit"
  | "rollingEdit"
  | "rateStretch"
  | "razor"
  | "slip"
  | "slide"
  | "pen"
  | "hand"
  | "zoom"
  | "text";

export interface ToolMeta {
  id: ToolId;
  label: string;
  description: string;
  /** Visible in the simplified "Essencial" mode. */
  essential: boolean;
  /** Command id that activates it (for tooltip shortcut lookup). */
  commandId: string;
}

export const TOOLS: ToolMeta[] = [
  {
    id: "selection",
    label: "Seleção",
    description: "Selecionar, mover e aparar clips",
    essential: true,
    commandId: "tool.selection",
  },
  {
    id: "trackSelect",
    label: "Selecionar trilha",
    description: "Seleciona todos os clips à frente na trilha",
    essential: false,
    commandId: "tool.trackSelectForward",
  },
  {
    id: "rippleEdit",
    label: "Ripple Edit",
    description: "Apara a borda fechando/abrindo espaço",
    essential: false,
    commandId: "tool.rippleEdit",
  },
  {
    id: "rollingEdit",
    label: "Rolling Edit",
    description: "Move a fronteira entre dois clips adjacentes",
    essential: false,
    commandId: "tool.rollingEdit",
  },
  {
    id: "rateStretch",
    label: "Rate Stretch",
    description: "Altera a duração mudando a velocidade",
    essential: false,
    commandId: "tool.rateStretch",
  },
  {
    id: "razor",
    label: "Razor",
    description: "Corta o clip no ponto clicado",
    essential: true,
    commandId: "tool.razor",
  },
  {
    id: "slip",
    label: "Slip",
    description: "Desloca o conteúdo mantendo posição e duração",
    essential: false,
    commandId: "tool.slip",
  },
  {
    id: "slide",
    label: "Slide",
    description: "Move o clip ajustando os vizinhos",
    essential: false,
    commandId: "tool.slide",
  },
  {
    id: "pen",
    label: "Pen",
    description: "Keyframes de ganho no áudio",
    essential: false,
    commandId: "tool.pen",
  },
  {
    id: "hand",
    label: "Hand",
    description: "Pan da timeline sem editar",
    essential: true,
    commandId: "tool.hand",
  },
  {
    id: "zoom",
    label: "Zoom",
    description: "Clique aproxima, Alt+clique afasta",
    essential: true,
    commandId: "tool.zoom",
  },
  {
    id: "text",
    label: "Texto",
    description: "Adiciona legenda no playhead",
    essential: false,
    commandId: "tool.text",
  },
];

export const toolMeta = (id: ToolId): ToolMeta => TOOLS.find((t) => t.id === id)!;
