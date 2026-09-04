import type { PlanScope } from "@/core/contracts/aiPlan";
import type { Project, TrainingProfile } from "@/core/contracts/domain";
import { activeSequence, sequenceDuration } from "@/core/contracts/domain";

/**
 * Deterministic, bounded context builder for AI providers.
 *
 * Guarantees:
 * - Deterministic: same project + scope + profile → byte-identical JSON.
 * - Bounded: hard caps on clips, transcript segments and total characters,
 *   so a long project can never blow up a local model's context window.
 * - Scope-aware: with `selection` scope only the selected clips are exposed;
 *   with `range` scope only transcript inside the in/out range is exposed.
 * - Privacy: asset filesystem paths are never included — only ids/durations.
 */

export const CONTEXT_LIMITS = {
  maxClips: 300,
  maxTranscriptSegments: 200,
  maxTranscriptChars: 12_000,
  maxRules: 20,
  maxAssets: 50,
} as const;

export interface AssistantContext {
  schemaVersion: 1;
  sequence: {
    id: string;
    aspect: string;
    durationUs: number;
    trackIds: string[];
    clips: Array<{
      id: string;
      trackId: string;
      assetId: string;
      assetName: string;
      startUs: number;
      sourceInUs: number;
      sourceOutUs: number;
      gainDb: number;
      label: string;
      selected: boolean;
    }>;
    clipsTruncated: boolean;
  };
  assets: Array<{
    id: string;
    name: string;
    kind: string;
    durationUs: number;
    audioChannels: number;
    usedByClipIds: string[];
  }>;
  transcript: Array<{ assetId: string; startUs: number; endUs: number; text: string }>;
  transcriptTruncated: boolean;
  silences: number;
  scope: PlanScope;
  profile: { rules: string[]; defaults: TrainingProfile["defaults"] };
}

export interface ContextStats {
  clips: number;
  transcriptSegments: number;
  approxChars: number;
}

export function buildAssistantContext(
  project: Project,
  scope: PlanScope,
  profile: TrainingProfile,
  selection: readonly string[],
): { context: AssistantContext; stats: ContextStats } {
  const seq = activeSequence(project);
  const selected = new Set(selection);

  const scopedClips =
    scope.kind === "selection" && scope.clipIds.length > 0
      ? seq.clips.filter((c) => scope.clipIds.includes(c.id))
      : seq.clips;
  const clips = scopedClips
    .slice()
    .sort((a, b) => a.startUs - b.startUs || a.id.localeCompare(b.id))
    .slice(0, CONTEXT_LIMITS.maxClips)
    .map((c) => ({
      id: c.id,
      trackId: c.trackId,
      assetId: c.assetId,
      assetName: (project.assets.find((a) => a.id === c.assetId)?.name ?? "").slice(0, 80),
      startUs: c.startUs,
      sourceInUs: c.sourceInUs,
      sourceOutUs: c.sourceOutUs,
      gainDb: c.gainDb,
      label: c.label.slice(0, 60),
      selected: selected.has(c.id),
    }));

  let transcriptPool = project.transcript;
  if (scope.kind === "range" && scope.inUs !== undefined && scope.outUs !== undefined) {
    const [inUs, outUs] = [scope.inUs, scope.outUs];
    transcriptPool = transcriptPool.filter((t) => t.endUs > inUs && t.startUs < outUs);
  }
  const transcript: AssistantContext["transcript"] = [];
  let chars = 0;
  for (const t of transcriptPool.slice(0, CONTEXT_LIMITS.maxTranscriptSegments)) {
    const text = t.text.slice(0, 400);
    if (chars + text.length > CONTEXT_LIMITS.maxTranscriptChars) break;
    chars += text.length;
    transcript.push({ assetId: t.assetId, startUs: t.startUs, endUs: t.endUs, text });
  }

  const context: AssistantContext = {
    schemaVersion: 1,
    sequence: {
      id: seq.id,
      aspect: seq.aspect,
      durationUs: sequenceDuration(seq),
      trackIds: seq.tracks.map((t) => t.id),
      clips,
      clipsTruncated: scopedClips.length > clips.length,
    },
    assets: project.assets.slice(0, CONTEXT_LIMITS.maxAssets).map((a) => ({
      id: a.id,
      // File NAME only — the filesystem path is never exposed to a model.
      name: a.name.slice(0, 120),
      kind: a.kind,
      durationUs: a.durationUs,
      audioChannels: a.audioChannels,
      usedByClipIds: seq.clips.filter((c) => c.assetId === a.id).map((c) => c.id),
    })),
    transcript,
    transcriptTruncated: transcript.length < transcriptPool.length,
    silences: Object.values(project.analysis.silences).reduce((sum, r) => sum + r.length, 0),
    scope,
    profile: {
      rules: profile.rules.slice(0, CONTEXT_LIMITS.maxRules).map((r) => r.slice(0, 240)),
      defaults: profile.defaults,
    },
  };

  return {
    context,
    stats: {
      clips: clips.length,
      transcriptSegments: transcript.length,
      approxChars: JSON.stringify(context).length,
    },
  };
}
