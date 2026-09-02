import { describe, expect, it } from 'vitest';
import { spectralDenoise } from './spectral-denoise';

const RATE = 48000;
const rms = (x: Float32Array, from = 0, to = x.length) => {
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += x[i]! * x[i]!;
  return Math.sqrt(sum / Math.max(1, to - from));
};
// Deterministic white noise so the assertions are stable.
function noise(length: number, level: number, seed = 1): Float32Array {
  let state = seed;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out[i] = ((state / 0xffffffff) * 2 - 1) * level;
  }
  return out;
}

describe('spectralDenoise', () => {
  it('attenuates a steady noise floor by roughly the requested amount and keeps length', () => {
    const dry = noise(RATE * 2, 0.05);
    const wet = spectralDenoise(dry, { reductionDb: 15 });
    expect(wet.length).toBe(dry.length);
    const drop = 20 * Math.log10(rms(dry) / rms(wet));
    expect(drop).toBeGreaterThan(9);
    expect(drop).toBeLessThan(18);
  });

  it('keeps a voiced tone intact while removing the hiss around it', () => {
    const length = RATE * 2;
    const dry = noise(length, 0.02);
    const tone = new Float32Array(length);
    for (let i = 0; i < length; i += 1) tone[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / RATE);
    // The tone plays in the middle second only; the edges are pure noise floor.
    for (let i = RATE / 2; i < (RATE * 3) / 2; i += 1) dry[i] = dry[i]! + tone[i]!;
    const wet = spectralDenoise(dry, { reductionDb: 15 });
    const toneDry = rms(dry, RATE * 0.6, RATE * 1.4);
    const toneWet = rms(wet, RATE * 0.6, RATE * 1.4);
    expect(Math.abs(20 * Math.log10(toneDry / toneWet))).toBeLessThan(1);
    const floorDrop = 20 * Math.log10(rms(dry, 0, RATE * 0.4) / rms(wet, 0, RATE * 0.4));
    expect(floorDrop).toBeGreaterThan(9);
  });

  it('reports progress and handles short input', () => {
    const seen: number[] = [];
    const wet = spectralDenoise(noise(500, 0.1), { onProgress: (p) => seen.push(p) });
    expect(wet.length).toBe(500);
    expect(seen[seen.length - 1]).toBe(1);
  });
});
