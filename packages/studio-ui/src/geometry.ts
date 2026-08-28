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
import type { FaceDetector, FaceLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';
import { GRID_H, GRID_W, type FrameGeom, type NRect, type SafeZone, safeZoneForRange } from '@pireel/studio-engine/geometry-math';
import { isMouthVisiblyOpen, type EditorialFaceObservation } from '@pireel/studio-engine/mouth-state';
import { frameStabilityScore, type FrameMotionVector, type FrameQualityObservation } from '@pireel/studio-engine/visual-quality';
import { t } from './i18n';

export type { NRect, FrameGeom, SafeZone } from '@pireel/studio-engine/geometry-math';
export { safeZoneForRange } from '@pireel/studio-engine/geometry-math';

const GEOM_FPS = 2;
const MAX_FRAMES = 420; // short clips at 2fps; long clips spread these frames across the whole span (~1 frame/1.5s @10min) so every segment gets geometry
const SEG_THRESHOLD = 0.4;
const QUALITY_LONG_EDGE = 64;

// self-host: WASM + models live in public/mediapipe/ (same-origin, no dependency on Google/jsdelivr).
// After upgrading @mediapipe/tasks-vision, rerun scripts/sync-mediapipe.sh to re-copy the wasm.
const WASM = '/mediapipe/wasm';
const SEG_MODEL = '/mediapipe/selfie_segmenter.tflite';
const FACE_MODEL = '/mediapipe/blaze_face_short_range.tflite';
const EDITORIAL_FACE_MODEL = '/mediapipe/blaze_face_full_range.tflite';
const FACE_LANDMARKER_MODEL = '/mediapipe/face_landmarker.task';
const EDITORIAL_FACE_LONG_EDGE = 720;
const EDITORIAL_FACE_CROP_SIZE = 256;

interface MP {
  seg: ImageSegmenter;
  face: FaceDetector;
  delegate: 'GPU' | 'CPU';
}
let _mp: Promise<MP | null> | null = null;
let _faceLandmarker: Promise<FaceLandmarker | null> | null = null;
let _editorialFaceDetector: Promise<FaceDetector | null> | null = null;

// Diagnostics: last geometry-pass status (for the 🧪 panel + console; no more silent failures)
let _note: string | null = null; // null = not run (t() banned at module scope; default string is translated at geomNote's use site)
export function geomNote(): string {
  return _note ?? t('common.notRunYet');
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
        _note = t('common.mediapipeDelegateFailedLoad', { delegate, msg: e instanceof Error ? e.message : String(e) });
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

function loadFaceLandmarker(): Promise<FaceLandmarker | null> {
  if (_faceLandmarker) return _faceLandmarker;
  const pending = (async () => {
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    for (const delegate of ['CPU', 'GPU'] as const) {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM);
        return await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate },
          runningMode: 'IMAGE',
          numFaces: 1,
          minFaceDetectionConfidence: 0.45,
          minFacePresenceConfidence: 0.45,
          minTrackingConfidence: 0.45,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        });
      } catch (error) {
        console.warn('[studio/geometry] face landmarker failed:', error instanceof Error ? error.message : String(error));
      }
    }
    return null;
  })();
  _faceLandmarker = pending;
  pending.then(
    (landmarker) => { if (!landmarker && _faceLandmarker === pending) _faceLandmarker = null; },
    () => { if (_faceLandmarker === pending) _faceLandmarker = null; },
  );
  return pending;
}

function loadEditorialFaceDetector(): Promise<FaceDetector | null> {
  if (_editorialFaceDetector) return _editorialFaceDetector;
  const pending = (async () => {
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
    for (const delegate of ['CPU', 'GPU'] as const) {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM);
        return await FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: EDITORIAL_FACE_MODEL, delegate },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.35,
          minSuppressionThreshold: 0.25,
        });
      } catch (error) {
        console.warn('[studio/geometry] editorial face detector failed:', error instanceof Error ? error.message : String(error));
      }
    }
    return null;
  })();
  _editorialFaceDetector = pending;
  pending.then(
    (detector) => { if (!detector && _editorialFaceDetector === pending) _editorialFaceDetector = null; },
    () => { if (_editorialFaceDetector === pending) _editorialFaceDetector = null; },
  );
  return pending;
}

