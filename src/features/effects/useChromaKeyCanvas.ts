import { useEffect, type RefObject } from "react";
import type { ChromaKey } from "@/core/contracts/domain";

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

/**
 * Applies the clip's chroma key to a canvas fed by the monitor's <video>.
 * Pure client-side preview: the export pipeline receives the same parameters
 * and reproduces them with ffmpeg's colorkey filter.
 */
export function useChromaKeyCanvas(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  chroma: ChromaKey | undefined,
  playing: boolean,
): void {
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!chroma || !video || !canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const [kr, kg, kb] = hexToRgb(chroma.colorHex);
    const similarity = chroma.similarity * 442; // max RGB distance
    const smoothness = Math.max(1, chroma.smoothness * 442);
    let raf = 0;
    let stopped = false;

    const draw = () => {
      if (stopped) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w > 0 && h > 0) {
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(video, 0, 0, w, h);
        const frame = ctx.getImageData(0, 0, w, h);
        const px = frame.data;
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i]!;
          const g = px[i + 1]!;
          const b = px[i + 2]!;
          const dist = Math.sqrt((r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2);
          if (dist < similarity) {
            px[i + 3] = 0;
          } else if (dist < similarity + smoothness) {
            px[i + 3] = Math.round(255 * ((dist - similarity) / smoothness));
          }
          // Spill suppression: pull green back towards the red/blue average.
          if (chroma.spill > 0 && g > r && g > b) {
            const avg = (r + b) / 2;
            px[i + 1] = Math.round(g + (avg - g) * chroma.spill);
          }
        }
        ctx.putImageData(frame, 0, 0);
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [videoRef, canvasRef, chroma, playing]);
}
