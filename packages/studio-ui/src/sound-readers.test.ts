import { describe, expect, it } from 'vitest';
import { monoAtRate, monoResampler } from './audio-decode';
import { peakReader, peaksOf } from './audio-peaks';
import { levelMeter, measureBufferLoudnessDb } from './loudness';

/** The part of AudioBuffer the reducers read. */
function buffer(sampleRate: number, ...channels: Float32Array[]): AudioBuffer {
  return {
    sampleRate, length: channels[0]!.length, duration: channels[0]!.length / sampleRate, numberOfChannels: channels.length,
    getChannelData: (index: number) => channels[index]!,
  } as unknown as AudioBuffer;
}

/** The same samples cut into uneven pieces, as a decoder hands them over. */
function* pieces(channels: Float32Array[]): Generator<Float32Array[]> {
  for (let offset = 0, size = 1; offset < channels[0]!.length; offset += size, size = (size * 7) % 4099 + 1) {
    yield channels.map((channel) => channel.subarray(offset, offset + size));
  }
}

const tone = (sampleRate: number, seconds: number, level: (t: number) => number, hz = 220) =>
  Float32Array.from({ length: Math.round(sampleRate * seconds) }, (_, index) => Math.sin((2 * Math.PI * hz * index) / sampleRate) * level(index / sampleRate));

describe('waveform read in pieces', () => {
  it('draws the same bins as the whole decoded track', () => {
    const left = tone(48_000, 7.3, (t) => 0.1 + 0.8 * Math.abs(Math.sin(t)));
    const right = tone(48_000, 7.3, (t) => 0.6 * Math.abs(Math.cos(t * 2)), 330);
    const reader = peakReader(left.length, 48_000);
    for (const piece of pieces([left, right])) reader.push(piece);
    const whole = peaksOf(buffer(48_000, left, right));
    expect(reader.peaks).toHaveLength(whole.length);
    // peaksOf samples a bin sparsely once it is long; these bins are 480 samples, a sample apart at most.
    for (let i = 0; i < whole.length; i++) expect(reader.peaks[i]!).toBeGreaterThanOrEqual(whole[i]! - 1e-6);
    for (let i = 0; i < whole.length; i++) expect(reader.peaks[i]!).toBeCloseTo(whole[i]!, 2);
  });

  it('keeps 30000 bins for an hour and ignores samples past the stated length', () => {
    const reader = peakReader(48_000 * 3600, 48_000);
    expect(reader.peaks).toHaveLength(30_000);
    const short = peakReader(1000, 48_000);
    short.push([new Float32Array(1000).fill(0.25)]);
    short.push([new Float32Array(500).fill(0.9)]);
    expect(Math.max(...short.peaks)).toBeCloseTo(0.25, 6);
  });
});

describe('level read in pieces', () => {
  it('measures what the whole decoded track measures', () => {
    for (const sampleRate of [44_100, 48_000]) {
      const left = tone(sampleRate, 9.7, (t) => (t % 3 < 2 ? 0.5 : 0.001));
      const right = tone(sampleRate, 9.7, (t) => (t % 3 < 2 ? 0.3 : 0.001), 330);
      const meter = levelMeter(sampleRate);
      for (const piece of pieces([left, right])) meter.push(piece);
      expect(meter.db()).toBe(measureBufferLoudnessDb(buffer(sampleRate, left, right)));
    }
  });

  it('gives a full-length half-scale tone its level, and silence none', () => {
    expect(measureBufferLoudnessDb(buffer(48_000, tone(48_000, 4, () => 0.5)))).toBeCloseTo(-9, 1);
    expect(measureBufferLoudnessDb(buffer(48_000, new Float32Array(48_000 * 2)))).toBeNull();
    expect(levelMeter(48_000).db()).toBeNull();
  });

  it('measures a sound shorter than one window over its whole length', () => {
    expect(measureBufferLoudnessDb(buffer(48_000, tone(48_000, 0.25, () => 0.5)))).toBeCloseTo(-9, 0);
  });
});

