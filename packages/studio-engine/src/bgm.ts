/**
 * BGM bed (single music track under the whole edited timeline).
 *
 * Model: ONE bed per composition (Composition.bgm) — talking-head videos want a mood bed,
 * not a multi-track music timeline; "different music per chapter" stays out of scope until
 * a real need shows up. The bed is described declaratively (level/duck/loop/fades) and both
 * ends render it from the same pure envelope below: preview drives an <audio> element's
 * volume per tick, export bakes the identical gains into the PCM mix.
 *
 * Ducking: the bed drops by BGM_DUCK_DB while narration speech is present. Speech presence
 * comes from the transcripts (word timestamps mapped onto the edited timeline) — no audio
 * analysis needed, and pauses/intros/outros swell naturally. Spans are merged with a gap
 * tolerance so the bed doesn't pump between words.
 */

import { VOLUME_DB_MAX, VOLUME_DB_MIN, dbToGain } from './composition-core';

export interface BgmTrack {
  /** Audio source URL (upload = session blob URL; generated/library = https). Same convention as VideoShot.src. */
  src: string;
  /** Content sig when the bytes went through our storage — draft restore / cloud takeback, same role as VideoShot.srcSig. */
  sig?: string;
  /** Display name (file name / generation prompt digest). */
  label?: string;
  /** Media duration in seconds (stored at mount so loop math never needs to probe the file). */
  durationSec?: number;
  /** Bed level in dB relative to source ([-60, 0]; absent = BGM_DEFAULT_DB, NOT source level —
   *  music at source level under narration is a mistake nobody wants). */
  volumeDb?: number;
  /** Auto-duck under narration (absent = ON; false turns it off). */
  duck?: boolean;
  /** Loop to cover the timeline (absent = ON; false = play once and stay silent after). */
  loop?: boolean;
  /** Fade edges in seconds (absent = BGM_FADE_IN_SEC / BGM_FADE_OUT_SEC). */
  fadeInSec?: number;
  fadeOutSec?: number;
  /** Start offset into the music file (skip a long intro), seconds. */
  offsetSec?: number;
  /** Where the bed begins on the EDITED timeline (drag position on the music lane; absent = 0).
   *  The bed runs from here to the end of the timeline (loop) or until the music runs out (no loop). */
  startSec?: number;
}

export const BGM_DEFAULT_DB = -18;
export const BGM_DUCK_DB = -9;
export const BGM_DUCK_RAMP_SEC = 0.35;
export const BGM_FADE_IN_SEC = 0.8;
export const BGM_FADE_OUT_SEC = 1.5;
/** Word spans closer than this merge into one speech window (the bed must not pump between words). */
export const BGM_SPEECH_MERGE_GAP_SEC = 1.2;

/** A window of narration speech on the EDITED timeline (seconds). */
export interface SpeechSpan {
  start: number;
  end: number;
}

