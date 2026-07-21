import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import type { ClipMeta } from './types';

/**
 * 读视频元数据。流式读 metadata,**不**加载整段视频。
 *
 * 对 1GB 文件秒返回——MediaBunny 只读 mp4 atom 头/wmv index,几 KB 字节。
 */
export async function probeVideo(file: File): Promise<ClipMeta> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    const audioTrack = await input.getPrimaryAudioTrack();
    const duration = await input.computeDuration();
    return {
      width: videoTrack?.displayWidth ?? 0,
      height: videoTrack?.displayHeight ?? 0,
      duration,
      hasAudio: audioTrack !== null,
      videoCodec: videoTrack ? await videoTrack.getCodec() : null,
      audioCodec: audioTrack ? await audioTrack.getCodec() : null,
    };
  } finally {
    await input.dispose();
  }
}
