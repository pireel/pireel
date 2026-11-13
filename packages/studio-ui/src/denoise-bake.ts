/**
 * The cleaned voice of a recording, baked without ever holding the track: the sound is decoded a
 * packet at a time, denoised a 45 s chunk at a time, and both results are written to this device as
 * they are made. Held whole, a 44-minute recording took ~2.8 GB to bake (the decoded track, its
 * mono copy, the denoised copy, the blend and two WAV buffers), every time its project was opened.
 *
 * Two files per source, both 48 kHz mono 16-bit WAV in the local media cache:
 *   wet   the denoised voice, made once per source (the model is the slow part);
 *   mix   dry·(1−strength) + wet·strength, what the preview plays and the export substitutes.
 * The mix is blended from the wet as stored, so it is the same whether the wet was just made or
 * read back, and a project opened again finds its mix and decodes nothing.
 */

import { monoResampler, readVideoSound } from './audio-decode';
import { DENOISE_RATE, WAV_HEADER_BYTES, blendPcm, pcm16, pcm16ToFloat, readWavMono, wavMonoHeader, wavMonoSamples } from './denoise';
import { loadLocalVideo, saveLocalStream } from './local-media';
import { isContentSig } from './media';

/** A cache key the store reads no size out of: only a content sig keeps its colons. */
const keyFor = (prefix: string, sig: string) => prefix + (isContentSig(sig) ? sig : sig.replace(/:/g, '~'));
export const cleanedVoiceWetKey = (sig: string) => keyFor('dnwet:dfn3:', sig);
export const cleanedVoiceMixKey = (sig: string, strength: number) => keyFor(`dnmix:dfn3:${strength}:`, sig);

/** Samples read from a stored wet per round, and the dry held to meet them (4 s). */
const BLEND_BLOCK = DENOISE_RATE * 4;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  promise.catch(() => {}); // a failure is read by whoever awaits; nobody waiting is not an error
  return { promise, resolve, reject };
}

/** Takes the next samples of a WAV being written: floats, or 16-bit PCM bytes already encoded. */
export type WavWrite = (samples: Float32Array | Uint8Array<ArrayBuffer>) => Promise<void>;

/**
 * Write a mono 16-bit WAV of `total` samples into the local cache under `key` as `produce` hands
 * the samples over; the file is the one on this device, not a copy in memory. `write` waits while
 * the disk is behind. A failure on either side ends both and is thrown, and nothing partial is kept.
 */
export async function writeWavMono(
  key: string,
  total: number,
  name: string,
  produce: (write: WavWrite) => Promise<void>,
  sampleRate: number = DENOISE_RATE,
): Promise<File> {
  let controller!: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>;
  let wake: (() => void) | null = null;
  let dropped = false;
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(opened) { controller = opened; },
    pull() { wake?.(); wake = null; },
    cancel() { dropped = true; wake?.(); wake = null; },
  }, { highWaterMark: 4 * 1024 * 1024, size: (chunk) => chunk.byteLength });
  const saved = saveLocalStream(stream, key, { name, type: 'audio/wav', expectedSize: WAV_HEADER_BYTES + total * 2 });
  saved.catch(() => {}); // read below, on either path
  const send = async (bytes: Uint8Array<ArrayBuffer>) => {
    if (dropped) throw new Error('the file could not be written');
    controller.enqueue(bytes);
    if ((controller.desiredSize ?? 1) <= 0) await new Promise<void>((resolve) => { wake = resolve; });
  };
  try {
    await send(wavMonoHeader(total, sampleRate));
    await produce((samples) => send(samples instanceof Float32Array ? pcm16(samples) : samples));
    controller.close();
    return await saved;
  } catch (error) {
    try { controller.error(error); } catch { /* already closed or cancelled */ }
    // When the disk side failed first, its reason is the one worth reporting.
    const diskError = await saved.then(() => null, (reason: unknown) => reason);
    throw dropped && diskError ? diskError : error;
  }
}

/** Samples queued in order and taken back in any sizes; what is missing comes back as silence. */
function sampleQueue() {
  const parts: Float32Array[] = [];
  let head = 0; // read position inside parts[0]
  let size = 0;
  return {
    get length() { return size; },
    push(samples: Float32Array) {
      if (!samples.length) return;
      parts.push(samples);
      size += samples.length;
    },
    take(count: number): Float32Array {
      const out = new Float32Array(count);
      let filled = 0;
      while (filled < count && parts.length) {
        const part = parts[0]!;
        const n = Math.min(count - filled, part.length - head);
        out.set(part.subarray(head, head + n), filled);
        filled += n; head += n; size -= n;
        if (head === part.length) { parts.shift(); head = 0; }
      }
      return out;
    },
  };
}

