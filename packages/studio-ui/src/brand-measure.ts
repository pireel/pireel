import { captionBand, type VideoObservation } from '@pireel/studio-engine/brand-analysis';
import { captionNear, readingWindows } from '@pireel/studio-engine/brand-facts';
import type { Moment } from '@pireel/studio-engine/brand-reading';
import { bandColors, inkExtent } from '@pireel/studio-engine/brand-visual';
import type { CutPair, VisualSample } from '@pireel/studio-engine/brand-visual';
import type { FrameGeom } from '@pireel/studio-engine/geometry-math';
import { detectScenes } from '@pireel/studio-engine/video-edit/scene-detection';

/**
 * The decoding half of brand extraction: everything that needs the video's pixels or sound — samples
 * for the text pass, cuts, faces, hashes, overlays, loudness, the strips each video is read through,
 * stills, crops and clips. Browser APIs only (MediaBunny, MediaPipe, OffscreenCanvas), so the same code
 * runs in the studio and in the headless Chrome of the server's measuring service.
 */

export const OCR_EVERY_SEC = 2;
export const OCR_MAX_SEC = 80;
export const HASH_RATE = 2;
/** Head/tail windows for recurring intros/outros: stings often follow a cold open of several seconds. */
const HEAD_SEC = 15;
const TAIL_SEC = 10;
const OCR_WIDTH = 540;
/** Visual primitives for layout / cut-type classification (sizes as in the research evaluation). */
const LAYOUT_THUMB = 48;
const CUT_THUMB = 64;
const MAX_CUT_PAIRS = 40;
const CUT_OFFSET_SEC = 0.12;

/** One measured video: its observation (no speech yet) and the frames kept for the text pass. */
export interface MeasuredVideo { observation: VideoObservation; ocrFrames: Map<number, Blob>; width: number; height: number }

export const jpeg = (canvas: OffscreenCanvas, quality = 0.82) => canvas.convertToBlob({ type: 'image/jpeg', quality });
export async function blobBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) text += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(text);
}

/** 16×16 difference hash as 64 hex chars (256 bits), the same measure as the evaluation prototype. */
function dhash(ctx: OffscreenCanvasRenderingContext2D, source: CanvasImageSource): string {
  ctx.drawImage(source, 0, 0, 17, 16);
  const data = ctx.getImageData(0, 0, 17, 16).data;
  const gray = (x: number, y: number) => { const i = (y * 17 + x) * 4; return data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114; };
  let hex = '';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x += 4) {
    let nibble = 0;
    for (let bit = 0; bit < 4; bit++) nibble = (nibble << 1) | (gray(x + bit + 1, y) > gray(x + bit, y) ? 1 : 0);
    hex += nibble.toString(16);
  }
  return hex;
}

/** Edge map at a small width; summed across frames it shows what never moves (overlays). */
function edges(ctx: OffscreenCanvasRenderingContext2D, source: CanvasImageSource, w: number, h: number): Uint8Array {
  ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h);
  const lum = (i: number) => data[i * 4]! * 0.299 + data[i * 4 + 1]! * 0.587 + data[i * 4 + 2]! * 0.114;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = lum(i + 1) - lum(i - 1); const gy = lum(i + w) - lum(i - w);
    out[i] = gx * gx + gy * gy > 60 * 60 ? 1 : 0;
  }
  return out;
}

