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

import { VOLUME_DB_MIN, dbToGain, fadeShape } from './composition-core';

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
  /** Trim in/out points in SOURCE seconds (lane edge handles). in absent = 0, out absent = durationSec.
   *  Timeline length = (out − in) ÷ speed. */
  inSec?: number;
  outSec?: number;
}

export const AUDIO_DEFAULT_DB = -18;
/** Lane clips play through a WebAudio gain node, so unlike shots they CAN be boosted past source level.
 *  VOLUME_DB_MIN (-60 dB) is silence at the bottom end. */
export const AUDIO_VOLUME_DB_MAX = 20;
export const AUDIO_FADE_IN_SEC = 0.8;
export const AUDIO_FADE_OUT_SEC = 1.5;
/** Longest a single fade may be. */
export const AUDIO_FADE_MAX_SEC = 10;
export const AUDIO_SPEED_MIN = 0.5;
export const AUDIO_SPEED_MAX = 2;
/** Shortest a clip may be trimmed to, in TIMELINE seconds. */
export const AUDIO_MIN_LEN_SEC = 0.2;

let _audioUid = 0;
export function audioClipId(): string {
  _audioUid += 1;
  return `aud${_audioUid}_${Math.floor(performance.now())}`;
}

/** Resolved knobs (defaults applied). outSec falls back to the media duration, or Infinity when unknown.
 *  The two fades are kept APART: fade-in is capped by the clip's length and fade-out by whatever is left
 *  after it, so they can never overlap into one blob (the reference editor clamps the same way). Short
 *  clips therefore show shorter fades than the stored value — the stored value is preserved, so making the
 *  clip longer again restores it. */
export function audioClipDefaults(c: AudioClip): Required<Pick<AudioClip, 'startSec' | 'volumeDb' | 'fadeInSec' | 'fadeOutSec' | 'speed' | 'inSec' | 'outSec'>> {
  const inSec = Math.max(0, c.inSec ?? 0);
  const cap = c.durationSec ?? Infinity;
  const outSec = Math.max(inSec, Math.min(cap, c.outSec ?? cap));
  const speed = Math.max(AUDIO_SPEED_MIN, Math.min(AUDIO_SPEED_MAX, c.speed ?? 1));
  const span = Number.isFinite(outSec) ? (outSec - inSec) / speed : Infinity;
  const fadeIn = Math.min(Math.max(0, c.fadeInSec ?? AUDIO_FADE_IN_SEC), AUDIO_FADE_MAX_SEC, span);
  return {
    startSec: Math.max(0, c.startSec ?? 0),
    volumeDb: Math.max(VOLUME_DB_MIN, Math.min(AUDIO_VOLUME_DB_MAX, c.volumeDb ?? AUDIO_DEFAULT_DB)),
    fadeInSec: fadeIn,
    fadeOutSec: Math.min(Math.max(0, c.fadeOutSec ?? AUDIO_FADE_OUT_SEC), AUDIO_FADE_MAX_SEC, Math.max(0, span - fadeIn)),
    speed,
    inSec,
    outSec,
  };
}

/** The clip's window on the edited timeline: [start, end), end = start + trimmed source length ÷ speed.
 *  Unknown media duration (bytes not mounted yet) degrades to the timeline end so the chip still draws.
 *  NOT clamped to totalSec — a clip may hang past the end of the video; callers clamp for drawing. */
export function audioClipWindow(c: AudioClip, totalSec: number): { start: number; end: number } {
  const d = audioClipDefaults(c);
  const start = d.startSec;
  if (!Number.isFinite(d.outSec)) return { start, end: Math.max(start, totalSec) };
  return { start, end: start + (d.outSec - d.inSec) / d.speed };
}

/** Edge-trim math (lane handles): given the dragged edge's new TIMELINE position, return the patch.
 *  Left = the in-point moves with the clip's left edge (the tail stays put, NLE convention);
 *  right = the out-point moves. Both clamp to the media's own bounds and AUDIO_MIN_LEN_SEC. */
export function audioTrimPatch(c: AudioClip, edge: 'left' | 'right', newEdgeSec: number): Pick<AudioClip, 'startSec' | 'inSec' | 'outSec'> {
  const d = audioClipDefaults(c);
  const cap = c.durationSec ?? Infinity;
  if (edge === 'left') {
    const end = Number.isFinite(d.outSec) ? d.startSec + (d.outSec - d.inSec) / d.speed : Infinity;
    // available head room in TIMELINE seconds (how far left the edge can go before running out of source)
    const minStart = Math.max(0, d.startSec - d.inSec / d.speed);
    const maxStart = Number.isFinite(end) ? end - AUDIO_MIN_LEN_SEC : d.startSec + (cap - d.inSec) / d.speed - AUDIO_MIN_LEN_SEC;
    const start = Math.max(minStart, Math.min(maxStart, newEdgeSec));
    const inSec = Math.max(0, d.inSec + (start - d.startSec) * d.speed);
    return { startSec: start, inSec, ...(Number.isFinite(d.outSec) ? { outSec: d.outSec } : {}) };
  }
  const minEnd = d.startSec + AUDIO_MIN_LEN_SEC;
  const maxEnd = Number.isFinite(cap) ? d.startSec + (cap - d.inSec) / d.speed : Infinity;
  const end = Math.max(minEnd, Math.min(maxEnd, newEdgeSec));
  return { inSec: d.inSec, outSec: d.inSec + (end - d.startSec) * d.speed };
}

