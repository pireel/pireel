import { diffArrays } from 'diff';
import { segmentTokens, wordsFromText, type FxWord } from './caption-fx';

/** Keep unchanged spoken anchors; only interpolate changed text inside its neighboring anchors. */
export function editedCaptionWords(text: string, source: readonly FxWord[], start: number, end: number): FxWord[] {
  const tokens = segmentTokens(text);
  const changes = diffArrays(source.map((word) => word.text), tokens);
  const result: FxWord[] = [];
  let sourceIndex = 0;
  let added: string[] = [];
  let removed: FxWord[] = [];
  const flush = (nextStart: number) => {
    if (added.length) {
      const from = Math.max(start, result.at(-1)?.end ?? start, removed[0]?.start ?? start);
      const to = Math.min(end, nextStart, removed.at(-1)?.end ?? nextStart);
      // Replacement words inherit the replaced words' decoration by position (a corrected word keeps its highlight).
      result.push(...wordsFromText(added.join(' '), from, Math.max(from, to)).map((word, index, all) => {
        const replaced = removed.length ? removed[Math.min(removed.length - 1, Math.floor(index * removed.length / all.length))] : undefined;
        return { ...word, timing: 'estimated' as const, emphasis: false, ...(replaced?.decoration ? { decoration: replaced.decoration } : {}) };
      }));
    }
    added = []; removed = [];
  };
  for (const change of changes) {
    if (change.removed) { removed.push(...source.slice(sourceIndex, sourceIndex + change.count)); sourceIndex += change.count; }
    else if (change.added) added.push(...change.value);
    else {
      flush(source[sourceIndex]?.start ?? end);
      result.push(...source.slice(sourceIndex, sourceIndex + change.count).map((word) => ({ ...word })));
      sourceIndex += change.count;
    }
  }
  flush(end);
  return result;
}
