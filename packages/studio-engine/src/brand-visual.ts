import type { NRect } from './geometry-math';

/**
 * Brand analysis, visual half: classify how a video is laid out and how it cuts, from cheap per-frame
 * primitives the browser already has (face box, 18×32 person occupancy, small grayscale thumbnails).
 * Pure functions so they run the same in the browser and in the research evaluation
 * (scripts/eval-brand-visual.ts on docs/creator-style-research-2026-10).
 */

/** A periodic sample: face (largest), person occupancy grid (GRID_W×GRID_H, 1 = person) and a size×size grayscale thumbnail. */
export interface VisualSample { t: number; face: NRect | null; occ: Uint8Array | null; gray: Uint8Array; size: number }
/** Frames just before and after a cut. */
export interface CutPair { t: number; before: Uint8Array; after: Uint8Array; size: number; faceBefore: NRect | null; faceAfter: NRect | null }

export type CutKind = 'jump' | 'punch_in' | 'punch_out' | 'camera_change' | 'cutaway' | 'broll';
export type LayoutMode = 'full_frame_host' | 'split_screen' | 'pip_host' | 'pip_source' | 'greenscreen_composite' | 'template_frame' | 'first_person' | 'host_absent';
export type ArchetypeId = 'A1_native_one_take' | 'A2_jumpcut_monologue' | 'A3_punchin_comedy' | 'A4_reaction_stitch' | 'A5_multicam_podcast' | 'A6_greenscreen_explainer' | 'A7_studio_cards_explainer' | 'A8_demo_broll_fasttalk' | 'A9_doc_vo_montage' | 'A10_phone_montage_vlog';

export const VISUAL_GRID = { w: 18, h: 32 } as const;

/** Tunables, set on the research labels (see docs/brand-extraction-p1.md). */
export const VISUAL_THRESHOLDS = {
  minFaceH: 0.06,
  sameSize: [0.83, 1.2] as [number, number],
  jumpSimilarity: 0.6,
  zoomSimilarity: 0.45,
  backgroundChange: 10,
  /** On a composite the person's own pixels barely change while the background behind them does. */
  personStillRatio: 0.6,
  greenscreenShare: 0.25,
  compositeShare: 0.25,
  pipFaceH: 0.16,
  templateStableShare: 0.3,
  hostAbsentShare: 0.25,
};
type Thresholds = typeof VISUAL_THRESHOLDS;

const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

/** Normalized cross-correlation over the pixels where `mask` is 1 (all when absent). */
export function ncc(a: Uint8Array, b: Uint8Array, mask?: Uint8Array): number {
  let n = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) if (!mask || mask[i]) { sa += a[i]!; sb += b[i]!; n++; }
  if (n < 16) return 0;
  const ma = sa / n, mb = sb / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < a.length; i++) if (!mask || mask[i]) { const da = a[i]! - ma, db = b[i]! - mb; cov += da * db; va += da * da; vb += db * db; }
  // Two flat frames (black, solid colour) are "the same" only when their levels match.
  if (va < 1e-6 || vb < 1e-6) return Math.abs(ma - mb) < 8 ? 1 : 0;
  return cov / Math.sqrt(va * vb);
}

/**
 * Warp `from` as a digital zoom of factor `scale` that moves `fromCenter` onto `toCenter`; returns the
 * warped image and the mask of pixels that stayed inside the source.
 */
export function zoomWarp(from: Uint8Array, size: number, scale: number, fromCenter: { x: number; y: number }, toCenter: { x: number; y: number }): { image: Uint8Array; mask: Uint8Array } {
  const image = new Uint8Array(size * size); const mask = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = (fromCenter.x + ((x + 0.5) / size - toCenter.x) / scale) * size - 0.5;
    const sy = (fromCenter.y + ((y + 0.5) / size - toCenter.y) / scale) * size - 0.5;
    if (sx < 0 || sy < 0 || sx > size - 1 || sy > size - 1) continue;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1);
    const fx = sx - x0, fy = sy - y0;
    const v = from[y0 * size + x0]! * (1 - fx) * (1 - fy) + from[y0 * size + x1]! * fx * (1 - fy) + from[y1 * size + x0]! * (1 - fx) * fy + from[y1 * size + x1]! * fx * fy;
    image[y * size + x] = Math.round(v); mask[y * size + x] = 1;
  }
  return { image, mask };
}

