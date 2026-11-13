import '@pireel/studio-engine/video-edit/mediabunny-warnings';
/**
 * Audio decoding for local analysis (waveforms, loudness, denoise) — as opposed to extract-audio.ts,
 * which re-encodes to AAC because its job is to UPLOAD a small file for ASR.
 *
 * Locally we never wanted a file: every consumer decodes the result straight back to PCM, so
 * encoding first is pure round-trip waste (and lossy). These read the compressed samples through
 * MediaBunny and hand back an AudioBuffer directly — no encoder, no second decode.
 */

import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import { peakReader } from './audio-peaks';
import { levelMeter } from './loudness';

const ANALYSIS_CH = 2;

/** Decode an AUDIO file (music/SFX on the lane) to PCM. */
export async function decodeAudioFile(blob: Blob): Promise<AudioBuffer> {
  const octx = new OfflineAudioContext(ANALYSIS_CH, 8, 48000);
  return octx.decodeAudioData(await blob.arrayBuffer());
}

/** Decode a VIDEO file's audio track to PCM at its own sample rate. null = the file has no audio.
 *  Channels are capped at two: everything downstream (peaks, loudness, denoise) mixes down anyway.
 *
 *  This holds the WHOLE track (~23 MB per stereo minute, over a gigabyte for an hour), so nothing
 *  that runs on a recording uses it any more: waveform, level, speech activity and the cleaned voice
 *  all read through readVideoSound below. It is for a short clip whose samples are needed at once.
 *
 *  Two things this is careful about, because it runs while the user is working: samples are written
 *  straight into the AudioBuffer (a second staging copy would double the footprint — a ten-minute
 *  stereo track is already ~230 MB of f32), and the loop hands the main thread back every few
 *  milliseconds. A decode that resolves its samples without ever yielding to the event loop starves
 *  rendering and input for as long as it runs, which reads as the whole UI stuttering. */
export async function decodeVideoAudio(file: File): Promise<AudioBuffer | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    const rate = track.sampleRate;
    const chCount = Math.min(ANALYSIS_CH, track.numberOfChannels);
    const duration = await track.computeDuration(); // "max end timestamp", so it covers every sample
    const total = Math.max(1, Math.ceil(duration * rate));
    const octx = new OfflineAudioContext(chCount, total, rate);
    const buf = octx.createBuffer(chCount, total, rate);
    const chans = Array.from({ length: chCount }, (_, c) => buf.getChannelData(c));
    let any = false;
    let since = performance.now();
    for await (const sample of new AudioSampleSink(track).samples()) {
      const frames = sample.numberOfFrames;
      const srcCh = sample.numberOfChannels;
      const data = new Float32Array(frames * srcCh);
      sample.copyTo(data, { planeIndex: 0, format: 'f32' });
      const at = Math.round(sample.timestamp * rate); // place by timestamp: a stream with gaps stays time-aligned
      sample.close();
      if (at < total) {
        const n = Math.min(frames, total - at);
        for (let c = 0; c < chCount; c++) {
          const out = chans[c]!;
          const sc = srcCh === 1 ? 0 : Math.min(c, srcCh - 1);
          for (let i = 0; i < n; i++) out[at + i] = data[i * srcCh + sc]!;
        }
        any = true;
      }
      if (performance.now() - since > 8) {
        await new Promise((r) => setTimeout(r, 0)); // a macrotask, so a frame can actually paint
        since = performance.now();
      }
    }
    return any ? buf : null;
  } finally {
    await input.dispose();
  }
}

/** What a soundtrack is, known before its first sample: `frames` is its whole length at `sampleRate`. */
export interface SoundShape {
  sampleRate: number;
  channels: number;
  frames: number;
}

/** Takes the next piece of a soundtrack: one array per channel. */
export type SoundReceiver = (channels: Float32Array[]) => void | Promise<void>;

/**
 * Read a video's soundtrack in order, a piece at a time, for anything that only keeps a running
 * measurement (waveform bins, level, speech activity). Decoded whole, a track is ~23 MB per stereo
 * minute, so an hour-long recording held that way is well over a gigabyte for each reader; read this
 * way it costs the same as a short one.
 *
 * `open` is told the track's shape and returns what receives each piece: one array per channel (at
 * most two), contiguous from time zero. A gap in the stream arrives as silence and an overlap is
 * dropped, as the track plays. A receiver that returns a promise is waited for before the next
 * piece is decoded, so a slow consumer (denoising) never has the rest of the track queued behind
 * it. The loop hands the main thread back every few milliseconds, like decodeVideoAudio. Null
 * without an audio track or without a single sample.
 */
