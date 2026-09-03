import type { EditorCommand } from "@/core/contracts/commands";
import type { MediaAsset, Sequence } from "@/core/contracts/domain";
import { newId } from "@/core/contracts/domain";

/**
 * Premiere-like insertion: a video file that carries audio lands as TWO clips —
 * video on a video track, audio on an audio track — joined in the same A/V link
 * group, so they move/trim together until the user unlinks them.
 */
export function insertAssetCommands(
  asset: MediaAsset,
  sequence: Sequence,
  startUs: number,
  preferredTrackId?: string,
): EditorCommand[] {
  const label = asset.name.replace(/\.[^.]+$/, "");
  const at = Math.max(0, Math.round(startUs));
  const preferred = preferredTrackId
    ? sequence.tracks.find((t) => t.id === preferredTrackId)
    : undefined;

  const wantsAudioOnly = asset.kind === "audio" || preferred?.kind === "audio";
  const videoTrack = wantsAudioOnly
    ? undefined
    : (preferred?.kind === "video" ? preferred : undefined) ??
      sequence.tracks.find((t) => t.kind === "video");
  const audioTrack =
    asset.kind === "image"
      ? undefined
      : wantsAudioOnly
        ? (preferred?.kind === "audio" ? preferred : undefined) ??
          sequence.tracks.find((t) => t.kind === "audio")
        : asset.audioChannels > 0
          ? sequence.tracks.find((t) => t.kind === "audio")
          : undefined;

  const commands: EditorCommand[] = [];
  const clipIds: string[] = [];
  for (const track of [videoTrack, audioTrack]) {
    if (!track) continue;
    const clipId = newId("clip");
    clipIds.push(clipId);
    commands.push({
      type: "insertClip",
      clipId,
      trackId: track.id,
      assetId: asset.id,
      startUs: at,
      sourceInUs: 0,
      sourceOutUs: asset.durationUs,
      label,
    });
  }
  if (clipIds.length === 2) commands.push({ type: "linkClips", clipIds });
  return commands;
}

/** End of the given track's content, used to append instead of overlapping. */
export function trackEndUs(sequence: Sequence, trackId: string): number {
  return sequence.clips
    .filter((c) => c.trackId === trackId)
    .reduce((max, c) => {
      const span = (c.sourceOutUs - c.sourceInUs) / (c.playbackRate ?? 1);
      return Math.max(max, c.startUs + span);
    }, 0);
}
