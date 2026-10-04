import { describe, expect, it } from 'vitest';
import { textLayers, type VideoObservation } from './brand-analysis';
import { bandColors, portraitTemplateWindow, type VisualSample } from './brand-visual';

const video = (boxes: (t: number) => { text: string; x: number; y: number; w: number; h: number }[]): VideoObservation => ({
  id: 'v', durationSec: 60, width: 1080, height: 1920, cuts: [], faces: [], headHashes: [], tailHashes: [], overlays: [],
  ocr: Array.from({ length: 30 }, (_, i) => ({ t: i * 2, boxes: boxes(i * 2) })),
});

describe('held header', () => {
  it('is a wide, large band in the upper frame', () => {
    const layers = textLayers(video(() => [{ text: '月薪三千怎么存钱', x: 0.1, y: 0.08, w: 0.8, h: 0.04 }]));
    expect(layers[0]!.kind).toBe('header');
  });

  it('is not a corner bug, small print, or a sign low in the set', () => {
    const corner = textLayers(video(() => [{ text: '某某台', x: 0.82, y: 0.03, w: 0.14, h: 0.03 }]));
    const small = textLayers(video(() => [{ text: '本视频不构成投资建议', x: 0.1, y: 0.1, w: 0.6, h: 0.012 }]));
    const sign = textLayers(video(() => [{ text: 'COFFEE BAR', x: 0.2, y: 0.55, w: 0.5, h: 0.05 }]));
    expect([corner[0]!.kind, small[0]!.kind, sign[0]!.kind]).toEqual(['scene', 'scene', 'scene']);
  });
});

describe('portraitTemplateWindow', () => {
  const size = 16;
  /** Frames whose rows `from..to` change every sample while the rest holds still. */
  const samples = (from: number, to: number): VisualSample[] => Array.from({ length: 8 }, (_, s) => {
    const gray = new Uint8Array(size * size).fill(40);
    for (let y = from; y <= to; y++) for (let x = 0; x < size; x++) gray[y * size + x] = (s * 37 + x * 11 + y * 7) % 255;
    return { t: s, face: null, occ: null, gray, size };
  });

  it('finds the footage band of a vertical template frame', () => {
    expect(portraitTemplateWindow(samples(5, 10))).toEqual({ x: 0, y: 0.313, w: 1, h: 0.375 });
  });

  it('finds none when the whole frame moves', () => {
    expect(portraitTemplateWindow(samples(0, 15))).toBeNull();
  });
});

describe('bandColors', () => {
  const band = (text: number[], back: number[], textShare: number, noise = 0) => {
    const data = new Uint8ClampedArray(400 * 4);
    for (let i = 0; i < 400; i++) {
      const rgb = i < 400 * textShare ? text : back.map((v, k) => v + (noise ? ((i * 31 + k * 17) % (noise * 2)) - noise : 0));
      data.set([...rgb, 255], i * 4);
    }
    return data;
  };
  it('reads yellow lettering on a flat red plate', () => {
    expect(bandColors(band([255, 214, 0], [200, 20, 30], 0.25))).toEqual({ color: '#ffd600', plate: '#c8141e' });
  });
  it('gives no plate for text over busy footage', () => {
    expect(bandColors(band([255, 255, 255], [90, 90, 90], 0.2, 60)).plate).toBeNull();
  });
});
