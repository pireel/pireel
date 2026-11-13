/**
 * Narration denoise — DeepFilterNet3 (onnxruntime-web, fully in-browser) behind a swappable seam.
 *
 * Shape mirrors the reference NLE's bake: the expensive inference runs ONCE per source into a
 * cached WET file; "strength" is a dry/wet blend done at BAKE time (sample-accurate PCM sum), so
 * preview and export both play ONE blended file — no live dual-element mixing, no comb filtering,
 * no WebAudio takeover of the decode elements. Changing strength only re-blends from the cached
 * wet (seconds), never re-runs inference.
 *
 * Engine behind the `denoiseWetPcm` seam: DeepFilterNet3 on onnxruntime-web (dfn3-denoise.ts);
 * everything around it (bake/cache/blend/wav) is engine-agnostic. Output is 48 kHz MONO wav: speech-first tradeoff, stereo sources downmix.
 */

export const DENOISE_RATE = 48000;
/** Same default as the reference desktop NLE's denoise amount. */
export const DENOISE_DEFAULT_STRENGTH = 0.6;

/** Decode an audio blob to 48 kHz mono Float32 (mixdown across channels). */
export async function decodeMono48k(blob: Blob): Promise<Float32Array> {
  const octx = new OfflineAudioContext(1, 8, DENOISE_RATE);
  const buf = await octx.decodeAudioData(await blob.arrayBuffer());
  const out = new Float32Array(buf.length);
  const chs = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
  for (let i = 0; i < buf.length; i++) {
    let v = 0;
    for (const ch of chs) v += ch[i]!;
    out[i] = v / chs.length;
  }
  return out;
}

/** Run RNNoise over mono 48 kHz PCM → WET PCM (same length). Yields to the event loop between
 *  batches so a long bake doesn't freeze the tab; onProgress gets 0..1. */
export async function denoiseWetPcm(dry: Float32Array, onProgress?: (p: number) => void): Promise<Float32Array> {
  // DeepFilterNet3 (same model and pipeline constants as the reference desktop NLE). A load
  // failure (offline, blocked CDN) fails the bake — the panel shows it and the original audio plays.
  const { dfn3Enhance } = await import('./dfn3-denoise');
  return dfn3Enhance(dry, onProgress);
}

/** Sample-accurate dry/wet blend: out = dry·(1−s) + wet·s (clamped 0..1). */
export function blendPcm(dry: Float32Array, wet: Float32Array, strength: number): Float32Array {
  const s = Math.max(0, Math.min(1, strength));
  const n = Math.min(dry.length, wet.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = dry[i]! * (1 - s) + wet[i]! * s;
  return out;
}

export const WAV_HEADER_BYTES = 44;

/** The header of a 16-bit mono PCM WAV that holds `samples` samples: written first, the samples follow. */
export function wavMonoHeader(samples: number, sampleRate: number = DENOISE_RATE): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(WAV_HEADER_BYTES);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples * 2, true);
  return bytes;
}

/** Float samples as 16-bit little-endian PCM (out-of-range samples clamp). */
export function pcm16(pcm: Float32Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(pcm.length * 2);
  const v = new DataView(bytes.buffer);
  for (let i = 0; i < pcm.length; i++) {
    const x = Math.max(-1, Math.min(1, pcm[i]!));
    v.setInt16(i * 2, Math.round(x * 32767), true);
  }
  return bytes;
}

/** 16-bit little-endian PCM back to float, on the scale an audio decoder reads a WAV at (÷32768). */
export function pcm16ToFloat(bytes: Uint8Array): Float32Array {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength - (bytes.byteLength % 2));
  const out = new Float32Array(v.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = v.getInt16(i * 2, true) / 32768;
  return out;
}

/** Mono Float32 → 16-bit PCM WAV blob. */
export function encodeWavMono(pcm: Float32Array, sampleRate: number = DENOISE_RATE): Blob {
  return new Blob([wavMonoHeader(pcm.length, sampleRate), pcm16(pcm)], { type: 'audio/wav' });
}

/** How many samples a WAV written by wavMonoHeader/pcm16 holds; null when the file is not one. */
export function wavMonoSamples(file: Blob): number | null {
  const bytes = file.size - WAV_HEADER_BYTES;
  return bytes >= 0 && bytes % 2 === 0 ? bytes / 2 : null;
}

/** Read such a WAV a piece at a time, in order: `count` samples starting at `from`. */
export async function readWavMono(file: Blob, from: number, count: number): Promise<Float32Array> {
  const start = WAV_HEADER_BYTES + from * 2;
  return pcm16ToFloat(new Uint8Array(await file.slice(start, start + count * 2).arrayBuffer()));
}
