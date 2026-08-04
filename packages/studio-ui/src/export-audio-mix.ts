/**
 * Export audio mixing (only engaged when audio tracks exist — without any, client-export keeps
 * its untouched passthrough/scale path, zero regression).
 *
 * Grid: everything lands on one 48 kHz stereo f32 timeline. Narration segments are pulled from
 * their MediaBunny sample streams sequentially (per-source monotonic, same discipline as the
 * video side), linearly resampled onto the grid with per-shot gain; each audio clip is read from
 * its decoded AudioBuffer through the SAME audioClipGainAt/audioClipSrcTimeAt math the preview
 * uses (per-clip envelope precomputed at 100 Hz, speed = linear resample → pitch shifts, matching
 * the preview's preservesPitch=false). Sum → clamp → 1 s AudioSamples.
 *
 * Numeric scale note: at typical clip levels plus speech the sum rarely exceeds [-1, 1], but lane clips can
 * be boosted well past source level, so the summed buffer goes through a soft limiter (softClip) instead of
 * a hard clamp — no lookahead, it just bends the top instead of squaring it off.
 */

import { AudioSample, AudioSampleSink } from 'mediabunny';
import type { InputAudioTrack } from 'mediabunny';
import { type AudioClip, audioClipGainAt, audioClipSrcTimeAt } from '@pireel/studio-engine/composition';
import {
  segmentSourceRate,
  segmentSourceTimeAt,
  segmentTimelineEnd,
  segmentTimelineStart,
} from './video-segment-time';

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
  buffer: AudioBuffer;
}

/** Mix narration segments + audio clips into the output audio track. push receives ready samples in order. */
export async function mixAudioTrack(args: {
  segs: MixSeg[];
  /** Per-source audio track (absent = source has no audio). */
  audioTracks: Map<string, InputAudioTrack>;
  clips: MixAudioClip[];
  totalSec: number;
  push: (sample: AudioSample) => Promise<void>;
}): Promise<void> {
  const { segs, audioTracks, clips, totalSec, push } = args;
  // Per-source sequential readers spanning that source's full used range
  const readers = new Map<string, PcmStream>();
  for (const [key, track] of audioTracks) {
    const mine = segs.filter((s) => s.key === key && s.gain > 0);
    if (!mine.length) continue;
    const from = Math.min(...mine.map((s) => s.srcStart));
    const to = Math.max(...mine.map((s) => s.srcEnd));
    readers.set(key, new PcmStream(track, Math.max(0, from - 0.1), to + 0.1));
  }
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
  // Per-clip envelope precompute (same audioClipGainAt as preview)
  const envs = clips.map(({ clip }) => {
    const env = new Float32Array(Math.ceil(totalSec * ENV_RATE) + 2);
    for (let i = 0; i < env.length; i++) env[i] = audioClipGainAt(clip, i / ENV_RATE, totalSec);
    return env;
  });

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
      const reader = readers.get(s.key);
      if (!reader || s.gain <= 0) continue;
      const outOffset = Math.round((a - t0) * MIX_RATE);
      const n = Math.min(frames - outOffset, Math.round((b - a) * MIX_RATE));
      if (n <= 0) continue;
      const localAt = a - segStarts[i]!; // segment-local seconds where this chunk slice starts
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
