/**
 * Narration ASR → caption blocks. The transcript stays SENTENCE-granular (linguistic units, source
 * seconds, stable across cutting); display cues (one on-screen line each) are DERIVED at lay time
 * over the edited word stream (captions-relay displayCues) — this file just turns segments into
 * blocks 1:1. Word timing prefers ASR words (DashScope filetrans enable_words); wordsFromText
 * approximates from text + sentence timing only when ASR words are absent.
 */

import { joinWords, wordsFromText } from './caption-fx';
import { type Block, captionBlock } from './composition';

/** A display cue's pointer back to its source sentence: which transcript (src null = main narration),
 *  which sentence, and which word range within that sentence's words — the edit/translation key. */
export interface CueRef {
  src: string | null;
  seg: number;
  w0: number;
  w1: number;
}

export interface AsrSegment {
  start: number;
  end: number;
  text: string;
  /** Prefer this if ASR provided word-level timing. si = original index within the source sentence's words (stamped on mapped/derived copies only). */
  words?: { text: string; start: number; end: number; si?: number }[];
  /** Bilingual caption second line (whole-sentence translation; shows only when the sentence maps to a single display cue). */
  sub?: string;
  /** Per-cue translations keyed by word range "w0:w1" (written by the UI translate flow / set_caption_translations with a range). */
  cueSubs?: Record<string, string>;
  /** Derived display cue (one on-screen caption line, from displayCues). On persisted transcripts this flag only appears in the short-lived extraction-cueing scheme — desegmentCues merges those back. */
  cue?: boolean;
  /** Derived cues only: source-sentence pointer for edit/translation write-back. Never persisted on transcripts. */
  ref?: CueRef;
}

/** Reverse-migration for transcripts that were cue-split at extraction (a short-lived scheme):
 *  merge consecutive cue segments back into sentences, closing at sentence-final punctuation or a
 *  ≥1s gap. Idempotent — sentence transcripts pass through untouched (same array reference). Stale
 *  per-cue subs are dropped (translations are regenerable; ranges no longer line up after merging). */
export function desegmentCues(segs: AsrSegment[]): AsrSegment[] {
  if (!segs.some((s) => s.cue)) return segs;
  const SENT_END = /[。.!?!?…]\s*$/;
  const out: AsrSegment[] = [];
  let cur: AsrSegment | null = null;
  const flush = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  for (const s of segs) {
    if (!s.cue) {
      flush();
      out.push(s);
      continue;
    }
    const words = s.words ?? wordsFromText(s.text, s.start, s.end);
    if (cur && s.start - cur.end < 1.0) {
      cur = { start: cur.start, end: s.end, text: joinWords([cur.text, s.text]), words: [...(cur.words ?? []), ...words] };
    } else {
      flush();
      cur = { start: s.start, end: s.end, text: s.text, words };
    }
    if (SENT_END.test(s.text)) flush();
  }
  flush();
  return out;
}

/** Transcript segments → caption blocks, one block per segment (word data only; visuals come from the
 *  global caption style/preset, captions carry no styling). Cue segments (the normal case since
 *  toCueSegments) are pre-split to one line and render statically; legacy sentence segments keep the
 *  old render-time rotation (chunking inside the caption template), so old blocks/drafts/caches keep
 *  working unchanged. */
export function captionBlocksFromAsr(segments: AsrSegment[], opts?: { preset?: string; yPct?: number }): Block[] {
  const blocks = segments
    .filter((s) => s.text && s.text.trim())
    .map((s) => {
      const words = s.words?.length ? s.words : wordsFromText(s.text, s.start, s.end);
      // Derived cues get a deterministic id from their source pointer: re-derivations keep the same id
      // (selection, preview double-buffer diffing and hf:* messages stay stable). Non-alnum chars in the
      // src key would break '#id' CSS selectors in the assembled doc — strip them.
      const refId = s.ref ? `capd_${(s.ref.src ?? 'main').replace(/[^a-zA-Z0-9]/g, '').slice(-10)}_${s.ref.seg}_${s.ref.w0}` : undefined;
      return captionBlock({
        ...(refId ? { id: refId } : {}),
        words,
        ...(s.cue ? { cue: true } : {}),
        ...(s.ref ? { ref: s.ref } : {}),
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
