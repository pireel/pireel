import type { SfxIntensity } from './sfx-library';
export const SFX_MIX_VERSION = 'speech-relative-2';
export interface SpeechLevelProfile { rms: Float32Array; peaks: Float32Array; durationSec: number; referenceRms: number }
const percentile = (values: number[], q: number) => values.length ? values.sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))] : 0;
/** Stereo-safe energy and 1ms peak bounds, without retaining a second full audio buffer. */
export function speechLevelProfile(channels: readonly Float32Array[], sampleRate: number): SpeechLevelProfile {
  if (!channels.length || !(sampleRate > 0) || !channels[0].length) throw new Error('无法分析原声音量。');
  const length = channels[0].length; const rms = new Float32Array(Math.ceil(length / sampleRate * 10)); const counts = new Uint32Array(rms.length);
  const peaks = new Float32Array(Math.ceil(length / sampleRate * 1000));
  for (let i = 0; i < length; i++) {
    const r = Math.floor(i / sampleRate * 10); const p = Math.floor(i / sampleRate * 1000);
    for (const channel of channels) {
      const value = Number.isFinite(channel[i]) ? channel[i] : 0;
      rms[r] += value * value; counts[r]++; peaks[p] = Math.max(peaks[p], Math.abs(value));
    }
  }
  for (let i = 0; i < rms.length; i++) rms[i] = Math.sqrt(rms[i] / Math.max(1, counts[i]));
  return { rms, peaks, durationSec: length / sampleRate, referenceRms: percentile(Array.from(rms).filter(value => value > .003), .65) || .04 };
}
export function normalizeSound(pcm: Float32Array, rate: number, maxDurationSec = 1.5): Float32Array {
  if (!pcm.length) throw new Error('音效文件为空。');
  let mean = 0; for (const value of pcm) { if (!Number.isFinite(value)) throw new Error('音效采样无效。'); mean += value; } mean /= pcm.length;
  let peak = 0; for (const value of pcm) peak = Math.max(peak, Math.abs(value - mean));
  if (peak < .0001) throw new Error('音效文件没有可用声音。');
  const threshold = peak * .006; let first = 0; let last = pcm.length - 1;
  while (first < last && Math.abs(pcm[first] - mean) < threshold) first++;
  while (last > first && Math.abs(pcm[last] - mean) < threshold) last--;
  first = Math.max(0, first - Math.round(rate * .003)); last = Math.min(pcm.length - 1, last + Math.round(rate * .02));
  const count = Math.min(last - first + 1, Math.round(rate * maxDurationSec));
  const result = new Float32Array(Math.max(Math.ceil(rate * .22), count));
  for (let i = 0; i < count; i++) {
    const edge = Math.min(1, i / Math.max(1, rate * .003), (count - 1 - i) / Math.max(1, rate * .012));
    result[i] = (pcm[first + i] - mean) * .75 / peak * Math.max(0, edge);
  }
  return result;
}
function activeRms(pcm: Float32Array) {
  let peak = 0; for (const value of pcm) peak = Math.max(peak, Math.abs(value));
  let sum = 0; let count = 0;
  for (const value of pcm) if (Math.abs(value) > peak * .08) { sum += value * value; count++; }
  return Math.sqrt(sum / Math.max(1, count));
}
/** Bake the level and headroom envelope into the SFX file. Preview/export read the same samples. */
export function mixSoundToSpeech(pcm: Float32Array, rate: number, profile: SpeechLevelProfile, startSec: number, intensity: SfxIntensity, reserved = new Float32Array(profile.peaks.length), maxDurationSec = 1.5) {
  const normalized = normalizeSound(pcm, rate, maxDurationSec);
  const nearby = Array.from(profile.rms.slice(Math.max(0, Math.floor((startSec - 1) * 10)), Math.ceil((startSec + 1.5) * 10))).filter(value => value > .003);
  // The level follows the recording: nearby speech, but not below half its typical level, so an
  // effect in a pause stays audible. No absolute floor: it put effects over quiet recordings' speech.
  const speechRms = Math.max(percentile(nearby, .65) || profile.referenceRms, profile.referenceRms * .5);
  const ratio = { gentle: .4, normal: .6, emphasis: .85 }[intensity];
  const targetRms = Math.min(.16, speechRms * ratio);
  const gain = Math.min(4, targetRms / Math.max(.0001, activeRms(normalized)));
  const length = Math.min(normalized.length, Math.max(0, Math.floor((profile.durationSec - startSec) * rate)));
  if (length < rate * .2) throw new Error('音效位置过于接近视频结尾。');
  const mixed = new Float32Array(length); const blocks = Math.ceil(length / rate * 1000); const contributions = new Float32Array(blocks + 2); let envelope = 1; let limitedBlocks = 0;
  for (let b = 0; b < blocks; b++) {
    const from = Math.floor(b * rate / 1000); const end = Math.min(length, Math.floor((b + 1) * rate / 1000));
    let wantedPeak = 0; for (let i = from; i < end; i++) wantedPeak = Math.max(wantedPeak, Math.abs(normalized[i] * gain));
    // Cover both source millisecond buckets touched by this output block, including lookahead.
    const p = Math.max(0, Math.floor(startSec * 1000 + b));
    const sourcePeak = Math.max(profile.peaks[p] ?? 0, profile.peaks[p + 1] ?? 0, profile.peaks[p + 2] ?? 0);
    const used = Math.max(reserved[p] ?? 0, reserved[p + 1] ?? 0);
    const limit = Math.min(1, Math.max(0, .96 - sourcePeak - used) / Math.max(.00001, wantedPeak));
    envelope = Math.min(limit, envelope + (1 - envelope) * .04); if (envelope < .999) limitedBlocks++;
    let peak = 0; for (let i = from; i < end; i++) { mixed[i] = normalized[i] * gain * envelope; peak = Math.max(peak, Math.abs(mixed[i])); }
    contributions[b] = Math.max(contributions[b], peak); contributions[b + 1] = Math.max(contributions[b + 1], peak);
  }
  const base = Math.floor(startSec * 1000);
  for (let i = 0; i < contributions.length && base + i < reserved.length; i++) reserved[base + i] += contributions[i];
  return { pcm: mixed, gainDb: 20 * Math.log10(Math.max(.00001, gain)), speechRms, targetRms, outputRms: activeRms(mixed), limitedBlocks };
}
