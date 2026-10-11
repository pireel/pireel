import { describe, expect, it } from 'vitest';
import { brollTier, classifyArchetype, classifyCut, classifyLayout, cutProfile, inkExtent, ncc, zoomWarp, type CutPair, type VisualSample } from './brand-visual';

const S = 64;
/** Deterministic textured "scene" (a room) so correlations mean something. */
function scene(seed: number, size = S): Uint8Array {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    out[y * size + x] = Math.round(128 + 60 * Math.sin((x + seed * 7) / 5) * Math.cos((y - seed * 3) / 7) + 40 * Math.sin((x * y + seed * 13) / 90));
  }
  return out;
}
const face = (x: number, y: number, h: number) => ({ x, y, w: h * 0.8, h });

describe('cut classification', () => {
  it('sees an identical framing as a jump cut', () => {
    const img = scene(1);
    expect(classifyCut({ t: 1, before: img, after: img, size: S, faceBefore: face(0.4, 0.3, 0.2), faceAfter: face(0.41, 0.3, 0.2) }).kind).toBe('jump');
  });

  it('sees a digital zoom of the same picture as a punch-in, and the reverse as a punch-out', () => {
    const before = scene(2);
    const fb = face(0.4, 0.3, 0.2);
    const after = zoomWarp(before, S, 1.5, { x: 0.48, y: 0.4 }, { x: 0.5, y: 0.45 }).image;
    const fa = face(0.5 - 0.12, 0.45 - 0.15, 0.3);
    expect(classifyCut({ t: 1, before, after, size: S, faceBefore: fb, faceAfter: fa }).kind).toBe('punch_in');
    expect(classifyCut({ t: 1, before: after, after: before, size: S, faceBefore: fa, faceAfter: fb }).kind).toBe('punch_out');
  });

  it('sees a different picture with a host on both sides as another camera', () => {
    expect(classifyCut({ t: 1, before: scene(3), after: scene(40), size: S, faceBefore: face(0.4, 0.3, 0.2), faceAfter: face(0.3, 0.3, 0.3) }).kind).toBe('camera_change');
    expect(classifyCut({ t: 1, before: scene(3), after: scene(40), size: S, faceBefore: face(0.4, 0.3, 0.2), faceAfter: face(0.4, 0.3, 0.2) }).kind).toBe('camera_change');
  });

  it('separates cutaways and B-roll', () => {
    expect(classifyCut({ t: 1, before: scene(3), after: scene(5), size: S, faceBefore: face(0.4, 0.3, 0.2), faceAfter: null }).kind).toBe('cutaway');
    expect(classifyCut({ t: 1, before: scene(3), after: scene(5), size: S, faceBefore: null, faceAfter: null }).kind).toBe('broll');
  });

  it('summarizes shares per video', () => {
    const img = scene(1);
    const jump: CutPair = { t: 1, before: img, after: img, size: S, faceBefore: face(0.4, 0.3, 0.2), faceAfter: face(0.4, 0.3, 0.2) };
    const broll: CutPair = { ...jump, faceBefore: null, faceAfter: null };
    expect(cutProfile([jump, jump, jump, broll]).share).toMatchObject({ jump: 0.75, broll: 0.25 });
  });

  it('correlates flat frames only when their levels match', () => {
    expect(ncc(new Uint8Array(100).fill(10), new Uint8Array(100).fill(12))).toBe(1);
    expect(ncc(new Uint8Array(100).fill(10), new Uint8Array(100).fill(200))).toBe(0);
  });
});

const T = 48;
/** Thumbnail: scene `bg` everywhere except `still`, which always shows scene `stillSeed` (the part that does not change). */
function frame(bg: number, still: { x: number; y: number; w: number; h: number }, stillSeed = 99): Uint8Array {
  const img = scene(bg, T); const keep = scene(stillSeed, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const px = (x + 0.5) / T, py = (y + 0.5) / T;
    if (px >= still.x && px <= still.x + still.w && py >= still.y && py <= still.y + still.h) img[y * T + x] = keep[y * T + x]!;
  }
  return img;
}
const samples = (n: number, make: (i: number) => Omit<VisualSample, 't' | 'size' | 'occ'>): VisualSample[] => Array.from({ length: n }, (_, i) => ({ t: i * 2 + 0.5, size: T, occ: null, ...make(i) }));
const whole = { x: 0, y: 0, w: 1, h: 1 };

