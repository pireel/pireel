import type { AsrSegment } from './build-blocks';
import { wordsFromText } from './caption-fx';
import { validateEmphasisSelection, type EmphasisRow, type EmphasisSelection } from './caption-emphasis';

/** Stable source sentence/word addresses. No font, canvas, display cue or edited clock participates. */
export function sourceEmphasisRows(transcript: readonly AsrSegment[]) {
  const normalized = transcript.map(segment => ({ ...segment, words: segment.words?.length ? segment.words : wordsFromText(segment.text, segment.start, segment.end) }));
  const rows: EmphasisRow[] = [];
  const addresses: { segment: number; offset: number }[] = [];
  normalized.forEach((segment, index) => {
    for (let offset = 0; offset < segment.words.length; offset += 120) {
      addresses.push({ segment: index, offset });
      rows.push({ index: rows.length, words: segment.words.slice(offset, offset + 120).map(word => word.text) });
    }
  });
  return { normalized, rows, addresses };
}
export function annotateSourceEmphasis(transcript: readonly AsrSegment[], selections: EmphasisSelection[]): AsrSegment[] {
  const { normalized, rows, addresses } = sourceEmphasisRows(transcript);
  const selected = validateEmphasisSelection(rows, selections);
  if (!selected) throw new Error('原文重点词与转写不匹配。');
  const output = normalized.map(segment => {
    const { cueEmphasis: _oldDisplaySelection, ...source } = segment;
    return { ...source, words: source.words.map(word => ({ ...word, emphasis: false })) };
  });
  for (const row of selected) {
    const address = addresses[row.index];
    for (const word of row.words) output[address.segment].words[address.offset + word].emphasis = true;
  }
  return output;
}
