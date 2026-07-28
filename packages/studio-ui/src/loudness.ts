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

const WIN_SEC = 0.4;
const HOP_SEC = 0.2;
const ABS_GATE_DB = -55;
const REL_GATE_DB = 10;

/** How far under narration the bed base level sits (duck stacks on top during speech). */
export const BGM_AUTO_UNDER_DB = 12;

/** Gated RMS loudness over a decoded buffer, dBFS; null = effectively silent. Callers decode once (see
 *  audio-decode.ts) and reuse that buffer for peaks/loudness alike — nothing here re-decodes. */
export function measureBufferLoudnessDb(buf: AudioBuffer): number | null {
  const n = buf.length;
  if (!n) return null;
  // Mono mixdown power per window
  const chs = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
  const win = Math.max(1, Math.round(WIN_SEC * buf.sampleRate));
  const hop = Math.max(1, Math.round(HOP_SEC * buf.sampleRate));
  const powers: number[] = [];
  for (let start = 0; start + win <= n; start += hop) {
    let sum = 0;
    for (let i = start; i < start + win; i++) {
      let v = 0;
      for (const ch of chs) v += ch[i]!;
      v /= chs.length;
      sum += v * v;
    }
    powers.push(sum / win);
  }
  if (!powers.length) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (const ch of chs) v += ch[i]!;
      v /= chs.length;
      sum += v * v;
    }
    powers.push(sum / n);
  }
  const db = (p: number) => 10 * Math.log10(Math.max(p, 1e-12));
  const absGate = powers.filter((p) => db(p) > ABS_GATE_DB);
  if (!absGate.length) return null;
  const mean1 = absGate.reduce((a, b) => a + b, 0) / absGate.length;
  const relGate = absGate.filter((p) => db(p) > db(mean1) - REL_GATE_DB);
  const kept = relGate.length ? relGate : absGate;
  return Math.round(db(kept.reduce((a, b) => a + b, 0) / kept.length) * 10) / 10;
}

/** Clip volumeDb from measured loudness (clamped to the lane's storable range). */
export function bgmAutoVolumeDb(narrationDb: number, bgmDb: number): number {
  const v = narrationDb - BGM_AUTO_UNDER_DB - bgmDb;
  return Math.round(Math.max(VOLUME_DB_MIN, Math.min(VOLUME_DB_MAX, v)) * 10) / 10;
}

