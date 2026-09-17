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

describe('a word cut in the middle is captioned once', () => {
  const segment: AsrSegment = {
    start: 11.4, end: 12.5, text: '这是一张纸。',
    words: [
      { text: '这', start: 11.63, end: 11.71 }, { text: '是', start: 11.71, end: 11.87 }, { text: '一', start: 11.87, end: 11.95 },
      { text: '张', start: 11.95, end: 12.19 }, { text: '纸。', start: 12.27, end: 12.43 },
    ],
  };

  it('stays with the shot that plays its midpoint when the split is adjacent', () => {
    const mapped = mappedCaptionSegs([shot('a', 11.4, 12.10), shot('b', 12.10, 12.6)], [segment], {});
    const texts = mapped.flatMap((group) => group.words.map((word) => word.text));
    expect(texts).toEqual(['这', '是', '一', '张', '纸。']);
    expect(texts.filter((text) => text === '张')).toHaveLength(1);
  });

  it('follows its owner when the halves are reordered, and drops with it when the owner is cut', () => {
    // The second half plays first: 张 (midpoint 12.07) belongs to the 11.4–12.10 shot, now second.
    const reordered = mappedCaptionSegs([shot('b', 12.10, 12.6), shot('a', 11.4, 12.10)], [segment], {});
    const zhang = reordered.flatMap((group) => group.words).filter((word) => word.text === '张');
    expect(zhang).toHaveLength(1);
    expect(zhang[0]!.start).toBeGreaterThanOrEqual(0.5); // inside the second-played shot
    // Owner removed: only a 20 ms sliver of 张 survives in the other shot — not a caption.
    const cut = mappedCaptionSegs([shot('b', 12.17, 12.6)], [segment], {});
    expect(cut.flatMap((group) => group.words.map((word) => word.text))).toEqual(['纸。']);
  });
});