export interface CleanedVoiceOptions {
  /** 0–1: denoising when the wet is made, blending when it is read back. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Stands in for the model (tests): takes the track's length and where to write the cleaned sound. */
  enhancer?: typeof import('./dfn3-denoise').dfn3Enhancer;
}

/**
 * The mix for `source` at `strength`: found in the cache, or baked into it. Null when the file has
 * no sound to clean. `sig` names the source's bytes; the same sig and strength give the same file.
 */
export async function bakeCleanedVoice(source: File, sig: string, strength: number, options: CleanedVoiceOptions = {}): Promise<File | null> {
  const mixKey = cleanedVoiceMixKey(sig, strength);
  const kept = await loadLocalVideo(mixKey);
  if (kept && wavMonoSamples(kept)) { options.onProgress?.(1); return kept; }
  const wetKept = await loadLocalVideo(cleanedVoiceWetKey(sig));
  options.signal?.throwIfAborted();

  // Where the reader and the writer meet: `intake` is the writer's side once it can take sound,
  // `trackOver` tells it the last sample has been handed in (or why none more will come).
  const intake = deferred<(mono: Float32Array) => Promise<void>>();
  const trackOver = deferred<void>();
  let resampler: ReturnType<typeof monoResampler> | null = null;
  let mix: Promise<File> | null = null;

  const bake = (total: number, wet: File | null) => writeWavMono(mixKey, total, 'denoised.wav', async (writeMix) => {
    const dry = sampleQueue();
    if (wet) {
      // The wet is already on this device: blend against it, a few seconds at a time.
      let at = 0;
      const blend = async (count: number) => {
        await writeMix(blendPcm(dry.take(count), await readWavMono(wet, at, count), strength));
        at += count;
        options.onProgress?.(Math.min(0.99, at / total));
      };
      intake.resolve(async (mono) => {
        dry.push(mono);
        while (dry.length >= BLEND_BLOCK && at + BLEND_BLOCK <= total) await blend(BLEND_BLOCK);
      });
      await trackOver.promise;
      while (at < total) await blend(Math.min(BLEND_BLOCK, total - at));
      return;
    }
    // Denoise: the wet is stored as it comes out, and the mix is blended from what was stored.
    // Keeping the wet is best effort; without it the next change of strength denoises again.
    const wetWriter = deferred<WavWrite | null>();
    const wetOver = deferred<void>();
    void writeWavMono(cleanedVoiceWetKey(sig), total, 'wet.wav', (write) => { wetWriter.resolve(write); return wetOver.promise; })
      .catch(() => wetWriter.resolve(null));
    let writeWet = await wetWriter.promise;
    try {
      const createEnhancer = options.enhancer ?? (await import('./dfn3-denoise')).dfn3Enhancer;
      const enhancer = await createEnhancer(total, async (cleaned) => {
        const stored = pcm16(cleaned);
        if (writeWet) await writeWet(stored).catch(() => { writeWet = null; });
        await writeMix(blendPcm(dry.take(cleaned.length), pcm16ToFloat(stored), strength));
      }, (fraction) => options.onProgress?.(Math.min(0.99, fraction)));
      intake.resolve(async (mono) => {
        dry.push(mono);
        await enhancer.push(mono);
      });
      await trackOver.promise;
      await enhancer.finish();
      wetOver.resolve();
    } catch (error) {
      wetOver.reject(error);
      throw error;
    }
  });

  try {
    const shape = await readVideoSound(source, (found) => {
      const total = Math.max(1, Math.round((found.frames / found.sampleRate) * DENOISE_RATE));
      const toMono = resampler = monoResampler(found.sampleRate, DENOISE_RATE);
      mix = bake(total, wetKept && wavMonoSamples(wetKept) === total ? wetKept : null);
      mix.catch((error: unknown) => intake.reject(error)); // a writer that never opened must not leave the reader waiting
      return async (channels) => {
        options.signal?.throwIfAborted();
        await (await intake.promise)(toMono.push(channels));
      };
    });
    const writing = mix as Promise<File> | null;
    if (!writing) return null; // no audio track
    if (!shape) throw new NoSound();
    const tail = (resampler as ReturnType<typeof monoResampler> | null)?.flush();
    if (tail?.length) await (await intake.promise)(tail);
    trackOver.resolve();
    const file = await writing;
    options.onProgress?.(1);
    return file;
  } catch (error) {
    trackOver.reject(error);
    await (mix as Promise<File> | null)?.catch(() => {});
    if (error instanceof NoSound) return null; // a track without a single sample: nothing to clean
    throw error;
  }
}

class NoSound extends Error {}
