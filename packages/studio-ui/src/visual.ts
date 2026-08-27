'use client';

/**
 * Studio visual analysis: observe footage without prescribing an edit. It produces:
 *  1) Real source cuts (detectScenes, browser-local).
 *  2) Dense local geometry and ranked technical-quality windows.
 *  3) Sparse semantic labels (one VLM frame per sampled interval, including subdivisions of long uncut takes).
 * Real cuts remain distinct from observation intervals; downstream editorial judgment chooses the shot ranges.
 */

import { detectScenes } from '@pireel/studio-engine/video-edit/scene-detection';
import { extractThumbnails } from '@pireel/studio-engine/video-edit/thumbnails';
import { type NRect, type SafeZone, analyzeGeometryAndQuality, analyzeGeometryRange, geomNote, safeZoneForRange } from './geometry';
import { type DerivedPalette, extractPalette } from './palette';
import { fileSig } from './media';
import { buildVisualQualityWindows, type VisualQualityWindow } from '@pireel/studio-engine/visual-quality';

// Data contracts live in the engine package (analysis impl stays here): layoutFromPlan etc. consume these shapes
export type { VisualLabel, VisualSegment, VisualTimeline } from '@pireel/studio-engine/visual-types';
import type { VisualLabel, VisualSegment, VisualTimeline } from '@pireel/studio-engine/visual-types';

const MAX_VLM = 8; // VLM (paid) cost cap: segments are NOT dropped; only this many points are sampled to the VLM, other segments inherit semantics from the nearest
const MAX_SEMANTIC_SPAN_SEC = 12; // a long take with no hard cuts still needs action/content observations across time
const VLM_CONCURRENCY = 2; // Avoid bursting every sampled frame into the same pinned upstream at once.
const CAPTION_RESERVE = 0.16; // fixed bottom 16% reserved for captions (don't detect original captions: the start often has none, and captions get added to the bottom in post)
const DEFAULT_LABEL: VisualLabel = { content: 'talkinghead', person: 'center', safe: 'full', hasText: false, desc: '' };
const geometryCache = new Map<string, VisualTimeline>();

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  requestedConcurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const concurrency = Math.max(1, Math.min(items.length, Math.floor(requestedConcurrency) || 1));
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const run = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => run()));
  return results;
}

/* ---------- Visual-analysis cache (localStorage, keyed by file fingerprint; same clip doesn't rerun the VLM) ---------- */
// v4: local technical-quality windows + long-take semantic subdivisions; old caches lack both and must be refreshed.
const VPREFIX = 'pinshot:studio:visual:v4:';
export function getCachedVisual(sig: string): VisualTimeline | null {
  if (!sig || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(VPREFIX + sig);
    return raw ? (JSON.parse(raw) as VisualTimeline) : null;
  } catch {
    return null;
  }
}
function setCachedVisual(sig: string, v: VisualTimeline): void {
  if (!sig || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(VPREFIX + sig, JSON.stringify(v));
  } catch {
    /* quota full / private mode: silent */
  }
}

/** Clear the visual-analysis cache: clears one entry for a given sig, otherwise clears all (for forcing a rerun while debugging). */
export function clearVisualCache(sig?: string): void {
  if (sig) geometryCache.delete(sig);
  else geometryCache.clear();
  if (typeof localStorage === 'undefined') return;
  try {
    if (sig) {
      localStorage.removeItem(VPREFIX + sig);
      return;
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(VPREFIX)) localStorage.removeItem(k);
    }
  } catch {
    /* silent */
  }
}

async function blobToBase64(blob: Blob): Promise<{ base64: string; mime: string }> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
  return { base64: btoa(bin), mime: blob.type || 'image/jpeg' };
}

/** Real cuts -> analysis segments. Long takes are subdivided only for observation coverage;
 * `VisualTimeline.cuts` remains the source of truth for actual edit boundaries. */
export function analysisSegmentsFromCuts(cuts: number[], durationSec: number): { start: number; end: number }[] {
  const inner = cuts.filter((t) => t > 0.3 && t < durationSec - 0.1).sort((a, b) => a - b);
  const bounds = [0, ...inner, durationSec];
  const segs: { start: number; end: number }[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i]!;
    const end = bounds[i + 1]!;
    const span = end - start;
    if (span <= 0.4) continue;
    const pieces = Math.max(1, Math.ceil(span / MAX_SEMANTIC_SPAN_SEC));
    for (let piece = 0; piece < pieces; piece++) {
      segs.push({
        start: start + (span * piece) / pieces,
        end: start + (span * (piece + 1)) / pieces,
      });
    }
  }
  return segs.length ? segs : [{ start: 0, end: durationSec }];
}

