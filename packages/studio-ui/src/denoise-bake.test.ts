import { beforeEach, describe, expect, it, vi } from 'vitest';

// The device's media cache, as a map: a stream is kept only once it has been read to its end.
const cache = new Map<string, File>();
vi.mock('./local-media', () => ({
  loadLocalVideo: async (key: string) => cache.get(key) ?? null,
  saveLocalStream: async (stream: ReadableStream<Uint8Array<ArrayBuffer>>, key: string, options: { name: string; type?: string; expectedSize?: number | null }) => {
    const parts: Uint8Array<ArrayBuffer>[] = [];
    const reader = stream.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); }
    const file = new File(parts, options.name, { type: options.type });
    if (options.expectedSize != null && file.size !== options.expectedSize) throw new Error(`size ${file.size} != ${options.expectedSize}`);
    cache.set(key, file);
    return file;
  },
}));

// A recording's soundtrack, stood in for by the samples each test file carries, handed over in
// uneven pieces as a decoder would.
const soundtracks = new WeakMap<Blob, { sampleRate: number; channels: Float32Array[] } | 'empty'>();
vi.mock('./audio-decode', async (original) => ({
  ...(await original<typeof import('./audio-decode')>()),
  readVideoSound: async (file: Blob, open: (shape: { sampleRate: number; channels: number; frames: number }) => unknown) => {
    const sound = soundtracks.get(file);
    if (!sound) return null;
    const shape = sound === 'empty' ? { sampleRate: 48_000, channels: 1, frames: 1 } : { sampleRate: sound.sampleRate, channels: sound.channels.length, frames: sound.channels[0]!.length };
    const receive = (await open(shape)) as (channels: Float32Array[]) => void | Promise<void>;
    if (sound === 'empty') return null;
    for (let offset = 0, size = 1024; offset < shape.frames; offset += size, size = (size * 7) % 4099 + 1) await receive(sound.channels.map((channel) => channel.slice(offset, offset + size)));
    return shape;
  },
}));

import { DENOISE_RATE, pcm16, pcm16ToFloat, readWavMono, wavMonoSamples, encodeWavMono } from './denoise';
import { bakeCleanedVoice, cleanedVoiceMixKey, cleanedVoiceWetKey, writeWavMono } from './denoise-bake';
import { chunkedEnhancer } from './dfn3-denoise';

/** Stands in for the model: halves the sound, through the real long-input schedule. */
const enhancerCalls: number[] = [];
const enhancer = (async (total: number, write: (samples: Float32Array) => void | Promise<void>, onProgress?: (fraction: number) => void) => {
  enhancerCalls.push(total);
  return chunkedEnhancer(total, async (samples) => samples.map((value) => value * 0.5), write, onProgress);
}) as typeof import('./dfn3-denoise').dfn3Enhancer;

const voice = (seconds: number, level = 0.4) => Float32Array.from({ length: Math.round(DENOISE_RATE * seconds) }, (_, index) => Math.sin(index / 23) * level);
function recording(channels: Float32Array[], sampleRate = DENOISE_RATE) {
  const file = new File(['x'], 'talk.mov', { type: 'video/quicktime' });
  soundtracks.set(file, { sampleRate, channels });
  return file;
}
const samplesOf = async (file: File) => readWavMono(file, 0, wavMonoSamples(file)!);
const stored = (pcm: Float32Array) => pcm16ToFloat(pcm16(pcm));
/** The largest difference between two tracks, sample for sample; a different length is infinitely far. */
function apart(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Infinity;
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
  return worst;
}

beforeEach(() => { cache.clear(); enhancerCalls.length = 0; });

