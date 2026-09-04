/**
 * Resolve as palavras que só fazem sentido no contexto: "esse", "aqui",
 * "o segundo", "o último", "essa música". Sem isso a CUT chuta o alvo e mexe
 * no pedaço errado — o treinamento mestre trata isso como pré-requisito.
 *
 * O resultado é uma DICA (hint) determinística que vai junto do contexto para o
 * modelo. Ela nunca substitui a validação: continua sendo o executor que decide.
 */

export interface ReferenceScene {
  /** Clipes da sequência atual, já em ordem de tempo. */
  clips: Array<{ id: string; assetId: string; label: string; startUs: number }>;
  /** Arquivos do projeto (nome lógico, como aparece nas mídias). */
  assets: Array<{ id: string; name: string; kind: string }>;
  /** Seleção atual do usuário. */
  selection: readonly string[];
  /** Onde o cursor de tempo está, em microssegundos. */
  playheadUs: number;
  /** Último arquivo criado/importado pelo assistente, quando houver. */
  lastAssetId?: string | undefined;
}

export interface ReferenceHints {
  /** Clipes que "esse/isso/aqui" provavelmente significa. */
  clipIds: string[];
  /** Arquivo citado pelo nome ou pelo contexto. */
  assetId?: string | undefined;
  /** Momento que "aqui" representa. */
  atUs?: number | undefined;
  /** Explicação curta em português, para o modelo e para o histórico. */
  notes: string[];
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const HERE = /\b(aqui|nesse ponto|neste ponto|nesse momento|agora nesse|no playhead|no cursor)\b/;
const THIS = /\b(esse|essa|este|esta|isso|isto|esse ai|esse a[ií]|o de cima|ele|ela)\b/;
const LAST = /\b(ultimo|ultima|o de agora|que voce fez|que vc fez|recem criado|recente)\b/;
const FIRST = /\b(primeiro|primeira)\b/;
const ORDINALS: Array<[RegExp, number]> = [
  [/\bsegundo|segunda\b/, 2],
  [/\bterceiro|terceira\b/, 3],
  [/\bquarto|quarta\b/, 4],
  [/\bquinto|quinta\b/, 5],
];

/** Nome de arquivo citado no texto, ignorando acentos e extensão. */
export function findAssetByName(
  text: string,
  assets: ReferenceScene["assets"],
): string | undefined {
  const haystack = fold(text);
  let best: { id: string; length: number } | undefined;
  for (const asset of assets) {
    const bare = fold(asset.name)
      .replace(/\.[a-z0-9]{2,4}$/, "")
      .trim();
    if (bare.length < 3) continue;
    if (haystack.includes(bare) && (best === undefined || bare.length > best.length)) {
      best = { id: asset.id, length: bare.length };
    }
  }
  return best?.id;
}

export function resolveReferences(raw: string, scene: ReferenceScene): ReferenceHints {
  const text = fold(raw);
  const hints: ReferenceHints = { clipIds: [], notes: [] };

  const named = findAssetByName(raw, scene.assets);
  if (named) {
    hints.assetId = named;
    const name = scene.assets.find((a) => a.id === named)?.name ?? named;
    hints.notes.push(`O usuário citou o arquivo "${name}".`);
  }

  if (HERE.test(text)) {
    hints.atUs = scene.playheadUs;
    hints.notes.push(`"aqui" = ${scene.playheadUs} microssegundos (posição do cursor).`);
    const under = scene.clips.filter((c) => c.startUs <= scene.playheadUs);
    const last = under[under.length - 1];
    if (last && hints.clipIds.length === 0) hints.clipIds = [last.id];
  }

  const ordinal = ORDINALS.find(([re]) => re.test(text))?.[1];
  if (ordinal !== undefined) {
    const clip = scene.clips[ordinal - 1];
    if (clip) {
      hints.clipIds = [clip.id];
      hints.notes.push(`"o ${ordinal}º" = clipe ${clip.id} (${clip.label}).`);
    }
  } else if (FIRST.test(text) && scene.clips[0]) {
    hints.clipIds = [scene.clips[0].id];
    hints.notes.push(`"o primeiro" = clipe ${scene.clips[0].id}.`);
  } else if (LAST.test(text)) {
    if (scene.lastAssetId && !hints.assetId) {
      hints.assetId = scene.lastAssetId;
      hints.notes.push("“o último” = o arquivo criado agora pelo assistente.");
    }
    const last = scene.clips[scene.clips.length - 1];
    if (last && hints.clipIds.length === 0) {
      hints.clipIds = [last.id];
      hints.notes.push(`“o último” na timeline = clipe ${last.id}.`);
    }
  }

  if (hints.clipIds.length === 0 && scene.selection.length > 0 && THIS.test(text)) {
    hints.clipIds = [...scene.selection];
    hints.notes.push(`"esse/isso" = os ${scene.selection.length} clipes selecionados.`);
  }
  if (hints.clipIds.length === 0 && scene.selection.length > 0) {
    hints.clipIds = [...scene.selection];
  }
  if (hints.assetId === undefined && hints.clipIds.length === 1) {
    const clip = scene.clips.find((c) => c.id === hints.clipIds[0]);
    if (clip) hints.assetId = clip.assetId;
  }
  return hints;
}

/** Texto curto anexado ao contexto do modelo. */
export function hintsToPrompt(hints: ReferenceHints): string {
  if (hints.notes.length === 0 && hints.clipIds.length === 0) return "";
  const lines = [...hints.notes];
  if (hints.clipIds.length > 0) lines.push(`clipIds prováveis: ${hints.clipIds.join(", ")}`);
  if (hints.assetId) lines.push(`assetId provável: ${hints.assetId}`);
  if (hints.atUs !== undefined) lines.push(`atUs: ${hints.atUs}`);
  return `DICAS DE CONTEXTO (resolvidas pelo programa, confie nelas):\n${lines.join("\n")}`;
}
