import { describe, expect, it } from 'vitest';
import { type TimeStretch, needsStretch, resampleLinear, stretchedFrames, tiledStretch } from './time-stretch';

/** Fake stretch: exact length math, sample = source position (so seams can be checked numerically). */
const positional: TimeStretch = async ({ channels, rate }) => {
  const n = stretchedFrames(channels[0]!.length, rate);
  return channels.map((ch) => {
    const out = new Float32Array(n);
    for (let k = 0; k < n; k++) out[k] = ch[Math.min(ch.length - 1, Math.round(k * rate))]!;
    return out;
  });
};

describe('time stretch helpers', () => {
  it('needsStretch: 1× and near-1× are not worth a pass; anything else is', () => {
    expect(needsStretch(1)).toBe(false);
    expect(needsStretch(1.0005)).toBe(false);
    expect(needsStretch(1.25)).toBe(true);
    expect(needsStretch(0.5)).toBe(true);
    expect(needsStretch(0)).toBe(false);
    expect(needsStretch(Number.NaN)).toBe(false);
  });

  it('stretchedFrames is the timeline length of the span', () => {
    expect(stretchedFrames(48000, 2)).toBe(24000);
    expect(stretchedFrames(48000, 0.5)).toBe(96000);
    expect(stretchedFrames(0, 1.5)).toBe(0);
  });

  it('resampleLinear (fallback) keeps the length contract and interpolates', async () => {
    const ch = Float32Array.from({ length: 10 }, (_, i) => i);
    const [out] = await resampleLinear({ channels: [ch], sampleRate: 10, rate: 2 });
    expect(out!.length).toBe(5);
    expect(Array.from(out!)).toEqual([0, 2, 4, 6, 8]);
    const [half] = await resampleLinear({ channels: [ch], sampleRate: 10, rate: 0.5 });
    expect(half!.length).toBe(20);
    expect(half![1]).toBeCloseTo(0.5, 6);
  });
});

describe('tiled stretch', () => {
  it('under one tile: exactly one call, output untouched', async () => {
    let calls = 0;
    const impl: TimeStretch = async (i) => {
      calls++;
      return positional(i);
    };
    const ch = Float32Array.from({ length: 100 }, (_, i) => i);
    const [out] = await tiledStretch(impl, 1, 0.1)({ channels: [ch], sampleRate: 100, rate: 2 });
    expect(calls).toBe(1);
    expect(out!.length).toBe(50);
  });

  it('long input: tiles overlap, seams cross-fade, total length matches the whole-span math', async () => {
    const sr = 100;
    const ch = Float32Array.from({ length: 1000 }, (_, i) => i); // 10 s
    const seen: number[] = [];
    const impl: TimeStretch = async (i) => {
      seen.push(i.channels[0]!.length);
      return positional(i);
    };
    const rate = 1.25;
    const [out] = await tiledStretch(impl, 3, 0.5)({ channels: [ch], sampleRate: sr, rate });
    expect(out!.length).toBe(stretchedFrames(1000, rate));
    expect(seen.length).toBeGreaterThan(1);
    // Every output sample is close to its source position — a bad seam would jump by a tile.
    for (let k = 0; k < out!.length; k++) expect(Math.abs(out![k]! - k * rate)).toBeLessThan(3);
    // Monotonic: the cross-fade never runs time backwards
    for (let k = 1; k < out!.length; k++) expect(out![k]!).toBeGreaterThanOrEqual(out![k - 1]! - 1e-6);
  });

  it('stereo: both channels stretched, second channel independent', async () => {
    const l = Float32Array.from({ length: 700 }, (_, i) => i);
    const r = Float32Array.from({ length: 700 }, (_, i) => -i);
    const out = await tiledStretch(positional, 2, 0.2)({ channels: [l, r], sampleRate: 100, rate: 0.5 });
    expect(out.length).toBe(2);
    expect(out[0]!.length).toBe(1400);
    expect(out[1]!.length).toBe(1400);
    expect(out[1]![600]).toBeLessThan(0);
    expect(out[0]![600]).toBeGreaterThan(0);
  });
});