describe('mono at another rate, piece by piece', () => {
  const join = (parts: Float32Array[]) => {
    const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return out;
  };

  it('is the mean of the channels when the rate already matches', () => {
    const mono = monoAtRate(48_000, 48_000);
    expect([...mono([Float32Array.of(1, 0.5, -1), Float32Array.of(0, 0.5, 1)])]).toEqual([0.5, 0.5, 0]);
    const single = Float32Array.of(0.2, 0.4);
    expect(mono([single])).toBe(single);
  });

  it('gives one continuous signal however the input is cut', () => {
    const source = tone(44_100, 1.5, () => 0.4);
    const whole = monoAtRate(44_100, 48_000)([source]);
    const cut = monoAtRate(44_100, 48_000);
    const joined = join([...pieces([source])].map((piece) => cut(piece)));
    // 1.5 s at 48 kHz, short of the last fraction of a sample.
    expect(whole.length).toBeGreaterThan(48_000 * 1.5 - 3);
    expect(whole.length).toBeLessThanOrEqual(48_000 * 1.5);
    expect(Math.abs(joined.length - whole.length)).toBeLessThanOrEqual(1);
    for (let i = 0; i < Math.min(joined.length, whole.length); i++) expect(joined[i]!).toBeCloseTo(whole[i]!, 5);
  });

  it('keeps a straight line straight, up or down in rate', () => {
    const ramp = Float32Array.from({ length: 4410 }, (_, index) => index / 4410);
    for (const toRate of [48_000, 16_000]) {
      const cut = monoAtRate(44_100, toRate);
      const out = join([...pieces([ramp])].map((piece) => cut(piece)));
      for (let k = 0; k < out.length; k += 97) expect(out[k]!).toBeCloseTo((k * 44_100) / toRate / 4410, 4);
    }
  });
});

describe('mono at another rate for sound that is heard', () => {
  const sine = (rate: number, seconds: number, hz: number, level = 0.5) => Float32Array.from({ length: Math.round(rate * seconds) }, (_, index) => Math.sin((2 * Math.PI * hz * index) / rate) * level);
  const through = (source: Float32Array[], fromRate: number, toRate: number, cut = true) => {
    const resampler = monoResampler(fromRate, toRate);
    const parts = cut ? [...pieces(source)].map((piece) => resampler.push(piece)) : [resampler.push(source)];
    parts.push(resampler.flush());
    const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return out;
  };

  it('passes the mean of the channels through when the rate already matches', () => {
    const resampler = monoResampler(48_000, 48_000);
    expect([...resampler.push([Float32Array.of(1, 0.5, -1), Float32Array.of(0, 0.5, 1)])]).toEqual([0.5, 0.5, 0]);
    expect(resampler.flush()).toHaveLength(0);
  });

  it('keeps a tone in time and at its level from 44.1 kHz to 48 kHz', () => {
    const out = through([sine(44_100, 2, 1000)], 44_100, 48_000);
    expect(Math.abs(out.length - 96_000)).toBeLessThanOrEqual(1);
    let worst = 0;
    for (let i = 200; i < out.length - 200; i++) worst = Math.max(worst, Math.abs(out[i]! - Math.sin((2 * Math.PI * 1000 * i) / 48_000) * 0.5));
    expect(worst).toBeLessThan(0.001); // 54 dB under the tone: a late or early resampler is off by 0.06
  });

  it('keeps a high tone a straight line between samples would dull', () => {
    const out = through([sine(44_100, 1, 15_000)], 44_100, 48_000);
    let peak = 0;
    for (let i = 2000; i < out.length - 2000; i++) peak = Math.max(peak, Math.abs(out[i]!));
    expect(peak).toBeGreaterThan(0.49);
    expect(peak).toBeLessThan(0.51);
  });

  it('removes what the lower rate cannot carry when going down', () => {
    const out = through([sine(96_000, 1, 30_000)], 96_000, 48_000);
    let peak = 0;
    for (let i = 2000; i < out.length - 2000; i++) peak = Math.max(peak, Math.abs(out[i]!));
    expect(peak).toBeLessThan(0.01); // 30 kHz would fold to 18 kHz at full level without the low-pass
    expect(Math.abs(out.length - 48_000)).toBeLessThanOrEqual(1);
  });

  it('gives the same signal however the input is cut', () => {
    const source = [sine(44_100, 1.3, 700), sine(44_100, 1.3, 2100, 0.2)];
    const cut = through(source, 44_100, 48_000);
    const whole = through(source, 44_100, 48_000, false);
    expect(cut.length).toBe(whole.length);
    let worst = 0;
    for (let i = 0; i < cut.length; i++) worst = Math.max(worst, Math.abs(cut[i]! - whole[i]!));
    expect(worst).toBe(0);
  });
});
