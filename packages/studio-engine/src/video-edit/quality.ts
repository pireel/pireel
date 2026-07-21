import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';

/**
 * 素材质检 + 去重指纹。全部浏览器内、纯算法、零模型、零额外网络。
 *
 * 一次解码 N 帧,同时算出:清晰度 / 黑屏比 / 静帧程度 / 感知哈希(aHash),
 * 顺带产出展示用缩略图(中间帧)。替代单纯的 extractThumbnails,不多花解码。
 */

export interface ClipQuality {
  /** Laplacian 方差均值,越低越糊 */
  blurScore: number;
  /** 采样帧里"接近全黑/纯色"的占比 0-1 */
  blackRatio: number;
  /** 相邻采样帧最大差异,越低越像静帧/卡死 */
  motionScore: number;
  /** 8×8 平均哈希,64 位 0/1。跨片段比汉明距离做去重 */
  aHash: Uint8Array;
}

export interface ClipAssessment extends ClipQuality {
  thumbUrl: string;
  thumbBlob: Blob;
}

export interface QualityVerdict {
  /** 是否建议进入编排 */
  usable: boolean;
  /** 不可用原因(usable=false 时给) */
  reason?: 'too_short' | 'black' | 'blurry' | 'frozen';
  label?: string;
}

const BLUR_MIN = 12; // Laplacian 方差低于此判模糊(经验值,320px 灰度)
const BLACK_LUMA = 24; // 帧平均亮度低于此算黑帧
const BLACK_VAR = 60; // 且方差低于此(排除"暗但有内容")
const MOTION_MIN = 1.5; // 相邻帧差异低于此判静帧

/**
 * 采样 ~6 帧评估质量 + 算 aHash + 出缩略图。
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
      // 中间帧没抽到(极短/损坏),退一帧
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

/** 按阈值给质检结论。duration 来自 probe。minDuration 短于此判过短(默认 5s)。 */
export function judgeQuality(q: ClipQuality, duration: number, minDuration = 5): QualityVerdict {
  if (duration < minDuration) {
    return { usable: false, reason: 'too_short', label: `过短(<${minDuration}s)` };
  }
  if (q.blackRatio >= 0.6) return { usable: false, reason: 'black', label: '黑屏/纯色' };
  if (q.motionScore < MOTION_MIN) return { usable: false, reason: 'frozen', label: '静帧/卡死' };
  if (q.blurScore < BLUR_MIN) return { usable: false, reason: 'blurry', label: '画面模糊' };
  return { usable: true };
}

/** 两个 aHash 的汉明距离(0-64,越小越像) */
export function aHashDistance(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < 64; i++) if (a[i] !== b[i]) d++;
  return d;
}

/**
 * 去重分组。只把"极高相似"(距离 ≤ threshold)判为重复;
 * 中等相似(多机位同场景)保留——政务多角度 B-roll 是宝贵素材,不能误删。
 *
 * 返回每个 id → 它重复于哪个 id(保留组内第一个,其余标重复)。
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

// ---- 像素工具 ----

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

/** 3×3 Laplacian 卷积后的方差——经典清晰度/对焦指标 */
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

/** 8×8 平均哈希 */
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
