/**
 * The assistant is the single entry point: the user just says what they want and
 * this router decides which path to take — create a video, generate a picture,
 * transcribe speech, look something up on the internet, or edit the timeline.
 *
 * It is deliberately deterministic (and testable) so the choice never depends on
 * the model being installed; the local LLM is still used *inside* each path.
 *
 * People type fast and misspell ("cria uma iagem"), so the words are matched
 * with a one-character tolerance instead of a strict dictionary.
 */

export type ChatIntentKind = "video" | "image" | "audio" | "search" | "transcribe" | "edit";

export interface ChatIntent {
  kind: ChatIntentKind;
  /** What to create / search for, with the command words stripped. */
  subject: string;
  /** Scene count asked for, when the user said one ("6 cenas"). */
  sceneCount?: number | undefined;
  /** Exact words the user wants spoken, when they dictated them. */
  spoken?: string | undefined;
}

const STRIP =
  /\b(por favor|pra mim|para mim|no programa|agora|voc[êe]|pode|consegue|quero que|quero|preciso)\b/gi;

function clean(text: string): string {
  return text.replace(STRIP, " ").replace(/\s+/g, " ").trim();
}

/** Drops accents so "vídeo" and "video" are the same word. */
function fold(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokens(text: string): string[] {
  return fold(text)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** True when the two words differ by at most one typo (insert/remove/swap). */
function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let slips = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    slips += 1;
    if (slips > 1) return false;
    if (a.length === b.length) {
      i += 1;
      j += 1;
    } else if (a.length > b.length) i += 1;
    else j += 1;
  }
  return slips + (a.length - i) + (b.length - j) <= 1;
}

/** Index of the first token that matches one of the words (typos allowed). */
function findWord(list: string[], words: string[]): number {
  return list.findIndex((token) =>
    // Only longer words are matched loosely; short ones must be exact so a
    // typo tolerance never turns "partes" into "arte".
    words.some((word) => (word.length >= 6 ? nearlyEqual(token, word) : token === word)),
  );
}

function has(list: string[], words: string[]): boolean {
  return findWord(list, words) >= 0;
}

const VIDEO_WORDS = ["video", "videos", "reel", "reels", "short", "shorts", "filme", "clipe"];
const IMAGE_WORDS = [
  "imagem",
  "imagens",
  "foto",
  "fotos",
  "ilustracao",
  "arte",
  "thumbnail",
  "capa",
  "cartaz",
  "desenho",
];
const MAKE_WORDS = [
  "cria",
  "crie",
  "criar",
  "gera",
  "gere",
  "gerar",
  "faca",
  "faz",
  "fazer",
  "monta",
  "monte",
  "montar",
  "produza",
  "produzir",
  "desenha",
  "desenhe",
  "desenhar",
];
const AUDIO_WORDS = [
  "audio",
  "narracao",
  "narração",
  "voz",
  "locucao",
  "fala",
  "podcast",
  "vinheta",
];
const SEARCH_WORDS = [
  "pesquisa",
  "pesquise",
  "pesquisar",
  "busca",
  "buscar",
  "busque",
  "procura",
  "procure",
  "procurar",
  "internet",
  "web",
  "google",
  "noticias",
  "referencia",
  "referencias",
];
// "legendas" stays out on purpose: generating captions from an existing
// transcript is a timeline edit, not a new transcription job.
const TRANSCRIBE_WORDS = ["transcreva", "transcrever", "transcreve", "transcrita"];
/** Caption work happens on the timeline, so it must not look like a new job. */
const CAPTION_WORDS = ["legenda", "legendas", "subtitle", "subtitles"];

/** Removes the leading command ("crie um vídeo sobre …" → "…"). */
function subjectOf(text: string): string {
  const words = text.trim().split(/\s+/);
  const list = tokens(text);
  const nounAt = Math.max(
    findWord(list, VIDEO_WORDS),
    findWord(list, IMAGE_WORDS),
    findWord(list, AUDIO_WORDS),
  );
  const rest = nounAt >= 0 ? words.slice(nounAt + 1).join(" ") : text;
  return clean((rest || text).replace(/^(sobre|de|com|para|falando sobre|do|da)\s+/i, ""));
}

/** Reads "6 cenas" / "com 5 partes" out of the request. */
export function parseSceneCount(text: string): number | undefined {
  const match = /(\d{1,2})\s*(cenas?|partes?|blocos?|trechos?)/i.exec(text);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(12, Math.max(1, value));
}

/** Pulls the literal sentence out of «dizendo …», «falando …» or quotes. */
export function parseSpokenText(text: string): string | undefined {
  const quoted = /["“'”]([^"“'”]{3,})["“'”]/.exec(text);
  if (quoted?.[1]) return quoted[1].trim();
  const said = /\b(?:dizendo|falando|fale|diga|leia|lendo|narre|narrando)\b[:,]?\s+(.{3,})$/i.exec(
    text.trim(),
  );
  if (said?.[1]) return said[1].replace(/^que\s+/i, "").trim();
  return undefined;
}

export function detectChatIntent(raw: string): ChatIntent {
  const text = raw.trim();
  const list = tokens(text);
  const subject = subjectOf(text);
  const make = has(list, MAKE_WORDS);
  const search = has(list, SEARCH_WORDS);
  if (has(list, TRANSCRIBE_WORDS) && !has(list, CAPTION_WORDS)) {
    return { kind: "transcribe", subject };
  }
  if (search && !make) return { kind: "search", subject: clean(text) };
  if (make && has(list, VIDEO_WORDS)) {
    return { kind: "video", subject, sceneCount: parseSceneCount(text) };
  }
  if (make && has(list, IMAGE_WORDS)) return { kind: "image", subject };
  if (make && has(list, AUDIO_WORDS)) {
    return { kind: "audio", subject, spoken: parseSpokenText(text) };
  }
  if (search) return { kind: "search", subject: clean(text) };
  return { kind: "edit", subject };
}
