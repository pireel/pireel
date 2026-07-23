/**
 * Extract pure audio from a video (AAC in an mp4 container, i.e. m4a).
 *
 * Purpose: "don't upload the video, upload only the audio for ASR" — a 1GB video
 * usually reduces to a few dozen MB, cutting upload time from ~15 min to 1-2 min.
 *
 * Uses the Conversion API + video.discard, passing only the audio track without
 * decoding video frames — fast (<1s per clip).
 *
 * Throws on a video with no audio track; callers should check hasAudio via probeVideo first.
 *
 * mediabunny is dynamically imported on demand (≈90KB gz): it's statically
 * reachable from the studio/cloud-edit first paint, but only used once the user
 * actually picks a video — keep it out of the initial bundle. Same convention for every file in this directory.
 */
import type { BufferTarget as BufferTargetType } from 'mediabunny';

export async function extractAudio(file: File): Promise<Blob> {
  const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, QUALITY_MEDIUM } =
    await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const audioTrack = await input.getPrimaryAudioTrack();
    if (!audioTrack) throw new Error('The video has no audio track — cannot extract audio');

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