function persistentOverlays(maps: Uint8Array[], w: number, h: number): VideoObservation['overlays'] {
  if (maps.length < 8) return [];
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { let count = 0; for (const map of maps) count += map[i]!; mask[i] = count / maps.length > 0.8 ? 1 : 0; }
  // Group persistent pixels into boxes on a coarse grid; keep compact clusters near an edge.
  const cell = 6; const gw = Math.ceil(w / cell); const gh = Math.ceil(h / cell);
  const grid = new Uint8Array(gw * gh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) grid[Math.floor(y / cell) * gw + Math.floor(x / cell)]++;
  const seen = new Uint8Array(gw * gh); const boxes: VideoObservation['overlays'] = [];
  for (let start = 0; start < gw * gh; start++) {
    if (seen[start] || grid[start]! < 3) continue;
    const stack = [start]; seen[start] = 1; let x0 = gw, y0 = gh, x1 = 0, y1 = 0, ink = 0;
    while (stack.length) {
      const at = stack.pop()!; const gx = at % gw; const gy = Math.floor(at / gw); ink += grid[at]!;
      x0 = Math.min(x0, gx); y0 = Math.min(y0, gy); x1 = Math.max(x1, gx); y1 = Math.max(y1, gy);
      for (const next of [at - 1, at + 1, at - gw, at + gw]) if (next >= 0 && next < gw * gh && !seen[next] && grid[next]! >= 3 && Math.abs((next % gw) - gx) <= 1) { seen[next] = 1; stack.push(next); }
    }
    const box = { x: x0 * cell / w, y: y0 * cell / h, w: (x1 - x0 + 1) * cell / w, h: (y1 - y0 + 1) * cell / h };
    if (ink >= 20 && box.w < 0.5 && box.h < 0.25) boxes.push(box);
  }
  return boxes;
}

/**
 * Measure one video: OCR samples (frames kept for the text pass), cuts, faces, head/tail hashes,
 * persistent overlays, layout and cut primitives, loudness. Speech is transcribed elsewhere.
 */
export async function measureBrandVideo(blob: Blob, id: string, signal: AbortSignal, label = id): Promise<MeasuredVideo> {
  const file = blob instanceof File ? blob : new File([blob], `${id}.mp4`, { type: blob.type || 'video/mp4' });
  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error(`没有视频画面：${label}`);
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const durationSec = (await input.computeDuration()) - t0;
    const width = track.displayWidth; const height = track.displayHeight;
    const ocrTimes: number[] = [];
    for (let t = 0.5; t < Math.min(durationSec, OCR_MAX_SEC); t += OCR_EVERY_SEC) ocrTimes.push(t);
    const headTimes = Array.from({ length: Math.floor(Math.min(HEAD_SEC, durationSec) * HASH_RATE) }, (_, i) => i / HASH_RATE);
    const tailStart = Math.max(0, durationSec - TAIL_SEC);
    const tailTimes = Array.from({ length: Math.floor((durationSec - tailStart) * HASH_RATE) }, (_, i) => tailStart + i / HASH_RATE);
    const all = [...new Set([...ocrTimes, ...headTimes, ...tailTimes])].sort((a, b) => a - b);
    const ocrHeight = Math.round(OCR_WIDTH * height / width);
    const frameCanvas = new OffscreenCanvas(OCR_WIDTH, ocrHeight);
    const frameCtx = frameCanvas.getContext('2d')!;
    const hashCtx = new OffscreenCanvas(17, 16).getContext('2d', { willReadFrequently: true })!;
    const ew = 180; const eh = Math.round(ew * height / width);
    const edgeCtx = new OffscreenCanvas(ew, eh).getContext('2d', { willReadFrequently: true })!;
    const ocrFrames = new Map<number, Blob>(); const head: string[] = []; const tail: string[] = []; const edgeMaps: Uint8Array[] = [];
    const thumbCtx = new OffscreenCanvas(LAYOUT_THUMB, LAYOUT_THUMB).getContext('2d', { willReadFrequently: true })!;
    const thumbs = new Map<number, Uint8Array>();
    const sink = new VideoSampleSink(track);
    let index = 0;
    for await (const sample of sink.samplesAtTimestamps(all.map(t => t + t0))) {
      signal.throwIfAborted();
      const t = all[index++]!;
      if (!sample) continue;
      try {
        sample.draw(frameCtx, 0, 0, OCR_WIDTH, ocrHeight);
        const edgeMap = edges(edgeCtx, frameCanvas, ew, eh);
        // A frame with (almost) no edges is solid black/colour: it would hash alike across unrelated
        // videos, so it is recorded as '' and never counts as a match. Text on a solid card has edges.
        const hash = edgeMap.reduce((count, value) => count + value, 0) < 20 ? '' : dhash(hashCtx, frameCanvas);
        if (ocrTimes.includes(t)) { ocrFrames.set(t, await jpeg(frameCanvas)); edgeMaps.push(edgeMap); thumbs.set(t, grayThumb(thumbCtx, frameCanvas, LAYOUT_THUMB)); }
        if (headTimes.includes(t)) head.push(hash);
        if (tailTimes.includes(t)) tail.push(hash);
      } finally { sample.close(); }
    }
    const cuts = (await detectScenes(file, { minSceneLenSec: 0.3 })).map(cut => cut.timestamp);
    const { faces, faceSamples, frames } = await detectFaces(file, durationSec);
    signal.throwIfAborted();
    const visual = await visualPrimitives(file, cuts, thumbs, frames, durationSec);
    signal.throwIfAborted();
    const loudnessLufs = await measureLoudness(file);
    return { width, height, ocrFrames, observation: { id, durationSec, width, height, ocr: [], cuts, faces, faceSamples, headHashes: head, tailHashes: tail, overlays: persistentOverlays(edgeMaps, ew, eh), loudnessLufs, ...(visual ? { visual } : {}) } };
  } finally { await input.dispose(); }
}

