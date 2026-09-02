import { useEffect, useState } from "react";
import type { MediaAsset } from "@/core/contracts/domain";
import { DEFAULT_BUCKETS, loadAssetPeaks, type PeakData } from "@/core/audio/waveform";

/**
 * Peaks for the given assets, resolved after hydration (Web Audio is
 * browser-only). Returns a map keyed by assetId; missing keys simply render no
 * waveform yet.
 */
export function useAssetPeaks(assets: MediaAsset[]): Record<string, PeakData> {
  const [peaks, setPeaks] = useState<Record<string, PeakData>>({});
  const ids = assets.map((a) => a.id).join(",");

  useEffect(() => {
    let alive = true;
    const audible = assets.filter((a) => a.audioChannels > 0);
    void Promise.all(
      audible.map(async (asset) => {
        const data = await loadAssetPeaks(asset, DEFAULT_BUCKETS);
        if (!alive) return;
        setPeaks((prev) => (prev[asset.id] ? prev : { ...prev, [asset.id]: data }));
      }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  return peaks;
}
