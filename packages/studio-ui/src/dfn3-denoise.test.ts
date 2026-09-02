import { describe, expect, it } from 'vitest';
import {
  ComplexFft,
  DFN3,
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