const centre = (r: NRect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/**
 * One cut: a digital punch-in/out keeps the same picture, scaled (the zoomed "before" matches "after");
 * a jump cut keeps the same framing; anything else with a host on both sides is another camera (or a
 * swapped background); a host on one side only is a cutaway; none is B-roll.
 */
export function classifyCut(pair: CutPair, th: Thresholds = VISUAL_THRESHOLDS): { kind: CutKind; similarity: number; scale: number | null } {
  const a = pair.faceBefore && pair.faceBefore.h >= th.minFaceH ? pair.faceBefore : null;
  const b = pair.faceAfter && pair.faceAfter.h >= th.minFaceH ? pair.faceAfter : null;
  if (!a && !b) return { kind: 'broll', similarity: ncc(pair.before, pair.after), scale: null };
  if (!a || !b) return { kind: 'cutaway', similarity: ncc(pair.before, pair.after), scale: null };
  const scale = b.h / a.h;
  if (scale >= th.sameSize[0] && scale <= th.sameSize[1]) {
    const similarity = ncc(pair.before, pair.after);
    return { kind: similarity >= th.jumpSimilarity ? 'jump' : 'camera_change', similarity, scale };
  }
  const zoomIn = scale > 1;
  const [from, to, fFrom, fTo, s] = zoomIn ? [pair.before, pair.after, a, b, scale] : [pair.after, pair.before, b, a, 1 / scale];
  const warped = zoomWarp(from, pair.size, s, centre(fFrom), centre(fTo));
  const similarity = ncc(warped.image, to, warped.mask);
  return { kind: similarity >= th.zoomSimilarity ? (zoomIn ? 'punch_in' : 'punch_out') : 'camera_change', similarity, scale };
}

export interface CutProfile { cuts: number; share: Record<CutKind, number> }
export function cutProfile(pairs: CutPair[], th: Thresholds = VISUAL_THRESHOLDS): CutProfile {
  const share = { jump: 0, punch_in: 0, punch_out: 0, camera_change: 0, cutaway: 0, broll: 0 } as Record<CutKind, number>;
  for (const pair of pairs) share[classifyCut(pair, th).kind]++;
  for (const key of Object.keys(share) as CutKind[]) share[key] = pairs.length ? Math.round(share[key] / pairs.length * 1000) / 1000 : 0;
  return { cuts: pairs.length, share };
}

export interface LayoutProfile {
  mode: LayoutMode;
  /** Share of samples with the host's face on screen. */
  hostShare: number;
  /** Median face box while the host is on screen. */
  hostBox: NRect | null;
  /** Among consecutive samples where the face holds still: share where only the background behind it
   *  changed (greenscreen), where only the far side of the frame changed (composite: split / picture in
   *  picture); and the share of pixels that never change (template frame). */
  shares: { greenscreen: number; composite: number; templateStable: number; stablePairs: number };
}

const hostIn = (sample: VisualSample, th: Thresholds) => (sample.face?.h ?? 0) >= th.minFaceH;

/** Thumbnail mask of a normalized rectangle (clamped), optionally minus another. */
function rectMask(size: number, r: NRect, minus?: NRect): Uint8Array {
  const mask = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = (x + 0.5) / size, py = (y + 0.5) / size;
    const inR = px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
    const inM = minus && px >= minus.x && px <= minus.x + minus.w && py >= minus.y && py <= minus.y + minus.h;
    if (inR && !inM) mask[y * size + x] = 1;
  }
  return mask;
}
function meanAbsDiff(a: Uint8Array, b: Uint8Array, mask?: Uint8Array): number { let s = 0, n = 0; for (let i = 0; i < a.length; i++) if (!mask || mask[i]) { s += Math.abs(a[i]! - b[i]!); n++; } return n ? s / n : 0; }

