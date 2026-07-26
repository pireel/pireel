/**
 * Narration ASR → caption blocks. The transcript stays SENTENCE-granular (linguistic units, source
 * seconds, stable across cutting); display cues (one on-screen line each) are DERIVED at lay time
 * over the edited word stream (captions-relay displayCues) — this file just turns segments into
 * blocks 1:1. Word timing prefers ASR words (DashScope filetrans enable_words); wordsFromText
 * approximates from text + sentence timing only when ASR words are absent.
 *
 * TYPE DISCIPLINE — persisted vs derived:
 *   TranscriptWord / AsrSegment  = the PERSISTED transcript shape (cloud context / local drafts).
 *   CueWord / DisplayCue         = DERIVED display shapes (per-render output of displayCues); they
 *                                  carry runtime-only pointers (si / ref / cue) that must never land
 *                                  in storage — sanitizeTranscriptSegs is the hard guard at the
 *                                  persistence boundary.
 */

import { joinWords, wordsFromText } from './caption-fx';
import { type Block, captionBlock } from './composition';

/** One persisted transcript word (source seconds). */
export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
}

/** One PERSISTED transcript sentence (source seconds; the single stored source captions derive from). */
export interface AsrSegment {
  start: number;
  end: number;
  text: string;
  /** ASR word-level timing (DashScope filetrans enable_words); absent = wordsFromText approximates at use. */
  words?: TranscriptWord[];
  /** Spoken language of this sentence (BCP-47-ish, e.g. 'zh'/'en'; provider-reported or script-detected). */
  lang?: string;
  /** Speaker id (diarization; absent = single speaker / not enabled). */
  speaker?: string;
  /** Bilingual whole-sentence translation (shows only when the sentence maps to a single display cue). */
  sub?: string;
  /** Per-cue translations keyed by word range "w0:w1" (UI translate flow / set_caption_translations with a range). */
  cueSubs?: Record<string, string>;
  /** Target language sub/cueSubs were translated INTO. Unset = unknown (legacy / BYO agent writes) —
   *  displayed as-is; when both this and the current target language are known and differ, the
   *  translation is treated as stale and hidden (mixed-language second lines are worse than none). */
  subLang?: string;
  /** Legacy flag from the short-lived extraction-cueing scheme (desegmentCues merges those back on load). Never written anew. */
  cue?: boolean;
}

/** A display cue's pointer back to its source sentence: which transcript (src null = main narration),
 *  which sentence, and which word range within that sentence's words — the edit/translation key. */
export interface CueRef {
  src: string | null;
  seg: number;
  w0: number;
  w1: number;
}

/** A derived word copy (edited-timeline seconds) + its original index within the source sentence. */
export interface CueWord extends TranscriptWord {
  si?: number;
}

/** One DERIVED display cue (one on-screen caption line; output of displayCues, re-computed per change).
 *  Never persisted — sanitizeTranscriptSegs strips the runtime fields at the storage boundary. */
export interface DisplayCue extends Omit<AsrSegment, 'words' | 'cueSubs'> {
  words: CueWord[];
  cue: true;
  /** Source-sentence pointer for edit/translation write-back (absent only for ref-less legacy inputs). */
  ref?: CueRef;
}

/** Persistence guard: the transcript that lands in storage carries ONLY persisted fields — runtime
 *  derivation markers (cue / ref / per-word si) are stripped, whatever upstream produced. Returns the
 *  same array reference when nothing needed cleaning (cheap no-op for the common case). */
export function sanitizeTranscriptSegs(segs: AsrSegment[]): AsrSegment[] {
  const dirty = segs.some((s) => s.cue !== undefined || (s as DisplayCue).ref !== undefined || s.words?.some((w) => (w as CueWord).si !== undefined));
  if (!dirty) return segs;
  return segs.map((s) => {
    const { cue: _cue, ...rest } = s as DisplayCue;
    const { ref: _ref, ...clean } = rest;
    return {
      ...clean,
      ...(s.words ? { words: s.words.map((w) => ({ text: w.text, start: w.start, end: w.end })) } : {}),
    } as AsrSegment;
  });
}

/** Items accepted by the shared translation writer (set_caption_translations semantics):
 *  index = sentence line number; w0/w1 present = per-cue translation for that word range. */
export interface CaptionTranslationItem {
  index: number;
  text: string;
  w0?: number;
  w1?: number;
}

/** Apply translation writes to a transcript — ONE implementation shared by the offline executor, the
 *  browser tool mirror and the panel flows. text '' deletes; lang (when known) stamps subLang so a
 *  later target-language switch can tell stale translations apart. */