export async function readVideoSound(
  file: Blob,
  open: (shape: SoundShape) => SoundReceiver | Promise<SoundReceiver>,
): Promise<SoundShape | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    const rate = track.sampleRate;
    const chCount = Math.min(ANALYSIS_CH, track.numberOfChannels);
    const shape: SoundShape = { sampleRate: rate, channels: chCount, frames: Math.max(1, Math.ceil((await track.computeDuration()) * rate)) };
    const receive = await open(shape);
    const push = async (channels: Float32Array[]) => { const waiting = receive(channels); if (waiting) await waiting; };
    let next = 0;
    let any = false;
    let since = performance.now();
    for await (const sample of new AudioSampleSink(track).samples()) {
      const frames = sample.numberOfFrames;
      const srcCh = sample.numberOfChannels;
      const data = new Float32Array(frames * srcCh);
      sample.copyTo(data, { planeIndex: 0, format: 'f32' });
      const at = Math.round(sample.timestamp * rate);
      sample.close();
      while (at > next) { // a gap, a second at a time so a long one is never one allocation
        const quiet = Math.min(rate, at - next);
        await push(Array.from({ length: chCount }, () => new Float32Array(quiet)));
        next += quiet;
      }
      const skip = Math.max(0, next - at); // overlap with what was already handed over
      if (skip < frames) {
        await push(Array.from({ length: chCount }, (_, c) => {
          const sc = srcCh === 1 ? 0 : Math.min(c, srcCh - 1);
          const out = new Float32Array(frames - skip);
          for (let i = 0; i < out.length; i++) out[i] = data[(i + skip) * srcCh + sc]!;
          return out;
        }));
        next = at + frames;
        any = true;
      }
      if (performance.now() - since > 8) {
        await new Promise((r) => setTimeout(r, 0)); // a macrotask, so a frame can actually paint
        since = performance.now();
      }
    }
    return any ? shape : null;
  } finally {
    await input.dispose();
  }
}

/** The lane waveform of a video's soundtrack, built while it is read. Null = no sound to draw. */
export async function videoSoundPeaks(file: Blob): Promise<{ peaks: Float32Array; durationSec: number } | null> {
  let reader: ReturnType<typeof peakReader> | undefined;
  const shape = await readVideoSound(file, (found) => (reader = peakReader(found.frames, found.sampleRate)).push);
  return shape && reader ? { peaks: reader.peaks, durationSec: shape.frames / shape.sampleRate } : null;
}

/** Gated level (dBFS, see loudness.ts) of a video's soundtrack, measured while it is read. Null = no
 *  audio track or effectively silent. */
export async function videoSoundLevelDb(file: Blob): Promise<number | null> {
  let meter: ReturnType<typeof levelMeter> | undefined;
  const shape = await readVideoSound(file, (found) => (meter = levelMeter(found.sampleRate)).push);
  return shape && meter ? meter.db() : null;
}

/**
 * Integrated loudness (LUFS) of a file's soundtrack, measured while decoding: nothing but the meter's
 * per-100 ms sums is kept, so an hour-long video costs no more memory than a short one. Gaps in the
 * stream count as silence, as they play. Null without an audio track or audible sound.
 */
export async function streamVideoLoudness(file: Blob): Promise<number | null> {
  const { LoudnessMeter } = await import('@pireel/studio-engine/loudness-lufs');
  let meter: InstanceType<typeof LoudnessMeter> | undefined;
  const shape = await readVideoSound(file, (found) => {
    const opened = meter = new LoudnessMeter(found.sampleRate, found.channels);
    return (channels) => opened.push(channels);
  });
  if (!shape || !meter) return null;
  const lufs = meter.integrated();
  return Number.isFinite(lufs) ? lufs : null;
}

/**
 * Mono at `toRate` from the pieces of a track at `fromRate`, piece by piece: the mean of the
 * channels, with linear interpolation between samples when the rates differ (the reading side of
 * speech detection and level, not anything that is heard). State carries across calls, so the
 * output is one continuous signal however the input was cut up.
 */
