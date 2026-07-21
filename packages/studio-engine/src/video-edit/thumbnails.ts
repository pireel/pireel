// mediabunny 按需动态加载(约定见 extract-audio.ts)——类型导入不进 bundle
import type { Source } from 'mediabunny';
import type { Thumbnail } from './types';

interface ThumbOpts {
  width?: number;
  /** 不传按 width × 宽高比算 */
  height?: number;
  quality?: number;
  /** 每抽到一帧就回调（增量渲染：让缩略图边解码边出现，不必等整条视频抽完） */
  onThumb?: (thumb: Thumbnail) => void;
}

/** 核心：给定 mediabunny Source（Blob 或 Url），在指定时间戳抽帧渲 JPEG。 */
async function extractFromSource(
  source: Source,
  timestamps: number[],
  opts: ThumbOpts,
): Promise<Thumbnail[]> {
  const targetW = opts.width ?? 240;
  const quality = opts.quality ?? 0.75;

  const { ALL_FORMATS, Input, VideoSampleSink } = await import('mediabunny');
  const input = new Input({ source, formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return [];

    const aspect = track.displayWidth / track.displayHeight;
    const targetH = opts.height ?? Math.round(targetW / aspect);

    // 时间基归零:-c copy 剪过的 mp4 首包时间戳可以不是 0,mediabunny 给的是原始轨道
    // 时间,而 <video> 播放/ASR(Conversion 内部同样减 getFirstTimestamp)都是归零口径。
    // 不减掉的话缩略图会整体偏移(曾差 2s+)。负首包(B 帧编辑列表)按"不呈现"钳到 0。
    const t0 = Math.max(0, await input.getFirstTimestamp());
    const sink = new VideoSampleSink(track);
    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

    const out: Thumbnail[] = [];
    for await (const sample of sink.samplesAtTimestamps(timestamps.map((t) => t + t0))) {
      if (!sample) continue;
      sample.draw(ctx, 0, 0, targetW, targetH);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      const thumb: Thumbnail = {
        timestamp: sample.timestamp - t0,
        url: URL.createObjectURL(blob),
        blob,
      };
      out.push(thumb);
      opts.onThumb?.(thumb);
      sample.close();
    }
    return out;
  } finally {
    await input.dispose();
  }
}

/**
 * 在指定时间戳抽视频帧,渲染成 JPEG Blob（本地 File 源）。
 *
 * 单调 timestamps 走优化解码路径,比循环 getSample 快。
 *
 * 性能:1080p 抽 1 帧 ~50-150ms。
 */
export async function extractThumbnails(
  file: File,
  timestamps: number[],
  opts: ThumbOpts = {},
): Promise<Thumbnail[]> {
  const { BlobSource } = await import('mediabunny');
  return extractFromSource(new BlobSource(file), timestamps, opts);
}

/**
 * 同 extractThumbnails，但直接从 URL 流式抽帧：mediabunny UrlSource 走 HTTP Range，
 * 只取 moov + 目标帧附近的样本字节，不必先把整片下完。配合 onThumb 增量渲染，
 * 缩略图能像 <video> 预览一样很快开始浮现。
 *
 * url 需支持 Range（同源代理 /api/media/fetch 已透传 Range）。
 */
export async function extractThumbnailsFromUrl(
  url: string,
  timestamps: number[],
  opts: ThumbOpts = {},
): Promise<Thumbnail[]> {
  // same-origin 代理带 cookie 过鉴权
  const { UrlSource } = await import('mediabunny');
  return extractFromSource(
    new UrlSource(url, { requestInit: { credentials: 'same-origin' } }),
    timestamps,
    opts,
  );
}
