import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/core/store/editorStore";
import {
  DICTATION_SAMPLE_RATE,
  concatChunks,
  downsample,
  encodeWav,
  peakLevel,
} from "@/core/audio/wav";

export type DictationState = "idle" | "recording" | "transcribing";

/** Below this peak the microphone captured nothing worth transcribing. */
const SILENCE_PEAK = 0.01;
/** Stops on its own so a forgotten recording never grows unbounded. */
const MAX_SECONDS = 60;

interface Capture {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  chunks: Float32Array[];
  timer: number;
}

/**
 * Records the microphone and returns the spoken text, transcribed locally.
 *
 * Audio is captured as raw PCM through the Web Audio API and encoded to one
 * complete WAV per recording, then handed to whisper.cpp inside the app. No
 * audio and no text leaves the machine.
 */
export function useDictation(onText: (text: string) => void) {
  const runtime = useEditor().runtime;
  const capture = useRef<Capture | null>(null);
  const [state, setState] = useState<DictationState>("idle");
  const supported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    Boolean(runtime.transcribeSpeech);

  const teardown = useCallback((): Float32Array[] => {
    const active = capture.current;
    capture.current = null;
    if (!active) return [];
    window.clearTimeout(active.timer);
    active.processor.onaudioprocess = null;
    active.processor.disconnect();
    active.source.disconnect();
    active.stream.getTracks().forEach((track) => track.stop());
    void active.context.close().catch(() => undefined);
    return active.chunks;
  }, []);

  // A recording must never outlive the panel that owns it.
  useEffect(() => () => void teardown(), [teardown]);

  const stop = useCallback(async () => {
    const sampleRate = capture.current?.context.sampleRate ?? DICTATION_SAMPLE_RATE;
    const chunks = teardown();
    if (chunks.length === 0) {
      setState("idle");
      return;
    }
    const transcribe = runtime.transcribeSpeech;
    if (!transcribe) {
      setState("idle");
      return;
    }
    const samples = downsample(concatChunks(chunks), sampleRate, DICTATION_SAMPLE_RATE);
    if (samples.length < DICTATION_SAMPLE_RATE / 2 || peakLevel(samples) < SILENCE_PEAK) {
      setState("idle");
      toast.error("Não ouvi nada", {
        description: "Segure o botão, fale o comando e solte quando terminar.",
      });
      return;
    }
    setState("transcribing");
    try {
      const spoken = await transcribe(encodeWav(samples, DICTATION_SAMPLE_RATE), "wav");
      if (spoken.trim().length === 0) {
        toast.error("Não entendi o que foi falado", { description: "Tente falar novamente." });
        return;
      }
      onText(spoken.trim());
    } catch (error) {
      toast.error("Não consegui transcrever o áudio", {
        description: (error as Error).message,
      });
    } finally {
      setState("idle");
    }
  }, [onText, runtime, teardown]);

  const start = useCallback(async () => {
    if (capture.current || state !== "idle") return;
    if (!supported) {
      toast.error("Comando por voz indisponível aqui", {
        description: "Ele funciona no programa instalado no Windows, com o microfone liberado.",
      });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      toast.error("Sem acesso ao microfone", {
        description: "Libere o microfone para o L30 CUT AI e tente de novo.",
      });
      return;
    }
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    processor.onaudioprocess = (event) => {
      chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);
    processor.connect(context.destination);
    const timer = window.setTimeout(() => void stop(), MAX_SECONDS * 1_000);
    capture.current = { stream, context, source, processor, chunks, timer };
    setState("recording");
  }, [state, stop, supported]);

  const toggle = useCallback(() => {
    if (state === "recording") void stop();
    else if (state === "idle") void start();
  }, [start, state, stop]);

  return { state, supported, start, stop, toggle };
}