/** Split a lane clip at an edited-timeline moment into [head, tail]. Both keep the same source; the cut
 *  point becomes the head's out-point and the tail's in-point, so nothing moves on the timeline. Fades are
 *  zeroed on the two inner edges (a default fade there would dip the audio at a cut that removed nothing).
 *  null = the playhead isn't inside the clip with room for both halves. */
export function splitAudioClipAt(c: AudioClip, atSec: number, newId: () => string): [AudioClip, AudioClip] | null {
  const d = audioClipDefaults(c);
  if (!Number.isFinite(d.outSec)) return null;
  const end = d.startSec + (d.outSec - d.inSec) / d.speed;
  if (atSec < d.startSec + AUDIO_MIN_LEN_SEC || atSec > end - AUDIO_MIN_LEN_SEC) return null;
  const cutSrc = d.inSec + (atSec - d.startSec) * d.speed;
  const head = patchAudioClip(c, { inSec: d.inSec, outSec: cutSrc, fadeOutSec: 0 });
  const tail = patchAudioClip({ ...c, id: newId() }, { startSec: atSec, inSec: cutSrc, outSec: d.outSec, fadeInSec: 0 });
  return [head, tail];
}

/** Linear gain of a clip at edited time t (0 outside its window; fades measured inside it). */
export function audioClipGainAt(c: AudioClip, t: number, totalSec: number): number {
  const d = audioClipDefaults(c);
  const w = audioClipWindow(c, totalSec);
  if (t < w.start || t > w.end) return 0;
  // fades are measured against the clip's own edges (trimming moves them with the edge)
  let g = dbToGain(d.volumeDb);
  if (d.fadeInSec > 0) g *= fadeShape((t - w.start) / d.fadeInSec);
  if (d.fadeOutSec > 0) g *= fadeShape((w.end - t) / d.fadeOutSec);
  return g;
}

/** Position inside the music file for edited time t (source seconds; speed maps timeline→source).
 *  null = outside the clip's trimmed range. */
export function audioClipSrcTimeAt(c: AudioClip, t: number): number | null {
  const d = audioClipDefaults(c);
  const lt = t - d.startSec;
  if (lt < 0) return null;
  const srcT = d.inSec + lt * d.speed;
  if (srcT >= d.outSec) return null;
  return srcT;
}

/** Apply a patch to a clip with the neutrality convention (fields at their default value are dropped). */
export function patchAudioClip(cur: AudioClip, patch: Partial<Pick<AudioClip, 'startSec' | 'volumeDb' | 'fadeInSec' | 'fadeOutSec' | 'speed' | 'inSec' | 'outSec'>>): AudioClip {
  const next: AudioClip = { ...cur, ...patch };
  const out: AudioClip = { id: cur.id, src: next.src };
  if (next.sig) out.sig = next.sig;
  if (next.label) out.label = next.label;
  if (next.durationSec != null) out.durationSec = next.durationSec;
  if (next.startSec) out.startSec = Math.round(Math.max(0, next.startSec) * 100) / 100; // same precision as in/out — a coarser start would slide the audio inside the clip on a left trim
  const db = next.volumeDb != null ? Math.max(VOLUME_DB_MIN, Math.min(AUDIO_VOLUME_DB_MAX, next.volumeDb)) : undefined;
  if (db != null && db !== AUDIO_DEFAULT_DB) out.volumeDb = Math.round(db * 10) / 10;
  const fadeSec = (v: number) => Math.round(Math.max(0, Math.min(AUDIO_FADE_MAX_SEC, v)) * 10) / 10;
  if (next.fadeInSec != null && fadeSec(next.fadeInSec) !== AUDIO_FADE_IN_SEC) out.fadeInSec = fadeSec(next.fadeInSec);
  if (next.fadeOutSec != null && fadeSec(next.fadeOutSec) !== AUDIO_FADE_OUT_SEC) out.fadeOutSec = fadeSec(next.fadeOutSec);
  const sp = next.speed != null ? Math.max(AUDIO_SPEED_MIN, Math.min(AUDIO_SPEED_MAX, next.speed)) : undefined;
  if (sp != null && sp !== 1) out.speed = Math.round(sp * 100) / 100;
  if (next.inSec) out.inSec = Math.round(Math.max(0, next.inSec) * 100) / 100;
  // out-point only stored when it actually trims (equal to the media length = untrimmed)
  if (next.outSec != null && (next.durationSec == null || Math.abs(next.outSec - next.durationSec) > 0.01)) {
    out.outSec = Math.round(Math.max(0, next.outSec) * 100) / 100;
  }
  return out;
}