/** Too many segments -> evenly pick max of them (preserving boundary distribution). Only used to pick "VLM sampling points", not to drop segments themselves. */
function capSegments<T>(segs: T[], max: number): T[] {
  if (segs.length <= max) return segs;
  const step = segs.length / max;
  return Array.from({ length: max }, (_, i) => segs[Math.floor(i * step)]!);
}

/** Person bbox -> which side of the frame (for framing direction). null / tiny occupancy = none (no person / pure scenery). */
function personFromSubject(subject: NRect | null): VisualLabel['person'] {
  if (!subject || subject.w * subject.h < 0.02) return 'none';
  const cx = subject.x + subject.w / 2;
  return cx < 0.4 ? 'left' : cx > 0.6 ? 'right' : 'center';
}

/* ---------- Inserted-clip geometry (MediaPipe geometry pass only, free; NO VLM, don't burn money on inserted clips) ---------- */

/** Session-level cache: fileSig+range -> safe zone. Caches null on failure too — if one inserted source's analysis fails,
 *  each re-split in the same session shouldn't repeatedly rerun it (same policy as clipAsrFailRef). */
const clipZoneCache = new Map<string, SafeZone | null>();

/** Geometry safe zone for inserted clip [srcStart,srcEnd]: sample ~6 frames uniformly through MediaPipe, aggregate the
 *  range's rects (empty rects, largest first) + face, and subtract the bottom caption-reserve band (same convention as the main source).
 *  MediaPipe unavailable / frame sampling failed -> null (cached), caller falls back to FULL_GRAPHIC_BOX. */
export async function insertedClipSafeZone(file: File, srcStart: number, srcEnd: number): Promise<SafeZone | null> {
  const key = `${fileSig(file)}:${srcStart.toFixed(1)}-${srcEnd.toFixed(1)}`;
  if (clipZoneCache.has(key)) return clipZoneCache.get(key) ?? null;
  let zone: SafeZone | null = null;
  try {
    const frames = await analyzeGeometryRange(file, srcStart, srcEnd, 6);
    if (frames?.length) {
      zone = safeZoneForRange(frames, srcStart, srcEnd, [{ x: 0, y: 1 - CAPTION_RESERVE, w: 1, h: CAPTION_RESERVE }]);
    }
  } catch {
    zone = null;
  }
  clipZoneCache.set(key, zone);
  return zone;
}

/** Everything except the semantics pass (cuts/frame extraction/geometry/palette, all free) — shared by both the hosted
 *  path (VLM) and the BYO path (visual_brief: frames handed directly to an external agent to look at). Label assembly goes through finishVisualAnalysis. */
export interface VisualPrep {
  sig: string;
  durationSec: number;
  cuts: number[];
  segsAll: { start: number; end: number }[];
  /** VLM sampling frames (base64, timestamp = the actual sampled moment; extractThumbnails silently skips points it can't decode). */
  frames: { timestamp: number; base64: string; mime: string }[];
  geomFrames: Awaited<ReturnType<typeof analyzeGeometryAndQuality>>['frames'];
  qualityWindows: VisualQualityWindow[];
  palette: DerivedPalette | null;
}

export async function prepareVisualAnalysis(
  file: File,
  durationSec: number,
  onProgress?: (done: number, total: number) => void,
): Promise<{ cached: VisualTimeline } | { prep: VisualPrep }> {
  const sig = fileSig(file);
  const cached = getCachedVisual(sig);
  if (cached) {
    onProgress?.(1, 1); // cache hit: report complete immediately
    return { cached };
  }

  const cutObjs = await detectScenes(file).catch(() => []);
  const cuts = cutObjs.map((c) => c.timestamp).filter((t) => t > 0.3 && t < durationSec - 0.1);

  const segsAll = analysisSegmentsFromCuts(cuts, durationSec); // all analysis intervals, covering the whole clip (not dropped -> no gaps)
  const vlmSegs = capSegments(segsAll, MAX_VLM); // only these points get semantic sampling; other segments inherit from the nearest

  const stamps = vlmSegs.map((s) => Math.min(s.end - 0.05, s.start + (s.end - s.start) / 2));
  const thumbs = await extractThumbnails(file, stamps, { width: 360 });
  const palettePromise = extractPalette(thumbs); // reuse the same batch of thumbnail frames to sample the palette
  // The geometry pass (MediaPipe, per-frame) is the long pole; progress tracks it
  const [local, palette] = await Promise.all([
    analyzeGeometryAndQuality(file, durationSec, onProgress).catch(() => ({ frames: null, quality: [] })),
    palettePromise,
  ]);
  const qualityWindows = buildVisualQualityWindows(local.quality, durationSec, cuts);
  const frames = await Promise.all(
    thumbs.map(async (th) => {
      const img = await blobToBase64(th.blob);
      return { timestamp: th.timestamp, base64: img.base64, mime: img.mime };
    }),
  );
  thumbs.forEach((th) => URL.revokeObjectURL(th.url));
  return { prep: { sig, durationSec, cuts, segsAll, frames, geomFrames: local.frames, qualityWindows, palette } };
}

