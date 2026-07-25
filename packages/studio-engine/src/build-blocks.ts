/**
 * Narration ASR → caption blocks. Two granularities coexist:
 *  - CUE segments (cue:true, produced by toCueSegments at transcript-extraction time): one segment
 *    = one on-screen caption line, frozen at extraction (the a mainstream editor model) — blocks render statically.
 *  - legacy sentence segments (persisted transcripts from before cueing existed): one block per
 *    sentence, long lines rotate at render time (old behavior preserved, no data migration).
 * Word timing prefers ASR words (DashScope filetrans enable_words); wordsFromText approximates
 * from text + sentence timing only when ASR words are absent.
 */

import { estWordEm, groupAsrWords, joinWords, chunkWordsBalanced, wordsFromText } from './caption-fx';
import { type Block, captionBlock } from './composition';

export interface AsrSegment {
  start: number;
  end: number;
  text: string;
  /** Prefer this if ASR provided word-level timing (future) */
  words?: { text: string; start: number; end: number }[];
  /** Bilingual caption second line (translation of THIS segment; written by set_caption_translations, enters the block when captions are laid). */
  sub?: string;
  /** Cue segment (one on-screen caption line, split by toCueSegments at extraction). Absent = legacy sentence segment → render-time rotation. */
  cue?: boolean;
}

/** Extraction-time subtitle cueing (the a mainstream editor model): split each ASR sentence into fixed cue
 *  segments — one cue = one on-screen caption line — the moment the transcript enters the studio.
 *  Cues are FROZEN here: later font-size/preset changes do NOT re-split (no render-time dynamics;
 *  overflow at extreme scales wraps in CSS), and the user edits cue text directly. Idempotent
 *  (cue segments pass through), and legacy sentence-level transcripts never pass through this,
 *  keeping their old rotating render path untouched.
 *  Budget is in em at the default caption font size (box ≈56% of canvas width / ~46px font):
 *  portrait ≈13em, landscape canvas is wider ≈22em. */
export function toCueSegments(segs: AsrSegment[], opts?: { landscape?: boolean; maxEm?: number }): AsrSegment[] {
  const maxEm = opts?.maxEm ?? (opts?.landscape ? 22 : 13);
  const gapEm = 0.18; // inter-word flex gap in the render, mirrored coarsely (same accounting shape as captionLineSegments)
  const out: AsrSegment[] = [];
  for (const s of segs) {
    if (s.cue || !s.text?.trim()) {
      out.push(s);
      continue;
    }
    const words = s.words?.length ? groupAsrWords(s.text, s.words) : wordsFromText(s.text, s.start, s.end);
    if (!words.length) {
      out.push(s);
      continue;
    }
    const chunks = chunkWordsBalanced(words, maxEm + gapEm, (w) => estWordEm(w.text) + gapEm);
    chunks.forEach((g, gi) =>
      out.push({
        start: g[0]!.start,
        end: Math.max(g[g.length - 1]!.end, g[0]!.start + 0.3),
        text: joinWords(g.map((w) => w.text)),
        words: g,
        cue: true,
        // a sentence-level translation can't be split scientifically — carry it on the first cue only (fresh extractions have no subs anyway)
        ...(gi === 0 && s.sub ? { sub: s.sub } : {}),
      }),
    );
  }
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
      return captionBlock({
        words,
        ...(s.cue ? { cue: true } : {}),
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
