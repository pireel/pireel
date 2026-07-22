import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';

/**
 * Clip quality check + dedup fingerprint. All in-browser, pure algorithm, no
 * model, no extra network.
 *
 * Decodes N frames once and computes: sharpness / black-frame ratio / static-
 * frame degree / perceptual hash (aHash), plus a display thumbnail (middle
 * frame). Replaces a bare extractThumbnails at no extra decode cost.
 */

export interface ClipQuality {
  /** Mean Laplacian variance; lower = blurrier */
  blurScore: number;
  /** Fraction of sampled frames that are "near all-black / solid color", 0-1 */
  blackRatio: number;
  /** Max diff between adjacent sampled frames; lower = more like a static/frozen frame */
  motionScore: number;
  /** 8×8 average hash, 64 bits 0/1. Compare Hamming distance across clips to dedup */
  aHash: Uint8Array;
}

export interface ClipAssessment extends ClipQuality {
  thumbUrl: string;
  thumbBlob: Blob;
}

export interface QualityVerdict {
  /** Whether it's recommended for use */
  usable: boolean;
  /** Reason it's unusable (given when usable=false) */
  reason?: 'too_short' | 'black' | 'blurry' | 'frozen';
  label?: string;
}

const BLUR_MIN = 12; // Laplacian variance below this = blurry (empirical, 320px grayscale)
const BLACK_LUMA = 24; // frame mean luma below this = black frame
const BLACK_VAR = 60; // and variance below this (excludes "dark but has content")
const MOTION_MIN = 1.5; // adjacent-frame diff below this = static frame

/**
 * Sample ~6 frames to assess quality + compute aHash + produce a thumbnail.
 */
export async function assessClip(
  file: File,
  opts: { samples?: number; size?: number } = {},
): Promise<ClipAssessment | null> {
  const nSamples = opts.samples ?? 6;
  const size = opts.size ?? 320;

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const duration = await input.computeDuration();
    const aspect = track.displayWidth / track.displayHeight || 16 / 9;
    const w = size;
    const h = Math.max(2, Math.round(size / aspect));

    const stamps: number[] = [];
    for (let i = 0; i < nSamples; i++) {
      stamps.push(Math.max(0.05, Math.min(duration - 0.05, (duration * (i + 0.5)) / nSamples)));
    }
    const midIdx = Math.floor(nSamples / 2);

    const sink = new VideoSampleSink(track);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;

    const blurs: number[] = [];
    let blackCount = 0;
    let prevGray: Float32Array | null = null;
    let maxMotion = 0;
    let aHash: Uint8Array = new Uint8Array(64);
    let thumbBlob: Blob | null = null;

    let i = 0;
    for await (const sample of sink.samplesAtTimestamps(stamps)) {
      if (!sample) {
        i++;
        continue;
      }
      sample.draw(ctx, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      const gray = toGray(data, w, h);

      const { mean, variance } = lumaStats(gray);
      if (mean < BLACK_LUMA && variance < BLACK_VAR) blackCount++;
      blurs.push(laplacianVariance(gray, w, h));

      if (prevGray) {
        maxMotion = Math.max(maxMotion, frameDiff(prevGray, gray));
      }
      prevGray = gray;

      if (i === midIdx) {
        aHash = averageHash(data, w, h);
        thumbBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.78 });
      }
      sample.close();
      i++;
    }

    if (!thumbBlob) {
      // middle frame didn't decode (very short/corrupt), fall back to whatever's on the canvas
      thumbBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.78 });
    }

    const blurScore = blurs.length ? blurs.reduce((a, b) => a + b, 0) / blurs.length : 0;
    const blackRatio = stamps.length ? blackCount / stamps.length : 1;

    return {
      blurScore,
      blackRatio,
      motionScore: maxMotion,
      aHash,
      thumbUrl: URL.createObjectURL(thumbBlob),
      thumbBlob,
    };
  } finally {
    await input.dispose();
  }
}

/** Verdict from thresholds. duration comes from probe. Shorter than minDuration = too short (default 5s). */
export function judgeQuality(q: ClipQuality, duration: number, minDuration = 5): QualityVerdict {
  if (duration < minDuration) {
    return { usable: false, reason: 'too_short', label: `过短(<${minDuration}s)` };
  }
  if (q.blackRatio >= 0.6) return { usable: false, reason: 'black', label: '黑屏/纯色' };
  if (q.motionScore < MOTION_MIN) return { usable: false, reason: 'frozen', label: '静帧/卡死' };
  if (q.blurScore < BLUR_MIN) return { usable: false, reason: 'blurry', label: '画面模糊' };
  return { usable: true };
}

/** Hamming distance between two aHashes (0-64, smaller = more alike) */
export function aHashDistance(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < 64; i++) if (a[i] !== b[i]) d++;
  return d;
}

/**
 * Dedup grouping. Only "very high similarity" (distance ≤ threshold) counts as a
 * duplicate; medium similarity (multi-camera, same scene) is kept — multi-angle
 * B-roll is valuable material, don't delete it by mistake.
 *
 * Returns each id → the id it duplicates (first in a group is kept, the rest marked as dupes).
 */
export function findDuplicates(
  items: Array<{ id: string; aHash: Uint8Array }>,
  threshold = 6,
): Map<string, string> {
  const dupOf = new Map<string, string>();
  const kept: Array<{ id: string; aHash: Uint8Array }> = [];
  for (const it of items) {
    const match = kept.find((k) => aHashDistance(k.aHash, it.aHash) <= threshold);
    if (match) dupOf.set(it.id, match.id);
    else kept.push(it);
  }
  return dupOf;
}

// ---- Pixel helpers ----

function toGray(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    out[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return out;
}

function lumaStats(gray: Float32Array): { mean: number; variance: number } {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = sum / gray.length;
  let v = 0;
  for (let i = 0; i < gray.length; i++) v += (gray[i] - mean) ** 2;
  return { mean, variance: v / gray.length };
}

/** Variance after a 3×3 Laplacian convolution — the classic sharpness/focus metric */
function laplacianVariance(gray: Float32Array, w: number, h: number): number {
  const lap: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w];
      lap.push(v);
    }
  }
  if (lap.length === 0) return 0;
  const mean = lap.reduce((a, b) => a + b, 0) / lap.length;
  let varc = 0;
  for (const v of lap) varc += (v - mean) ** 2;
  return varc / lap.length;
}

function frameDiff(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** 8×8 average hash */
function averageHash(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const N = 8;
  const cells = new Float32Array(N * N);
  for (let cy = 0; cy < N; cy++) {
    for (let cx = 0; cx < N; cx++) {
      const x0 = Math.floor((cx * w) / N);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * w) / N));
      const y0 = Math.floor((cy * h) / N);
      const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * h) / N));
      let sum = 0;
      let cnt = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
          cnt++;
        }
      }
      cells[cy * N + cx] = cnt ? sum / cnt : 0;
    }
  }
  const mean = cells.reduce((a, b) => a + b, 0) / cells.length;
  const bits = new Uint8Array(64);
  for (let i = 0; i < 64; i++) bits[i] = cells[i] > mean ? 1 : 0;
  return bits;
}
