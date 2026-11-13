import { describe, expect, it } from 'vitest';
import {
  ComplexFft,
  DFN3,
  chunkedEnhancer,
  createDfn3State,
  erbWidths,
  shiftLookahead,
  stftAnalysis,
  stftSynthesis,
  vorbisWindow,
} from './dfn3-denoise';

describe('DeepFilterNet3 signal pipeline', () => {
  it('reproduces the ERB filterbank widths of libDF (32 bands over 481 bins, ≥2 bins each)', () => {
    const widths = erbWidths();
    expect(widths).toHaveLength(32);
    expect(widths.reduce((sum, w) => sum + w, 0)).toBe(481);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(2);
    expect(widths[0]).toBe(2);
    expect(widths[31]).toBeGreaterThan(widths[0]!);
  });

  it('uses the Vorbis window, which satisfies Princen–Bradley at hop N/2', () => {
    const w = vorbisWindow(DFN3.fftSize);
    expect(w[0]).toBeCloseTo(0, 5);
    expect(w[DFN3.fftSize / 2]).toBeCloseTo(1, 3);
    for (let i = 0; i < DFN3.hopSize; i += 1) {
      expect(w[i]! * w[i]! + w[i + DFN3.hopSize]! * w[i + DFN3.hopSize]!).toBeCloseTo(1, 5);
    }
  });

  it('computes a 960-point transform matching a direct DFT and inverts it', () => {
    const n = DFN3.fftSize;
    const fft = new ComplexFft(n);
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    let seed = 7;
    for (let i = 0; i < n; i += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      re[i] = seed / 0xffffffff - 0.5;
    }
    const src = Float64Array.from(re);
    fft.transform(re, im, false);
    for (const k of [0, 1, 17, 480, 959]) {
      let dr = 0;
      let di = 0;
      for (let t = 0; t < n; t += 1) {
        const angle = (-2 * Math.PI * k * t) / n;
        dr += src[t]! * Math.cos(angle);
        di += src[t]! * Math.sin(angle);
      }
      expect(re[k]).toBeCloseTo(dr, 6);
      expect(im[k]).toBeCloseTo(di, 6);
    }
    fft.transform(re, im, true);
    for (let t = 0; t < n; t += 8) expect(re[t]! / n).toBeCloseTo(src[t]!, 8);
  });

  it('reconstructs the input through analysis and synthesis once the streaming delay is trimmed', () => {
    const fft = new ComplexFft(DFN3.fftSize);
    const state = createDfn3State();
    const length = DFN3.sampleRate; // 1 s
    const signal = new Float32Array(length);
    for (let i = 0; i < length; i += 1) signal[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / DFN3.sampleRate) + 0.1 * Math.sin((2 * Math.PI * 3000 * i) / DFN3.sampleRate);
    const padded = new Float32Array(length + DFN3.fftSize);
    padded.set(signal);
    const { re, im, frames } = stftAnalysis(padded, state, fft);
    const raw = stftSynthesis(re, im, frames, state, fft);
    const delay = DFN3.fftSize - DFN3.hopSize;
    let err = 0;
    let energy = 0;
    for (let i = 0; i < length; i += 1) {
      const d = raw[delay + i]! - signal[i]!;
      err += d * d;
      energy += signal[i]! * signal[i]!;
    }
    expect(Math.sqrt(err / energy)).toBeLessThan(1e-4);
  });

  it('shifts features forward by the lookahead and zero-pads the tail', () => {
    const shifted = shiftLookahead(Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8]), 2, 4, 2);
    expect(Array.from(shifted)).toEqual([5, 6, 7, 8, 0, 0, 0, 0]);
  });

  it('starts the normalization states on libDF ramps', () => {
    const state = createDfn3State();
    expect(state.meanNorm[0]).toBeCloseTo(-60, 5);
    expect(state.meanNorm[31]).toBeCloseTo(-90, 5);
    expect(state.unitNorm[0]).toBeCloseTo(0.001, 6);
    expect(state.unitNorm[95]).toBeCloseTo(0.0001, 6);
  });
});

