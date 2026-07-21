/**
 * 从视频抽出纯音频(AAC in mp4 容器,即 m4a)。
 *
 * 用途:"视频不上传,只传音频做 ASR"——1GB 视频抽出来通常只剩几十 MB,
 * 上传时间从十几分钟降到 1-2 分钟。
 *
 * 走 Conversion API + video.discard,只过音频轨,不解码视频帧,很快(<1s/条)。
 *
 * 无音轨的视频会抛错,调用方应先用 probeVideo 判断 hasAudio。
 *
 * mediabunny 按需动态加载(≈90KB gz):它被 studio/cloud-edit 等首屏静态可达,
 * 但只有用户真选了视频才会用到——别让它压进首包。本目录各文件同此约定。
 */
import type { BufferTarget as BufferTargetType } from 'mediabunny';

export async function extractAudio(file: File): Promise<Blob> {
  const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, QUALITY_MEDIUM } =
    await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const audioTrack = await input.getPrimaryAudioTrack();
    if (!audioTrack) throw new Error('视频没有音轨,无法抽音频');

    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      video: { discard: true },
      audio: { codec: 'aac', bitrate: QUALITY_MEDIUM },
    });
    await conversion.execute();
    const buf = (output.target as BufferTargetType).buffer!;
    return new Blob([buf], { type: 'audio/mp4' });
  } finally {
    await input.dispose();
  }
}
