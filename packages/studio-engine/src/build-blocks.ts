/**
 * Narration ASR → caption blocks. This is where "step 2 (feed narration)" lands:
 * each spoken sentence = one shot block (caption), word-level timing driving
 * word-by-word highlight. True word-level timing should come from DashScope
 * filetrans (enable_words); for now wordsFromText approximates word splits from
 * the sentence text + sentence-level timing, enough to get it working.
 */

import { wordsFromText } from './caption-fx';
import { type Block, captionBlock } from './composition';

export interface AsrSegment {
  start: number;
  end: number;
  text: string;
  /** Prefer this if ASR provided word-level timing (future) */
  words?: { text: string; start: number; end: number }[];
  /** Bilingual caption second line (full-sentence translation; written by set_caption_translations, enters the block when captions are laid). */
  sub?: string;
}

/** Sentence-level ASR → caption blocks, one block per sentence (word data only; visuals come from the global caption style/preset, captions carry no styling).
 *  Long sentences are NOT split here — chunking is computed at render time (chunkWordsByWidth inside the caption template rotates chunks),
 *  not persisted: old blocks/drafts/caches take effect automatically, and block-level data stays one-to-one with the narration. */
export function captionBlocksFromAsr(segments: AsrSegment[], opts?: { preset?: string; yPct?: number }): Block[] {
  return segments
    .filter((s) => s.text && s.text.trim())
    .map((s) => {
      const words = s.words?.length ? s.words : wordsFromText(s.text, s.start, s.end);
      return captionBlock({
        words,
        ...(s.sub?.trim() ? { sub: s.sub.trim() } : {}),
        ...(opts?.preset ? { preset: opts.preset } : {}),
        ...(opts?.yPct != null ? { yPct: opts.yPct } : {}),
        label: s.text.trim(),
      });
    });
}
