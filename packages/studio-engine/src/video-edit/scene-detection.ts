// mediabunny 按需动态加载(约定见 extract-audio.ts)
import type { SceneCut, SceneSegment } from './types';

/**
 * HSV 三通道差异场景检测。对标 PySceneDetect ContentDetector,默认阈值 27。
 *
 * 路径:抽样帧 → 64×64 canvas → HSV 三通道 mean abs diff → > 阈值标切点。
 *
 * 性能参考:30s 视频 @ 5fps 抽样 = 150 帧 → ~500ms-1s。
 */
export async function detectScenes(
  file: File,
  opts: {
    /** 每秒抽样帧数(默认 5,够检测大部分场景切) */
    sampleFps?: number;
    /** 差异阈值(默认 27,PySceneDetect 经验值) */
    threshold?: number;
    /** 抽样图缩到多大做对比(默认 64) */
    thumbSize?: number;
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

    // 时间基归零:切点要和 <video> 播放/ASR 可比(首包非零的 mp4 详见 thumbnails.ts)
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
      sample.draw(ctx, 0, 0, size, size);
      const imageData = ctx.getImageData(0, 0, size, size);
      const curr = rgbaToHsv(imageData.data);
      if (prev) {
        const score = hsvFrameScore(prev, curr);
        if (score > threshold) cuts.push({ timestamp: sample.timestamp - t0, score });
      }
      prev = curr;
      sample.close();
    }
    return cuts;
  } finally {
    await input.dispose();
  }
}

/** 用切点把 [0, duration] 切成 N+1 段 */
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

// ---- HSV 工具 ----

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
