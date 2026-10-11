import type { AsrSegment, WordDecoration } from './build-blocks';

export type WordDecorationPatch = {
  highlight?: WordDecoration['highlight'] | null;
  color?: string | null;
  animation?: WordDecoration['animation'] | null;
};

/** Recompute color highlights in a visible scope in one transaction. Other decoration survives. */
export function replaceWordHighlights(segments: readonly AsrSegment[], targets: readonly { sentenceIndex: number; wordIndex: number }[], scope: readonly { sentenceIndex: number; wordIndex: number }[]): AsrSegment[] {
  const colored = scope.filter(({ sentenceIndex, wordIndex }) => segments[sentenceIndex]?.wordDecorations?.[String(wordIndex)]?.highlight === 'color');
  const cleared = applyWordDecorations(segments, colored, { highlight: null, color: null });
  return applyWordDecorations(cleared, targets, { highlight: 'color', color: null });
}

/** Update selected source words without changing speech, timing, or unrelated treatments. */
export function applyWordDecorations(
  segments: readonly AsrSegment[],
  targets: readonly { sentenceIndex: number; wordIndex: number }[],
  patch: WordDecorationPatch,
): AsrSegment[] {
  const bySentence = new Map<number, Set<number>>();
  for (const { sentenceIndex, wordIndex } of targets) {
    if (!Number.isInteger(sentenceIndex) || !Number.isInteger(wordIndex) || wordIndex < 0) continue;
    const selected = bySentence.get(sentenceIndex) ?? new Set<number>();
    selected.add(wordIndex);
    bySentence.set(sentenceIndex, selected);
  }
  let changed = false;
  const next = segments.map((segment, sentenceIndex) => {
    const selected = bySentence.get(sentenceIndex);
    if (!selected) return segment;
    const decorations = { ...segment.wordDecorations };
    let sentenceChanged = false;
    for (const wordIndex of selected) {
      const key = String(wordIndex);
      const old = decorations[key] ?? {};
      const value: WordDecoration = { ...old };
      if (patch.highlight !== undefined) {
        if (patch.highlight === null) delete value.highlight;
        else value.highlight = patch.highlight;
      }
      if (patch.color !== undefined) {
        if (patch.color === null) delete value.color;
        else if (/^#[0-9a-fA-F]{6}$/.test(patch.color)) value.color = patch.color;
      }
      if (patch.animation !== undefined) {
        if (patch.animation === null) delete value.animation;
        else value.animation = patch.animation;
      }
      if (value.highlight === old.highlight && value.color === old.color && value.animation === old.animation) continue;
      sentenceChanged = true;
      if (Object.keys(value).length) decorations[key] = value;
      else delete decorations[key];
    }
    if (!sentenceChanged) return segment;
    changed = true;
    if (Object.keys(decorations).length) return { ...segment, wordDecorations: decorations };
    const { wordDecorations: _removed, ...clean } = segment;
    return clean;
  });
  return changed ? next : segments as AsrSegment[];
}
