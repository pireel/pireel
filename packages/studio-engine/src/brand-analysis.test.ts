import { describe, expect, it } from 'vitest';
import { captionBand, summarizeBrandObservations, type OcrBox, type VideoObservation } from './brand-analysis';

const words = ['so the first', 'thing you do', 'is write down', 'every expense', 'then you cut', 'what hurts'];
const caption = (index: number, y = 0.56): OcrBox => ({ text: words[index % words.length]!, x: 0.25, y, w: 0.5, h: 0.04 });
const title: OcrBox = { text: '4 MONEY RULES', x: 0.2, y: 0.08, w: 0.6, h: 0.05 };
// Pseudo-random 64-bit hashes: unrelated frames differ in about half their bits.
const hash = (seed: number) => { let x = seed * 2654435761 >>> 0; let out = ''; for (let i = 0; i < 16; i++) { x = (x * 1103515245 + 12345) >>> 0; out += ((x >>> 16) & 15).toString(16); } return out; };

function video(id: string, patch: Partial<VideoObservation> = {}): VideoObservation {
  return {
    id, durationSec: 30,
    ocr: Array.from({ length: 30 }, (_, t) => ({ t, boxes: [title, ...(t % 5 === 4 ? [] : [caption(t)])] })),
    cuts: [3, 6, 9, 12, 15, 18, 21, 24, 27], faces: [{ t: 1, x: 0.3, y: 0.2, w: 0.4, h: 0.25 }],
    headHashes: Array.from({ length: 6 }, (_, index) => hash(Number(id.slice(1)) * 1000 + index * 7919)),
    tailHashes: Array.from({ length: 6 }, (_, index) => hash(Number(id.slice(1)) * 5000 + index * 104729)),
    overlays: [], ...patch,
  };
}

describe('brand observations', () => {
  it('finds the changing caption band, not the static title above it', () => {
    const band = captionBand(video('v1'))!;
    expect(band.bottom).toBeCloseTo(0.6, 2);
    expect(band.items.every(item => item.box.text !== title.text)).toBe(true);
  });

  it('summarizes caption geometry, casing and words per line across videos', () => {
    const summary = summarizeBrandObservations([video('v1'), video('v2'), video('v3')], 2);
    expect(summary.captions).toMatchObject({ bottomPct: 60, lineHeightPct: 4, widthPct: 50, xCenterPct: 50, tokensPerLine: 3, upperRatio: 0 });
    expect(summary.captions!.evidence.confidence).toBe('high');
    expect(summary.captions!.samples.length).toBeGreaterThan(0);
    expect(summary.pacing!.avgShotSec).toBe(3);
  });

  it('detects a recurring intro shared by three videos and cuts it from real footage', () => {
    const intro = Array.from({ length: 6 }, (_, index) => hash(0xabc000 + index));
    const videos = [video('v1', { headHashes: intro }), video('v2', { headHashes: intro }), video('v3', { headHashes: intro }), video('v4')];
    const summary = summarizeBrandObservations(videos, 2);
    expect(summary.intro).toMatchObject({ endSec: 3 });
    expect(summary.intro!.evidence.videos).toHaveLength(3);
    expect(summary.outro).toBeNull();
  });

  it('treats a recurring opening with per-video text as a title-card template, not a clip', () => {
    const card = Array.from({ length: 6 }, (_, index) => hash(0xdef000 + index));
    const titled = (id: string, title: string) => { const base = video(id, { headHashes: card }); base.ocr[0] = { t: 0.5, boxes: [{ text: title, x: 0.2, y: 0.4, w: 0.6, h: 0.08 }] }; return base; };
    const summary = summarizeBrandObservations([titled('v1', '各种类型的讨价还价'), titled('v2', '身兼数职的我'), titled('v3', '我的一年')], 2);
    expect(summary.intro).toBeNull();
    expect(summary.titleCards).toEqual([expect.objectContaining({ position: 'intro', videos: expect.arrayContaining(['v1', 'v2', 'v3']) })]);
  });

  it('never matches near-flat frames across videos', () => {
    const flat = Array.from({ length: 6 }, () => '');
    expect(summarizeBrandObservations(['v1', 'v2', 'v3'].map(id => video(id, { tailHashes: flat })), 2).outro).toBeNull();
  });

  it('keeps only a confident logo: repeated in place, away from captions, not a platform mark', () => {
    const logo = { x: 0.82, y: 0.02, w: 0.14, h: 0.05 };
    const platform = { x: 0.8, y: 0.02, w: 0.16, h: 0.05, text: 'bilibili' };
    expect(summarizeBrandObservations(['v1', 'v2', 'v3'].map(id => video(id, { overlays: [platform] })), 2).logo).toBeNull();
    const found = summarizeBrandObservations(['v1', 'v2', 'v3', 'v4'].map(id => video(id, { overlays: [logo] })), 2).logo;
    expect(found).toMatchObject({ corner: 'top-right' });
    expect(summarizeBrandObservations([video('v1', { overlays: [logo] }), video('v2'), video('v3'), video('v4')], 2).logo).toBeNull();
  });

  it('reports no captions for videos without a changing text band', () => {
    const silent = video('v1', { ocr: Array.from({ length: 20 }, (_, t) => ({ t, boxes: [title] })) });
    expect(summarizeBrandObservations([silent], 2).captions).toBeNull();
  });
});
