import type { AiEditPlan, PlanOperation, PlanScope } from "@/core/contracts/aiPlan";
import { parseAiEditPlan } from "@/core/contracts/aiPlan";
import {
  activeSequence,
  clipDuration,
  SECOND,
  sequenceDuration,
  type Project,
} from "@/core/contracts/domain";
import { buildSilenceCutPlan } from "@/features/timeline/silence";

export interface PlannerInput {
  prompt: string;
  project: Project;
  scope: PlanScope;
  defaults: { minSilenceUs: number; paddingUs: number; clipMinUs: number; clipMaxUs: number };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function planId() {
  return `plan_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function readMs(prompt: string, fallback: number): number {
  const ms = /(\d{2,5})\s*(ms|milissegundos)/.exec(norm(prompt));
  if (ms) return Number(ms[1]) * 1000;
  const sec = /(\d+(?:[.,]\d+)?)\s*(s|seg|segundos)/.exec(norm(prompt));
  if (sec?.[1]) return Math.round(Number(sec[1].replace(",", ".")) * SECOND);
  return fallback;
}

/**
 * Rule-based planner used when no LLM is configured (and as a safety net).
 * It produces the exact same AiEditPlan contract a model would have to produce.
 */
export function planDeterministically(input: PlannerInput): AiEditPlan | null {
  const p = norm(input.prompt);
  const seq = activeSequence(input.project);

  const matchAsset = () => {
    const candidates = input.project.assets
      .map((a) => ({ asset: a, needle: norm(a.name.replace(/\.[a-z0-9]{2,4}$/i, "")) }))
      .filter((c) => c.needle.length >= 3 && p.includes(c.needle))
      .sort((a, b) => b.needle.length - a.needle.length);
    return candidates[0]?.asset;
  };

  // "aumenta/diminui o volume do <arquivo>" — direct gain edit on imported media.
  if (/(volume|audio|som|ganho)/.test(p) && /(aument|sub|diminu|abaix|baix|mud|silenc)/.test(p)) {
    const asset = matchAsset();
    const dbMatch = /(-?\d+(?:[.,]\d+)?)\s*(db)?/.exec(p.replace(/\d+\s*(ms|s|seg)/g, ""));
    const magnitude = dbMatch?.[1] ? Math.abs(Number(dbMatch[1].replace(",", "."))) : 3;
    const mute = /(mud|silenc)/.test(p);
    const down = /(diminu|abaix|baix)/.test(p);
    const targetClips = asset
      ? seq.clips.filter((c) => c.assetId === asset.id)
      : input.scope.clipIds.length > 0
        ? seq.clips.filter((c) => input.scope.clipIds.includes(c.id))
        : seq.clips;
    if (targetClips.length === 0) return null;
    const label = asset ? `“${asset.name}”` : "os clipes selecionados";
    const operations: PlanOperation[] = mute
      ? targetClips.map((c) => ({ op: "setGain" as const, clipId: c.id, gainDb: -60 }))
      : targetClips.map((c) => ({
          op: "adjustGain" as const,
          clipId: c.id,
          deltaDb: down ? -magnitude : magnitude,
        }));
    return finalize({
      intent: mute ? "mute-audio" : "adjust-gain",
      summary: mute
        ? `Silenciar o áudio de ${label}.`
        : `${down ? "Diminuir" : "Aumentar"} ${magnitude} dB o áudio de ${label}.`,
      scope: input.scope,
      operations,
      warnings: [],
      impact: {
        clipsAdded: 0,
        clipsRemoved: 0,
        clipsModified: targetClips.length,
        durationDeltaUs: 0,
        sequencesCreated: 0,
        captionsAdded: 0,
      },
      requiresConfirmation: false,
      confidence: 0.9,
      rationale: "Ajuste de ganho determinístico nos clipes do arquivo indicado.",
    });
  }

  // "renomeia o <arquivo> para <novo nome>"
  const renameMatch = /(?:renomei\w*|renomear|muda\w*\s+o?\s*nome\w*|chama\w*)[^]*?\b(?:para|como|de)\s+(.{2,80})$/i.exec(
    input.prompt.trim(),
  );
  if (renameMatch) {
    const asset = matchAsset();
    const name = (renameMatch[1] ?? "").replace(/["'.]+$/g, "").trim();
    if (asset && name.length >= 2) {
      return finalize({
        intent: "rename-asset",
        summary: `Renomear “${asset.name}” para “${name}”.`,
        scope: input.scope,
        operations: [{ op: "renameAsset", assetId: asset.id, name: name.slice(0, 120) }],
        warnings: ["O arquivo no disco não muda de nome, apenas o nome usado no programa."],
        impact: {
          clipsAdded: 0,
          clipsRemoved: 0,
          clipsModified: 0,
          durationDeltaUs: 0,
          sequencesCreated: 0,
          captionsAdded: 0,
        },
        requiresConfirmation: false,
        confidence: 0.85,
        rationale: "Renomeação de mídia sem efeito no disco.",
      });
    }
  }

  if (/(silenci|pausa)/.test(p)) {
    const minSilenceUs = Math.max(100_000, readMs(input.prompt, input.defaults.minSilenceUs));
    const ops: PlanOperation[] = [
      { op: "removeSilences", minSilenceUs, paddingUs: input.defaults.paddingUs, ripple: true },
    ];
    const preview = buildSilenceCutPlan(
      seq,
      input.project.analysis.silences,
      { minSilenceUs, paddingUs: input.defaults.paddingUs },
      input.scope.kind === "selection" ? input.scope.clipIds : undefined,
    );
    return finalize({
      intent: "remove-silences",
      summary: `Remover ${Math.round(preview.removedUs / 1000)} ms de silêncio acima de ${Math.round(
        minSilenceUs / 1000,
      )} ms, com ripple na trilha.`,
      scope: input.scope,
      operations: ops,
      warnings:
        preview.commands.length === 0
          ? ["Nenhum silêncio detectado com esse limite. Rode a análise de silêncio primeiro."]
          : [],
      impact: {
        clipsAdded: preview.commands.filter((c) => c.type === "insertClip").length,
        clipsRemoved: preview.commands.filter((c) => c.type === "deleteClip").length,
        clipsModified: preview.commands.filter((c) => c.type === "trimClip").length,
        durationDeltaUs: -preview.removedUs,
        sequencesCreated: 0,
        captionsAdded: 0,
      },
      requiresConfirmation: preview.removedUs > 5 * SECOND,
      confidence: 0.95,
      rationale: "Regra determinística sobre as faixas de silêncio detectadas localmente.",
    });
  }

  if (/(reels|shorts|corte|clipes|cortes|vertical)/.test(p)) {
    const countMatch = /(\d+)\s*(cortes|clipes|videos|reels|shorts)/.exec(p);
    const count = Math.min(12, Math.max(1, Number(countMatch?.[1] ?? 6)));
    const wantsVertical = /(9:16|vertical|reels|shorts)/.test(p);
    const asset = input.project.assets[0];
    if (!asset) return null;
    const ranges = pickTranscriptRanges(input.project, count, input.defaults);
    if (ranges.length === 0) return null;
    const ops: PlanOperation[] = [];
    if (wantsVertical) ops.push({ op: "setAspect", aspect: "9:16" });
    ops.push({
      op: "createClipsFromRanges",
      assetId: asset.id,
      ranges,
      newSequencePerRange: false,
      aspect: wantsVertical ? "9:16" : undefined,
    });
    const total = ranges.reduce((s, r) => s + (r.endUs - r.startUs), 0);
    return finalize({
      intent: "create-short-cuts",
      summary: `Criar ${ranges.length} cortes de ${Math.round(
        input.defaults.clipMinUs / SECOND,
      )}–${Math.round(input.defaults.clipMaxUs / SECOND)}s a partir da transcrição${
        wantsVertical ? " e converter a sequência para 9:16" : ""
      }.`,
      scope: input.scope,
      operations: ops,
      warnings:
        ranges.length < count ? [`Só foi possível montar ${ranges.length} cortes coerentes.`] : [],
      impact: {
        clipsAdded: ranges.length,
        clipsRemoved: 0,
        clipsModified: wantsVertical ? seq.clips.length : 0,
        durationDeltaUs: total,
        sequencesCreated: 0,
        captionsAdded: 0,
      },
      requiresConfirmation: true,
      confidence: 0.72,
      rationale: "Agrupamento de segmentos falados contíguos dentro da janela de duração alvo.",
    });
  }

  if (/(legenda|caption|subtitle)/.test(p)) {
    const segments = input.project.transcript
      .slice(0, 2000)
      .map((t) => ({ startUs: t.startUs, endUs: t.endUs, text: t.text.slice(0, 400) }));
    if (segments.length === 0) return null;
    return finalize({
      intent: "add-captions",
      summary: `Gerar ${segments.length} legendas na trilha de legenda a partir da transcrição local.`,
      scope: input.scope,
      operations: [{ op: "addCaptions", segments }],
      warnings: [],
      impact: {
        clipsAdded: 0,
        clipsRemoved: 0,
        clipsModified: 0,
        durationDeltaUs: 0,
        sequencesCreated: 0,
        captionsAdded: segments.length,
      },
      requiresConfirmation: false,
      confidence: 0.9,
      rationale: "Mapeamento 1:1 dos segmentos de transcrição para legendas.",
    });
  }

  const topic = /(sobre|falas sobre|apenas)\s+(.{3,60})/.exec(input.prompt);
  if (topic) {
    const query = (topic[2] ?? "").replace(/["'.]/g, "").trim();
    return finalize({
      intent: "keep-topic",
      summary: `Manter apenas as falas relacionadas a “${query}”.`,
      scope: { ...input.scope, kind: "transcript" },
      operations: [{ op: "keepTranscriptTopic", query, minDurationUs: 1_500_000 }],
      warnings: ["Seleção por palavra-chave. Revise os trechos antes de aplicar."],
      impact: {
        clipsAdded: 0,
        clipsRemoved: 0,
        clipsModified: seq.clips.length,
        durationDeltaUs: -Math.round(sequenceDuration(seq) * 0.4),
        sequencesCreated: 0,
        captionsAdded: 0,
      },
      requiresConfirmation: true,
      confidence: 0.55,
      rationale: "Busca textual determinística na transcrição.",
    });
  }

  if (/(duplic)/.test(p) && seq.clips.length > 0) {
    const clip = input.scope.clipIds[0]
      ? (seq.clips.find((c) => c.id === input.scope.clipIds[0]) ?? seq.clips[0])
      : seq.clips[0];
    if (!clip) return null;
    return finalize({
      intent: "duplicate-clip",
      summary: `Duplicar “${clip.label || clip.id}” e mover a cópia para o início da sequência.`,
      scope: input.scope,
      operations: [
        { op: "duplicate", clipId: clip.id, toStartUs: 0 },
        { op: "move", clipId: clip.id, toStartUs: clipDuration(clip) },
      ],
      warnings: [],
      impact: {
        clipsAdded: 1,
        clipsRemoved: 0,
        clipsModified: 1,
        durationDeltaUs: clipDuration(clip),
        sequencesCreated: 0,
        captionsAdded: 0,
      },
      requiresConfirmation: false,
      confidence: 0.88,
      rationale: "Comando direto de duplicação com reposicionamento.",
    });
  }

  if (/(9:16|1:1|4:5|16:9)/.test(p)) {
    const aspect = (/(9:16|1:1|4:5|16:9)/.exec(p)![1] ?? "9:16") as "9:16";
    return finalize({
      intent: "set-aspect",
      summary: `Converter a sequência atual para ${aspect}.`,
      scope: input.scope,
      operations: [{ op: "setAspect", aspect }],
      warnings: [],
      impact: {
        clipsAdded: 0,
        clipsRemoved: 0,
        clipsModified: seq.clips.length,
        durationDeltaUs: 0,
        sequencesCreated: 0,
        captionsAdded: 0,
      },
      requiresConfirmation: false,
      confidence: 0.97,
      rationale: "Alteração de formato da sequência, não destrutiva.",
    });
  }

  return null;
}

function pickTranscriptRanges(
  project: Project,
  count: number,
  defaults: PlannerInput["defaults"],
): Array<{ startUs: number; endUs: number; label: string }> {
  const segments = project.transcript.slice().sort((a, b) => a.startUs - b.startUs);
  const ranges: Array<{ startUs: number; endUs: number; label: string }> = [];
  let i = 0;
  while (i < segments.length && ranges.length < count) {
    const head = segments[i]!;
    const start = head.startUs;
    let end = head.endUs;
    let words = head.text;
    let j = i + 1;
    while (j < segments.length && end - start < defaults.clipMinUs) {
      const next = segments[j]!;
      end = next.endUs;
      words += ` ${next.text}`;
      j += 1;
    }
    if (end - start > defaults.clipMaxUs) end = start + defaults.clipMaxUs;
    if (end - start >= Math.min(defaults.clipMinUs, 8 * SECOND)) {
      ranges.push({ startUs: start, endUs: end, label: words.slice(0, 48) });
    }
    i = Math.max(j, i + 1);
  }
  return ranges;
}

function finalize(args: {
  intent: string;
  summary: string;
  scope: PlanScope;
  operations: PlanOperation[];
  warnings: string[];
  impact: AiEditPlan["estimatedImpact"];
  requiresConfirmation: boolean;
  confidence: number;
  rationale: string;
}): AiEditPlan {
  const candidate = {
    id: planId(),
    intent: args.intent,
    summary: args.summary,
    scope: args.scope,
    operations: args.operations,
    warnings: args.warnings,
    estimatedImpact: args.impact,
    requiresConfirmation: args.requiresConfirmation,
    confidence: args.confidence,
    rationale: args.rationale,
    modelInfo: { provider: "deterministic" as const, model: "rules-v1" },
  };
  const parsed = parseAiEditPlan(candidate);
  if (!parsed.ok) throw new Error(`Planner gerou plano inválido: ${parsed.errors.join("; ")}`);
  return parsed.plan;
}
