/**
 * Loudness measurement + the auto-level decision built on it: when an audio clip is mounted,
 * its initial volumeDb is set so it sits BGM_AUTO_UNDER_DB below the measured narration loudness
 * (a starting point, not a lock — the user's slider always wins afterwards).
 *
 * Measure = gated RMS in dBFS (a two-stage gate in the spirit of EBU R128 integrated loudness,
 * not the full K-weighted spec): 400 ms windows / 200 ms hop, absolute gate -55 dBFS, then a
 * relative gate 10 dB under the mean of survivors. Good enough to compare speech beds; nobody
 * here needs broadcast-legal numbers.
 */

import { VOLUME_DB_MAX, VOLUME_DB_MIN } from '@pireel/studio-engine/composition';

const HOP_SEC = 0.2; // a window is two hops
const ABS_GATE_DB = -55;
const REL_GATE_DB = 10;

/** How far under narration the bed base level sits (duck stacks on top during speech). */
export const BGM_AUTO_UNDER_DB = 12;

/**
 * The gated level measured while the audio is read, in any number of pieces. A window is two hops,
 * so one sum per 200 ms is all it keeps: an hour of sound costs a few kilobytes, where the decoded
 * track would be ~1.4 GB.
 */
export function levelMeter(sampleRate: number) {
  const hop = Math.max(1, Math.round(HOP_SEC * sampleRate));
  const hops: number[] = [];
  let sum = 0; let filled = 0; let total = 0; let frames = 0;
  return {
    /** The next samples of the track, one array per channel (mixed down to mono here). */
    push(channels: readonly Float32Array[]) {
      const count = channels.length;
      const length = channels[0]?.length ?? 0;
      for (let i = 0; i < length; i++) {
        let v = 0;
        for (let c = 0; c < count; c++) v += channels[c]![i]!;
        v /= count;
        sum += v * v; total += v * v; frames += 1;
        if (++filled === hop) { hops.push(sum); sum = 0; filled = 0; }
      }
    },
    /** dBFS of what was read so far; null = effectively silent. */
    db(): number | null {
      if (!frames) return null;
      const powers: number[] = [];
      for (let k = 0; k + 1 < hops.length; k++) powers.push((hops[k]! + hops[k + 1]!) / (2 * hop));
      if (!powers.length) powers.push(total / frames); // shorter than one window
      const db = (p: number) => 10 * Math.log10(Math.max(p, 1e-12));
      const absGate = powers.filter((p) => db(p) > ABS_GATE_DB);
      if (!absGate.length) return null;
      const mean1 = absGate.reduce((a, b) => a + b, 0) / absGate.length;
      const relGate = absGate.filter((p) => db(p) > db(mean1) - REL_GATE_DB);
      const kept = relGate.length ? relGate : absGate;
      return Math.round(db(kept.reduce((a, b) => a + b, 0) / kept.length) * 10) / 10;
    },
  };
}

/** Gated RMS loudness over a decoded buffer, dBFS; null = effectively silent. For a clip already
 *  decoded for its waveform (music, effects); a long recording is measured as it is read instead
 *  (videoSoundLevelDb in audio-decode.ts). */
export function measureBufferLoudnessDb(buf: AudioBuffer): number | null {
  const meter = levelMeter(buf.sampleRate);
  meter.push(Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)));
  return meter.db();
}

/** Clip volumeDb from measured loudness (clamped to the lane's storable range). */
export function bgmAutoVolumeDb(narrationDb: number, bgmDb: number): number {
  const v = narrationDb - BGM_AUTO_UNDER_DB - bgmDb;
  return Math.round(Math.max(VOLUME_DB_MIN, Math.min(VOLUME_DB_MAX, v)) * 10) / 10;
}

