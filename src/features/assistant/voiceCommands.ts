/**
 * Três falas precisam de resposta imediata, sem passar pelo modelo:
 * "pare de falar", "cancele" e "desfaça". O treinamento mestre separa esses
 * comandos justamente porque esperar a IA responder deixa o programa surdo.
 */

export type QuickCommand = "stopSpeaking" | "cancel" | "undo" | "redo";

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function parseQuickCommand(raw: string): QuickCommand | null {
  const text = fold(raw).replace(/[.!?]+$/, "");
  if (/^(pare de falar|para de falar|silencio|fica quieto|cala a boca)$/.test(text)) {
    return "stopSpeaking";
  }
  if (
    /^(cancela|cancele|cancelar|para|pare|parar|cancele? (a )?(exportacao|o pedido|tudo))$/.test(
      text,
    )
  ) {
    return "cancel";
  }
  if (/^(desfaz|desfaca|desfazer|volta|voltar|volta atras|ctrl\s*z)$/.test(text)) return "undo";
  if (/^(refaz|refaca|refazer|de novo isso|ctrl\s*y)$/.test(text)) return "redo";
  return null;
}
