import type { Project, SilenceRange, TranscriptSegment } from "@/core/contracts/domain";
import { SECOND } from "@/core/contracts/domain";

const DEMO_VIDEO_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

const LINES: Array<[number, number, string]> = [
  [0, 5.4, "Bem-vindo ao L30 CUT AI. Este é um projeto de demonstração."],
  [6.6, 12.1, "A ideia central é editar vídeo longo com ajuda de inteligência artificial local."],
  [13.8, 19.2, "Tudo acontece na sua máquina: transcrição, análise de silêncios e cortes."],
  [21.0, 27.4, "A inteligência artificial nunca executa comando livre, ela propõe um plano tipado."],
  [29.2, 35.8, "Você revisa o impacto do plano e aplica como uma única transação reversível."],
  [37.5, 43.0, "Depois basta pedir cortes verticais de trinta a sessenta segundos para Reels."],
  [45.2, 51.6, "Legendas são geradas a partir da mesma transcrição, sem tocar na mídia original."],
  [53.4, 58.9, "E a exportação usa FFmpeg no aplicativo instalado para Windows."],
];

const SILENCES: Array<[number, number]> = [
  [5.4, 6.6],
  [12.1, 13.8],
  [19.2, 21.0],
  [27.4, 29.2],
  [35.8, 37.5],
  [43.0, 45.2],
  [51.6, 53.4],
];

const us = (s: number) => Math.round(s * SECOND);

/**
 * Built lazily (never at module scope) so the Worker runtime is never asked to
 * do work in global scope.
 */
export function createDemoProject(): Project {
  const now = new Date().toISOString();
  const assetId = "asset_demo_talk";
  const transcript: TranscriptSegment[] = LINES.map(([start, end, text], i) => ({
    id: `tr_${i + 1}`,
    assetId,
    startUs: us(start),
    endUs: us(end),
    text,
    speaker: "Host",
    confidence: 0.92,
  }));
  const silences: SilenceRange[] = SILENCES.map(([a, b]) => ({ startUs: us(a), endUs: us(b) }));

  return {
    schemaVersion: 1,
    id: "proj_demo",
    name: "Demo — Podcast Vertical",
    createdAt: now,
    updatedAt: now,
    demo: true,
    assets: [
      {
        id: assetId,
        kind: "video",
        name: "entrevista_demo.mp4",
        path: DEMO_VIDEO_URL,
        durationUs: us(60),
        width: 1280,
        height: 720,
        fpsNum: 30,
        fpsDen: 1,
        audioChannels: 2,
        sizeBytes: 158_000_000,
        proxyReady: true,
        demo: true,
      },
    ],
    sequences: [
      {
        id: "seq_main",
        name: "Master 16:9",
        aspect: "16:9",
        fpsNum: 30,
        fpsDen: 1,
        tracks: [
          { id: "v1", kind: "video", name: "V1", muted: false, locked: false },
          { id: "a1", kind: "audio", name: "A1", muted: false, locked: false },
          { id: "c1", kind: "caption", name: "Legendas", muted: false, locked: false },
        ],
        clips: [
          {
            id: "clip_main",
            trackId: "v1",
            assetId,
            label: "entrevista_demo",
            startUs: 0,
            sourceInUs: 0,
            sourceOutUs: us(60),
            gainDb: 0,
            enabled: true,
          },
        ],
        captions: [],
        markers: [
          { id: "mk_1", atUs: us(21), label: "Bloco IA", color: "accent" },
          { id: "mk_2", atUs: us(45), label: "Legendas", color: "accent" },
        ],
      },
    ],
    activeSequenceId: "seq_main",
    transcript,
    analysis: { silences: { [assetId]: silences }, transcribedAssetIds: [assetId] },
  };
}

export function createEmptyProject(name: string): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: `proj_${Date.now().toString(36)}`,
    name,
    createdAt: now,
    updatedAt: now,
    demo: false,
    assets: [],
    sequences: [
      {
        id: "seq_main",
        name: "Sequência 1",
        aspect: "16:9",
        fpsNum: 30,
        fpsDen: 1,
        tracks: [
          { id: "v1", kind: "video", name: "V1", muted: false, locked: false },
          { id: "a1", kind: "audio", name: "A1", muted: false, locked: false },
          { id: "c1", kind: "caption", name: "Legendas", muted: false, locked: false },
        ],
        clips: [],
        captions: [],
        markers: [],
      },
    ],
    activeSequenceId: "seq_main",
    transcript: [],
    analysis: { silences: {}, transcribedAssetIds: [] },
  };
}