const landmarkDistance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

interface PixelFaceBox { x: number; y: number; w: number; h: number; area: number }

function expandedSquareCrop(box: PixelFaceBox, width: number, height: number): { x: number; y: number; size: number } {
  const desired = Math.min(Math.max(box.w, box.h) * 1.8, width, height);
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;
  return {
    x: Math.max(0, Math.min(width - desired, centerX - desired / 2)),
    y: Math.max(0, Math.min(height - desired, centerY - desired / 2)),
    size: desired,
  };
}

/** Editorial-only local mouth scan. It is lazy and never runs for ordinary geometry/semantic analysis. */
export async function analyzeMouthAtTimes(
  file: File,
  requestedTimes: readonly number[],
): Promise<EditorialFaceObservation[]> {
  const stamps = [...new Set(requestedTimes
    .filter((time) => Number.isFinite(time) && time >= 0)
    .map((time) => Math.round(time * 1_000) / 1_000))]
    .sort((a, b) => a - b);
  if (!stamps.length) return [];
  const [landmarker, faceDetector] = await Promise.all([loadFaceLandmarker(), loadEditorialFaceDetector()]);
  if (!landmarker || !faceDetector) return [];
  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return [];
    const vw = track.displayWidth || 720;
    const vh = track.displayHeight || 1280;
    const scale = Math.min(1, EDITORIAL_FACE_LONG_EDGE / Math.max(vw, vh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(8, Math.round(vw * scale));
    canvas.height = Math.max(8, Math.round(vh * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = EDITORIAL_FACE_CROP_SIZE;
    faceCanvas.height = EDITORIAL_FACE_CROP_SIZE;
    const faceCtx = faceCanvas.getContext('2d');
    if (!faceCtx) return [];
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const sink = new VideoSampleSink(track);
    const observations: EditorialFaceObservation[] = [];
    for await (const sample of sink.samplesAtTimestamps(stamps.map((stamp) => stamp + t0))) {
      if (!sample) continue;
      const timeSec = sample.timestamp - t0;
      sample.draw(ctx as unknown as CanvasRenderingContext2D, 0, 0, canvas.width, canvas.height);
      sample.close();
      const boxes = faceDetector.detect(canvas).detections.flatMap((detection): PixelFaceBox[] => {
        const box = detection.boundingBox;
        if (!box || box.width <= 0 || box.height <= 0) return [];
        return [{
          x: box.originX,
          y: box.originY,
          w: box.width,
          h: box.height,
          area: (box.width * box.height) / Math.max(1, canvas.width * canvas.height),
        }];
      }).sort((left, right) => right.area - left.area);
      const primary = boxes[0];
      const prominentFloor = primary ? Math.max(0.0015, primary.area * 0.3) : Infinity;
      const prominentFaceCount = boxes.filter((box) => box.area >= prominentFloor).length;
      const backgroundFaceCount = Math.max(0, boxes.length - prominentFaceCount);
      if (!primary) {
        observations.push({
          timeSec,
          faceDetected: false,
          mouthReadable: false,
          jawOpenScore: null,
          lipApertureRatio: null,
          visiblyOpen: false,
          prominentFaceCount: 0,
          backgroundFaceCount,
        });
        continue;
      }
      const crop = expandedSquareCrop(primary, canvas.width, canvas.height);
      faceCtx.clearRect(0, 0, faceCanvas.width, faceCanvas.height);
      faceCtx.drawImage(canvas, crop.x, crop.y, crop.size, crop.size, 0, 0, faceCanvas.width, faceCanvas.height);
      const result = landmarker.detect(faceCanvas);
      const landmarks = result.faceLandmarks[0];
      const categories = result.faceBlendshapes[0]?.categories ?? [];
      const jaw = categories.find((category) => category.categoryName.replace(/[_-]/g, '').toLowerCase() === 'jawopen')?.score ?? null;
      const upperLip = landmarks?.[13];
      const lowerLip = landmarks?.[14];
      const leftCorner = landmarks?.[78];
      const rightCorner = landmarks?.[308];
      const mouthWidth = leftCorner && rightCorner ? landmarkDistance(leftCorner, rightCorner) : 0;
      const lipApertureRatio = upperLip && lowerLip && mouthWidth > 0.001
        ? landmarkDistance(upperLip, lowerLip) / mouthWidth
        : null;
      const signals = { jawOpenScore: jaw, lipApertureRatio };
      observations.push({
        timeSec,
        faceDetected: true,
        mouthReadable: Boolean(landmarks),
        ...signals,
        visiblyOpen: isMouthVisiblyOpen(signals),
        prominentFaceCount,
        backgroundFaceCount,
      });
    }
    return observations;
  } catch (error) {
    console.warn('[studio/geometry] mouth scan failed:', error instanceof Error ? error.message : String(error));
    return [];
  } finally {
    await input.dispose();
  }
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

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function horizontalSubjectCenteredness(occ: Uint8Array, face: NRect | null): number | null {
  let sum = 0;
  let weightedX = 0;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const value = occ[y * GRID_W + x] ?? 0;
      sum += value;
      weightedX += value * ((x + 0.5) / GRID_W);
    }
  }
  const centerX = sum > 0 ? weightedX / sum : face ? face.x + face.w / 2 : null;
  if (centerX == null) return null;
  return clamp01(1 - Math.abs(centerX - 0.5) / 0.38);
}

/** Small local signal pass: no network/model calls. Background-dominant block matching estimates
 * camera translation, while Laplacian variance and luminance distribution cover focus/exposure. */
function measureFrameQuality(
  canvas: HTMLCanvasElement,
  qualityCanvas: HTMLCanvasElement,
  qualityCtx: CanvasRenderingContext2D,
  previousLuma: Float32Array | null,
  previousMotion: FrameMotionVector | null,
): { sharpness: number; exposure: number; stability: number; luma: Float32Array; motion: FrameMotionVector | null } {
  qualityCtx.drawImage(canvas, 0, 0, qualityCanvas.width, qualityCanvas.height);
  const rgba = qualityCtx.getImageData(0, 0, qualityCanvas.width, qualityCanvas.height).data;
  const width = qualityCanvas.width;
  const height = qualityCanvas.height;
  const luma = new Float32Array(width * height);
  let sum = 0;
  let sumSq = 0;
  let clipped = 0;
  for (let i = 0; i < luma.length; i++) {
    const offset = i * 4;
    const value = ((rgba[offset] ?? 0) * 0.2126 + (rgba[offset + 1] ?? 0) * 0.7152 + (rgba[offset + 2] ?? 0) * 0.0722) / 255;
    luma[i] = value;
    sum += value;
    sumSq += value * value;
    if (value < 0.025 || value > 0.975) clipped += 1;
  }
  const mean = sum / Math.max(1, luma.length);
  const deviation = Math.sqrt(Math.max(0, sumSq / Math.max(1, luma.length) - mean * mean));
  let lapSum = 0;
  let lapSq = 0;
  let lapCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = (luma[i - 1] ?? 0) + (luma[i + 1] ?? 0) + (luma[i - width] ?? 0) + (luma[i + width] ?? 0) - 4 * (luma[i] ?? 0);
      lapSum += lap;
      lapSq += lap * lap;
      lapCount += 1;
    }
  }
  const lapMean = lapSum / Math.max(1, lapCount);
  const lapVariance = Math.max(0, lapSq / Math.max(1, lapCount) - lapMean * lapMean);
  const sharpness = clamp01((Math.sqrt(lapVariance) - 0.012) / 0.16);
  const center = mean < 0.18 ? clamp01(mean / 0.18) : mean > 0.82 ? clamp01((1 - mean) / 0.18) : 1;
  const contrast = clamp01(deviation / 0.16);
  const exposure = clamp01(center * 0.58 + contrast * 0.42 - (clipped / Math.max(1, luma.length)) * 1.5);

  let stability = 1;
  let motion: FrameMotionVector | null = null;
  if (previousLuma && previousLuma.length === luma.length) {
    let bestDx = 0;
    let bestDy = 0;
    let bestError = Infinity;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        let error = 0;
        let count = 0;
        for (let y = 4; y < height - 4; y += 2) {
          for (let x = 4; x < width - 4; x += 2) {
            error += Math.abs((luma[y * width + x] ?? 0) - (previousLuma[(y + dy) * width + x + dx] ?? 0));
            count += 1;
          }
        }
        const normalized = error / Math.max(1, count);
        if (normalized < bestError) {
          bestError = normalized;
          bestDx = dx;
          bestDy = dy;
        }
      }
    }
    motion = { dx: bestDx, dy: bestDy };
    // Smooth pans/tracking shots keep a consistent motion vector. Handheld shake reverses or
    // changes direction abruptly, so temporal consistency carries more weight than raw movement.
    stability = frameStabilityScore(motion, previousMotion, bestError);
  }
  return { sharpness, exposure, stability, luma, motion };
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
  return (await analyzeGeometryAndQuality(file, durationSec, onProgress)).frames;
}

