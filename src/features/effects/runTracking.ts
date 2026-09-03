import type { TrackPoint } from "@/core/contracts/domain";
import { cropTemplate, matchTemplate, toGray, type GrayFrame } from "./tracker";

export interface TrackingRequest {
  /** Media URL (blob/demo/file) of the clip's asset. */
  src: string;
  /** Source-space window to analyse, in microseconds. */
  sourceInUs: number;
  sourceOutUs: number;
  /** Timeline duration of the clip (points are clip-relative). */
  clipDurationUs: number;
  /** Initial box, normalized 0..1. */
  box: { x: number; y: number; w: number; h: number };
  /** Sampling interval in microseconds (default ~5 fps). */
  stepUs?: number;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
}

const ANALYSIS_WIDTH = 320;

function seek(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("falha ao ler o vídeo"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = seconds;
  });
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = src;
    const onReady = () => {
      video.removeEventListener("loadeddata", onReady);
      resolve(video);
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", () => reject(new Error("não foi possível carregar a mídia")));
  });
}

/**
 * Runs the tracker over a clip's source range in the browser and returns
 * clip-relative keyframes. Frames are sampled through a canvas, so it only
 * needs a decodable media URL — no native dependency.
 */
export async function runTracking(req: TrackingRequest): Promise<TrackPoint[]> {
  const stepUs = req.stepUs ?? 200_000;
  const video = await loadVideo(req.src);
  const ratio = video.videoHeight > 0 ? video.videoHeight / video.videoWidth : 9 / 16;
  const width = ANALYSIS_WIDTH;
  const height = Math.max(2, Math.round(width * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas indisponível");

  const grab = (): GrayFrame => {
    ctx.drawImage(video, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    return toGray(data, width, height);
  };

  const boxPx = {
    x: req.box.x * width,
    y: req.box.y * height,
    w: Math.max(8, req.box.w * width),
    h: Math.max(8, req.box.h * height),
  };

  await seek(video, req.sourceInUs / 1_000_000);
  let template = cropTemplate(grab(), boxPx);
  let cursor = { x: boxPx.x, y: boxPx.y };

  const points: TrackPoint[] = [];
  const span = Math.max(1, req.sourceOutUs - req.sourceInUs);
  const timelineScale = req.clipDurationUs / span;

  for (let offset = 0; offset <= span; offset += stepUs) {
    if (req.signal?.aborted) break;
    await seek(video, (req.sourceInUs + offset) / 1_000_000);
    const frame = grab();
    const found = matchTemplate(frame, template, cursor.x, cursor.y, 28, 2);
    cursor = { x: found.x, y: found.y };
    // Refresh the template when the match is confident: handles slow changes.
    if (found.score > 0.9) template = cropTemplate(frame, { ...boxPx, x: found.x, y: found.y });
    points.push({
      atUs: Math.min(req.clipDurationUs, Math.round(offset * timelineScale)),
      x: Math.min(1, Math.max(0, found.x / width)),
      y: Math.min(1, Math.max(0, found.y / height)),
      w: Math.min(1, boxPx.w / width),
      h: Math.min(1, boxPx.h / height),
    });
    req.onProgress?.(Math.min(1, offset / span));
  }

  video.src = "";
  req.onProgress?.(1);
  return points;
}