/** Semantic labels (labels[i] maps 1:1 to prep.frames[i], null = that frame got none) -> assemble the full VisualTimeline and cache it. */
export function finishVisualAnalysis(
  prep: VisualPrep,
  labels: (VisualLabel | null)[],
  options: { cache?: boolean } = {},
): VisualTimeline {
  const { cuts, segsAll, frames, geomFrames, qualityWindows, palette } = prep;
  // Sample points (actual sampled frame time -> label), letting non-sampled segments inherit semantics (content/hasText/desc) from the nearest.
  // Match back by the frames' own timestamp, not by index against vlmSegs (index misalignment would smear labels across segments).
  const vlmPts = frames.map((f, i) => ({ t: f.timestamp, label: labels[i] ?? DEFAULT_LABEL }));
  const nearestVlm = (t: number): VisualLabel => {
    let best = vlmPts[0]?.label ?? DEFAULT_LABEL;
    let bd = Infinity;
    for (const p of vlmPts) {
      const d = Math.abs(p.t - t);
      if (d < bd) {
        bd = d;
        best = p.label;
      }
    }
    return best;
  };

  // Caption reserve: always subtract a bottom band as a hard no-go zone (don't detect original captions); placements always avoid it, leaving room for post-added captions
  const textBands: NRect[] = [{ x: 0, y: 1 - CAPTION_RESERVE, w: 1, h: CAPTION_RESERVE }];

  // Build every segment: geometry (dense, free) computed independently per segment -> person position/framing direction accurate across the whole clip;
  // semantics inherited from the nearest sparse sample; the bottom reserve band is subtracted in every segment (hard no-go zone)
  const segments: VisualSegment[] = segsAll.map((s) => {
    const geom = geomFrames ? safeZoneForRange(geomFrames, s.start, s.end, textBands) : undefined;
    const base = nearestVlm((s.start + s.end) / 2);
    const person = geom ? personFromSubject(geom.subject) : base.person;
    const label: VisualLabel = { ...base, person };
    return { ...s, label, ...(geom ? { geom } : {}) };
  });
  const result: VisualTimeline = {
    cuts,
    segments,
    geomNote: geomNote(),
    ...(qualityWindows.length ? { qualityWindows } : {}),
    ...(textBands.length ? { textBands } : {}),
    ...(palette ? { palette } : {}),
  };
  // Only cache results where "at least one pass succeeded": semantics all failed + geometry pass all failed = pure fallback data;
  // caching that would pin the failure (reopening the same clip hits the cache and never retries). Partial success is cacheable; use clearVisualCache to force a rerun.
  const vlmOk = labels.some((l) => l !== null);
  if (options.cache !== false && (vlmOk || geomFrames || qualityWindows.length)) setCachedVisual(prep.sig, result);
  return result;
}

/** Local-only visual measurements. This path never calls the VLM and never writes the semantic
 * cache, so a later content/design request still performs full visual understanding. */
export async function analyzeVisualGeometry(
  file: File,
  durationSec: number,
  onProgress?: (done: number, total: number) => void,
): Promise<VisualTimeline> {
  const sig = fileSig(file);
  const semantic = getCachedVisual(sig);
  if (semantic) {
    onProgress?.(1, 1);
    return semantic;
  }
  const cached = geometryCache.get(sig);
  if (cached) {
    onProgress?.(1, 1);
    return cached;
  }
  const prepared = await prepareVisualAnalysis(file, durationSec, onProgress);
  if ('cached' in prepared) return prepared.cached;
  const timeline = finishVisualAnalysis(prepared.prep, [], { cache: false });
  geometryCache.set(sig, timeline);
  return timeline;
}

export async function analyzeVisual(
  file: File,
  durationSec: number,
  onProgress?: (done: number, total: number) => void,
): Promise<VisualTimeline> {
  const r = await prepareVisualAnalysis(file, durationSec, onProgress);
  if ('cached' in r) return r.cached;
  // Hosted semantics pass: send sampling frames to our own VLM (paid; the BYO path skips this step — the agent looks at the frames itself)
  const labels = await mapWithConcurrency(
    r.prep.frames,
    VLM_CONCURRENCY,
    async (f): Promise<VisualLabel | null> => {
      try {
        const resp = await fetch('/api/studio/vlm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ image_base64: f.base64, mime: f.mime }),
        });
        if (!resp.ok) return null;
        return (await resp.json()) as VisualLabel;
      } catch {
        return null;
      }
    },
  );
  return finishVisualAnalysis(r.prep, labels);
}
