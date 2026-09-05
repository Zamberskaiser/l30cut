import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ASPECT_RESOLUTIONS, SETUP_PROFILES } from "@/core/runtime/catalog";
import type {
  ComponentStatus,
  CreatorEngines,
  CreatorScene,
  SearchHit,
  SetupProfile,
} from "@/core/runtime/types";
import type { MediaAsset } from "@/core/contracts/domain";
import { useActiveSequence, useEditor } from "@/core/store/editorStore";
import { insertAssetCommands, trackEndUs } from "@/features/media/insertAsset";
import { describeGaps, missingCreatorModules } from "@/features/creator/modules";
import {
  buildScriptPrompt,
  fallbackScenes,
  parseScriptJson,
  totalDurationUs,
} from "@/features/creator/script";
import type { ChatIntent } from "./chatIntents";
import { withCutVoice } from "./cutCore";
import { readableError } from "./errorMessage";

/** Speech-to-text pieces, installed on demand when a transcription is asked for. */
const SPEECH_GAPS = [
  { id: "whisper.cpp" as const, label: "Transcritor de fala" },
  { id: "whisper-model" as const, label: "Modelo de fala" },
];

/** Everything the assistant produces lands in the bin under a dated name. */
function stamp(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`;
}

export interface ActionOutcome {
  /** What to show in the chat thread. */
  text: string;
}

/**
 * The creation side of the assistant: making a video, making a picture,
 * searching the web and turning speech into text — all triggered from the chat
 * and all finishing the same way, with the produced file imported into the
 * project's media so the work never leaves the timeline.
 */
export function useAssistantActions(options: { endpoint: string; model: string }) {
  const { runtime, enqueue, cancelJob, addAsset, run, project } = useEditor();
  const sequence = useActiveSequence();
  const [engines, setEngines] = useState<CreatorEngines | null>(null);
  const [components, setComponents] = useState<ComponentStatus[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  /** Jobs and downloads of the request in flight, so it can be called off. */
  const activeJobs = useRef<string[]>([]);
  const aborter = useRef<AbortController>(new AbortController());

  /** Stops whatever the assistant is doing right now. */
  const cancel = useCallback(() => {
    aborter.current.abort();
    aborter.current = new AbortController();
    for (const id of activeJobs.current) cancelJob(id);
    activeJobs.current = [];
    setBusy(null);
  }, [cancelJob]);

  /** Queues a job and remembers it while it runs, so cancel can reach it. */
  const runJob = useCallback(
    async <T>(spec: Parameters<typeof enqueue<T>>[0]): Promise<T> => {
      const { id, done } = enqueue(spec);
      activeJobs.current = [...activeJobs.current, id];
      try {
        return await done;
      } finally {
        activeJobs.current = activeJobs.current.filter((item) => item !== id);
      }
    },
    [enqueue],
  );

  useEffect(() => {
    if (runtime.listAiEngines) {
      void runtime
        .listAiEngines()
        .then(setEngines)
        .catch(() => setEngines(null));
    }
    void runtime
      .listComponents()
      .then(setComponents)
      .catch(() => setComponents([]));
  }, [runtime]);

  /** Downloads only the modules this particular request needs. */
  const prepare = useCallback(
    async (needs: { narrate: boolean; images: boolean; speech?: boolean }): Promise<boolean> => {
      const gaps = missingCreatorModules(engines, needs, components);
      if (needs.speech) {
        // Speech-to-text needs whisper.cpp plus its model.
        for (const gap of SPEECH_GAPS) {
          const ready = components.find((item) => item.id === gap.id)?.state === "ready";
          if (!ready && !gaps.some((existing) => existing.id === gap.id)) gaps.push(gap);
        }
      }
      if (gaps.length === 0) return true;
      if (!runtime.capabilities.componentDownloads) {
        toast.error("Faltam módulos locais", { description: describeGaps(gaps) });
        return false;
      }
      const profile = (SETUP_PROFILES[1] ?? SETUP_PROFILES[0]) as SetupProfile;
      for (const gap of gaps) {
        setBusy(`Preparando ${gap.label}`);
        const signal = aborter.current.signal;
        const status = await runJob({
          kind: "export",
          label: `Preparar ${gap.label}`,
          run: async ({ onProgress }) =>
            runtime.installComponent(
              gap.id,
              profile,
              (event) => onProgress(event.progress, event.detail),
              signal,
            ),
        });
        setComponents((current) => [...current.filter((item) => item.id !== status.id), status]);
        if (status.state !== "ready") {
          toast.error(`${gap.label} não ficou pronto`, { description: status.error ?? undefined });
          return false;
        }
      }
      if (runtime.listAiEngines) setEngines(await runtime.listAiEngines());
      return true;
    },
    [components, engines, runJob, runtime],
  );

  /** Imports a produced file into the bin, optionally onto the timeline. */
  const importIntoBin = useCallback(
    async (path: string, toTimeline: boolean): Promise<MediaAsset | null> => {
      const assets = await runtime.importMedia({ files: [path] }, () => {});
      if (assets.length === 0) return null;
      addAsset(assets);
      const asset = assets[0]!;
      if (toTimeline) {
        const track = sequence.tracks.find((candidate) => candidate.kind === "video");
        if (track) {
          const commands = insertAssetCommands(
            asset,
            sequence,
            trackEndUs(sequence, track.id),
            track.id,
          );
          if (commands.length > 0) run(commands, `Inserir ${asset.name}`);
        }
      }
      return asset;
    },
    [addAsset, run, runtime, sequence],
  );

  /** Script → narration → images → montage, then straight into the project. */
  const createVideo = useCallback(
    async (intent: ChatIntent): Promise<ActionOutcome> => {
      if (!runtime.createVideo) {
        return {
          text: "Criar vídeo funciona no programa instalado no Windows, onde estão o montador e as vozes.",
        };
      }
      const brief = intent.subject.trim();
      if (brief.length < 4) {
        return {
          text: "Diga do que o vídeo deve falar, por exemplo: “crie um vídeo sobre pesca esportiva com 4 cenas”.",
        };
      }
      const count = intent.sceneCount ?? 4;
      setBusy("Escrevendo o roteiro");
      let scenes: CreatorScene[] | null = null;
      if (runtime.generateScript) {
        try {
          scenes = parseScriptJson(
            await runtime.generateScript(
              options.endpoint,
              options.model,
              buildScriptPrompt(brief, count),
            ),
          );
        } catch {
          scenes = null;
        }
      }
      scenes = scenes ?? fallbackScenes(brief, count);
      if (scenes.length === 0) return { text: "Não consegui montar um roteiro com esse pedido." };

      const wantsImages = (engines?.images ?? false) || Boolean(runtime.createImage);
      const ready = await prepare({ narrate: true, images: false });
      if (!ready)
        return { text: "Faltam módulos locais para criar o vídeo — veja o aviso na tela." };

      const resolution = ASPECT_RESOLUTIONS[sequence.aspect] ?? { width: 1920, height: 1080 };
      const outputName = stamp("criacao");
      setBusy("Montando o vídeo");
      const result = await runJob({
        kind: "export",
        label: `Criar vídeo — ${scenes.length} cena(s)`,
        run: async ({ onProgress }) =>
          runtime.createVideo!(
            scenes!,
            { ...resolution, outputName, narrate: true, burnTitles: true },
            (event) => onProgress(event.progress, event.detail),
          ),
      });
      const asset = await importIntoBin(result.outputPath, true);
      return {
        text: [
          `Vídeo criado com ${result.sceneCount} cena(s) e já na sua timeline${asset ? ` como “${asset.name}”` : ""}.`,
          result.usedNarration ? "Com narração local." : "Sem narração (voz local não disponível).",
          result.usedImageModel
            ? "Imagens geradas aqui no computador."
            : wantsImages
              ? "Cartelas animadas no lugar das imagens geradas."
              : "",
          `Arquivo: ${result.outputPath} · duração estimada ${(totalDurationUs(scenes) / 1_000_000).toFixed(1)}s.`,
          ...(result.notes ?? []),
          (result.notes ?? []).length > 0
            ? "Abra “Diagnóstico” na barra de cima para ver o motivo detalhado."
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      };
    },
    [engines, runJob, importIntoBin, options.endpoint, options.model, prepare, runtime, sequence],
  );

  /** One still with the local image model, imported into the bin. */
  const createImage = useCallback(
    async (intent: ChatIntent): Promise<ActionOutcome> => {
      if (!runtime.createImage) {
        return { text: "Gerar imagem funciona no programa instalado no Windows." };
      }
      const prompt = intent.subject.trim();
      if (prompt.length < 3) return { text: "Descreva a imagem que você quer." };
      const ready = await prepare({ narrate: false, images: true });
      if (!ready) {
        return {
          text: "O gerador de imagens ainda não está pronto. Abra “Diagnóstico” na barra de cima: ele mostra o que falta e o último erro do gerador.",
        };
      }
      const resolution = ASPECT_RESOLUTIONS[sequence.aspect] ?? { width: 1920, height: 1080 };
      setBusy("Gerando a imagem");
      const path = await runJob({
        kind: "export",
        label: "Gerar imagem",
        run: async ({ onProgress }) => {
          onProgress(0.15, "Desenhando com o modelo local");
          const created = await runtime.createImage!(
            prompt,
            resolution.width,
            resolution.height,
            stamp("imagem"),
          );
          onProgress(1, "Imagem pronta");
          return created;
        },
      });
      const asset = await importIntoBin(path, false);
      return {
        text: `Imagem gerada e adicionada às mídias${asset ? ` como “${asset.name}”` : ""}. Arquivo: ${path}. Arraste para a timeline quando quiser.`,
      };
    },
    [runJob, importIntoBin, prepare, runtime, sequence],
  );

  /** Narration audio with the local voice, imported into the bin. */
  const createAudio = useCallback(
    async (intent: ChatIntent): Promise<ActionOutcome> => {
      if (!runtime.createAudio) {
        return {
          text: "Criar áudio funciona no programa instalado no Windows, onde ficam as vozes.",
        };
      }
      const topic = intent.subject.trim();
      let words = (intent.spoken ?? "").trim();
      if (words.length < 3 && topic.length < 3) {
        return {
          text: "Diga o que a voz deve falar, por exemplo: “crie um áudio dizendo bem-vindo ao canal”.",
        };
      }
      const ready = await prepare({ narrate: true, images: false });
      if (!ready) {
        return {
          text: "A voz local ainda não está pronta. Abra “Diagnóstico” na barra de cima para ver o que falta na narração.",
        };
      }
      if (words.length < 3 && runtime.generateScript) {
        setBusy("Escrevendo o texto da narração");
        try {
          words = (
            await runtime.generateScript(
              options.endpoint,
              options.model,
              withCutVoice(
                `Escreva a narração que a voz vai falar sobre: ${topic}. No máximo 70 palavras, texto corrido, sem títulos, sem marcações e sem comentar o pedido.`,
              ),
            )
          ).trim();
        } catch {
          words = "";
        }
      }
      if (words.length < 3) words = topic;
      setBusy("Gravando a narração");
      const path = await runJob({
        kind: "export",
        label: "Criar áudio",
        run: async ({ onProgress }) => {
          onProgress(0.2, "Falando com a voz local");
          const created = await runtime.createAudio!(words.slice(0, 2000), stamp("narracao"));
          onProgress(1, "Áudio pronto");
          return created;
        },
      });
      const asset = await importIntoBin(path, true);
      return {
        text: `Áudio criado e já na sua timeline${asset ? ` como “${asset.name}”` : ""}. Texto falado: “${words.slice(0, 160)}”. Arquivo: ${path}.`,
      };
    },
    [importIntoBin, options.endpoint, options.model, prepare, runJob, runtime],
  );

  /** Public web search — the only outbound call, and only when asked. */
  const search = useCallback(
    async (intent: ChatIntent): Promise<ActionOutcome> => {
      if (!runtime.webSearch) {
        return { text: "A pesquisa na internet funciona no programa instalado no Windows." };
      }
      setBusy("Pesquisando na internet");
      let hits: SearchHit[] = [];
      try {
        hits = await runtime.webSearch(intent.subject);
      } catch (error) {
        return { text: `Não consegui pesquisar agora: ${(error as Error).message}` };
      }
      if (hits.length === 0) {
        return { text: "A pesquisa não trouxe resultados. Tente com outras palavras." };
      }
      return {
        text: [
          `Encontrei ${hits.length} resultado(s):`,
          ...hits.slice(0, 5).map((hit) => `• ${hit.title} — ${hit.snippet} (${hit.url})`),
        ].join("\n"),
      };
    },
    [runtime],
  );

  /** Transcribes a project media and files the text next to the exports. */
  const transcribeAsset = useCallback(
    async (asset: MediaAsset): Promise<ActionOutcome> => {
      const ready = await prepare({ narrate: false, images: false, speech: true });
      if (!ready) return { text: "O transcritor de fala ainda não está pronto." };
      setBusy(`Ouvindo ${asset.name}`);
      const segments = await runtime.transcribe(asset, () => undefined, aborter.current.signal);
      const text = segments
        .map((segment) => segment.text.trim())
        .filter(Boolean)
        .join("\n");
      if (text.length === 0) return { text: `Não encontrei falas em “${asset.name}”.` };
      let saved: string | null = null;
      if (runtime.saveTextFile) {
        try {
          saved = await runtime.saveTextFile(`transcricao-${asset.name}`, "txt", text);
        } catch {
          saved = null;
        }
      }
      return {
        text: [
          `Transcrição de “${asset.name}” pronta com ${segments.length} trecho(s).`,
          saved ? `Salvei em ${saved}.` : "",
          "",
          text.slice(0, 1200),
        ]
          .filter((part) => part !== undefined)
          .join("\n"),
      };
    },
    [prepare, runtime],
  );

  /** Media the assistant can transcribe (audio and video already imported). */
  const transcribable = project.assets.filter((asset) => asset.kind !== "image");

  const perform = useCallback(
    async (intent: ChatIntent): Promise<ActionOutcome> => {
      try {
        if (intent.kind === "video") return await createVideo(intent);
        if (intent.kind === "image") return await createImage(intent);
        if (intent.kind === "audio") return await createAudio(intent);
        if (intent.kind === "search") return await search(intent);
        if (intent.kind === "transcribe") {
          const target =
            transcribable.find((asset) =>
              intent.subject.toLowerCase().includes(asset.name.toLowerCase().slice(0, 12)),
            ) ?? transcribable[transcribable.length - 1];
          if (!target) {
            return {
              text: "Importe o áudio ou o vídeo primeiro (ou use o botão do microfone) e eu transcrevo.",
            };
          }
          return await transcribeAsset(target);
        }
        return { text: "" };
      } catch (error) {
        const message = readableError(error);
        if (aborter.current.signal.aborted || /cancel/i.test(message)) {
          return { text: "Pedido cancelado." };
        }
        toast.error("A Cut não conseguiu concluir", {
          description: message,
          duration: 12_000,
        });
        return {
          text: `Não consegui concluir: ${message}\nAbra “Diagnóstico” na barra de cima para ver o registro do que falhou.`,
        };
      } finally {
        setBusy(null);
      }
    },
    [createAudio, createImage, createVideo, search, transcribable, transcribeAsset],
  );

  return {
    busy,
    cancel,
    engines,
    perform,
    importIntoBin,
    transcribable,
    transcribeAsset,
  };
}
