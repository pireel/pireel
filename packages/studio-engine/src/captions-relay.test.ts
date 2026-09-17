import { describe, expect, it } from 'vitest';
import type { AsrSegment } from './build-blocks';
import { mappedCaptionSegs } from './captions-relay';
import type { VideoShot } from './composition';

const shot = (id: string, srcStart: number, srcEnd: number): VideoShot => ({ id, srcStart, srcEnd, treatment: 'full' });

describe('mappedCaptionSegs word survival', () => {
  // DashScope returned 技@25.69-25.69: a real syllable with a zero-width stamp.
  const segment: AsrSegment = {
    start: 25.0, end: 26.5, text: 'InfoQ技术大会',
    words: [
      { text: 'InfoQ', start: 25.05, end: 25.69 },
      { text: '技', start: 25.69, end: 25.69 },
      { text: '术', start: 25.85, end: 25.93 },
      { text: '大会', start: 25.93, end: 26.25 },
    ],
  };

  it('keeps a zero-width provider word when its moment survives the edit', () => {
    const [mapped] = mappedCaptionSegs([shot('a', 24, 27)], [segment], {});
    expect(mapped!.words.map((word) => word.text)).toEqual(['InfoQ', '技', '术', '大会']);
    expect(mapped!.text).toBe('InfoQ技术大会');
  });

  it('still drops a word whose time was cut away', () => {
    // The cut removes 25.6–25.84: 技 (and the tail of InfoQ) are gone, 术 and 大会 remain.
    const mapped = mappedCaptionSegs([shot('a', 24, 25.6), shot('b', 25.84, 27)], [segment], {});
    expect(mapped.flatMap((group) => group.words.map((word) => word.text))).toEqual(['InfoQ', '术', '大会']);
  });
});
