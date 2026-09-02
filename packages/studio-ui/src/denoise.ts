/**
 * Narration denoise — RNNoise (wasm, Apache-2.0, fully in-browser) with a swappable seam.
 *
 * Shape mirrors the reference NLE's bake: the expensive inference runs ONCE per source into a
 * cached WET file; "strength" is a dry/wet blend done at BAKE time (sample-accurate PCM sum), so
 * preview and export both play ONE blended file — no live dual-element mixing, no comb filtering,
 * no WebAudio takeover of the decode elements. Changing strength only re-blends from the cached
 * wet (seconds), never re-runs inference.
 *
 * Engine behind the `denoiseWetPcm` seam: DeepFilterNet3 on onnxruntime-web (dfn3-denoise.ts),
 * RNNoise only as the load-failure fallback — everything around it (bake/cache/blend/wav) is
 * engine-agnostic. Output is 48 kHz MONO wav: speech-first tradeoff, stereo sources downmix.
 */

export const DENOISE_RATE = 48000;
/** Same default as the reference desktop NLE's denoise amount. */
export const DENOISE_DEFAULT_STRENGTH = 0.6;
const FRAME = 480; // rnnoise contract: 10 ms frames at 48 kHz
const YIELD_EVERY = 400; // frames between event-loop yields (~4 s of audio)

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
  // DeepFilterNet3 (same model and pipeline constants as the reference desktop NLE). RNNoise
  // stays only as the fallback when the graphs cannot load (offline, blocked CDN).
  try {
    const { dfn3Enhance } = await import('./dfn3-denoise');
    return await dfn3Enhance(dry, onProgress);
  } catch (error) {
    console.warn('[denoise] DeepFilterNet3 unavailable, falling back to RNNoise', error);
  }
  const { default: factory } = await import('@jitsi/rnnoise-wasm/dist/rnnoise-sync');
  const mod = await factory();
  const state = mod._rnnoise_create();
  const inPtr = mod._malloc(FRAME * 4);
  const outPtr = mod._malloc(FRAME * 4);
  const wet = new Float32Array(dry.length);
  const frame = new Float32Array(FRAME);
  try {
    const frames = Math.ceil(dry.length / FRAME);
    for (let f = 0; f < frames; f++) {
      const off = f * FRAME;
      const n = Math.min(FRAME, dry.length - off);
      // rnnoise speaks float-in-int16-range
      for (let i = 0; i < FRAME; i++) frame[i] = i < n ? dry[off + i]! * 32767 : 0;
      mod.HEAPF32.set(frame, inPtr >> 2);
      mod._rnnoise_process_frame(state, outPtr, inPtr);
      const out = mod.HEAPF32.subarray(outPtr >> 2, (outPtr >> 2) + n);
      for (let i = 0; i < n; i++) wet[off + i] = out[i]! / 32767;
      if (f % YIELD_EVERY === YIELD_EVERY - 1) {
        onProgress?.(f / frames);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    onProgress?.(1);
    return wet;
  } finally {
    mod._free(inPtr);
    mod._free(outPtr);
    mod._rnnoise_destroy(state);
  }
}

/** Sample-accurate dry/wet blend: out = dry·(1−s) + wet·s (clamped 0..1). */
export function blendPcm(dry: Float32Array, wet: Float32Array, strength: number): Float32Array {
  const s = Math.max(0, Math.min(1, strength));
  const n = Math.min(dry.length, wet.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = dry[i]! * (1 - s) + wet[i]! * s;
  return out;
}

/** Mono Float32 → 16-bit PCM WAV blob. */
export function encodeWavMono(pcm: Float32Array, sampleRate: number = DENOISE_RATE): Blob {
  const n = pcm.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
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
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const x = Math.max(-1, Math.min(1, pcm[i]!));
    v.setInt16(44 + i * 2, Math.round(x * 32767), true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}