describe('cleaned voice, baked in pieces', () => {
  it('writes dry·(1−s) + wet·s for the whole track, from the wet as it is stored', async () => {
    const left = voice(70); const right = voice(70, 0.2);
    const sig = 'pireel2:abc:1000';
    const mix = (await bakeCleanedVoice(recording([left, right]), sig, 0.6, { enhancer }))!;
    expect(wavMonoSamples(mix)).toBe(left.length);
    const dry = left.map((value, index) => (value + right[index]!) / 2);
    // The wet that was stored: the halved voice away from the chunk seams (which crossfade).
    const wet = await samplesOf(cache.get(cleanedVoiceWetKey(sig))!);
    expect(wet).toHaveLength(left.length);
    expect(apart(wet.subarray(0, 48_000 * 20), stored(dry.subarray(0, 48_000 * 20).map((value) => value * 0.5)))).toBeLessThan(1 / 32768);
    expect(apart(await samplesOf(mix), stored(dry.map((value, index) => value * (1 - 0.6) + wet[index]! * 0.6)))).toBe(0);
    expect(cache.get(cleanedVoiceMixKey(sig, 0.6))).toBe(mix);
  });

  it('reads the stored wet back for another strength, and the stored mix for the same one', async () => {
    const dry = voice(60);
    const source = recording([dry]);
    const sig = 'pireel2:def:2000';
    const first = (await bakeCleanedVoice(source, sig, 0.6, { enhancer }))!;
    expect(enhancerCalls).toEqual([dry.length]);
    const second = (await bakeCleanedVoice(source, sig, 0.25, { enhancer }))!;
    expect(enhancerCalls).toHaveLength(1); // the model did not run again
    const wet = await samplesOf(cache.get(cleanedVoiceWetKey(sig))!);
    expect(apart(await samplesOf(second), stored(dry.map((value, index) => value * 0.75 + wet[index]! * 0.25)))).toBe(0);
    // The same strength again is the file already there: nothing is decoded.
    soundtracks.delete(source);
    expect(await bakeCleanedVoice(source, sig, 0.6, { enhancer })).toBe(first);
  });

  it('gives the same mix whether the wet was just made or read back', async () => {
    const dry = voice(50);
    const made = await samplesOf((await bakeCleanedVoice(recording([dry]), 'pireel2:one:1', 0.5, { enhancer }))!);
    cache.delete(cleanedVoiceMixKey('pireel2:one:1', 0.5));
    const readBack = await samplesOf((await bakeCleanedVoice(recording([dry]), 'pireel2:one:1', 0.5, { enhancer }))!);
    expect(enhancerCalls).toHaveLength(1);
    expect(apart(readBack, made)).toBe(0);
  });

  it('brings a 44.1 kHz track to 48 kHz at its real length', async () => {
    const dry = Float32Array.from({ length: 44_100 * 20 }, (_, index) => Math.sin((2 * Math.PI * 440 * index) / 44_100) * 0.3);
    const mix = (await bakeCleanedVoice(recording([dry], 44_100), 'pireel2:rate:3', 1, { enhancer }))!;
    expect(wavMonoSamples(mix)).toBe(48_000 * 20);
    const got = await samplesOf(mix);
    // Full strength of a halving model: a 440 Hz tone at half level, in time with the source.
    let worst = 0;
    for (let i = 4800; i < got.length - 4800; i += 7) worst = Math.max(worst, Math.abs(got[i]! - Math.sin((2 * Math.PI * 440 * i) / 48_000) * 0.15));
    expect(worst).toBeLessThan(0.002);
  });

  it('has nothing to clean in a file without sound, and keeps nothing for it', async () => {
    expect(await bakeCleanedVoice(new File(['x'], 'mute.mov'), 'pireel2:mute:4', 0.6, { enhancer })).toBeNull();
    const empty = new File(['x'], 'empty.mov');
    soundtracks.set(empty, 'empty');
    expect(await bakeCleanedVoice(empty, 'pireel2:empty:5', 0.6, { enhancer })).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('stops when told to and leaves no half-written file', async () => {
    const abort = new AbortController();
    const baking = bakeCleanedVoice(recording([voice(200)]), 'pireel2:stop:6', 0.6, { enhancer, signal: abort.signal, onProgress: (fraction) => { if (fraction > 0.2) abort.abort(); } });
    await expect(baking).rejects.toThrow();
    expect(cache.size).toBe(0);
  });

  it('fails with the reason when the model cannot start, without waiting forever', async () => {
    const broken = (async () => { throw new Error('model unavailable'); }) as unknown as typeof enhancer;
    await expect(bakeCleanedVoice(recording([voice(5)]), 'pireel2:broken:7', 0.6, { enhancer: broken })).rejects.toThrow('model unavailable');
    expect(cache.has(cleanedVoiceMixKey('pireel2:broken:7', 0.6))).toBe(false);
  });

  it('keeps an old-style source key out of the size the cache reads from a key', () => {
    expect(cleanedVoiceWetKey('pireel2:abc:123')).toBe('dnwet:dfn3:pireel2:abc:123'); // where earlier bakes stored it
    expect(cleanedVoiceWetKey('talk.mov:123:456')).toBe('dnwet:dfn3:talk.mov~123~456');
    expect(cleanedVoiceMixKey('pireel2:abc:123', 0.6)).toBe('dnmix:dfn3:0.6:pireel2:abc:123');
  });
});

describe('a WAV written as it is made', () => {
  it('is the same file encodeWavMono makes of the whole', async () => {
    const pcm = voice(3.21);
    const file = await writeWavMono('k', pcm.length, 'a.wav', async (write) => {
      for (let offset = 0, size = 1; offset < pcm.length; offset += size, size = (size * 7) % 5003 + 1) await write(pcm.subarray(offset, offset + size));
    });
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array(await encodeWavMono(pcm).arrayBuffer()));
    expect(await readWavMono(file, 1000, 5)).toEqual(stored(pcm.subarray(1000, 1005)));
  });

  it('fails, and keeps nothing, when fewer samples arrive than it was opened for', async () => {
    await expect(writeWavMono('short', 1000, 'a.wav', async (write) => { await write(new Float32Array(10)); })).rejects.toThrow();
    expect(cache.has('short')).toBe(false);
  });
});