/**
 * Layout from the face, which detectors find reliably (person segmentation over-fills on busy frames).
 * For consecutive samples where the face holds its place and size, compare what changed: the face
 * itself, a ring around it, and the far side of the frame. A greenscreen keeps the face but swaps what
 * is right behind it; a split screen or picture in picture keeps the host's corner still while the far
 * side plays other footage; a plain talking head changes everything or nothing together.
 */
export function classifyLayout(samples: VisualSample[], vertical: boolean, th: Thresholds = VISUAL_THRESHOLDS): LayoutProfile {
  const hosted = samples.filter(sample => hostIn(sample, th));
  const hostShare = samples.length ? hosted.length / samples.length : 0;
  const faces = hosted.map(sample => sample.face!);
  const hostBox = faces.length ? { x: median(faces.map(f => f.x)), y: median(faces.map(f => f.y)), w: median(faces.map(f => f.w)), h: median(faces.map(f => f.h)) } : null;

  let stablePairs = 0, gsHits = 0, compositeHits = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!, b = samples[i]!;
    if (!hostIn(a, th) || !hostIn(b, th)) continue;
    const fa = a.face!, fb = b.face!;
    const ca = centre(fa), cb = centre(fb);
    if (Math.abs(ca.x - cb.x) > 0.05 || Math.abs(ca.y - cb.y) > 0.05 || fb.h / fa.h < 0.85 || fb.h / fa.h > 1.18) continue;
    stablePairs++;
    const size = a.size;
    const face = { x: Math.min(fa.x, fb.x), y: Math.min(fa.y, fb.y), w: Math.max(fa.x + fa.w, fb.x + fb.w) - Math.min(fa.x, fb.x), h: Math.max(fa.y + fa.h, fb.y + fb.h) - Math.min(fa.y, fb.y) };
    const ring = { x: face.x - face.w * 0.8, y: face.y - face.h * 0.4, w: face.w * 2.6, h: face.h * 1.8 };
    const c = vertical ? ca.y : ca.x;
    const far = vertical ? (c < 0.5 ? { x: 0, y: 0.58, w: 1, h: 0.42 } : { x: 0, y: 0, w: 1, h: 0.42 }) : (c < 0.5 ? { x: 0.58, y: 0, w: 0.42, h: 1 } : { x: 0, y: 0, w: 0.42, h: 1 });
    const inside = meanAbsDiff(a.gray, b.gray, rectMask(size, face));
    const around = meanAbsDiff(a.gray, b.gray, rectMask(size, ring, face));
    const away = meanAbsDiff(a.gray, b.gray, rectMask(size, far, ring));
    if (around >= th.backgroundChange && inside <= around * th.personStillRatio) gsHits++;
    else if (away >= th.backgroundChange && around < th.backgroundChange / 2 && inside < th.backgroundChange / 2) compositeHits++;
  }
  const greenscreen = stablePairs >= 3 ? gsHits / stablePairs : 0;
  const composite = stablePairs >= 3 ? compositeHits / stablePairs : 0;

  // Template frame: a large share of pixels that never change across the video.
  let templateStable = 0;
  if (samples.length >= 6) {
    const size = samples[0]!.size; let stable = 0;
    for (let k = 0; k < size * size; k++) {
      const values = samples.map(sample => sample.gray[k]!); const m = mean(values);
      if (Math.sqrt(mean(values.map(v => (v - m) ** 2))) < 6) stable++;
    }
    templateStable = stable / (size * size);
  }

  const shares = { greenscreen: round3(greenscreen), composite: round3(composite), templateStable: round3(templateStable), stablePairs };
  const edge = hostBox ? (() => { const c = centre(hostBox); return c.x < 0.3 || c.x > 0.7 || c.y < 0.25 || c.y > 0.75; })() : false;
  let mode: LayoutMode = 'full_frame_host';
  if (hostShare < th.hostAbsentShare) mode = 'host_absent';
  else if (composite >= th.compositeShare) mode = hostBox && hostBox.h < th.pipFaceH && edge ? 'pip_host' : 'split_screen';
  else if (greenscreen >= th.greenscreenShare) mode = 'greenscreen_composite';
  else if (templateStable >= th.templateStableShare && hostBox && hostBox.h < 0.15) mode = 'template_frame';
  return { mode, hostShare: round3(hostShare), hostBox, shares };
}