export function applyCaptionTranslations(segs: AsrSegment[], items: CaptionTranslationItem[], lang?: string): AsrSegment[] {
  return segs.map((s, i) => {
    const hits = items.filter((it) => it.index === i);
    if (!hits.length) return s;
    const out: AsrSegment = { ...s };
    for (const hit of hits) {
      if (hit.w0 != null && hit.w1 != null) {
        const subs = { ...(out.cueSubs ?? {}) };
        if (hit.text) subs[`${hit.w0}:${hit.w1}`] = hit.text;
        else delete subs[`${hit.w0}:${hit.w1}`];
        if (Object.keys(subs).length) out.cueSubs = subs;
        else delete out.cueSubs;
      } else if (hit.text) out.sub = hit.text;
      else delete out.sub;
    }
    if (out.sub || out.cueSubs) {
      if (lang) out.subLang = lang;
    } else delete out.subLang;
    return out;
  });
}

/** Remove every translation (sub / cueSubs / subLang) from a transcript. */
export function clearCaptionTranslations(segs: AsrSegment[]): AsrSegment[] {
  return segs.map(({ sub: _s, cueSubs: _cs, subLang: _sl, ...rest }) => rest);
}

/** Reverse-migration for transcripts that were cue-split at extraction (a short-lived scheme):
 *  merge consecutive cue segments back into sentences, closing at sentence-final punctuation or a
 *  ≥1s gap. Idempotent — sentence transcripts pass through untouched (same array reference). Stale
 *  per-cue subs are dropped (translations are regenerable; ranges no longer line up after merging). */
export function desegmentCues(segs: AsrSegment[]): AsrSegment[] {
  if (!segs.some((s) => s.cue)) return segs;
  const SENT_END = /[。.!?!?…]\s*$/;
  const out: AsrSegment[] = [];
  let acc: AsrSegment[] = []; // cue pieces accumulated for the sentence being rebuilt
  const flush = () => {
    if (!acc.length) return;
    const first = acc[0]!;
    out.push({
      start: first.start,
      end: acc[acc.length - 1]!.end,
      text: joinWords(acc.map((x) => x.text)),
      words: acc.flatMap((x) => x.words ?? wordsFromText(x.text, x.start, x.end)),
      ...(first.lang ? { lang: first.lang } : {}),
      ...(first.speaker ? { speaker: first.speaker } : {}),
    });
    acc = [];
  };
  for (const s of segs) {
    if (!s.cue) {
      flush();
      out.push(s);
      continue;
    }
    if (acc.length && s.start - acc[acc.length - 1]!.end >= 1.0) flush();
    acc.push(s);
    if (SENT_END.test(s.text)) flush();
  }
  flush();
  return out;
}

/** Transcript segments / display cues → caption blocks, 1:1 (word data only; visuals come from the
 *  global caption style/preset, captions carry no styling). Derived cues render statically as one
 *  line; ref-less legacy sentence segments keep the old render-time rotation, so old persisted blocks
 *  keep working unchanged. */
export function captionBlocksFromAsr(segments: (AsrSegment | DisplayCue)[], opts?: { preset?: string; yPct?: number }): Block[] {
  const blocks = segments
    .filter((s) => s.text && s.text.trim())
    .map((s) => {
      const words = s.words?.length ? s.words : wordsFromText(s.text, s.start, s.end);
      const ref = (s as DisplayCue).ref;
      // Derived cues get a deterministic id from their source pointer: re-derivations keep the same id
      // (selection, preview double-buffer diffing and hf:* messages stay stable). Non-alnum chars in the
      // src key would break '#id' CSS selectors in the assembled doc — strip them.
      const refId = ref ? `capd_${(ref.src ?? 'main').replace(/[^a-zA-Z0-9]/g, '').slice(-10)}_${ref.seg}_${ref.w0}` : undefined;
      return captionBlock({
        ...(refId ? { id: refId } : {}),
        words,
        ...(s.cue ? { cue: true } : {}),
        ...(ref ? { ref } : {}),
        ...(s.sub?.trim() ? { sub: s.sub.trim() } : {}),
        ...(opts?.preset ? { preset: opts.preset } : {}),
        ...(opts?.yPct != null ? { yPct: opts.yPct } : {}),
        label: s.text.trim(),
      });
    });
  // Exclusive windows (standard subtitle behavior): ASR sentence tails often overlap the next
  // sentence's start — both blocks would render fully opaque at once (double caption at every
  // alternation). Clamp each block's window to the next block's start; word times stay untouched
  // (the transcript is the source of truth — this is display-window post-processing only).
  const byStart = [...blocks].sort((a, b) => a.startSec - b.startSec);
  for (let i = 0; i < byStart.length - 1; i++) {
    const a = byStart[i]!;
    const b = byStart[i + 1]!;
    if (b.startSec > a.startSec && a.startSec + a.durationSec > b.startSec) {
      a.durationSec = Math.max(0.1, Math.round((b.startSec - a.startSec) * 100) / 100);
    }
  }
  return blocks;
}