/** Largest face per frame at 2 fps (MediaPipe, local and free). A failed model load leaves framing to the platform default. */
async function detectFaces(file: File, durationSec: number): Promise<{ faces: VideoObservation['faces']; faceSamples: number; frames: FrameGeom[] }> {
  const { analyzeGeometry } = await import('./geometry');
  const frames = await analyzeGeometry(file, durationSec).catch(() => null);
  if (!frames?.length) return { faces: [], faceSamples: 0, frames: [] };
  return { faces: frames.flatMap(frame => frame.face ? [{ t: frame.t, ...frame.face }] : []), faceSamples: frames.length, frames };
}

/** Luminance of `source` squeezed to size×size (aspect ignored: regions stay in normalized coordinates). */
function grayThumb(ctx: OffscreenCanvasRenderingContext2D, source: CanvasImageSource, size: number): Uint8Array {
  ctx.drawImage(source, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const out = new Uint8Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = Math.round(data[i * 4]! * 0.299 + data[i * 4 + 1]! * 0.587 + data[i * 4 + 2]! * 0.114);
  return out;
}

/** Grayscale frames of one video at the given times. */
async function grayFrames(file: File, times: number[], size: number): Promise<Map<number, Uint8Array>> {
  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const out = new Map<number, Uint8Array>();
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return out;
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const ctx = new OffscreenCanvas(size, size).getContext('2d', { willReadFrequently: true })!;
    const sorted = [...new Set(times)].sort((a, b) => a - b);
    let index = 0;
    for await (const sample of new VideoSampleSink(track).samplesAtTimestamps(sorted.map(t => t + t0))) {
      const t = sorted[index++]!;
      if (!sample) continue;
      try { sample.draw(ctx, 0, 0, size, size); out.set(t, grayThumb(ctx, ctx.canvas, size)); } finally { sample.close(); }
    }
    return out;
  } finally { await input.dispose(); }
}

/**
 * Layout samples (thumbnail + nearest face/occupancy from the 2 fps geometry pass) and frames around up to
 * MAX_CUT_PAIRS cuts spread over the video. Without geometry there is no face to anchor on: skipped.
 */
