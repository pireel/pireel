/**
 * Export audio mixing (only engaged when audio tracks exist — without any, client-export keeps
 * its untouched passthrough/scale path, zero regression).
 *
 * Grid: everything lands on one 48 kHz stereo f32 timeline. Narration segments are pulled from
 * their MediaBunny sample streams sequentially (per-source monotonic, same discipline as the
 * video side), linearly resampled onto the grid with per-shot gain; each audio clip is read from
 * its decoded AudioBuffer through the SAME audioClipGainAt/audioClipSrcTimeAt math the preview
 * uses (per-clip envelope precomputed at 100 Hz). Sum → clamp → 1 s AudioSamples.
 *
 * Speed (a narration segment placed at a non-1× rate, an audio clip with speed ≠ 1) is a
 * pitch-preserving time stretch (time-stretch.ts), baked in a pre-pass: the retimed span is read
 * once at 1×, stretched to its timeline length, and the chunk loop then reads that PCM at 1×. The
 * preview plays the same material through the browser's preservesPitch stretch, so both ends keep
 * the voice's pitch; the old linear resample (pitch follows the rate) remains only as the fallback
 * when no worklet can run.
 *
 * Numeric scale note: at typical clip levels plus speech the sum rarely exceeds [-1, 1], but lane clips can
 * be boosted well past source level, so the summed buffer goes through a soft limiter (softClip) instead of
 * a hard clamp — no lookahead, it just bends the top instead of squaring it off.
 */

import { AudioSample, AudioSampleSink } from 'mediabunny';
import type { InputAudioTrack } from 'mediabunny';
import { type AudioClip, audioClipDefaults, audioClipGainAt, audioClipSrcTimeAt } from '@pireel/studio-engine/composition';
import { type MaskedAudioRange, maskedAudioAt } from '@pireel/studio-engine/word-masks';
import {
  segmentSourceRate,
  segmentSourceTimeAt,
  segmentTimelineEnd,
  segmentTimelineStart,
} from './video-segment-time';
import { type TimeStretch, defaultTimeStretch, needsStretch } from './time-stretch';

export const MIX_RATE = 48000;
export const MIX_CH = 2;
const CHUNK_SEC = 1;
const ENV_RATE = 100; // per-clip envelope precompute grid (fades are ≥0.1s scale — 10 ms is plenty)

/** Where the soft limiter starts bending the signal (linear). Below it nothing is touched at all — most
 *  material never reaches -1.9 dBFS — above it the curve approaches 1.0 asymptotically instead of the flat
 *  top a hard clamp produces. A clamp turns a peak into a square edge, and squares are buzz; this loses a
 *  little of the peak's shape instead. The knee is C1-continuous (slope 1 on both sides), so nothing kinks. */
const SOFT_KNEE = 0.8;
export function softClip(v: number): number {
  const a = v < 0 ? -v : v;
  if (a <= SOFT_KNEE) return v;
  const shaped = SOFT_KNEE + (1 - SOFT_KNEE) * (1 - Math.exp(-(a - SOFT_KNEE) / (1 - SOFT_KNEE)));
  return v < 0 ? -shaped : shaped;
}

export interface MixSeg {
  srcStart: number;
  srcEnd: number;
  key: string;
  timelineStart?: number;
  timelineEnd?: number;
  /** Linear per-shot gain (shotGain); 0 = contributes nothing. */
  gain: number;
  /** Segment-local fade factor (shotFadeAt); absent = flat. */
  fadeAt?: (tLocal: number) => number;
}

/** Sequential PCM reader over one source's audio samples: monotonic srcT only (matches how the
 *  edited timeline walks each source), linear resample to the mix grid, mono→stereo spread,
 *  >2ch keeps the first two. Gaps in the sample stream read as silence. */
class PcmStream {
  private it: AsyncIterator<AudioSample>;
  private cur: { data: Float32Array; start: number; rate: number; ch: number; frames: number } | null = null;
  private done = false;

  constructor(track: InputAudioTrack, from: number, to: number) {
    this.it = new AudioSampleSink(track).samples(from, to)[Symbol.asyncIterator]();
  }

  private async advanceTo(srcT: number): Promise<void> {
    while (!this.done && (!this.cur || srcT >= this.cur.start + this.cur.frames / this.cur.rate)) {
      const { value, done } = await this.it.next();
      if (done || !value) {
        this.done = true;
        return;
      }
      const data = new Float32Array(value.numberOfFrames * value.numberOfChannels);
      value.copyTo(data, { planeIndex: 0, format: 'f32' });
      this.cur = { data, start: value.timestamp, rate: value.sampleRate, ch: value.numberOfChannels, frames: value.numberOfFrames };
      value.close();
    }
  }