/** Decode once for both MediaPipe geometry and technical quality. Quality remains available when
 * MediaPipe cannot load, so focus/exposure/stability scanning is not coupled to a person model. */
export async function analyzeGeometryAndQuality(
  file: File,
  durationSec: number,
  onProgress?: (done: number, total: number) => void,
): Promise<{ frames: FrameGeom[] | null; quality: FrameQualityObservation[] }> {
  const mp = await loadMP();

  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) {
      _note = t('common.noVideoTrackGeometry');
      return { frames: null, quality: [] };
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
    if (!ctx) return { frames: null, quality: [] };
    const qualityScale = Math.min(1, QUALITY_LONG_EDGE / Math.max(cw, ch));
    const qualityCanvas = document.createElement('canvas');
    qualityCanvas.width = Math.max(8, Math.round(cw * qualityScale));
    qualityCanvas.height = Math.max(8, Math.round(ch * qualityScale));
    const qualityCtx = qualityCanvas.getContext('2d', { willReadFrequently: true });
    if (!qualityCtx) return { frames: null, quality: [] };

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
    const quality: FrameQualityObservation[] = [];
    let previousLuma: Float32Array | null = null;
    let previousMotion: FrameMotionVector | null = null;
    const total = stamps.length;
    let done = 0;
    for await (const sample of sink.samplesAtTimestamps(stamps.map((s) => s + t0))) {
      if (!sample) continue;
      const t = sample.timestamp - t0;
      sample.draw(ctx as unknown as CanvasRenderingContext2D, 0, 0, cw, ch);
      sample.close();
      const measured = measureFrameQuality(canvas, qualityCanvas, qualityCtx, previousLuma, previousMotion);
      previousLuma = measured.luma;
      previousMotion = measured.motion;
      if (mp) {
        const inferred = inferFrame(mp, canvas, cw, ch);
        out.push({ t, ...inferred });
        const occupancy = inferred.occ.reduce((sum, value) => sum + value, 0) / (GRID_W * GRID_H);
        const subjectCenteredness = horizontalSubjectCenteredness(inferred.occ, inferred.face);
        quality.push({
          timeSec: t,
          sharpness: measured.sharpness,
          exposure: measured.exposure,
          stability: measured.stability,
          subjectPresence: inferred.face ? 1 : clamp01(occupancy / 0.12),
          ...(subjectCenteredness == null ? {} : { subjectCenteredness }),
        });
      } else {
        quality.push({ timeSec: t, sharpness: measured.sharpness, exposure: measured.exposure, stability: measured.stability });
      }
      done += 1;
      onProgress?.(done, total);
    }
    const withSubject = out.filter((f) => f.occ.some((v) => v)).length;
    const faceHits = out.filter((f) => f.face).length;
    // Average person occupancy (rough check that segmentation is working: talking-head is usually 15~60%; ≈0 = segmentation missed the person, very high = polarity may be inverted)
    const avgOcc = out.length ? Math.round((out.reduce((s, f) => s + f.occ.reduce((a, v) => a + v, 0), 0) / out.length / (GRID_W * GRID_H)) * 100) : 0;
    if (mp) _note = t('common.analyzedFrames', { n: out.length, delegate: mp.delegate, subject: withSubject, occ: avgOcc, face: faceHits });
    return { frames: mp ? out : null, quality };
  } catch (e) {
    _note = t('common.geometryPassErrorMsg', { msg: e instanceof Error ? e.message : String(e) });
    console.warn('[studio/geometry]', _note);
    return { frames: null, quality: [] };
  } finally {
    await input.dispose();
  }
}

