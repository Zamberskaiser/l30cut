/**
 * Minimal 16-bit PCM WAV writer plus a linear downsampler.
 *
 * Microphone dictation encodes a complete WAV per recording instead of shipping
 * MediaRecorder fragments: only the first fragment carries a container header,
 * and Safari/WebView2 disagree on the container they produce. A finished WAV is
 * decodable by FFmpeg and whisper.cpp on every host.
 */

export const DICTATION_SAMPLE_RATE = 16_000;

/** Averages neighbouring samples down to `targetRate` (mono input). */
export function downsample(
  input: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (targetRate >= sourceRate) return input;
  const ratio = sourceRate / targetRate;
  const output = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < output.length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      sum += input[j] ?? 0;
      count += 1;
    }
    output[i] = count > 0 ? sum / count : 0;
  }
  return output;
}

/** Concatenates the captured chunks into one buffer. */
export function concatChunks(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/** Peak amplitude, used to reject a silent recording before transcribing it. */
export function peakLevel(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) {
    const value = Math.abs(sample);
    if (value > peak) peak = value;
  }
  return peak;
}

/** Writes a standard mono 16-bit WAV file (header + samples). */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return bytes;
}