describe('long input enhanced in pieces', () => {
  // A stand-in for the model: what it returns depends on where a sample sits in its chunk, so a
  // chunk cut at the wrong place, or a seam joined differently, changes the result.
  const enhance = async (samples: Float32Array) => samples.map((value, index) => value * 0.5 + (index % 977) * 1e-4);
  const RATE = 1000; // a 45 s chunk is 45 000 samples: an hour of schedule in a small array

  /** The schedule as it was written over a whole array: the reference the fed-in version must match. */
  async function wholeArray(dry: Float32Array): Promise<Float32Array> {
    const chunkSamples = DFN3.chunkSeconds * RATE;
    if (dry.length <= chunkSamples) return enhance(dry);
    const overlap = Math.max(1, Math.floor((DFN3.overlapMs * RATE) / 1000));
    const hop = chunkSamples - overlap;
    const numChunks = Math.max(2, Math.ceil((dry.length - overlap) / hop));
    const evenChunk = Math.max(overlap + 1, Math.floor((dry.length + overlap * (numChunks - 1) + numChunks - 1) / numChunks));
    const evenHop = evenChunk - overlap;
    const out = new Float32Array(dry.length);
    let written = 0;
    let prevTail: Float32Array | null = null;
    let offset = 0;
    const push = (data: Float32Array) => { const n = Math.min(data.length, out.length - written); out.set(data.subarray(0, n), written); written += n; };
    while (offset < dry.length) {
      const enhanced = await enhance(dry.subarray(offset, Math.min(offset + evenChunk, dry.length)));
      if (!prevTail) {
        const keepEnd = Math.max(0, enhanced.length - overlap);
        push(enhanced.subarray(0, keepEnd));
        prevTail = enhanced.slice(keepEnd);
      } else {
        const effective = Math.min(overlap, enhanced.length, prevTail.length);
        const mixed = new Float32Array(effective);
        for (let i = 0; i < effective; i += 1) {
          const tt = i / Math.max(effective - 1, 1);
          mixed[i] = prevTail[i]! * Math.cos((tt * Math.PI) / 2) + enhanced[i]! * Math.sin((tt * Math.PI) / 2);
        }
        push(mixed);
        if (prevTail.length > effective) push(prevTail.subarray(effective));
        const midEnd = Math.max(effective, enhanced.length - overlap);
        push(enhanced.subarray(effective, midEnd));
        prevTail = enhanced.slice(midEnd);
      }
      offset += evenHop;
      if (dry.length - offset < overlap * 2) break;
    }
    if (prevTail) push(prevTail);
    return out;
  }

  /** The largest difference between two tracks, sample for sample; a different length is infinitely far. */
  const apart = (a: Float32Array, b: Float32Array) => {
    if (a.length !== b.length) return Infinity;
    let worst = 0;
    for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
    return worst;
  };

  const recording = (seconds: number) => Float32Array.from({ length: Math.round(seconds * RATE) }, (_, index) => Math.sin(index / 37) * 0.6);

  async function inPieces(dry: Float32Array, pieceOf: (index: number) => number, announced = dry.length) {
    const parts: Float32Array[] = [];
    const progress: number[] = [];
    let largestWrite = 0;
    const enhancer = chunkedEnhancer(announced, enhance, (samples) => { parts.push(samples.slice()); largestWrite = Math.max(largestWrite, samples.length); }, (fraction) => progress.push(fraction), RATE);
    for (let offset = 0, index = 0; offset < dry.length; index += 1) {
      const size = pieceOf(index);
      await enhancer.push(dry.subarray(offset, offset + size));
      offset += size;
    }
    await enhancer.finish();
    const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return { out, progress, largestWrite };
  }

  it('gives sample for sample what the whole-array schedule gave, at every length', async () => {
    for (const seconds of [0.3, 12, 45, 45.001, 46, 89.5, 90, 300.7, 44 * 60 + 0.2]) {
      const dry = recording(seconds);
      const expected = await wholeArray(dry);
      const { out } = await inPieces(dry, (index) => (index * 7919) % 2048 + 1);
      expect(out.length, `${seconds}s`).toBe(dry.length);
      expect(apart(out, expected), `${seconds}s`).toBe(0);
    }
  }, 30_000);

  it('does not depend on how the input is cut, down to one piece', async () => {
    const dry = recording(200);
    const expected = await wholeArray(dry);
    expect(apart((await inPieces(dry, () => dry.length)).out, expected)).toBe(0);
    expect(apart((await inPieces(dry, () => 1024)).out, expected)).toBe(0);
    expect(apart((await inPieces(dry, (index) => (index % 2 ? 100_000 : 3))).out, expected)).toBe(0);
  });

  it('never writes more than a chunk at a time and reports progress to the end', async () => {
    const { progress, largestWrite } = await inPieces(recording(600), () => 4096);
    expect(largestWrite).toBeLessThanOrEqual(DFN3.chunkSeconds * RATE);
    expect(progress.at(-1)).toBe(1);
    expect(progress.length).toBeGreaterThan(10);
    expect(progress.every((value, index) => index === 0 || value >= progress[index - 1]!)).toBe(true);
  });

  it('pads a track that ends early with silence and ignores what runs past its length', async () => {
    const dry = recording(100);
    const short = await inPieces(dry.subarray(0, 80_000), () => 5000, dry.length);
    const padded = new Float32Array(dry.length);
    padded.set(dry.subarray(0, 80_000));
    expect(apart(short.out, await wholeArray(padded))).toBe(0);
    const long = await inPieces(recording(130), () => 5000, dry.length);
    expect(apart(long.out, await wholeArray(dry))).toBe(0);
  });
});
