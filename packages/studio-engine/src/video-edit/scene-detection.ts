// mediabunny is dynamically imported on demand (convention in extract-audio.ts)
import type { SceneCut, SceneSegment } from './types';

/**
 * Scene detection by HSV three-channel difference. Mirrors PySceneDetect
 * ContentDetector, default threshold 27.
 *
 * Path: sampled frames → 64×64 canvas → HSV three-channel mean abs diff →
 * mark a cut where it exceeds the threshold → consolidate (see consolidateSceneCuts).
 *
 * Performance: a 30s video @ 5fps sampling = 150 frames → ~500ms-1s.
 */

/** Bump when the cut logic changes: caches keyed on a file's analysis carry the cuts, so a
 * stale entry would keep serving the old boundaries. */
export const SCENE_DETECTION_VERSION = 2;

/** PySceneDetect's min_scene_len (15 frames at 30fps). */
const DEFAULT_MIN_SCENE_LEN_SEC = 0.5;
/** A sample inside a run of over-threshold samples counts as a hard cut only when it stands this
 * far above its in-run neighbours; otherwise the run is continuous change (a pan, handheld sway,
 * a subject crossing the frame), not a sequence of cuts. */
const RUN_SPIKE_RATIO = 1.8;

/**
 * Turn raw over-threshold samples into edit boundaries.
 *
 * The raw detector flags every sample whose difference to the previous one exceeds the threshold.
 * Handheld or fast-moving footage exceeds it on sample after sample, which used to yield a "cut"
 * every 0.2s and downstream a longest usable interval of a fraction of a second. Two rules fix it:
 *
 * 1. Runs of consecutive flagged samples are motion. Only a spike that stands well above its
 *    neighbours inside the run is kept as a cut (a hard cut followed by movement); an isolated
 *    flagged sample is always a cut.
 * 2. Minimum scene length: a cut closer than `minSceneLenSec` to the previous kept cut is dropped.
 */
export function consolidateSceneCuts(
  candidates: readonly SceneCut[],
  sampleIntervalSec: number,
  opts: { minSceneLenSec?: number } = {},
): SceneCut[] {
  const minSceneLen = opts.minSceneLenSec ?? DEFAULT_MIN_SCENE_LEN_SEC;
  const sorted = [...candidates].sort((a, b) => a.timestamp - b.timestamp);
  const runs: SceneCut[][] = [];
  for (const cut of sorted) {
    const run = runs[runs.length - 1];
    if (run && cut.timestamp - run[run.length - 1]!.timestamp <= sampleIntervalSec * 1.5) run.push(cut);
    else runs.push([cut]);
  }
  const kept: SceneCut[] = [];
  for (const run of runs) {
    if (run.length === 1) {
      kept.push(run[0]!);
      continue;
    }
    for (let i = 0; i < run.length; i++) {
      const neighbours = [run[i - 1], run[i + 1]].filter((c): c is SceneCut => !!c);
      const reference = neighbours.reduce((sum, c) => sum + c.score, 0) / neighbours.length;
      if (run[i]!.score >= reference * RUN_SPIKE_RATIO) kept.push(run[i]!);
    }
  }
  const out: SceneCut[] = [];
  for (const cut of kept) {
    const last = out[out.length - 1];
    if (last && cut.timestamp - last.timestamp < minSceneLen) continue;
    out.push(cut);
  }
  return out;
}
export async function detectScenes(
  file: File,
  opts: {
    /** Frames sampled per second (default 5, enough to catch most scene cuts) */
    sampleFps?: number;
    /** Difference threshold (default 27, PySceneDetect's empirical value) */
    threshold?: number;
    /** Size the sampled image is scaled to for comparison (default 64) */
    thumbSize?: number;
    /** Shortest scene a cut may open (default 0.5s); see consolidateSceneCuts. */
    minSceneLenSec?: number;
    onProgress?: (p: number) => void;
  } = {},
): Promise<SceneCut[]> {
  const sampleFps = opts.sampleFps ?? 5;
  const threshold = opts.threshold ?? 27;
  const size = opts.thumbSize ?? 64;

  const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) return [];

    // Zero the time base: cuts must be comparable with <video> playback / ASR (mp4s with a non-zero first packet — see thumbnails.ts)
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const duration = (await input.computeDuration()) - t0;
    const sink = new VideoSampleSink(videoTrack);
    const interval = 1 / sampleFps;
    const timestamps: number[] = [];
    for (let t = 0; t < duration; t += interval) timestamps.push(t + t0);

    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;

    const cuts: SceneCut[] = [];
    let prev: HsvFrame | null = null;
    let idx = 0;

    for await (const sample of sink.samplesAtTimestamps(timestamps)) {
      idx++;
      opts.onProgress?.(idx / timestamps.length);
      if (!sample) continue;
      // try/finally: any throw in the per-frame analysis must not leak the sample.
      try {
        sample.draw(ctx, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const curr = rgbaToHsv(imageData.data);
        if (prev) {
          const score = hsvFrameScore(prev, curr);
          if (score > threshold) cuts.push({ timestamp: sample.timestamp - t0, score });
        }
        prev = curr;
      } finally {
        sample.close();
      }
    }
    return consolidateSceneCuts(cuts, interval, { minSceneLenSec: opts.minSceneLenSec });
  } finally {
    await input.dispose();
  }
}

/** Split [0, duration] into N+1 segments at the cut points */
export function cutsToSegments(cuts: SceneCut[], duration: number): SceneSegment[] {
  const segments: SceneSegment[] = [];
  let prev = 0;
  for (const cut of cuts) {
    segments.push({ start: prev, end: cut.timestamp });
    prev = cut.timestamp;
  }
  segments.push({ start: prev, end: duration });
  return segments;
}

// ---- HSV helpers ----

type HsvFrame = { h: Uint8Array; s: Uint8Array; v: Uint8Array };

function rgbaToHsv(rgba: Uint8ClampedArray): HsvFrame {
  const n = rgba.length >> 2;
  const h = new Uint8Array(n);
  const s = new Uint8Array(n);
  const v = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4] / 255;
    const g = rgba[i * 4 + 1] / 255;
    const b = rgba[i * 4 + 2] / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const d = mx - mn;
    let hh = 0;
    if (d > 0) {
      if (mx === r) hh = ((g - b) / d + 6) % 6;
      else if (mx === g) hh = (b - r) / d + 2;
      else hh = (r - g) / d + 4;
    }
    h[i] = Math.round((hh / 6) * 255);
    s[i] = mx === 0 ? 0 : Math.round((d / mx) * 255);
    v[i] = Math.round(mx * 255);
  }
  return { h, s, v };
}

function hsvFrameScore(prev: HsvFrame, curr: HsvFrame): number {
  let sumH = 0;
  let sumS = 0;
  let sumV = 0;
  const n = prev.h.length;
  for (let i = 0; i < n; i++) {
    let dh = Math.abs(prev.h[i] - curr.h[i]);
    if (dh > 128) dh = 256 - dh;
    sumH += dh;
    sumS += Math.abs(prev.s[i] - curr.s[i]);
    sumV += Math.abs(prev.v[i] - curr.v[i]);
  }
  return (sumH + sumS + sumV) / (3 * n);
}
