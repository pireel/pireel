import { describe, expect, it } from 'vitest';
import { encodeWav, layoutDubbing, mixDub, pcm16ToFloat, stretchSpeech } from './dubbing-align';

const sr = 1000;
describe('dubbing layout', () => {
  it('keeps natural length when it fits, lets a line run into the next which starts later', () => {
    const { placed, notes } = layoutDubbing([{ start: 0, end: 2000, natural: 2900 }, { start: 2500, end: 4000, natural: 1000 }], 8000, sr);
    expect(placed.map(p => [p.start, p.end])).toEqual([[0, 2900], [2900, 3900]]);
    expect(notes).toEqual([]);
  });
  it('speeds a run up together before cutting, and cuts only at the picture end', () => {
    const together = layoutDubbing([{ start: 0, end: 2000, natural: 2900 }, { start: 2500, end: 4000, natural: 3000 }], 5000, sr);
    expect(together.notes.map(n => n.kind)).toEqual(['faster', 'faster']);
    const cut = layoutDubbing([{ start: 7300, end: 8000, natural: 2000 }], 8000, sr);
    expect(cut.notes).toEqual([{ index: 0, kind: 'trimmed' }]); expect(cut.placed[0]).toMatchObject({ start: 7300, end: 8000, trim: true });
  });
  it('lets overlapping speakers keep their own times', () => {
    const { placed } = layoutDubbing([{ start: 0, end: 6000, natural: 6000 }, { start: 3000, end: 9000, natural: 6000 }], 9000, sr);
    expect(placed.map(p => p.start)).toEqual([0, 3000]);
  });
});

describe('speech audio', () => {
  it('stretches speech to the asked length and keeps a tone near its pitch', () => {
    const rate = 24000; const input = new Float32Array(rate).map((_, i) => Math.sin(2 * Math.PI * 200 * i / rate));
    const out = stretchSpeech(input, 1.25, rate);
    expect(out.length).toBe(Math.round(rate / 1.25));
    // Zero crossings per second stay about 400 (200 Hz) instead of rising to 500.
    let crossings = 0; for (let i = 2000; i < out.length - 2000; i++) if (out[i - 1]! < 0 && out[i]! >= 0) crossings++;
    expect(crossings / ((out.length - 4000) / rate)).toBeGreaterThan(185); expect(crossings / ((out.length - 4000) / rate)).toBeLessThan(215);
  });
  it('mixes placed lines, fading a cut one out, and writes a WAV', () => {
    const line = new Float32Array(500).fill(.5);
    const mixed = mixDub(1000, sr, [{ pcm: line, placement: { start: 100, end: 600, trim: false, squeeze: 1 } }, { pcm: new Float32Array(900).fill(.5), placement: { start: 800, end: 1000, trim: true, squeeze: 4.5 } }]);
    expect(mixed[300]).toBeCloseTo(.5); expect(mixed[700]).toBe(0); expect(Math.abs(mixed[999]!)).toBeLessThan(.05);
    const wav = encodeWav(mixed, sr);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF'); expect(wav.length).toBe(44 + 2000);
    expect(pcm16ToFloat(new Uint8Array([0, 64]))[0]).toBeCloseTo(.5);
  });
});
