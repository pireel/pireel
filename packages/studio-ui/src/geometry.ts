'use client';

/**
 * Geometry pass (free, no tokens): dense person segmentation + face detection
 * in-browser via MediaPipe, computing each segment's safe-zone coordinates
 * (normalized [0..1], origin top-left, multiply by comp size for block placement).
 *
 * Split of duties: geometry only (where the person is, where it's empty). Semantics
 * (theme/composition/content) belong to the VLM (sparse, see visual.ts).
 * Any failure degrades to null; the main path falls back to the VLM's coarse safe zone.
 *
 * Safe-zone algorithm:
 *  - Per frame: segment -> downsample person occupancy to a coarse grid; keep the face box separate (hard no-go).
 *  - Segment safe zone = union of per-frame occupancy (avoid everywhere the subject ever appeared) -> take the complement.
 *  - Run top-K max-empty-rectangle over the complement grid -> placeable rects ({x,y,w,h} normalized).
 */

// mediabunny / @mediapipe/tasks-vision are heavy and only needed after "user picked a video + ran visual analysis":
// always dynamic-import, keep them out of the /studio initial bundle. Type imports don't enter the bundle.
import type { FaceDetector, ImageSegmenter } from '@mediapipe/tasks-vision';
import { GRID_H, GRID_W, type FrameGeom, type NRect, type SafeZone, safeZoneForRange } from '@pireel/studio-engine/geometry-math';
import { t } from './i18n';

export type { NRect, FrameGeom, SafeZone } from '@pireel/studio-engine/geometry-math';
export { safeZoneForRange } from '@pireel/studio-engine/geometry-math';

const GEOM_FPS = 2;
const MAX_FRAMES = 420; // short clips at 2fps; long clips spread these frames across the whole span (~1 frame/1.5s @10min) so every segment gets geometry
const SEG_THRESHOLD = 0.4;

// self-host: WASM + models live in public/mediapipe/ (same-origin, no dependency on Google/jsdelivr).
// After upgrading @mediapipe/tasks-vision, rerun scripts/sync-mediapipe.sh to re-copy the wasm.
const WASM = '/mediapipe/wasm';
const SEG_MODEL = '/mediapipe/selfie_segmenter.tflite';
const FACE_MODEL = '/mediapipe/blaze_face_short_range.tflite';

interface MP {
  seg: ImageSegmenter;
  face: FaceDetector;
  delegate: 'GPU' | 'CPU';
}
let _mp: Promise<MP | null> | null = null;

// Diagnostics: last geometry-pass status (for the 🧪 panel + console; no more silent failures)
let _note: string | null = null; // null = not run (t() banned at module scope; default string is translated at geomNote's use site)
export function geomNote(): string {
  return _note ?? t('未运行');
}

function loadMP(): Promise<MP | null> {
  if (_mp) return _mp;
  const p = (async () => {
    const { FaceDetector, FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    // Prefer CPU (XNNPACK): the browser WebGL GPU delegate often "creates fine but inference returns empty/garbage"
    // (face + segmentation both go dead). This is offline 2fps×256px analysis, so CPU is plenty and is the reference
    // impl — most reliable. GPU is only a fallback if CPU creation fails.
    for (const delegate of ['CPU', 'GPU'] as const) {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM);
        const seg = await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: SEG_MODEL, delegate },
          runningMode: 'IMAGE',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
        const face = await FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL, delegate },
          runningMode: 'IMAGE',
        });
        console.info(`[studio/geometry] MediaPipe ready (${delegate})`);
        return { seg, face, delegate };
      } catch (e) {
        _note = t('MediaPipe({delegate}) 加载失败: {msg}', { delegate, msg: e instanceof Error ? e.message : String(e) });
        console.warn('[studio/geometry]', _note); // on GPU failure it auto-retries CPU
      }
    }
    return null;
  })();
  _mp = p;
  // Don't permanently cache a load failure (resolve null / reject): reset so the next call retries,
  // otherwise one network hiccup pins the whole session's geometry pass to null.
  p.then(
    (mp) => {
      if (!mp && _mp === p) _mp = null;
    },
    () => {
      if (_mp === p) _mp = null;
    },
  );
  return p;
}

