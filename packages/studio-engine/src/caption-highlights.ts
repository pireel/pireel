import { wordsFromText } from './caption-fx';
import type { AsrSegment } from './build-blocks';

/** A highlight phrase as models and tools name it: a transcript row and the exact words from that row. */
export interface HighlightPhrase {
  index: number;
  text: string;
}

const squash = (text: string) => text.replace(/\s+/g, '');
const EDGE_PUNCT = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;

/** The words a row's decorations index into (measured words, else the row text split the same way). */
export function rowWords(segment: AsrSegment): { text: string }[] {
  return segment.words?.length ? segment.words : wordsFromText(segment.text, segment.start, segment.end);
}

/**
 * Word indexes covered by every occurrence of `phrase` in a row, ignoring spaces and the phrase's
 * edge punctuation. A match that starts or ends inside a word takes the whole word. null = the
 * phrase is not in the row (callers report it; nothing is guessed).
 */
export function phraseWordIndexes(words: readonly { text: string }[], phrase: string): number[] | null {
  const needle = squash(phrase).replace(EDGE_PUNCT, '');
  if (!needle) return null;
  const starts: number[] = [];
  let hay = '';
  for (const word of words) {
    starts.push(hay.length);
    hay += squash(word.text);
  }
  const hit = new Set<number>();
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + 1)) {
    const end = at + needle.length;
    words.forEach((word, index) => {
      const from = starts[index]!;
      const to = from + squash(word.text).length;
      if (to > at && from < end) hit.add(index);
    });
  }
  return hit.size ? [...hit].sort((a, b) => a - b) : null;
}
