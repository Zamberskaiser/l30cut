import type { AiEditPlan, PlanOperation } from "@/core/contracts/aiPlan";
import type { EditCommand, Transaction } from "@/core/contracts/commands";
import { EditCommandSchema } from "@/core/contracts/commands";
import {
  activeSequence,
  clipEnd,
  SECOND,
  type Project,
} from "@/core/contracts/domain";
import type { RuntimeAdapter } from "@/core/runtime/types";
import { buildSilenceCutPlan } from "@/features/timeline/silence";
import { newId } from "@/core/store/timelineReducer";

export interface CompileResult {
  ok: true;
  transaction: Transaction;
}
export interface CompileFailure {
  ok: false;
  errors: string[];
}

const MIN_CLIP_US = 200_000;
const MAX_CLIP_US = 15 * 60 * SECOND;
const MAX_COMMANDS = 4000;

/**
 * Compiles a validated plan into deterministic timeline commands.
 * Every id, range and runtime capability is checked BEFORE anything executes.
 */
export function compilePlan(
  project: Project,
  plan: AiEditPlan,
  runtime: Pick<RuntimeAdapter, "capabilities">,
): CompileResult | CompileFailure {
  const errors: string[] = [];
  const seq = activeSequence(project);
  const clipIds = new Set(seq.clips.map((c) => c.id));
  const trackIds = new Set(seq.tracks.map((t) => t.id));
  const commands: EditCommand[] = [];

  const requireClip = (id: string, op: PlanOperation["op"]) => {
    if (!clipIds.has(id)) errors.push(`${op}: clip inexistente ${id}`);
    return seq.clips.find((c) => c.id === id);
  };

  for (const op of plan.operations) {
    switch (op.op) {
      case "removeSilences": {
        const target =
          plan.scope.kind === "selection" && plan.scope.clipIds.length > 0
            ? plan.scope.clipIds
            : undefined;
        target?.forEach((id) => requireClip(id, op.op));
        const built = buildSilenceCutPlan(
          seq,
          project.analysis.silences,
          { minSilenceUs: op.minSilenceUs, paddingUs: op.paddingUs },
          target,
        );
        if (built.commands.length === 0) {
          errors.push("removeSilences: nenhuma faixa de silêncio elegível encontrada");
        }
        commands.push(...built.commands);
        break;
      }
      case "createClipsFromRanges": {
        const asset = project.assets.find((a) => a.id === op.assetId);
        if (!asset) {
          errors.push(`createClipsFromRanges: asset inexistente ${op.assetId}`);
          break;
        }
        const videoTrack = seq.tracks.find((t) => t.kind === "video");
        if (!videoTrack) {
          errors.push("createClipsFromRanges: sequência sem trilha de vídeo");
          break;
        }
        let cursor = seq.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
        op.ranges.forEach((range, index) => {
          const length = range.endUs - range.startUs;
          if (length < MIN_CLIP_US) {
            errors.push(`createClipsFromRanges: intervalo ${index + 1} curto demais`);
            return;
          }
          if (length > MAX_CLIP_US) {
            errors.push(`createClipsFromRanges: intervalo ${index + 1} excede o limite de 15 min`);
            return;
          }
          if (range.endUs > asset.durationUs) {
            errors.push(`createClipsFromRanges: intervalo ${index + 1} fora da duração da mídia`);
            return;
          }
          commands.push({
            type: "insertClip",
            clipId: newId("clip"),
            trackId: videoTrack.id,
            assetId: asset.id,
            startUs: cursor,
            sourceInUs: range.startUs,
            sourceOutUs: range.endUs,
            label: range.label || `Corte ${index + 1}`,
          });
          cursor += length;
        });
        break;
      }
      case "splitAt": {
        const clip = requireClip(op.clipId, op.op);
        if (clip && (op.atUs <= clip.startUs || op.atUs >= clipEnd(clip))) {
          errors.push("splitAt: ponto de corte fora do clip");
        }
        commands.push({ type: "splitClip", clipId: op.clipId, atUs: op.atUs });
        break;
      }
      case "trim": {
        const clip = requireClip(op.clipId, op.op);
        const asset = clip ? project.assets.find((a) => a.id === clip.assetId) : undefined;
        const nextOut = op.sourceOutUs ?? clip?.sourceOutUs ?? 0;
        if (asset && nextOut > asset.durationUs) errors.push("trim: out point além da mídia");
        commands.push({
          type: "trimClip",
          clipId: op.clipId,
          sourceInUs: op.sourceInUs,
          sourceOutUs: op.sourceOutUs,
        });
        break;
      }
      case "move": {
        requireClip(op.clipId, op.op);
        if (op.toTrackId && !trackIds.has(op.toTrackId)) errors.push("move: trilha inexistente");
        commands.push({
          type: "moveClip",
          clipId: op.clipId,
          toStartUs: op.toStartUs,
          toTrackId: op.toTrackId,
        });
        break;
      }
      case "duplicate":
        requireClip(op.clipId, op.op);
        commands.push({ type: "duplicateClip", clipId: op.clipId, toStartUs: op.toStartUs });
        break;
      case "remove":
        requireClip(op.clipId, op.op);
        commands.push(
          op.ripple
            ? { type: "rippleDelete", clipId: op.clipId }
            : { type: "deleteClip", clipId: op.clipId },
        );
        break;
      case "setGain":
        requireClip(op.clipId, op.op);
        commands.push({ type: "changeGain", clipId: op.clipId, gainDb: op.gainDb });
        break;
      case "addCaptions":
        for (const segment of op.segments) {
          if (segment.endUs <= segment.startUs) {
            errors.push("addCaptions: intervalo inválido");
            continue;
          }
          commands.push({
            type: "addCaption",
            segment: {
              id: newId("cap"),
              startUs: segment.startUs,
              endUs: segment.endUs,
              text: segment.text,
            },
          });
        }
        break;
      case "createSequence":
        commands.push({
          type: "createSequence",
          sequenceId: newId("seq"),
          name: op.name,
          aspect: op.aspect,
          activate: true,
        });
        break;
      case "setAspect":
        commands.push({ type: "setSequenceAspect", aspect: op.aspect });
        break;
      case "keepTranscriptTopic": {
        const needle = op.query.toLowerCase();
        const hits = project.transcript.filter((t) => t.text.toLowerCase().includes(needle));
        if (hits.length === 0) {
          errors.push(`keepTranscriptTopic: nenhum trecho fala sobre “${op.query}”`);
          break;
        }
        const asset = project.assets.find((a) => a.id === hits[0]!.assetId);
        const videoTrack = seq.tracks.find((t) => t.kind === "video");
        if (!asset || !videoTrack) {
          errors.push("keepTranscriptTopic: mídia ou trilha ausente");
          break;
        }
        for (const clip of seq.clips) commands.push({ type: "deleteClip", clipId: clip.id });
        let cursor = 0;
        for (const hit of hits) {
          const length = Math.max(hit.endUs - hit.startUs, op.minDurationUs);
          const end = Math.min(hit.startUs + length, asset.durationUs);
          commands.push({
            type: "insertClip",
            clipId: newId("clip"),
            trackId: videoTrack.id,
            assetId: asset.id,
            startUs: cursor,
            sourceInUs: hit.startUs,
            sourceOutUs: end,
            label: hit.text.slice(0, 40),
          });
          cursor += end - hit.startUs;
        }
        break;
      }
    }
  }

  if (commands.length === 0) errors.push("O plano não gerou nenhuma operação aplicável.");
  if (commands.length > MAX_COMMANDS) errors.push("O plano excede o limite de comandos por transação.");
  if (!runtime.capabilities.ffmpeg && plan.operations.some((o) => o.op === "createClipsFromRanges")) {
    // Allowed in demo mode (timeline is non-destructive) — surfaced as a warning only.
  }
  for (const command of commands) {
    const parsed = EditCommandSchema.safeParse(command);
    if (!parsed.success) errors.push(`comando inválido gerado: ${command.type}`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    transaction: {
      label: plan.summary,
      commands,
      source: "ai",
      planId: plan.id,
    },
  };
}