/** Fast second-pass quality scan over an explicit shortlist. It decodes only the requested low-res
 * frames and skips MediaPipe, keeping the refinement bounded independently of source duration. */
export async function analyzeQualityAtTimes(
  file: File,
  requestedTimes: readonly number[],
  onProgress?: (done: number, total: number) => void,
): Promise<FrameQualityObservation[]> {
  const stamps = [...new Set(requestedTimes
    .filter((time) => Number.isFinite(time) && time >= 0)
    .map((time) => Math.round(time * 1_000) / 1_000))]
    .sort((a, b) => a - b);
  if (!stamps.length) return [];
  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return [];
    const vw = track.displayWidth || 720;
    const vh = track.displayHeight || 1280;
    const decodeScale = Math.min(1, 128 / Math.max(vw, vh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(8, Math.round(vw * decodeScale));
    canvas.height = Math.max(8, Math.round(vh * decodeScale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    const qualityScale = Math.min(1, QUALITY_LONG_EDGE / Math.max(canvas.width, canvas.height));
    const qualityCanvas = document.createElement('canvas');
    qualityCanvas.width = Math.max(8, Math.round(canvas.width * qualityScale));
    qualityCanvas.height = Math.max(8, Math.round(canvas.height * qualityScale));
    const qualityCtx = qualityCanvas.getContext('2d', { willReadFrequently: true });
    if (!qualityCtx) return [];
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const sink = new VideoSampleSink(track);
    const quality: FrameQualityObservation[] = [];
    let previousLuma: Float32Array | null = null;
    let previousMotion: FrameMotionVector | null = null;
    let previousTime: number | null = null;
    let done = 0;
    for await (const sample of sink.samplesAtTimestamps(stamps.map((stamp) => stamp + t0))) {
      if (!sample) continue;
      const timeSec = sample.timestamp - t0;
      if (previousTime != null && timeSec - previousTime > 0.5) {
        previousLuma = null;
        previousMotion = null;
      }
      sample.draw(ctx as unknown as CanvasRenderingContext2D, 0, 0, canvas.width, canvas.height);
      sample.close();
      const measured = measureFrameQuality(canvas, qualityCanvas, qualityCtx, previousLuma, previousMotion);
      quality.push({
        timeSec,
        sharpness: measured.sharpness,
        exposure: measured.exposure,
        stability: measured.stability,
      });
      previousLuma = measured.luma;
      previousMotion = measured.motion;
      previousTime = timeSec;
      done += 1;
      onProgress?.(done, stamps.length);
    }
    return quality;
  } catch (error) {
    console.warn('[studio/geometry] fine quality scan failed:', error instanceof Error ? error.message : String(error));
    return [];
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