/** Single-frame inference: segment -> person occupancy grid + face box. Shared by both entry points (dense analysis / realtime single frame). */
function inferFrame(mp: MP, canvas: HTMLCanvasElement, cw: number, ch: number): { face: NRect | null; occ: Uint8Array } {
  const occ = new Uint8Array(GRID_W * GRID_H);
  try {
    const res = mp.seg.segment(canvas);
    // mask is WASM-side memory; close must run in finally so an exception mid-way can't leak (dense pass calls per-frame, leaks accumulate)
    try {
      const conf = res.confidenceMasks?.[0];
      const cat = res.categoryMask;
      if (conf) {
        const arr = conf.getAsFloat32Array();
        const mw = conf.width;
        const mh = conf.height;
        for (let gy = 0; gy < GRID_H; gy++) {
          const py = Math.min(mh - 1, Math.floor(((gy + 0.5) / GRID_H) * mh));
          for (let gx = 0; gx < GRID_W; gx++) {
            const px = Math.min(mw - 1, Math.floor(((gx + 0.5) / GRID_W) * mw));
            if ((arr[py * mw + px] ?? 0) > SEG_THRESHOLD) occ[gy * GRID_W + gx] = 1;
          }
        }
      } else if (cat) {
        const arr = cat.getAsUint8Array();
        const mw = cat.width;
        const mh = cat.height;
        for (let gy = 0; gy < GRID_H; gy++) {
          const py = Math.min(mh - 1, Math.floor(((gy + 0.5) / GRID_H) * mh));
          for (let gx = 0; gx < GRID_W; gx++) {
            const px = Math.min(mw - 1, Math.floor(((gx + 0.5) / GRID_W) * mw));
            if ((arr[py * mw + px] ?? 0) > 0) occ[gy * GRID_W + gx] = 1;
          }
        }
      }
    } finally {
      res.confidenceMasks?.forEach((m) => m.close());
      res.categoryMask?.close();
    }
  } catch {
    /* segmentation failed for this frame -> treat as all-empty */
  }
  let face: NRect | null = null;
  try {
    const b = mp.face.detect(canvas).detections?.[0]?.boundingBox;
    if (b) face = { x: b.originX / cw, y: b.originY / ch, w: b.width / cw, h: b.height / ch };
  } catch {
    /* no face detected */
  }
  return { face, occ };
}

/**
 * Realtime person mask (for the "text behind person" preview): prefer RVM matting (WebGPU, hair-level soft edges +
 * temporal stability); if WebGPU is unavailable/fails, fall back to selfie segmentation (256 grid, low-quality fallback;
 * 0.2–0.8 confidence gives a wide soft transition, preserving the model's own soft edge from being re-hardened).
 * Returns null on failure/not-ready; the caller skips that frame.
 * Closes the passed-in bitmap either way (it was transferred via postMessage and isn't returned).
 */
export async function segmentPersonMask(src: ImageBitmap): Promise<ImageBitmap | null> {
  try {
    const { matteMask } = await import('./person-matte');
    const matte = await matteMask(src);
    if (matte) return matte;
    const mp = await loadMP();
    if (!mp) return null;
    const res = mp.seg.segment(src);
    try {
      const conf = res.confidenceMasks?.[0];
      if (!conf) return null;
      const arr = conf.getAsFloat32Array();
      const mw = conf.width;
      const mh = conf.height;
      const px = new Uint8ClampedArray(mw * mh * 4);
      for (let i = 0; i < mw * mh; i++) {
        const c = arr[i] ?? 0;
        px[i * 4 + 3] = c <= 0.2 ? 0 : c >= 0.8 ? 255 : Math.round(((c - 0.2) / 0.6) * 255);
      }
      const oc = new OffscreenCanvas(mw, mh);
      const ctx = oc.getContext('2d');
      if (!ctx) return null;
      ctx.putImageData(new ImageData(px, mw, mh), 0, 0);
      return oc.transferToImageBitmap();
    } finally {
      res.confidenceMasks?.forEach((m) => m.close());
      res.categoryMask?.close();
    }
  } catch {
    return null;
  } finally {
    try {
      src.close();
    } catch {
      /* ignore */
    }
  }
}