function median(values: number[]): number { const s = [...values].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2) : 0; }
function round3(value: number) { return Math.round(value * 1000) / 1000; }

export type BrollTier = 'none' | 'light' | 'medium' | 'heavy';
/** B-roll tier from how much of the video the host is off screen; composited layouts carry source footage all along. */
export function brollTier(hostShare: number, layout: LayoutMode): BrollTier {
  const off = 1 - hostShare;
  const tier: BrollTier = off < 0.05 ? 'none' : off < 0.25 ? 'light' : off < 0.5 ? 'medium' : 'heavy';
  if ((layout === 'split_screen' || layout === 'pip_host' || layout === 'pip_source' || layout === 'greenscreen_composite') && (tier === 'none' || tier === 'light')) return 'medium';
  return tier;
}

export interface ArchetypeInput {
  layout: LayoutMode;
  hostShare: number;
  cutsPerMin: number;
  cuts: Record<CutKind, number>;
  speakers: number;
  captionsOn: boolean;
  /** Words per minute (null without a transcript). */
  wpm: number | null;
  headerShare: number;
  /** The host shows in the opening and is mostly off screen after it (narrated documentary pattern). */
  hostEarlyOnly: boolean;
  /** B-roll kinds named by the reading pass (STYLE_FACETS.brollTypes); decides which B-roll-led archetype. */
  brollKinds?: readonly string[];
}

const PRODUCT_BROLL = ['product_macro', 'screen_recording'];
const DOC_BROLL = ['archival_news', 'stock', 'map_3d', 'animation', 'screenshot_article', 'ai_image'];
/** Which B-roll-led archetype: product/screen footage, documentary material, or the creator's own footage. */
function brollLed(input: ArchetypeInput): ArchetypeId | null {
  const kinds = input.brollKinds ?? [];
  if (!kinds.length) return null;
  const count = (list: string[]) => kinds.filter(kind => list.includes(kind)).length;
  if (count(PRODUCT_BROLL) > count(DOC_BROLL)) return 'A8_demo_broll_fasttalk';
  if (count(DOC_BROLL) > 0) return 'A9_doc_vo_montage';
  return kinds.includes('user_footage') ? 'A10_phone_montage_vlog' : null;
}

/**
 * Rule-based archetype (docs/creator-style-research-2026-10/archetype_presets.json), thresholds read off the
 * research set (docs/brand-extraction-p1.md): layout first, then how much the host is off screen, then the
 * dominant cut kind, then pace. Another camera and a swapped green-screen background both read as
 * camera changes; fast scripted speech with burned-in captions and a single voice separates the latter.
 */
