/**
 * The assistant is the single entry point: the user just says what they want and
 * this router decides which path to take — create a video, generate a picture,
 * transcribe speech, look something up on the internet, or edit the timeline.
 *
 * It is deliberately deterministic (and testable) so the choice never depends on
 * the model being installed; the local LLM is still used *inside* each path.
 */

export type ChatIntentKind = "video" | "image" | "search" | "transcribe" | "edit";

export interface ChatIntent {
  kind: ChatIntentKind;
  /** What to create / search for, with the command words stripped. */
  subject: string;
  /** Scene count asked for, when the user said one ("6 cenas"). */
  sceneCount?: number | undefined;
}

const STRIP =
  /\b(por favor|pra mim|para mim|no programa|agora|voc[êe]|pode|consegue|quero que|quero|preciso)\b/gi;

function clean(text: string): string {
  return text.replace(STRIP, " ").replace(/\s+/g, " ").trim();
}

/** Removes the leading command ("crie um vídeo sobre …" → "…"). */
function subjectOf(text: string): string {
  const cut = text.replace(
    /^.*?\b(v[íi]deo|filme|imagem|foto|ilustra[çc][ãa]o|arte|thumbnail|capa)\b\s*/i,
    "",
  );
  return clean((cut || text).replace(/^(sobre|de|com|para|falando sobre|do|da)\s+/i, ""));
}

const VIDEO = /\b(v[íi]deo|reels?|short|filme|clipe)\b/i;
const IMAGE = /\b(imagem|imagens|foto|fotos|ilustra[çc][ãa]o|arte|thumbnail|capa|cartaz)\b/i;
const MAKE = /\b(cri(a|e|ar)|gera?(r|e)?|fa[çz]a?|monta(r|e)?|produza?|desenh(a|e|ar))\b/i;
const SEARCH =
  /\b(pesquis(a|e|ar|ue)|busca|buscar|procur(a|e|ar)|na internet|na web|no google|not[íi]cias|refer[êe]ncias?)\b/i;
const TRANSCRIBE = /\b(transcrev(a|er|e)|transcri[çc][ãa]o|legendas? do|o que (ele|ela) (diz|fala))\b/i;

/** Reads "6 cenas" / "com 5 partes" out of the request. */
export function parseSceneCount(text: string): number | undefined {
  const match = /(\d{1,2})\s*(cenas?|partes?|blocos?|trechos?)/i.exec(text);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(12, Math.max(1, value));
}

export function detectChatIntent(raw: string): ChatIntent {
  const text = raw.trim();
  const subject = subjectOf(text);
  if (TRANSCRIBE.test(text)) return { kind: "transcribe", subject };
  if (SEARCH.test(text) && !MAKE.test(text)) return { kind: "search", subject: clean(text) };
  if (MAKE.test(text) && VIDEO.test(text)) {
    return { kind: "video", subject, sceneCount: parseSceneCount(text) };
  }
  if (MAKE.test(text) && IMAGE.test(text)) return { kind: "image", subject };
  if (SEARCH.test(text)) return { kind: "search", subject: clean(text) };
  return { kind: "edit", subject };
}
