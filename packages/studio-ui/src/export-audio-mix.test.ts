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