async function visualPrimitives(file: File, cuts: number[], thumbs: Map<number, Uint8Array>, frames: FrameGeom[], durationSec: number): Promise<VideoObservation['visual'] | null> {
  if (!frames.length || !thumbs.size) return null;
  const nearest = (t: number, pick: (frame: FrameGeom) => boolean = () => true) => { let best: FrameGeom | null = null; for (const frame of frames) if (pick(frame) && (!best || Math.abs(frame.t - t) < Math.abs(best.t - t))) best = frame; return best && Math.abs(best.t - t) <= 0.75 ? best : null; };
  const samples: VisualSample[] = [...thumbs.entries()].sort((a, b) => a[0] - b[0]).map(([t, gray]) => { const geom = nearest(t); return { t, face: geom?.face ?? null, occ: geom?.occ ?? null, gray, size: LAYOUT_THUMB }; });
  const usable = cuts.filter(cut => cut > CUT_OFFSET_SEC && cut < durationSec - CUT_OFFSET_SEC);
  const step = Math.max(1, usable.length / MAX_CUT_PAIRS);
  const picked = Array.from({ length: Math.min(MAX_CUT_PAIRS, usable.length) }, (_, i) => usable[Math.floor(i * step)]!);
  const grays = await grayFrames(file, picked.flatMap(cut => [cut - CUT_OFFSET_SEC, cut + CUT_OFFSET_SEC]), CUT_THUMB);
  const pairs: CutPair[] = picked.flatMap(cut => {
    const before = grays.get(cut - CUT_OFFSET_SEC); const after = grays.get(cut + CUT_OFFSET_SEC);
    if (!before || !after) return [];
    return [{ t: cut, before, after, size: CUT_THUMB, faceBefore: nearest(cut - 0.25, frame => frame.t <= cut)?.face ?? null, faceAfter: nearest(cut + 0.25, frame => frame.t >= cut)?.face ?? null }];
  });
  return { samples, pairs };
}

/** Loudness measured while decoding, so long videos never hold their whole soundtrack in memory. */
async function measureLoudness(file: Blob): Promise<number | null> {
  const { streamVideoLoudness } = await import('./audio-decode');
  return streamVideoLoudness(file).catch(() => null);
}

export async function crop(blob: Blob, box: { x: number; y: number; w: number; h: number }, pad = 0.02, type = 'image/jpeg'): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const x = Math.max(0, (box.x - pad) * bitmap.width); const y = Math.max(0, (box.y - pad) * bitmap.height);
    const w = Math.min(bitmap.width - x, (box.w + pad * 2) * bitmap.width); const h = Math.min(bitmap.height - y, (box.h + pad * 2) * bitmap.height);
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    canvas.getContext('2d')!.drawImage(bitmap, x, y, w, h, 0, 0, canvas.width, canvas.height);
    return canvas.convertToBlob({ type, quality: 0.9 });
  } finally { bitmap.close(); }
}

/** Cut [start, end) out of a source video as the brand's own intro/outro asset. */
export async function trimToFile(file: Blob, start: number, end: number, name: string): Promise<File> {
  const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const conversion = await Conversion.init({ input, output, trim: { start, end } });
  if (!conversion.isValid) throw new Error('片头片尾无法从原片裁出。');
  await conversion.execute();
  await input.dispose();
  return new File([target.buffer!], name, { type: 'video/mp4' });
}

/** Decode the given times of one video into small JPEG stills (for strips and evidence). */
export async function stills(file: Blob, times: number[], width: number): Promise<Map<number, Blob>> {
  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const out = new Map<number, Blob>();
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return out;
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const canvas = new OffscreenCanvas(width, Math.round(width * track.displayHeight / track.displayWidth));
    const ctx = canvas.getContext('2d')!;
    const sorted = [...new Set(times)].sort((a, b) => a - b);
    let index = 0;
    for await (const sample of new VideoSampleSink(track).samplesAtTimestamps(sorted.map(t => t + t0))) {
      const t = sorted[index++]!;
      if (!sample) continue;
      try { sample.draw(ctx, 0, 0, canvas.width, canvas.height); out.set(t, await jpeg(canvas, 0.8)); } finally { sample.close(); }
    }
    return out;
  } finally { await input.dispose(); }
}