  /** Add this source's PCM over [srcT0, srcT0 + frames/MIX_RATE) into out (interleaved stereo) at outOffset frames. */
  async read(
    srcT0: number,
    frames: number,
    out: Float32Array,
    outOffset: number,
    gainAt: (k: number) => number,
    sourceRate = 1,
  ): Promise<void> {
    for (let k = 0; k < frames; k++) {
      const gain = gainAt(k);
      if (gain <= 0) continue;
      const srcT = srcT0 + k / MIX_RATE * sourceRate;
      await this.advanceTo(srcT);
      const c = this.cur;
      if (!c || srcT < c.start) continue; // gap → silence
      const f = (srcT - c.start) * c.rate;
      const i0 = Math.min(c.frames - 1, Math.floor(f));
      const i1 = Math.min(c.frames - 1, i0 + 1);
      const frac = Math.min(1, Math.max(0, f - i0));
      const o = (outOffset + k) * MIX_CH;
      for (let ch = 0; ch < MIX_CH; ch++) {
        const sc = c.ch === 1 ? 0 : Math.min(ch, c.ch - 1);
        const v0 = c.data[i0 * c.ch + sc]!;
        const v1 = c.data[i1 * c.ch + sc]!;
        out[o + ch]! += (v0 + (v1 - v0) * frac) * gain;
      }
    }
  }
}

export interface MixAudioClip {
  clip: AudioClip;
  /** Decoded media (decodeAudioData at any rate — read generically). */
  buffer: MixPcmBuffer;
  /** Word masks on this clip's source (source seconds): silenced in the envelope, beeps become tones. */
  masks?: readonly MaskedAudioRange[];
}

/** The slice of AudioBuffer the mixer reads — so tests (and pre-stretched PCM) can stand in for one. */
export interface MixPcmBuffer {
  sampleRate: number;
  length: number;
  numberOfChannels: number;
  getChannelData(ch: number): Float32Array;
}

function planarBuffer(channels: Float32Array[], sampleRate: number): MixPcmBuffer {
  return {
    sampleRate,
    length: channels[0]?.length ?? 0,
    numberOfChannels: channels.length,
    getChannelData: (ch) => channels[Math.min(ch, channels.length - 1)] ?? new Float32Array(0),
  };
}

/** Speed ≠ 1 clips play from a pre-stretched copy of their [inSec, outSec) span at 1×: the clip
 *  handed to audioClipSrcTimeAt is neutralised (speed 1, span = stretched length) while the ORIGINAL
 *  clip keeps driving the gain envelope (its timeline span already accounts for the speed). */
async function prestretchClip(entry: MixAudioClip, stretch: TimeStretch): Promise<MixAudioClip> {
  const d = audioClipDefaults(entry.clip);
  if (!needsStretch(d.speed)) return entry;
  const { buffer } = entry;
  const rate = buffer.sampleRate;
  const i0 = Math.max(0, Math.min(buffer.length, Math.round(d.inSec * rate)));
  const i1 = Math.max(i0, Math.min(buffer.length, Math.round(d.outSec * rate)));
  const channels = Array.from({ length: Math.max(1, Math.min(2, buffer.numberOfChannels)) }, (_, c) =>
    buffer.getChannelData(c).subarray(i0, i1),
  );
  const out = await stretch({ channels, sampleRate: rate, rate: d.speed });
  const outFrames = out[0]?.length ?? 0;
  return {
    clip: { ...entry.clip, speed: 1, inSec: 0, outSec: outFrames / rate },
    buffer: planarBuffer(out, rate),
  };
}

/** A synthesized tone on the timeline (word masks: the beep that replaces a muted word). */
export interface MixTone {
  timelineStart: number;
  timelineEnd: number;
}

/** Classic censor tone: 1 kHz sine, well below full scale, with short edge ramps so it never clicks. */
export const TONE_HZ = 1000;
export const TONE_LEVEL = 0.22;
export const TONE_RAMP_SEC = 0.008;

function toneGainAt(tone: MixTone, t: number): number {
  const local = t - tone.timelineStart;
  const len = tone.timelineEnd - tone.timelineStart;
  if (local < 0 || local >= len) return 0;
  const ramp = Math.min(TONE_RAMP_SEC, len / 2);
  if (local < ramp) return local / ramp;
  if (len - local < ramp) return (len - local) / ramp;
  return 1;
}