describe('layout classification', () => {
  it('a host in a still room is full frame', () => {
    expect(classifyLayout(samples(12, () => ({ face: face(0.4, 0.3, 0.2), gray: frame(1, whole) })), true).mode).toBe('full_frame_host');
  });

  it('a handheld host (everything moves together) is full frame', () => {
    expect(classifyLayout(samples(12, i => ({ face: face(0.4, 0.3, 0.2), gray: frame(i * 3, { x: 0, y: 0, w: 0, h: 0 }) })), true).mode).toBe('full_frame_host');
  });

  it('a host who stays put while the background right behind them keeps changing is a green-screen composite', () => {
    const f = face(0.15, 0.6, 0.15);
    const person = { x: f.x, y: f.y, w: f.w, h: 1 - f.y };
    expect(classifyLayout(samples(12, i => ({ face: f, gray: frame(i * 11 + 3, person) })), true).mode).toBe('greenscreen_composite');
  });

  it('a host in their own still half under changing footage is a split screen', () => {
    const f = face(0.42, 0.62, 0.2);
    expect(classifyLayout(samples(12, i => ({ face: f, gray: frame(i * 9 + 2, { x: 0, y: 0.5, w: 1, h: 0.5 }) })), true).mode).toBe('split_screen');
  });

  it('a small face that keeps its still corner is picture-in-picture', () => {
    const f = face(0.8, 0.82, 0.08);
    expect(classifyLayout(samples(12, i => ({ face: f, gray: frame(i * 5 + 1, { x: 0.68, y: 0.74, w: 0.32, h: 0.26 }) })), true).mode).toBe('pip_host');
  });

  it('mostly no host is host-absent', () => {
    expect(classifyLayout(samples(12, i => ({ face: i === 0 ? face(0.4, 0.3, 0.2) : null, gray: frame(i, whole) })), true).mode).toBe('host_absent');
  });
});

describe('archetype and B-roll tier', () => {
  const cuts = (patch: Partial<Record<'jump' | 'punch_in' | 'punch_out' | 'camera_change' | 'cutaway' | 'broll', number>>) => ({ jump: 0, punch_in: 0, punch_out: 0, camera_change: 0, cutaway: 0, broll: 0, ...patch });
  const base = { layout: 'full_frame_host' as const, hostShare: 0.95, cutsPerMin: 12, cuts: cuts({}), speakers: 1, captionsOn: true, wpm: 180, headerShare: 0, hostEarlyOnly: false };
  it('maps layout first, then cutting device and pace', () => {
    expect(classifyArchetype({ ...base, layout: 'split_screen' })).toBe('A4_reaction_stitch');
    expect(classifyArchetype({ ...base, layout: 'greenscreen_composite' })).toBe('A6_greenscreen_explainer');
    expect(classifyArchetype({ ...base, cutsPerMin: 2 })).toBe('A1_native_one_take');
    expect(classifyArchetype({ ...base, speakers: 2, cuts: cuts({ camera_change: 0.5 }) })).toBe('A5_multicam_podcast');
    expect(classifyArchetype({ ...base, cuts: cuts({ punch_in: 0.2, punch_out: 0.1 }) })).toBe('A3_punchin_comedy');
    expect(classifyArchetype({ ...base, cuts: cuts({ camera_change: 0.5 }), wpm: 210 })).toBe('A6_greenscreen_explainer');
    expect(classifyArchetype({ ...base, cuts: cuts({ jump: 0.6 }) })).toBe('A2_jumpcut_monologue');
    expect(classifyArchetype({ ...base, hostShare: 0.3, hostEarlyOnly: true })).toBe('A9_doc_vo_montage');
    expect(classifyArchetype({ ...base, hostShare: 0.55, cutsPerMin: 25, cuts: cuts({ broll: 0.3, cutaway: 0.25 }) })).toBe('A8_demo_broll_fasttalk');
    expect(classifyArchetype({ ...base, hostShare: 0.55, cutsPerMin: 25, captionsOn: false, cuts: cuts({ broll: 0.3, cutaway: 0.25 }) })).toBe('A10_phone_montage_vlog');
  });

  it('tiers B-roll by host absence, at least medium for composited layouts', () => {
    expect(brollTier(0.98, 'full_frame_host')).toBe('none');
    expect(brollTier(0.8, 'full_frame_host')).toBe('light');
    expect(brollTier(0.3, 'host_absent')).toBe('heavy');
    expect(brollTier(1, 'split_screen')).toBe('medium');
  });
});

describe('inkExtent', () => {
  // 10 wide, 20 tall: white letters on rows 6–13 (with a one-row gap at 9), a white row far off at 18.
  const image = (rows: number[]) => { const data = new Uint8ClampedArray(10 * 20 * 4); for (let row = 0; row < 20; row++) for (let col = 0; col < 10; col++) { const i = (row * 10 + col) * 4; const on = rows.includes(row) && col % 2 === 0; data.set(on ? [255, 255, 255, 255] : [20, 20, 20, 255], i); } return data; };
  it('finds the run of text rows around the middle, bridging a gap between strokes', () => {
    expect(inkExtent(image([6, 7, 8, 10, 11, 12, 13, 18]), 10, 20, '#ffffff')).toEqual({ top: 0.3, bottom: 0.7 });
  });
  it('leaves out a solid block of the caption colour (a shirt, a wall) under the letters', () => {
    // Letters on rows 6–9 (every other pixel), a solid white block on rows 10–19.
    const data = new Uint8ClampedArray(10 * 20 * 4);
    for (let row = 0; row < 20; row++) for (let col = 0; col < 10; col++) { const on = (row >= 6 && row <= 9 && col % 2 === 0) || row >= 10; data.set(on ? [255, 255, 255, 255] : [20, 20, 20, 255], (row * 10 + col) * 4); }
    expect(inkExtent(data, 10, 20, '#ffffff', 0.4)).toEqual({ top: 0.3, bottom: 0.5 });
  });
  it('gives nothing when the colour is not there', () => {
    expect(inkExtent(image([]), 10, 20, '#ffffff')).toBeNull();
  });
});