/** Dense per-frame segmentation -> person occupancy grid + face box. Returns null on failure. */
export async function analyzeGeometry(
  file: File,
  durationSec: number,
  onProgress?: (done: number, total: number) => void,
): Promise<FrameGeom[] | null> {
  const mp = await loadMP();
  if (!mp) return null; // _note already recorded the load-failure reason

  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) {
      _note = t('无视频轨,几何跳过');
      return null;
    }
    const vw = track.displayWidth || 720;
    const vh = track.displayHeight || 1280;
    const scale = Math.min(1, 256 / Math.max(vw, vh)); // shrink inference input to long edge ≤256
    const cw = Math.max(2, Math.round(vw * scale));
    const ch = Math.max(2, Math.round(vh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    // Sample uniformly across the whole clip: short clips use GEOM_FPS; long clips spread MAX_FRAMES over the full span
    // (otherwise only the first MAX_FRAMES/GEOM_FPS seconds = 90s get covered, and later segments have no geometry and share one fallback).
    const stamps: number[] = [];
    const step = Math.max(1 / GEOM_FPS, durationSec / MAX_FRAMES);
    for (let t = 0; t < durationSec && stamps.length < MAX_FRAMES; t += step) stamps.push(t);

    // Zeroed timebase: stamps are in playback terms (durationSec already zeroed); add the original offset back for the
    // request and subtract it on the returned time (for mp4s whose first packet is non-zero, see thumbnails.ts)
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const sink = new VideoSampleSink(track);
    const out: FrameGeom[] = [];
    const total = stamps.length;
    let done = 0;
    for await (const sample of sink.samplesAtTimestamps(stamps.map((s) => s + t0))) {
      if (!sample) continue;
      const t = sample.timestamp - t0;
      sample.draw(ctx as unknown as CanvasRenderingContext2D, 0, 0, cw, ch);
      sample.close();

      out.push({ t, ...inferFrame(mp, canvas, cw, ch) });
      done += 1;
      onProgress?.(done, total);
    }
    const withSubject = out.filter((f) => f.occ.some((v) => v)).length;
    const faceHits = out.filter((f) => f.face).length;
    // Average person occupancy (rough check that segmentation is working: talking-head is usually 15~60%; ≈0 = segmentation missed the person, very high = polarity may be inverted)
    const avgOcc = out.length ? Math.round((out.reduce((s, f) => s + f.occ.reduce((a, v) => a + v, 0), 0) / out.length / (GRID_W * GRID_H)) * 100) : 0;
    _note = t('已分析 {n} 帧({delegate}) · 人 {subject}帧/占{occ}% · 脸 {face}帧', { n: out.length, delegate: mp.delegate, subject: withSubject, occ: avgOcc, face: faceHits });
    return out;
  } catch (e) {
    _note = t('几何遍异常: {msg}', { msg: e instanceof Error ? e.message : String(e) });
    console.warn('[studio/geometry]', _note);
    return null;
  } finally {
    await input.dispose();
  }
}

/**
 * Range geometry (for inserted clips): sample `frames` frames uniformly over source time [start,end]
 * (each at its cell midpoint, avoiding transition-blur frames near cut points) and run segmentation + face.
 * Only a few frames, so it's fast; doesn't touch _note diagnostics (those belong to the main-source pass).
 * MediaPipe unavailable / no video track / not a single frame decoded -> null; the caller falls back.
 */
export async function analyzeGeometryRange(file: File, start: number, end: number, frames = 6): Promise<FrameGeom[] | null> {
  const mp = await loadMP();
  if (!mp) return null;
  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const vw = track.displayWidth || 720;
    const vh = track.displayHeight || 1280;
    const scale = Math.min(1, 256 / Math.max(vw, vh));
    const cw = Math.max(2, Math.round(vw * scale));
    const ch = Math.max(2, Math.round(vh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const span = Math.max(0, end - start);
    const n = Math.max(1, Math.round(frames));
    const stamps = Array.from({ length: n }, (_, i) => Math.max(0, start) + (span * (i + 0.5)) / n);
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const sink = new VideoSampleSink(track);
    const out: FrameGeom[] = [];
    for await (const sample of sink.samplesAtTimestamps(stamps.map((s) => s + t0))) {
      if (!sample) continue;
      const t = sample.timestamp - t0;
      sample.draw(ctx as unknown as CanvasRenderingContext2D, 0, 0, cw, ch);
      sample.close();
      out.push({ t, ...inferFrame(mp, canvas, cw, ch) });
    }
    return out.length ? out : null;
  } catch (e) {
    console.warn('[studio/geometry] interval geometry failed:', e instanceof Error ? e.message : String(e));
    return null;
  } finally {
    await input.dispose();
  }
}

/**
 * Realtime single-frame detection (for debugging): grab the frame at time t, compute segmentation + face on the fly
 * -> that frame's safe zone / face / subject. Feeds the preview overlay's "measure wherever you drag" — more accurate
 * than the sparse cache. Opens/closes Input each call, so debounce it.
 */
export async function detectFrameAt(file: File, t: number): Promise<SafeZone | null> {
  const mp = await loadMP();
  if (!mp) return null;
  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const vw = track.displayWidth || 720;
    const vh = track.displayHeight || 1280;
    const scale = Math.min(1, 256 / Math.max(vw, vh));
    const cw = Math.max(2, Math.round(vw * scale));
    const ch = Math.max(2, Math.round(vh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const sink = new VideoSampleSink(track);
    for await (const sample of sink.samplesAtTimestamps([Math.max(0, t) + t0])) {
      if (!sample) continue;
      sample.draw(ctx as unknown as CanvasRenderingContext2D, 0, 0, cw, ch);
      sample.close();
      const fg: FrameGeom = { t, ...inferFrame(mp, canvas, cw, ch) };
      return safeZoneForRange([fg], t, t);
    }
    return null;
  } catch {
    return null;
  } finally {
    await input.dispose();
  }
}
