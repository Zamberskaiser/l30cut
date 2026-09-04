import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/core/store/editorStore";
import type { MediaAsset } from "@/core/contracts/domain";
import { describeFileProblem, fileExtension, joinSegments } from "./audioSources";

/**
 * Pulls spoken text out of a media file already on the machine — either one the
 * user picked from disk or one already imported into the project. Everything is
 * transcribed by whisper.cpp inside the app, so no audio leaves the computer.
 */
export function useMediaTranscription(onText: (text: string) => void) {
  const { runtime, project } = useEditor();
  const [busy, setBusy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const supported = Boolean(runtime.transcribeSpeech);

  const deliver = useCallback(
    (label: string, text: string) => {
      const clean = text.trim();
      if (clean.length === 0) {
        toast.error("Não encontrei falas nesse arquivo", {
          description: "Confira se ele tem áudio com voz.",
        });
        return;
      }
      onText(clean);
      toast.success(`Transcrição de ${label} pronta`, {
        description: "O texto está na caixa do assistente — revise e envie.",
      });
    },
    [onText],
  );

  /** Reads a file the user picked and transcribes it. */
  const fromFile = useCallback(
    async (file: File) => {
      const transcribe = runtime.transcribeSpeech;
      if (!transcribe) {
        toast.error("Transcrição indisponível aqui", {
          description: "Ela funciona no programa instalado no Windows.",
        });
        return;
      }
      const problem = describeFileProblem(file.name, file.size);
      if (problem) {
        toast.error("Não consigo usar esse arquivo", { description: problem });
        return;
      }
      setBusy(file.name);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        deliver(file.name, await transcribe(bytes, fileExtension(file.name) || "wav"));
      } catch (error) {
        toast.error("Não consegui transcrever o arquivo", {
          description: (error as Error).message,
        });
      } finally {
        setBusy(null);
      }
    },
    [deliver, runtime],
  );

  /** Transcribes a clip source already imported into the project. */
  const fromAsset = useCallback(
    async (asset: MediaAsset) => {
      setBusy(asset.name);
      try {
        const segments = await runtime.transcribe(asset, () => undefined);
        deliver(asset.name, joinSegments(segments));
      } catch (error) {
        toast.error("Não consegui transcrever essa mídia", {
          description: (error as Error).message,
        });
      } finally {
        setBusy(null);
      }
    },
    [deliver, runtime],
  );

  /** Opens the system file picker, hidden input owned by the caller. */
  const pickFile = useCallback(() => input.current?.click(), []);

  const assets = project.assets.filter((asset) => asset.kind !== "image");

  return { busy, supported, assets, fromFile, fromAsset, pickFile, input };
}
