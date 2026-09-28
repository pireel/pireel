import { expect, it } from 'vitest';
import { mixSoundToSpeech, speechLevelProfile, normalizeSound } from './sfx-mix';
const sine = (seconds: number, level: number, rate = 48000, hz = 440) => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => level * Math.sin(2 * Math.PI * hz * i / rate));
const rms = (pcm: Float32Array) => Math.sqrt(pcm.reduce((sum, n) => sum + n * n, 0) / pcm.length);
it('normalizes source files and adapts effects to nearby narration instead of copying a fixed dB', () => {
  const quiet = speechLevelProfile([sine(4, .06)], 48000); const loud = speechLevelProfile([sine(4, .3)], 48000);
  const sound = sine(.3, .5, 48000, 900); const a = mixSoundToSpeech(sound, 48000, quiet, 1, 'normal'); const b = mixSoundToSpeech(sound, 48000, loud, 1, 'normal');
  expect(rms(b.pcm)).toBeGreaterThan(rms(a.pcm) * 2); expect(b.speechRms).toBeGreaterThan(a.speechRms);
  const quieterAsset = sound.map(n => n * .1); const c = mixSoundToSpeech(quieterAsset, 48000, loud, 1, 'normal');
  expect(rms(c.pcm)).toBeCloseTo(rms(b.pcm), 4);
  expect(rms(b.pcm)).toBeGreaterThan(rms(sound) * 10 ** (-24 / 20) * 2);
});
it('leaves measurable headroom even when narration and overlapping effects are loud', () => {
  const source = sine(3, .92); const profile = speechLevelProfile([source, source.map(n => n * -.8)], 48000); const reserved = new Float32Array(profile.peaks.length);
  const one = mixSoundToSpeech(sine(.4, .9), 48000, profile, 1, 'emphasis', reserved);
  const two = mixSoundToSpeech(sine(.4, .9, 48000, 800), 48000, profile, 1, 'emphasis', reserved);
  expect(one.limitedBlocks).toBeGreaterThan(0);
  for (let i = 0; i < one.pcm.length; i++) expect(Math.abs(source[48000 + i]) + Math.abs(one.pcm[i]) + Math.abs(two.pcm[i])).toBeLessThanOrEqual(.961);
});
it('uses surrounding speech for pauses, separates intensity, and rejects broken assets', () => {
  const source = sine(4, .2); source.fill(0, 48000, 72000); const profile = speechLevelProfile([source], 48000);
  const sound = sine(.25, .5); const gentle = mixSoundToSpeech(sound, 48000, profile, 1, 'gentle'); const emphasis = mixSoundToSpeech(sound, 48000, profile, 1, 'emphasis');
  expect(emphasis.outputRms).toBeGreaterThan(gentle.outputRms); expect(gentle.speechRms).toBeGreaterThan(.05);
  expect(() => normalizeSound(new Float32Array(500), 48000)).toThrow();
  expect(() => normalizeSound(new Float32Array([NaN]), 48000)).toThrow();
  expect(normalizeSound(sine(.1, .1), 48000).length).toBeGreaterThanOrEqual(.2 * 48000);
});
