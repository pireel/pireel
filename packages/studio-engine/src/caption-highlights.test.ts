import { describe, expect, it } from 'vitest';
import { phraseWordIndexes } from './caption-highlights';

const words = (texts: string[]) => texts.map((text) => ({ text }));

describe('phraseWordIndexes', () => {
  it('finds whole words across CJK word boundaries and ignores spaces and edge punctuation', () => {
    expect(phraseWordIndexes(words(['效率', '提升', '了', '三倍。']), '三倍')).toEqual([3]);
    expect(phraseWordIndexes(words(['效率', '提升', '了']), '率提')).toEqual([0, 1]);
    expect(phraseWordIndexes(words(['make', 'it', 'pop!']), 'it pop!')).toEqual([1, 2]);
  });
  it('marks every occurrence and refuses a phrase that is not in the row', () => {
    expect(phraseWordIndexes(words(['好', '的', '好']), '好')).toEqual([0, 2]);
    expect(phraseWordIndexes(words(['效率', '提升']), '速度')).toBeNull();
    expect(phraseWordIndexes(words(['效率']), '。')).toBeNull();
  });
});
