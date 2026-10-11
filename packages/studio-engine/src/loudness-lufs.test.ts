import { describe, expect, it } from 'vitest';
import { integratedLoudness, LoudnessMeter, loudnessGainDb } from './loudness-lufs';
const sine = (seconds: number, peak: number, rate = 48000, hz = 997) => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => peak * Math.sin(2 * Math.PI * hz * i / rate));

it('matches the BS.1770 reference: a full-scale 997 Hz sine reads -3.01 LUFS in one channel and 0 in two', () => {
  const tone = sine(5, 1);
  expect(integratedLoudness([tone], 48000)).toBeCloseTo(-3.01, 1);
  expect(integratedLoudness([tone, tone], 48000)).toBeCloseTo(0, 1);
  expect(integratedLoudness([sine(5, 10 ** (-20 / 20))], 48000)).toBeCloseTo(-23.01, 1);
  // Rate-correct filters: the same tone at 44.1 kHz reads the same.
  expect(integratedLoudness([sine(5, 1, 44100)], 44100)).toBeCloseTo(-3.01, 1);
});

it('returns -Infinity for silence or too-short input, and gating ignores long silence', () => {
  expect(integratedLoudness([new Float32Array(48000 * 3)], 48000)).toBe(-Infinity);
  expect(integratedLoudness([sine(.2, 1)], 48000)).toBe(-Infinity);
  expect(integratedLoudness([sine(5, 1, 1000, 100)], 1000)).toBe(-Infinity);
  const speechThenSilence = new Float32Array(48000 * 30); speechThenSilence.set(sine(5, .1));
  // Only the few blocks straddling the tone's end count toward the gated mean (within 0.3 LU).
  expect(Math.abs(integratedLoudness([speechThenSilence], 48000) - integratedLoudness([sine(5, .1)], 48000))).toBeLessThan(.3);
});

it('bounds the master gain and gives none for silence', () => {
  expect(loudnessGainDb(-35.5)).toBe(19.5);
  expect(loudnessGainDb(-60)).toBe(24);
  expect(loudnessGainDb(-2)).toBe(-12);
  expect(loudnessGainDb(-Infinity)).toBeNull();
});

describe('LoudnessMeter', () => {
  it('gives the same loudness fed in chunks as in one piece', () => {
    const rate = 48000; const seconds = 3;
    const tone = (gain: number) => Float32Array.from({ length: rate * seconds }, (_, i) => gain * Math.sin(2 * Math.PI * 997 * i / rate) * (i < rate ? 0.2 : 1));
    const left = tone(0.5); const right = tone(0.3);
    const whole = integratedLoudness([left, right], rate);
    const meter = new LoudnessMeter(rate, 2);
    for (let at = 0; at < left.length; at += 4096 + 7) meter.push([left.subarray(at, at + 4096 + 7), right.subarray(at, at + 4096 + 7)]);
    expect(meter.integrated()).toBeCloseTo(whole, 6);
    expect(Number.isFinite(whole)).toBe(true);
  });
});
