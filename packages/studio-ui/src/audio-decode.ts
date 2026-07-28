/**
 * Audio decoding for local analysis (waveforms, loudness, denoise) — as opposed to extract-audio.ts,
 * which re-encodes to AAC because its job is to UPLOAD a small file for ASR.
 *
 * Locally we never wanted a file: every consumer decodes the result straight back to PCM, so
 * encoding first is pure round-trip waste (and lossy). These read the compressed samples through
 * MediaBunny and hand back an AudioBuffer directly — no encoder, no second decode.
 */

import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';

const ANALYSIS_CH = 2;

/** Decode an AUDIO file (music/SFX on the lane) to PCM. */
export async function decodeAudioFile(blob: Blob): Promise<AudioBuffer> {
  const octx = new OfflineAudioContext(ANALYSIS_CH, 8, 48000);
  return octx.decodeAudioData(await blob.arrayBuffer());
}

/** Decode a VIDEO file's audio track to PCM at its own sample rate. null = the file has no audio.
 *  Channels are capped at two: everything downstream (peaks, loudness, denoise) mixes down anyway. */
export async function decodeVideoAudio(file: File): Promise<AudioBuffer | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    const rate = track.sampleRate;
    const chCount = Math.min(ANALYSIS_CH, track.numberOfChannels);
    const duration = await track.computeDuration();
    const total = Math.max(1, Math.ceil(duration * rate) + rate); // +1s slack: sample timestamps can run past the reported duration
    const chans = Array.from({ length: chCount }, () => new Float32Array(total));
    let end = 0;
    for await (const sample of new AudioSampleSink(track).samples()) {
      const frames = sample.numberOfFrames;
      const srcCh = sample.numberOfChannels;
      const data = new Float32Array(frames * srcCh);
      sample.copyTo(data, { planeIndex: 0, format: 'f32' });
      sample.close();
      // Place by timestamp rather than by running count: a stream with gaps stays time-aligned
      const at = Math.round(sample.timestamp * rate);
      if (at >= total) continue;
      const n = Math.min(frames, total - at);
      for (let c = 0; c < chCount; c++) {
        const out = chans[c]!;
        const sc = srcCh === 1 ? 0 : Math.min(c, srcCh - 1);
        for (let i = 0; i < n; i++) out[at + i] = data[i * srcCh + sc]!;
      }
      if (at + n > end) end = at + n;
    }
    if (!end) return null;
    const octx = new OfflineAudioContext(chCount, end, rate);
    const buf = octx.createBuffer(chCount, end, rate);
    for (let c = 0; c < chCount; c++) buf.copyToChannel(chans[c]!.subarray(0, end), c);
    return buf;
  } finally {
    await input.dispose();
  }
}

/** Mono mixdown of a decoded buffer, resampled to `rate` (OfflineAudioContext does the resampling in
 *  native code — far cheaper than doing it in JS, and it's the same path decodeAudioData would take). */
export async function toMono(buf: AudioBuffer, rate: number): Promise<Float32Array> {
  if (buf.numberOfChannels === 1 && buf.sampleRate === rate) return buf.getChannelData(0).slice();
  const frames = Math.max(1, Math.round((buf.length / buf.sampleRate) * rate));
  const octx = new OfflineAudioContext(1, frames, rate);
  const src = octx.createBufferSource();
  src.buffer = buf;
  src.connect(octx.destination);
  src.start();
  const out = await octx.startRendering();
  return out.getChannelData(0).slice();
}
