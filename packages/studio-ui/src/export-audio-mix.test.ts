import { describe, expect, it } from 'vitest';
import { softClip } from './export-audio-mix';

describe('导出软限幅', () => {
  it('拐点以下逐字不动:正常素材完全不经手', () => {
    for (const v of [0, 0.05, -0.3, 0.5, 0.79, -0.8, 0.8]) expect(softClip(v)).toBe(v);
  });

  it('拐点以上压向 1.0 但永不越界,也不压成平顶(硬 clamp 的方波=爆音)', () => {
    expect(softClip(0.9)).toBeGreaterThan(0.8);
    expect(softClip(0.9)).toBeLessThan(1);
    expect(softClip(4)).toBeLessThan(1);
    expect(softClip(1e6)).toBeLessThanOrEqual(1);
    // 峰越大结果越大:平顶会让两个不同的峰输出同一个值(信息被抹平=失真)
    expect(softClip(2)).toBeGreaterThan(softClip(1.2));
    expect(softClip(1.2)).toBeGreaterThan(softClip(1));
  });

  it('奇对称 + 拐点处斜率连续(接不上会自己产生一个折角)', () => {
    for (const v of [0.85, 1.4, 3]) expect(softClip(-v)).toBeCloseTo(-softClip(v), 12);
    const e = 1e-6;
    const slopeBelow = (softClip(0.8) - softClip(0.8 - e)) / e;
    const slopeAbove = (softClip(0.8 + e) - softClip(0.8)) / e;
    expect(slopeAbove).toBeCloseTo(slopeBelow, 4);
  });
});

// ---------------------------------------------------------------------------
// Speed → pitch-preserving pre-stretch (audio-clip path; narration segments share the seam)
// ---------------------------------------------------------------------------

import { MIX_CH, MIX_RATE, type MixPcmBuffer, mixAudioTrack } from './export-audio-mix';
import type { TimeStretch } from './time-stretch';

function pcm(len: number, fill: (i: number) => number, sampleRate = MIX_RATE): MixPcmBuffer {
  const ch = Float32Array.from({ length: len }, (_, i) => fill(i));
  return { sampleRate, length: len, numberOfChannels: 1, getChannelData: () => ch };
}

async function renderMix(args: Omit<Parameters<typeof mixAudioTrack>[0], 'push' | 'segs' | 'audioTracks'>): Promise<Float32Array> {
  const out: Float32Array[] = [];
  await mixAudioTrack({
    segs: [],
    audioTracks: new Map(),
    ...args,
    push: async (sample) => {
      const data = new Float32Array(sample.numberOfFrames * MIX_CH);
      sample.copyTo(data, { planeIndex: 0, format: 'f32' });
      out.push(data);
      sample.close();
    },
  });
  const total = out.reduce((n, a) => n + a.length, 0);
  const all = new Float32Array(total);
  let o = 0;
  for (const a of out) {
    all.set(a, o);
    o += a.length;
  }
  return all;
}

describe('导出混音:变速走保音调拉伸', () => {
  const clip = { id: 'a', src: 'x', durationSec: 2, volumeDb: 0, fadeInSec: 0, fadeOutSec: 0 };

  it('speed=1 不调用 stretch,按原样读', async () => {
    let calls = 0;
    const stretch: TimeStretch = async (i) => {
      calls++;
      return i.channels;
    };
    const buf = pcm(MIX_RATE * 2, () => 0.25);
    const mixed = await renderMix({ clips: [{ clip, buffer: buf }], totalSec: 2, stretch });
    expect(calls).toBe(0);
    expect(mixed[MIX_CH * 1000]).toBeCloseTo(0.25, 4);
  });

  it('speed=2 调用 stretch 一次,拿 [inSec,outSec) 的源 PCM,rate=speed;输出按时间线长度落位', async () => {
    const seen: { frames: number; rate: number; sampleRate: number }[] = [];
    // Fake stretch: constant 0.5 for the stretched length (a real one keeps pitch; here we only check plumbing)
    const stretch: TimeStretch = async (i) => {
      seen.push({ frames: i.channels[0]!.length, rate: i.rate, sampleRate: i.sampleRate });
      const n = Math.round(i.channels[0]!.length / i.rate);
      return i.channels.map(() => new Float32Array(n).fill(0.5));
    };
    const buf = pcm(MIX_RATE * 2, () => 0.25);
    const mixed = await renderMix({ clips: [{ clip: { ...clip, speed: 2 }, buffer: buf }], totalSec: 2, stretch });
    expect(seen).toEqual([{ frames: MIX_RATE * 2, rate: 2, sampleRate: MIX_RATE }]);
    // The 2 s clip at 2× occupies the first second only: stretched PCM inside, silence after.
    expect(mixed[MIX_CH * Math.round(MIX_RATE * 0.5)]).toBeCloseTo(0.5, 4);
    expect(mixed[MIX_CH * Math.round(MIX_RATE * 1.5)]).toBeCloseTo(0, 6);
  });

  it('inSec/outSec 裁剪后只拉伸裁剪段,且尊重源采样率', async () => {
    const seen: { frames: number; sampleRate: number }[] = [];
    const stretch: TimeStretch = async (i) => {
      seen.push({ frames: i.channels[0]!.length, sampleRate: i.sampleRate });
      const n = Math.round(i.channels[0]!.length / i.rate);
      return i.channels.map(() => new Float32Array(n).fill(0.3));
    };
    const sr = 44100;
    const buf = pcm(sr * 4, () => 0.25, sr);
    await renderMix({ clips: [{ clip: { ...clip, durationSec: 4, inSec: 1, outSec: 3, speed: 0.5 }, buffer: buf }], totalSec: 4, stretch });
    expect(seen).toEqual([{ frames: sr * 2, sampleRate: sr }]);
  });
});

