import { describe, expect, it } from 'vitest';
import { captionTranslationWrites, sentenceBreaksBetween, sentenceTranslationUnits, type TranslationUnit } from './caption-translation-transaction';

const unit = (src: string | null, segs: number[], text = 'x'): TranslationUnit => ({
  src, start: 0, end: 1, text, members: segs.map((s) => ({ seg: s, wordCount: 1 })),
});

describe('captionTranslationWrites', () => {
  it('groups items by source, one per transcript segment', () => {
    const result = captionTranslationWrites(
      [unit(null, [0]), unit('blob:clip', [0]), unit(null, [2])],
      [{ index: 1, text: 'New clip' }, { index: 0, text: 'New main' }, { index: 2, text: 'Third' }],
    );
    expect(result).toEqual({ ok: true, writes: [
      { src: null, items: [{ index: 0, text: 'New main' }, { index: 2, text: 'Third' }] },
      { src: 'blob:clip', items: [{ index: 0, text: 'New clip' }] },
    ] });
  });

  it('spreads a sentence that spans two transcript segments over both by word share', () => {
    const result = captionTranslationWrites(
      [{ src: null, start: 0, end: 2, text: '大家好，客时间寄来的张纸。', members: [{ seg: 0, wordCount: 4 }, { seg: 1, wordCount: 2 }] }],
      [{ index: 0, text: 'Hello everyone, a sheet of paper from Geektime.' }],
    );
    expect(result.ok).toBe(true);
    const items = (result as { writes: { items: { index: number; text: string }[] }[] }).writes[0]!.items;
    expect(items.map((item) => item.index)).toEqual([0, 1]);
    expect(items.map((item) => item.text).join(' ')).toBe('Hello everyone, a sheet of paper from Geektime.');
  });

  it('refuses a missing, duplicate, or out-of-range row so nothing half-lands', () => {
    expect(captionTranslationWrites([unit(null, [0]), unit(null, [1])], [{ index: 0, text: 'only one row' }]).ok).toBe(false);
    expect(captionTranslationWrites([unit(null, [0])], [{ index: 0, text: 'a' }, { index: 0, text: 'b' }]).ok).toBe(false);
    expect(captionTranslationWrites([unit(null, [0])], [{ index: 5, text: 'a' }]).ok).toBe(false);
  });
});

describe('sentenceTranslationUnits', () => {
  const word = (text: string, si: number, start: number) => ({ text, si, start, end: start + 0.2 });
  const fragment = (src: string | null, seg: number, start: number, words: ReturnType<typeof word>[]) => ({
    start, end: words[words.length - 1]!.end, text: words.map((w) => w.text).join(''), words,
    ref: { src, seg, w0: words[0]!.si, w1: words[words.length - 1]!.si },
  });

  it('joins the cut fragments of one segment and the pause-split segments of one sentence', () => {
    // ASR broke "…寄来的 | 一张纸。" at a pause into two segments, and a cut removed 一 from the
    // second; the translator must see one sentence.
    const units = sentenceTranslationUnits([
      fragment(null, 0, 0, [word('大家好', 0, 0), word('，', 1, 0.3), word('客时间', 2, 0.4), word('寄来的', 3, 0.7)]),
      fragment(null, 1, 1.0, [word('张纸', 1, 1.0), word('。', 2, 1.2)]),
      fragment(null, 2, 1.6, [word('还', 0, 1.6), word('一个', 1, 1.8)]),
      fragment(null, 2, 2.4, [word('包包。', 3, 2.4)]),
    ] as never);
    expect(units.map((u) => u.text)).toEqual(['大家好，客时间寄来的张纸。', '还一个包包。']);
    expect(units[0]!.members).toEqual([{ seg: 0, wordCount: 4 }, { seg: 1, wordCount: 2 }]);
    expect(units[1]!.members).toEqual([{ seg: 2, wordCount: 3 }]);
  });

  it('keeps segments apart across a pause of a second or more and across sources', () => {
    const units = sentenceTranslationUnits([
      fragment(null, 0, 0, [word('第一段没有标点', 0, 0)]),
      fragment(null, 1, 1.5, [word('第二段。', 0, 1.5)]),
      fragment('blob:b', 0, 3, [word('B roll line', 0, 3)]),
    ] as never);
    expect(units.map((u) => [u.src, u.text])).toEqual([[null, '第一段没有标点'], [null, '第二段。'], ['blob:b', 'B roll line']]);
  });

  it('bounds a source that never punctuates', () => {
    const fragments = Array.from({ length: 12 }, (_, seg) => fragment(null, seg, seg * 0.5, [word('二十个字'.repeat(5), 0, seg * 0.5)]));
    const units = sentenceTranslationUnits(fragments as never);
    expect(units.length).toBeGreaterThan(1);
    expect(units.every((u) => u.text.length <= 200)).toBe(true);
    expect(units.flatMap((u) => u.members.map((m) => m.seg))).toEqual(fragments.map((f) => f.ref.seg));
  });
});

describe('sentenceBreaksBetween', () => {
  it('follows ICU sentence rules instead of a punctuation table', () => {
    expect(sentenceBreaksBetween('大家好，客时间寄来的', '张纸。')).toBe(false);
    expect(sentenceBreaksBetween('这是一张纸。', '这是一个贺卡。')).toBe(true);
    expect(sentenceBreaksBetween('看看这个是什么？', '这个应该是合作方法')).toBe(true);
    expect(sentenceBreaksBetween('We shipped it.', 'Then we slept', 'en')).toBe(true);
    expect(sentenceBreaksBetween('We shipped it', 'and then we slept', 'en')).toBe(false);
    expect(sentenceBreaksBetween('It costs 1,999', 'yuan per year.', 'en')).toBe(false);
    expect(sentenceBreaksBetween('今日は晴れです。', '明日は雨です。', 'ja')).toBe(true);
  });
});
