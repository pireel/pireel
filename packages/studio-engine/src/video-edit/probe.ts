import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import type { ClipMeta } from './types';

/**
 * Read video metadata. Streams the metadata; does NOT load the whole video.
 *
 * Returns in a second even for 1GB files — MediaBunny reads only the mp4 atom
 * headers / wmv index, a few KB.
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