// ---------------------------------------------------------------------------
// Whole-mix loudness: master gain + lookahead limiter
// ---------------------------------------------------------------------------

import { MasterLimiter } from './export-audio-mix';
import { exportNeedsTimelineMix } from './client-export';

const CEILING = 10 ** (-1.5 / 20);
const peakOf = (pcm: Float32Array) => { let peak = 0; for (const v of pcm) peak = Math.max(peak, Math.abs(v)); return peak; };
const stereo = (frames: number, fill: (i: number) => number) => { const out = new Float32Array(frames * MIX_CH); for (let i = 0; i < frames; i++) out[i * MIX_CH] = out[i * MIX_CH + 1] = fill(i); return out; };
const run = (limiter: MasterLimiter, input: Float32Array, chunk: number) => {
  const parts: Float32Array[] = [];
  for (let o = 0; o < input.length; o += chunk * MIX_CH) parts.push(limiter.process(input.subarray(o, o + chunk * MIX_CH)).slice());
  parts.push(limiter.flush().slice());
  const all = new Float32Array(parts.reduce((n, a) => n + a.length, 0)); let o = 0; for (const a of parts) { all.set(a, o); o += a.length; }
  return all;
};

describe('whole-mix loudness master', () => {
  it('passes quiet material through at exactly the master gain, frame-aligned and complete', () => {
    const input = stereo(MIX_RATE, (i) => .05 * Math.sin(i / 7));
    const out = run(new MasterLimiter(2), input, 4800);
    expect(out.length).toBe(input.length);
    for (let i = 0; i < input.length; i += 97) expect(out[i]).toBeCloseTo(input[i]! * 2, 6);
  });

  it('never exceeds the ceiling, chunk boundaries included, and chunking does not change the result', () => {
    // Loud bursts straddling chunk edges, +12 dB of master gain on top.
    const input = stereo(MIX_RATE * 2, (i) => (Math.floor(i / 3000) % 3 === 0 ? .9 : .1) * Math.sin(i / 5));
    const whole = run(new MasterLimiter(4), input, MIX_RATE * 2);
    const chunked = run(new MasterLimiter(4), input, 1000);
    expect(chunked.length).toBe(input.length);
    expect(peakOf(chunked)).toBeLessThanOrEqual(CEILING + 1e-6);
    for (let i = 0; i < whole.length; i += 53) expect(chunked[i]).toBeCloseTo(whole[i]!, 6);
    // The limiter gains down rather than clipping: the loud bursts stay below the ceiling by a margin most of the time.
    let clamped = 0; for (const v of chunked) if (Math.abs(v) >= CEILING - 1e-6) clamped++;
    expect(clamped / chunked.length).toBeLessThan(.01);
  });

  it('runs through the mixer in place of the soft clip, keeping the programme length', async () => {
    const clip = { id: 'a', src: 'x', durationSec: 2.5, volumeDb: 0, fadeInSec: 0, fadeOutSec: 0 };
    const buf = pcm(Math.round(MIX_RATE * 2.5), (i) => .5 * Math.sin(i / 4));
    const mixed = await renderMix({ clips: [{ clip, buffer: buf }], totalSec: 2.5, master: { gainDb: 12 } });
    expect(mixed.length).toBe(Math.ceil(2.5 * MIX_RATE) * MIX_CH);
    expect(peakOf(mixed)).toBeLessThanOrEqual(CEILING + 1e-6);
    expect(peakOf(mixed)).toBeGreaterThan(CEILING * .9);
  });

  it('sends plain 1× narration through the mixer only when the document sets a loudness', () => {
    const plain = { loudness: false, clips: false, visualVideos: 0, tones: 0, clipMaskBeep: false, unencodableSource: false, retimed: false };
    expect(exportNeedsTimelineMix(plain)).toBe(false);
    expect(exportNeedsTimelineMix({ ...plain, loudness: true })).toBe(true);
  });
});
