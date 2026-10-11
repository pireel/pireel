import { describe, expect, it } from 'vitest';
import { isFillerWord } from './speech-fillers';

describe('isFillerWord', () => {
  it('matches hesitation fillers with full- or half-width punctuation', () => {
    for (const word of ['嗯', '嗯，', '呃。', '哦，', '噢！', '唉…', 'um,', 'Uh.', 'hmm?']) expect(isFillerWord(word)).toBe(true);
  });
  it('leaves words and tone particles alone', () => {
    for (const word of ['好，', '啊', '呢。', '哦对', 'umbrella', '嗯哼']) expect(isFillerWord(word)).toBe(false);
  });
});
