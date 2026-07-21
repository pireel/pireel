'use client';

/**
 * Studio 本地媒体链路 —— 视频不上传云端,只在浏览器里读。
 *
 * 打开 → 选本地文件(URL.createObjectURL 预览本地播放)→ MediaBunny 探测元数据 →
 * **只抽音频**(几十 MB)上传做 ASR → 分镜。整段原片只在【导出】时才上传。
 * 复用全站现成件:extractAudio(MediaBunny 抽音轨)/ studioProviders().uploads.upload(干净中间产物路径,不污染素材库)。
 */

import { extractAudio } from '@pireel/studio-engine/video-edit/extract-audio';
import { extractThumbnails } from '@pireel/studio-engine/video-edit/thumbnails';
import { studioProviders } from '@pireel/studio-engine/providers';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { getCachedAsr, setCachedAsr } from './asr-cache';
import { t } from './i18n';

export interface ProbedFile {
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

/** 文件指纹:同一文件(名/大小/改时间)→ 同 key,ASR/上传可命中缓存。 */
export function fileSig(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/** 本地探测视频元数据(MediaBunny 动态加载,不上传)。 */
export async function probeVideoFile(file: File): Promise<ProbedFile> {
  const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    const a = await input.getPrimaryAudioTrack().catch(() => null);
    // computeDuration 是"最大结束时间戳"口径:首包非零的 mp4 会把时长虚长一个偏移量。
    // 减掉 getFirstTimestamp 换算成 <video> 播放口径(currentTime 0 = 最早样本)。
    const duration = (await input.computeDuration()) - Math.max(0, await input.getFirstTimestamp());
    return {
      durationSec: Number.isFinite(duration) && duration > 0 ? duration : 0,
      width: v?.displayWidth ?? 0,
      height: v?.displayHeight ?? 0,
      hasAudio: !!a,
    };
  } finally {
    await input.dispose();
  }
}

/** 抽音频(只传音频)→ ASR → 句级分镜。按 fileSig 缓存(同片只转一次)。 */
export async function transcribeFile(file: File): Promise<AsrSegment[]> {
  const sig = fileSig(file);
  const cached = getCachedAsr(sig);
  if (cached) return cached;

  const audio = await extractAudio(file);
  const { url } = await studioProviders().uploads.upload(audio, { contentType: audio.type || 'audio/mp4', filename: 'studio-audio.m4a' });
  const r = await fetch('/api/auto-edit/asr', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ audio_url: url }),
  });
  // 服务端故障要抛明确错误,别静默吞成空数组——上层得把「ASR 挂了」和「视频真没人声」区分开
  if (!r.ok) throw new Error(t('ASR 请求失败(HTTP {status})', { status: r.status }));
  const j = (await r.json()) as { segments?: Array<{ start: number; end: number; text: string }> };
  // ASR 时间是"音轨自身归零"口径(Conversion 抽音频时减的是音轨首包),播放是"全部轨最早
  // 样本归零"。两轨首包不同步的文件要补上差值,否则字幕/剪点整体平移。
  const off = await audioPlaybackOffset(file);
  const segs: AsrSegment[] = (Array.isArray(j.segments) ? j.segments : [])
    .filter((s) => s.text?.trim())
    .map((s) => ({ start: Math.max(0, s.start + off), end: Math.max(s.start + off + 0.1, s.end + off), text: s.text.trim() }));
  if (segs.length) setCachedAsr(sig, segs);
  return segs;
}

/** 音轨首包相对播放零点(全部轨最早样本)的偏移,秒。两轨同步的正常文件 ≈0。 */
async function audioPlaybackOffset(file: File): Promise<number> {
  const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const a = await input.getPrimaryAudioTrack();
    if (!a) return 0;
    const off = Math.max(0, await a.getFirstTimestamp()) - Math.max(0, await input.getFirstTimestamp());
    return Math.abs(off) > 0.02 ? off : 0;
  } catch {
    return 0;
  } finally {
    await input.dispose();
  }
}

/** 缩率图一格:全局时刻 + blob URL(供时间轴视频轨铺底)。 */
export interface FilmstripFrame {
  t: number;
  url: string;
}

/**
 * 等距抽缩率图给时间轴视频轨铺底(本地解码,不上传)。
 * count 控制密度;onFrame 增量回调,让缩率图边解码边浮现。
 */
export async function extractFilmstrip(
  file: File,
  durationSec: number,
  count = 14,
  onFrame?: (f: FilmstripFrame) => void,
): Promise<FilmstripFrame[]> {
  const dur = durationSec > 0 ? durationSec : 0;
  if (dur <= 0) return [];
  const n = Math.max(2, Math.min(count, 600));
  // 每格取该区间中点,避开 0 与结尾黑帧
  const stamps = Array.from({ length: n }, (_, i) => Math.min(dur - 0.05, ((i + 0.5) / n) * dur));
  const frames: FilmstripFrame[] = [];
  await extractThumbnails(file, stamps, {
    width: 96,
    quality: 0.6,
    onThumb: (th) => {
      const f = { t: th.timestamp, url: th.url };
      frames.push(f);
      onFrame?.(f);
    },
  });
  return frames.sort((a, b) => a.t - b.t);
}

/** 导出时才上传整段原片,返回可被渲染服务拉取的 https URL。 */
export async function uploadVideoFile(file: File): Promise<string> {
  const { url } = await studioProviders().uploads.upload(file, { contentType: file.type || 'video/mp4', filename: file.name || 'studio-video.mp4' });
  return url;
}

/** 上传素材位的图片,返回 https URL(渲染服务可拉取并本地化)。 */
export async function uploadImageFile(file: File): Promise<string> {
  const { url } = await studioProviders().uploads.upload(file, { contentType: file.type || 'image/png', filename: file.name || 'studio-image.png' });
  return url;
}