/** Mix narration segments + audio clips into the output audio track. push receives ready samples in order. */
export async function mixAudioTrack(args: {
  segs: MixSeg[];
  /** Per-source audio track (absent = source has no audio). */
  audioTracks: Map<string, InputAudioTrack>;
  clips: MixAudioClip[];
  totalSec: number;
  push: (sample: AudioSample) => Promise<void>;
  /** Pitch-preserving retime for speed ≠ 1 material; defaults to Signalsmith with a resample fallback. */
  stretch?: TimeStretch;
  /** Synthesized tones added on top of the mix (beeped words). */
  tones?: MixTone[];
}): Promise<void> {
  const { segs, audioTracks, totalSec, push } = args;
  const tones = [...(args.tones ?? [])];
  const stretch = args.stretch ?? defaultTimeStretch;
  // Native timeline starts; missing values retain the legacy contiguous fallback.
  const segStarts: number[] = [];
  const segEnds: number[] = [];
  let cursor = 0;
  for (const s of segs) {
    const start = segmentTimelineStart(s, cursor);
    const end = segmentTimelineEnd(s, start);
    segStarts.push(start);
    segEnds.push(end);
    cursor = end;
  }
  // Pre-pass: retimed narration segments are read once at 1× through their own short-lived stream
  // (keeps the shared per-source readers monotonic) and stretched to their timeline length.
  const stretchedSegs = new Map<number, Float32Array[]>();
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    const track = audioTracks.get(s.key);
    if (!track || s.gain <= 0) continue;
    const rate = segmentSourceRate(s, segStarts[i]!, segEnds[i]!);
    if (!needsStretch(rate)) continue;
    const srcFrames = Math.round((s.srcEnd - s.srcStart) * MIX_RATE);
    if (srcFrames <= 0) continue;
    const interleaved = new Float32Array(srcFrames * MIX_CH);
    await new PcmStream(track, Math.max(0, s.srcStart - 0.1), s.srcEnd + 0.1).read(s.srcStart, srcFrames, interleaved, 0, () => 1, 1);
    const channels = Array.from({ length: MIX_CH }, (_, c) => {
      const ch = new Float32Array(srcFrames);
      for (let k = 0; k < srcFrames; k++) ch[k] = interleaved[k * MIX_CH + c]!;
      return ch;
    });
    stretchedSegs.set(i, await stretch({ channels, sampleRate: MIX_RATE, rate }));
  }
  // Per-source sequential readers spanning that source's full used range (1× segments only)
  const readers = new Map<string, PcmStream>();
  for (const [key, track] of audioTracks) {
    const mine = segs.filter((s, i) => s.key === key && s.gain > 0 && !stretchedSegs.has(i));
    if (!mine.length) continue;
    const from = Math.min(...mine.map((s) => s.srcStart));
    const to = Math.max(...mine.map((s) => s.srcEnd));
    readers.set(key, new PcmStream(track, Math.max(0, from - 0.1), to + 0.1));
  }
  // Per-clip envelope precompute (same audioClipGainAt as preview) — from the ORIGINAL clip, whose
  // timeline span already reflects its speed; the read side may swap in a pre-stretched copy.
  const envs = args.clips.map(({ clip, masks }) => {
    const env = new Float32Array(Math.ceil(totalSec * ENV_RATE) + 2);
    for (let i = 0; i < env.length; i++) {
      const t = i / ENV_RATE;
      let g = audioClipGainAt(clip, t, totalSec);
      if (g > 0 && masks?.length) {
        const srcT = audioClipSrcTimeAt(clip, t);
        if (srcT != null && maskedAudioAt(masks, srcT)) g = 0;
      }
      env[i] = g;
    }
    return env;
  });
  // Beeped words on audio-lane clips: their source spans become tones on the timeline (clip speed/trim honoured).
  for (const { clip, masks } of args.clips) {
    if (!masks?.length || clip.muted) continue;
    const d = audioClipDefaults(clip);
    for (const range of masks) {
      if (range.audio !== 'beep') continue;
      const a = Math.max(range.start, d.inSec);
      const b = Math.min(range.end, d.outSec);
      if (b <= a) continue;
      tones.push({ timelineStart: d.startSec + (a - d.inSec) / d.speed, timelineEnd: d.startSec + (b - d.inSec) / d.speed });
    }
  }
  const clips: MixAudioClip[] = [];
  for (const entry of args.clips) clips.push(await prestretchClip(entry, stretch));

  const totalFrames = Math.ceil(totalSec * MIX_RATE);
  const chunkFrames = CHUNK_SEC * MIX_RATE;
  const buf = new Float32Array(chunkFrames * MIX_CH);
  for (let f0 = 0; f0 < totalFrames; f0 += chunkFrames) {
    const frames = Math.min(chunkFrames, totalFrames - f0);
    const t0 = f0 / MIX_RATE;
    buf.fill(0, 0, frames * MIX_CH);

    // Narration: sub-ranges of this chunk per overlapping segment (few per chunk — no per-frame lookup)
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]!;
      const a = Math.max(t0, segStarts[i]!);
      const b = Math.min(t0 + frames / MIX_RATE, segEnds[i]!);
      if (b <= a) continue;
      if (s.gain <= 0) continue;
      const outOffset = Math.round((a - t0) * MIX_RATE);
      const n = Math.min(frames - outOffset, Math.round((b - a) * MIX_RATE));
      if (n <= 0) continue;
      const localAt = a - segStarts[i]!; // segment-local seconds where this chunk slice starts
      const pre = stretchedSegs.get(i);
      if (pre) {
        // Pre-stretched PCM is already on the timeline grid: segment-local frame = timeline offset
        const base = Math.round(localAt * MIX_RATE);
        const len = pre[0]?.length ?? 0;
        for (let k = 0; k < n; k++) {
          const f = base + k;
          if (f >= len) break;
          const gain = s.gain * (s.fadeAt ? s.fadeAt(localAt + k / MIX_RATE) : 1);
          if (gain <= 0) continue;
          const o = (outOffset + k) * MIX_CH;
          for (let ch = 0; ch < MIX_CH; ch++) buf[o + ch]! += (pre[Math.min(ch, pre.length - 1)]![f] ?? 0) * gain;
        }
        continue;
      }
      const reader = readers.get(s.key);
      if (!reader) continue;
      const sourceRate = segmentSourceRate(s, segStarts[i]!, segEnds[i]!);
      await reader.read(
        segmentSourceTimeAt(s, a, segStarts[i]!, segEnds[i]!),
        n,
        buf,
        outOffset,
        (k) => s.gain * (s.fadeAt ? s.fadeAt(localAt + k / MIX_RATE) : 1),
        sourceRate,
      );
    }

    // Beep tones (word masks): pure sine on the timeline grid, phase continuous across chunks
    for (const tone of tones) {
      const a = Math.max(t0, tone.timelineStart);
      const b = Math.min(t0 + frames / MIX_RATE, tone.timelineEnd);
      if (b <= a) continue;
      const k0 = Math.max(0, Math.round((a - t0) * MIX_RATE));
      const k1 = Math.min(frames, Math.round((b - t0) * MIX_RATE));
      for (let k = k0; k < k1; k++) {
        const t = t0 + k / MIX_RATE;
        const g = TONE_LEVEL * toneGainAt(tone, t);
        if (g <= 0) continue;
        const v = Math.sin(2 * Math.PI * TONE_HZ * t) * g;
        const o = k * MIX_CH;
        for (let ch = 0; ch < MIX_CH; ch++) buf[o + ch]! += v;
      }
    }

    // Audio clips (overlaps simply sum)
    for (let ci = 0; ci < clips.length; ci++) {
      const { clip, buffer } = clips[ci]!;
      const env = envs[ci]!;
      const ch0 = buffer.getChannelData(0);
      const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
      const bRate = buffer.sampleRate;
      const bFrames = buffer.length;
      for (let k = 0; k < frames; k++) {
        const t = t0 + k / MIX_RATE;
        const ei = t * ENV_RATE;
        const e0 = Math.min(env.length - 2, Math.floor(ei));
        const g = env[e0]! + (env[e0 + 1]! - env[e0]!) * (ei - e0);
        if (g <= 0) continue;
        const srcT = audioClipSrcTimeAt(clip, t);
        if (srcT == null) continue;
        const p = srcT * bRate;
        const i0 = Math.min(bFrames - 1, Math.floor(p));
        const i1 = Math.min(bFrames - 1, i0 + 1);
        const frac = p - Math.floor(p);
        const o = k * MIX_CH;
        buf[o]! += (ch0[i0]! + (ch0[i1]! - ch0[i0]!) * frac) * g;
        buf[o + 1]! += (ch1[i0]! + (ch1[i1]! - ch1[i0]!) * frac) * g;
      }
    }

    // Soft limit + emit
    const out = buf.subarray(0, frames * MIX_CH).slice();
    for (let i = 0; i < out.length; i++) out[i] = softClip(out[i]!);
    await push(new AudioSample({ data: out, format: 'f32', numberOfChannels: MIX_CH, sampleRate: MIX_RATE, timestamp: t0 }));
  }
}