export function classifyArchetype(input: ArchetypeInput): ArchetypeId {
  const { cuts } = input;
  const away = cuts.broll + cuts.cutaway;
  if (input.layout === 'split_screen' || input.layout === 'pip_host' || input.layout === 'pip_source') return 'A4_reaction_stitch';
  if (input.layout === 'first_person') return input.cutsPerMin >= 12 ? 'A8_demo_broll_fasttalk' : 'A1_native_one_take';
  if (input.layout === 'greenscreen_composite') return 'A6_greenscreen_explainer';
  if (input.cutsPerMin < 6 && away < 0.3) return 'A1_native_one_take';
  if (input.layout === 'host_absent' || input.hostShare < 0.45 || input.hostEarlyOnly) return brollLed(input) ?? 'A9_doc_vo_montage';
  if (input.hostShare < 0.65 && away >= 0.45) return brollLed(input) ?? (input.captionsOn && input.cutsPerMin >= 14 ? 'A8_demo_broll_fasttalk' : 'A10_phone_montage_vlog');
  if (cuts.jump >= 0.3) return 'A2_jumpcut_monologue';
  if (cuts.camera_change >= 0.4) return input.speakers <= 1 && input.captionsOn && (input.wpm ?? 0) >= 195 ? 'A6_greenscreen_explainer' : 'A5_multicam_podcast';
  if (cuts.punch_in + cuts.punch_out >= 0.15) return 'A3_punchin_comedy';
  if (input.headerShare >= 0.5 && input.cutsPerMin < 16) return 'A7_studio_cards_explainer';
  if (away >= 0.4) return 'A10_phone_montage_vlog';
  return input.cutsPerMin >= 14 ? 'A10_phone_montage_vlog' : 'A1_native_one_take';
}

export type PrimaryDevice = 'long_take' | 'same_size_jumpcut' | 'punchin_alternation' | 'multicam_switch' | 'broll_cover';
/** The cutting device a video leans on, from its pace and cut-kind shares (thresholds as in classifyArchetype). */
export function primaryDevice(cutsPerMin: number, cuts: Record<CutKind, number>, speakers: number): PrimaryDevice {
  if (cutsPerMin < 6) return 'long_take';
  if (cuts.broll + cuts.cutaway >= 0.45) return 'broll_cover';
  if (cuts.jump >= 0.3) return 'same_size_jumpcut';
  if (cuts.camera_change >= 0.4 && speakers >= 2) return 'multicam_switch';
  if (cuts.punch_in + cuts.punch_out >= 0.15) return 'punchin_alternation';
  if (cuts.camera_change >= 0.4) return 'multicam_switch';
  return cuts.broll + cuts.cutaway >= cuts.jump ? 'broll_cover' : 'same_size_jumpcut';
}

/**
 * The content window of a vertical template frame (Chinese-platform study: a held headline band on
 * top, landscape footage in the middle, a decorated band below; about 30% of top Douyin talking-head
 * accounts). The window is the band of rows and columns where most pixels move across the video while
 * the frame around it holds still. Null when the whole frame moves or the moving part is not a band.
 */
export function portraitTemplateWindow(samples: VisualSample[]): NRect | null {
  if (samples.length < 6) return null;
  const size = samples[0]!.size;
  const moving = new Uint8Array(size * size);
  for (let k = 0; k < size * size; k++) {
    const values = samples.map(sample => sample.gray[k]!); const m = mean(values);
    if (Math.sqrt(mean(values.map(v => (v - m) ** 2))) >= 6) moving[k] = 1;
  }
  const rowShare = Array.from({ length: size }, (_, y) => { let n = 0; for (let x = 0; x < size; x++) n += moving[y * size + x]!; return n / size; });
  const colShare = Array.from({ length: size }, (_, x) => { let n = 0; for (let y = 0; y < size; y++) n += moving[y * size + x]!; return n / size; });
  const rows = rowShare.flatMap((share, y) => share >= 0.5 ? [y] : []);
  if (!rows.length) return null;
  const top = rows[0]!, bottom = rows.at(-1)!;
  const band = colShare.map((_, x) => { let n = 0; for (let y = top; y <= bottom; y++) n += moving[y * size + x]!; return n / (bottom - top + 1); });
  const cols = band.flatMap((share, x) => share >= 0.5 ? [x] : []);
  if (!cols.length) return null;
  const window = { x: cols[0]! / size, y: top / size, w: (cols.at(-1)! - cols[0]! + 1) / size, h: (bottom - top + 1) / size };
  // Still frame above and below the window: the rows outside it barely move.
  const outside = rowShare.filter((_, y) => y < top || y > bottom);
  const stillOutside = outside.length >= size * 0.25 && mean(outside) < 0.15;
  return stillOutside && window.w >= 0.8 && window.h >= 0.2 && window.h <= 0.7 ? { x: round3(window.x), y: round3(window.y), w: round3(window.w), h: round3(window.h) } : null;
}