export function monoAtRate(fromRate: number, toRate: number): (channels: readonly Float32Array[]) => Float32Array {
  const ratio = fromRate / toRate;
  let pos = 0; // where the next output sample falls, in input frames from the start of the coming piece
  let last = 0; // the previous piece's final sample: the neighbour of an output sample between two pieces
  return (channels) => {
    const length = channels[0]?.length ?? 0;
    let mono = channels[0] ?? new Float32Array(0);
    if (channels.length > 1) {
      mono = new Float32Array(length);
      for (const channel of channels) for (let i = 0; i < length; i++) mono[i]! += channel[i]! / channels.length;
    }
    if (ratio === 1 || !length) return mono;
    const count = Math.max(0, Math.ceil((length - 1 - pos) / ratio));
    const out = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      const at = pos + k * ratio;
      const index = Math.floor(at);
      const from = index < 0 ? last : mono[index]!;
      out[k] = from + (mono[Math.min(length - 1, index + 1)]! - from) * (at - index);
    }
    pos += count * ratio - length;
    last = mono[length - 1]!;
    return out;
  };
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

/**
 * Mono at `toRate` for sound that will be heard (the cleaned voice), fed piece by piece: the mean
 * of the channels through a windowed-sinc resampler, low-passed at the lower of the two rates.
 * Equal rates pass the mean straight through. `flush` returns what the last pieces still owed.
 */
export function monoResampler(fromRate: number, toRate: number): { push(channels: readonly Float32Array[]): Float32Array; flush(): Float32Array } {
  const mean = (channels: readonly Float32Array[]): Float32Array => {
    const length = channels[0]?.length ?? 0;
    if (channels.length <= 1) return channels[0] ?? new Float32Array(0);
    const mono = new Float32Array(length);
    for (const channel of channels) for (let i = 0; i < length; i++) mono[i]! += channel[i]! / channels.length;
    return mono;
  };
  if (fromRate === toRate) return { push: mean, flush: () => new Float32Array(0) };

  const step = fromRate / toRate; // input samples per output sample
  const cutoff = Math.min(1, toRate / fromRate);
  const half = Math.ceil(16 / cutoff); // taps on each side of an output sample, in input samples
  const width = 2 * half;
  const PHASES = 1024;
  // One row of taps per fraction of an input sample; each row sums to one, so level is kept exactly.
  const table = new Float32Array((PHASES + 1) * width);
  for (let phase = 0; phase <= PHASES; phase++) {
    let sum = 0;
    for (let tap = 0; tap < width; tap++) {
      const t = phase / PHASES - (tap - half + 1);
      const x = Math.PI * cutoff * t;
      const value = Math.abs(t) >= half ? 0 : (Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x) * (0.5 + 0.5 * Math.cos((Math.PI * t) / half));
      table[phase * width + tap] = value;
      sum += value;
    }
    for (let tap = 0; tap < width; tap++) table[phase * width + tap]! /= sum;
  }

  let held: Float32Array = new Float32Array(0); // input not yet behind every output that needs it
  let heldStart = 0; // index of held[0] in the whole input
  let outIndex = 0;
  const run = (ended: boolean): Float32Array => {
    const end = heldStart + held.length;
    const out: number[] = [];
    for (;;) {
      const at = outIndex * step;
      const whole = Math.floor(at);
      if (ended ? at >= end : whole + half >= end) break;
      const row = Math.round((at - whole) * PHASES) * width;
      const first = whole - half + 1 - heldStart;
      let value = 0;
      for (let tap = 0; tap < width; tap++) {
        const index = first + tap;
        if (index >= 0 && index < held.length) value += held[index]! * table[row + tap]!;
      }
      out.push(value);
      outIndex += 1;
    }
    const keepFrom = Math.max(heldStart, Math.min(end, Math.floor(outIndex * step) - half + 1));
    held = held.slice(keepFrom - heldStart);
    heldStart = keepFrom;
    return Float32Array.from(out);
  };
  return {
    push(channels) {
      const mono = mean(channels);
      const joined = new Float32Array(held.length + mono.length);
      joined.set(held);
      joined.set(mono, held.length);
      held = joined;
      return run(false);
    },
    flush: () => run(true),
  };
}