/** Tiles with a caption bar under each cell: its time and the caption text read at that time. */
export async function tile(cells: { blob: Blob; label: string }[], columns: number, cellWidth: number): Promise<Blob> {
  const bitmaps = await Promise.all(cells.map(cell => createImageBitmap(cell.blob)));
  try {
    const cellHeight = Math.round(cellWidth * bitmaps[0]!.height / bitmaps[0]!.width); const bar = 34;
    const rows = Math.ceil(cells.length / columns);
    const canvas = new OffscreenCanvas(columns * cellWidth, rows * (cellHeight + bar));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    cells.forEach((cell, index) => {
      const x = (index % columns) * cellWidth; const y = Math.floor(index / columns) * (cellHeight + bar);
      ctx.drawImage(bitmaps[index]!, x, y, cellWidth, cellHeight);
      ctx.fillStyle = '#ffd400'; ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(cell.label.slice(0, 34), x + 4, y + cellHeight + 22, cellWidth - 8);
    });
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  } finally { bitmaps.forEach(bitmap => bitmap.close()); }
}

export const fmt = (t: number) => `${t.toFixed(1)}s`;

export async function pixelsOf(blob: Blob, box: { x: number; y: number; w: number; h: number }): Promise<Uint8ClampedArray> {
  return (await regionPixels(blob, box)).data;
}

/** The pixels of a region of an image (fractions of the image), with the region's size in pixels. */
export async function regionPixels(blob: Blob, box: { x: number; y: number; w: number; h: number }): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const x = Math.floor(box.x * bitmap.width), y = Math.floor(box.y * bitmap.height);
  const w = Math.max(1, Math.round(box.w * bitmap.width)), h = Math.max(1, Math.round(box.h * bitmap.height));
  const canvas = new OffscreenCanvas(w, h); const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h); bitmap.close();
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

/**
 * A caption's colours and where its letters really are: colours inside the OCR box, then the rows the
 * text colour covers in a region a box-height above and below it (OCR boxes are approximate and often
 * short of the glyphs). `ink` is in fractions of the frame's height.
 */
export async function captionLook(blob: Blob, box: { x: number; y: number; w: number; h: number }): Promise<{ color: string; plate: string | null; ink?: { top: number; bottom: number } }> {
  const colors = bandColors(await pixelsOf(blob, box));
  const top = Math.max(0, box.y - box.h); const bottom = Math.min(1, box.y + box.h * 2);
  const region = { x: box.x, y: top, w: box.w, h: bottom - top };
  const { data, width, height } = await regionPixels(blob, region);
  const ink = inkExtent(data, width, height, colors.color, (box.y + box.h / 2 - top) / region.h);
  return { ...colors, ...(ink ? { ink: { top: top + ink.top * region.h, bottom: top + ink.bottom * region.h } } : {}) };
}

export const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Caption text and plate colours, measured inside the caption band of the first video that has one. */
export async function captionColors(measured: MeasuredVideo[]): Promise<{ color: string; plate: string | null } | undefined> {
  for (const item of measured) {
    const band = captionBand(item.observation);
    const entry = band?.items.find(found => item.ocrFrames.has(found.t));
    if (!entry) continue;
    return bandColors(await pixelsOf(item.ocrFrames.get(entry.t)!, entry.box));
  }
  return undefined;
}

/** The images one video is read through: an overview grid labelled with the caption read at each time,
 *  and strips over the opening, the ending and each moment. */
export async function readingStrips(file: Blob, video: VideoObservation, moments: readonly Moment[]): Promise<{ role: string; blob: Blob }[]> {
  const windows = readingWindows(video.durationSec, moments);
  const frames = await stills(file, [...windows.overview, ...windows.strips.flatMap(window => window.times)], 270);
  const near = captionNear(video);
  const overview = await tile(windows.overview.filter(t => frames.has(t)).map(t => ({ blob: frames.get(t)!, label: `${fmt(t)} ${near(t)}` })), 4, 270);
  const strips = await Promise.all(windows.strips.map(async window => ({ role: window.role, blob: await tile(window.times.filter(t => frames.has(t)).map(t => ({ blob: frames.get(t)!, label: fmt(t) })), 4, 270) })));
  return [{ role: 'overview grid', blob: overview }, ...strips];
}