/** Merge raw word/sentence spans into speech windows: sort, drop empties, merge gaps ≤ gapSec. */
export function mergeSpeechSpans(raw: SpeechSpan[], gapSec: number = BGM_SPEECH_MERGE_GAP_SEC): SpeechSpan[] {
  const spans = raw
    .filter((s) => s.end > s.start)
    .map((s) => ({ start: Math.max(0, s.start), end: s.end }))
    .sort((a, b) => a.start - b.start);
  const out: SpeechSpan[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && s.start - last.end <= gapSec) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

/** Duck factor at t: 1 outside speech windows, dbToGain(BGM_DUCK_DB) inside, linear ramps of
 *  BGM_DUCK_RAMP_SEC straddling each window edge (the bed starts dropping slightly BEFORE the
 *  first word so speech onset is never stepped on). Expects MERGED spans. */
export function duckFactorAt(t: number, spans: SpeechSpan[]): number {
  if (!spans.length) return 1;
  const ducked = dbToGain(BGM_DUCK_DB);
  const r = BGM_DUCK_RAMP_SEC;
  let f = 1;
  for (const s of spans) {
    if (t < s.start - r || t > s.end + r) continue;
    if (t >= s.start && t <= s.end) return ducked;
    // inside a ramp: proportional between full and ducked
    const edge = t < s.start ? (s.start - t) / r : (t - s.end) / r;
    f = Math.min(f, ducked + (1 - ducked) * edge);
  }
  return f;
}

/** Resolved knobs (defaults applied). */
export function bgmDefaults(b: BgmTrack): Required<Pick<BgmTrack, 'volumeDb' | 'duck' | 'loop' | 'fadeInSec' | 'fadeOutSec' | 'offsetSec' | 'startSec'>> {
  return {
    volumeDb: Math.max(VOLUME_DB_MIN, Math.min(VOLUME_DB_MAX, b.volumeDb ?? BGM_DEFAULT_DB)),
    duck: b.duck !== false,
    loop: b.loop !== false,
    fadeInSec: Math.max(0, b.fadeInSec ?? BGM_FADE_IN_SEC),
    fadeOutSec: Math.max(0, b.fadeOutSec ?? BGM_FADE_OUT_SEC),
    offsetSec: Math.max(0, b.offsetSec ?? 0),
    startSec: Math.max(0, b.startSec ?? 0),
  };
}

/** The bed's window on the edited timeline: [startSec, end). Loop = runs to the timeline end;
 *  no loop = until the music runs out (unknown duration degrades to the timeline end). */
export function bgmWindow(b: BgmTrack, totalSec: number): { start: number; end: number } {
  const d = bgmDefaults(b);
  const start = Math.min(d.startSec, totalSec);
  if (!d.loop && b.durationSec != null && b.durationSec > d.offsetSec) {
    return { start, end: Math.min(totalSec, start + (b.durationSec - d.offsetSec)) };
  }
  return { start, end: totalSec };
}

/** Linear gain of the bed at edited time t. totalSec = edited timeline length (for the tail fade).
 *  speech = MERGED spans (pass [] to disable ducking regardless of the flag). */
export function bgmGainAt(b: BgmTrack, t: number, totalSec: number, speech: SpeechSpan[]): number {
  const d = bgmDefaults(b);
  const w = bgmWindow(b, totalSec);
  if (t < w.start || t > w.end) return 0;
  const lt = t - w.start;
  let g = dbToGain(d.volumeDb);
  if (d.fadeInSec > 0) g *= Math.min(1, lt / d.fadeInSec);
  if (d.fadeOutSec > 0) g *= Math.min(1, Math.max(0, (w.end - t) / d.fadeOutSec));
  if (d.duck) g *= duckFactorAt(t, speech);
  return g;
}

/** Position inside the music file for edited time t (loop = modulo over the remaining length after offset).
 *  null = before the bed's start / past the end of a non-looping bed. durationSec unknown →
 *  plain offset+(t−start) (element loop attr handles wrap). */
export function bgmSrcTimeAt(b: BgmTrack, t: number): number | null {
  const d = bgmDefaults(b);
  const lt = t - d.startSec;
  if (lt < 0) return null;
  if (b.durationSec == null || b.durationSec <= d.offsetSec) return d.offsetSec + lt;
  const span = b.durationSec - d.offsetSec;
  if (!d.loop) return lt < span ? d.offsetSec + lt : null;
  return d.offsetSec + (lt % span);
}

/** Apply a patch to the bed with the same neutrality convention as patchShotAudio: fields at their
 *  default value are dropped so untouched beds stay minimal. null clears the whole bed. */
export function patchBgm(cur: BgmTrack, patch: Partial<Pick<BgmTrack, 'volumeDb' | 'duck' | 'loop' | 'fadeInSec' | 'fadeOutSec' | 'offsetSec' | 'startSec'>>): BgmTrack {
  const next: BgmTrack = { ...cur, ...patch };
  const out: BgmTrack = { src: next.src };
  if (next.sig) out.sig = next.sig;
  if (next.label) out.label = next.label;
  if (next.durationSec != null) out.durationSec = next.durationSec;
  const db = next.volumeDb != null ? Math.max(VOLUME_DB_MIN, Math.min(VOLUME_DB_MAX, next.volumeDb)) : undefined;
  if (db != null && db !== BGM_DEFAULT_DB) out.volumeDb = Math.round(db * 10) / 10;
  if (next.duck === false) out.duck = false;
  if (next.loop === false) out.loop = false;
  if (next.fadeInSec != null && next.fadeInSec !== BGM_FADE_IN_SEC) out.fadeInSec = Math.max(0, next.fadeInSec);
  if (next.fadeOutSec != null && next.fadeOutSec !== BGM_FADE_OUT_SEC) out.fadeOutSec = Math.max(0, next.fadeOutSec);
  if (next.offsetSec) out.offsetSec = Math.max(0, next.offsetSec);
  if (next.startSec) out.startSec = Math.round(Math.max(0, next.startSec) * 10) / 10;
  return out;
}
