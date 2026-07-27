/**
 * Audio tracks (music/SFX clips on the dedicated timeline lane).
 *
 * Plain NLE semantics (user's call, replacing the earlier "smart single bed"): a composition
 * holds N independent audio clips; each has a position on the edited timeline, its own level,
 * fade-in/out durations and a playback-speed multiplier. No looping, no auto-ducking — what
 * you place is what plays. Clips may overlap (sounds sum).
 *
 * Speed changes PITCH on both ends by design: export resamples PCM linearly, so preview sets
 * preservesPitch=false on the element — the two stay identical (a pitch-preserving stretch in
 * preview would lie about the export).
 *
 * Both ends render from the same pure envelope below: preview drives per-clip <audio> elements,
 * export bakes identical gains into the PCM mix.
 */

import { VOLUME_DB_MAX, VOLUME_DB_MIN, dbToGain } from './composition-core';

export interface AudioClip {
  id: string;
  /** Audio source URL (upload = session blob URL; generated/library = https). Same convention as VideoShot.src. */
  src: string;
  /** Content sig when the bytes went through our storage — draft restore / cloud takeback, same role as VideoShot.srcSig. */
  sig?: string;
  /** Display name (file name / generation prompt digest). */
  label?: string;
  /** Media duration in seconds (stored at mount so span math never needs to probe the file). */
  durationSec?: number;
  /** Where the clip begins on the EDITED timeline (lane drag position; absent = 0). */
  startSec?: number;
  /** Level in dB relative to source ([-60, 0]; absent = AUDIO_DEFAULT_DB — music at source level
   *  under narration is a mistake nobody wants; an explicit 0 stores as volumeDb: 0? No — 0 is
   *  representable via patch clamping, absent simply means the default). */
  volumeDb?: number;
  /** Fade edges in seconds (absent = AUDIO_FADE_IN_SEC / AUDIO_FADE_OUT_SEC). */
  fadeInSec?: number;
  fadeOutSec?: number;
  /** Playback-speed multiplier (absent = 1; clamped AUDIO_SPEED_MIN..MAX). Changes pitch, see header. */
  speed?: number;
  /** Start offset into the music file (skip a long intro), seconds of SOURCE time. */
  offsetSec?: number;
}

export const AUDIO_DEFAULT_DB = -18;
export const AUDIO_FADE_IN_SEC = 0.8;
export const AUDIO_FADE_OUT_SEC = 1.5;
export const AUDIO_SPEED_MIN = 0.5;
export const AUDIO_SPEED_MAX = 2;

let _audioUid = 0;
export function audioClipId(): string {
  _audioUid += 1;
  return `aud${_audioUid}_${Math.floor(performance.now())}`;
}

/** Resolved knobs (defaults applied). */
export function audioClipDefaults(c: AudioClip): Required<Pick<AudioClip, 'startSec' | 'volumeDb' | 'fadeInSec' | 'fadeOutSec' | 'speed' | 'offsetSec'>> {
  return {
    startSec: Math.max(0, c.startSec ?? 0),
    volumeDb: Math.max(VOLUME_DB_MIN, Math.min(VOLUME_DB_MAX, c.volumeDb ?? AUDIO_DEFAULT_DB)),
    fadeInSec: Math.max(0, c.fadeInSec ?? AUDIO_FADE_IN_SEC),
    fadeOutSec: Math.max(0, c.fadeOutSec ?? AUDIO_FADE_OUT_SEC),
    speed: Math.max(AUDIO_SPEED_MIN, Math.min(AUDIO_SPEED_MAX, c.speed ?? 1)),
    offsetSec: Math.max(0, c.offsetSec ?? 0),
  };
}

/** The clip's window on the edited timeline: [start, end). Length = remaining source length ÷ speed
 *  (no looping — the clip plays once); unknown media duration degrades to the timeline end. */
export function audioClipWindow(c: AudioClip, totalSec: number): { start: number; end: number } {
  const d = audioClipDefaults(c);
  const start = Math.min(d.startSec, totalSec);
  if (c.durationSec != null && c.durationSec > d.offsetSec) {
    return { start, end: Math.min(totalSec, start + (c.durationSec - d.offsetSec) / d.speed) };
  }
  return { start, end: totalSec };
}

/** Linear gain of a clip at edited time t (0 outside its window; fades measured inside it). */
export function audioClipGainAt(c: AudioClip, t: number, totalSec: number): number {
  const d = audioClipDefaults(c);
  const w = audioClipWindow(c, totalSec);
  if (t < w.start || t > w.end) return 0;
  let g = dbToGain(d.volumeDb);
  if (d.fadeInSec > 0) g *= Math.min(1, (t - w.start) / d.fadeInSec);
  if (d.fadeOutSec > 0) g *= Math.min(1, Math.max(0, (w.end - t) / d.fadeOutSec));
  return g;
}

/** Position inside the music file for edited time t (source seconds; speed maps timeline→source).
 *  null = outside the clip's playable range. */
export function audioClipSrcTimeAt(c: AudioClip, t: number): number | null {
  const d = audioClipDefaults(c);
  const lt = t - d.startSec;
  if (lt < 0) return null;
  const srcT = d.offsetSec + lt * d.speed;
  if (c.durationSec != null && srcT >= c.durationSec) return null;
  return srcT;
}

/** Apply a patch to a clip with the neutrality convention (fields at their default value are dropped). */
export function patchAudioClip(cur: AudioClip, patch: Partial<Pick<AudioClip, 'startSec' | 'volumeDb' | 'fadeInSec' | 'fadeOutSec' | 'speed' | 'offsetSec'>>): AudioClip {
  const next: AudioClip = { ...cur, ...patch };
  const out: AudioClip = { id: cur.id, src: next.src };
  if (next.sig) out.sig = next.sig;
  if (next.label) out.label = next.label;
  if (next.durationSec != null) out.durationSec = next.durationSec;
  if (next.startSec) out.startSec = Math.round(Math.max(0, next.startSec) * 10) / 10;
  const db = next.volumeDb != null ? Math.max(VOLUME_DB_MIN, Math.min(VOLUME_DB_MAX, next.volumeDb)) : undefined;
  if (db != null && db !== AUDIO_DEFAULT_DB) out.volumeDb = Math.round(db * 10) / 10;
  if (next.fadeInSec != null && next.fadeInSec !== AUDIO_FADE_IN_SEC) out.fadeInSec = Math.round(Math.max(0, next.fadeInSec) * 10) / 10;
  if (next.fadeOutSec != null && next.fadeOutSec !== AUDIO_FADE_OUT_SEC) out.fadeOutSec = Math.round(Math.max(0, next.fadeOutSec) * 10) / 10;
  const sp = next.speed != null ? Math.max(AUDIO_SPEED_MIN, Math.min(AUDIO_SPEED_MAX, next.speed)) : undefined;
  if (sp != null && sp !== 1) out.speed = Math.round(sp * 100) / 100;
  if (next.offsetSec) out.offsetSec = Math.max(0, next.offsetSec);
  return out;
}