const hex = (rgb: number[]) => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/**
 * Text and plate colours of a cropped text band (RGBA pixels): two-colour clustering, where the
 * smaller cluster is the lettering and the larger one what is behind it. The background counts as a
 * plate only when it is nearly flat; text over moving footage gets no plate.
 */
export function bandColors(rgba: Uint8ClampedArray): { color: string; plate: string | null } {
  const pixels: number[][] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) if (rgba[i + 3]! > 200) pixels.push([rgba[i]!, rgba[i + 1]!, rgba[i + 2]!]);
  if (pixels.length < 8) return { color: '#ffffff', plate: null };
  const lum = (p: number[]) => p[0]! * 0.299 + p[1]! * 0.587 + p[2]! * 0.114;
  const sorted = [...pixels].sort((a, b) => lum(a) - lum(b));
  let centres = [sorted[Math.floor(sorted.length * 0.1)]!, sorted[Math.floor(sorted.length * 0.9)]!];
  let groups: number[][][] = [[], []];
  for (let round = 0; round < 8; round++) {
    groups = [[], []];
    for (const p of pixels) {
      const d = centres.map(c => (p[0]! - c[0]!) ** 2 + (p[1]! - c[1]!) ** 2 + (p[2]! - c[2]!) ** 2);
      groups[d[0]! <= d[1]! ? 0 : 1]!.push(p);
    }
    centres = groups.map((group, index) => group.length ? [0, 1, 2].map(k => mean(group.map(p => p[k]!))) : centres[index]!);
  }
  const [textIndex, backIndex] = groups[0]!.length <= groups[1]!.length ? [0, 1] : [1, 0];
  const back = groups[backIndex]!;
  const spread = Math.sqrt(mean(back.map(p => (lum(p) - lum(centres[backIndex]!)) ** 2)));
  return { color: hex(centres[textIndex]!), plate: spread < 18 ? hex(centres[backIndex]!) : null };
}

/**
 * The rows the caption's letters actually cover, in a region around an OCR box: the rows where enough
 * pixels are the caption's text colour, taking the run that holds the OCR box's middle (OCR boxes from
 * vision models are approximate, often short of the glyphs). Fractions of the region's height.
 */
export function inkExtent(rgba: Uint8ClampedArray, width: number, height: number, color: string, middle = 0.5): { top: number; bottom: number } | null {
  const target = [1, 3, 5].map(at => parseInt(color.slice(at, at + 2), 16));
  const need = Math.max(2, Math.round(width * 0.01));
  const inked: boolean[] = [];
  for (let row = 0; row < height; row++) {
    let count = 0;
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * 4;
      if (Math.hypot(rgba[i]! - target[0]!, rgba[i + 1]! - target[1]!, rgba[i + 2]! - target[2]!) < 60) count++;
    }
    inked.push(count >= need);
  }
  let at = Math.min(height - 1, Math.max(0, Math.round(middle * height)));
  if (!inked[at]) {
    // The nearest inked row to the middle, within a fifth of the region.
    const reach = Math.round(height / 5);
    let found = -1;
    for (let step = 1; step <= reach && found < 0; step++) for (const row of [at - step, at + step]) if (row >= 0 && row < height && inked[row]) { found = row; break; }
    if (found < 0) return null;
    at = found;
  }
  let top = at; let bottom = at;
  // A gap of a row or two inside a line of text (between strokes) is bridged.
  while (top > 0 && (inked[top - 1] || (top > 1 && inked[top - 2]))) top--;
  while (bottom < height - 1 && (inked[bottom + 1] || (bottom < height - 2 && inked[bottom + 2]))) bottom++;
  return { top: top / height, bottom: (bottom + 1) / height };
}

