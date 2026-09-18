import { describe, expect, it } from 'vitest';
import {
  captionTranslationWrites,
  LINE_MARK,
  lineTranslationUnits,
  splitTranslatedLines,
  type TranslationLineRow,
  type TranslationUnit,
} from './caption-translation-transaction';

const row = (src: string | null, index: number, w0: number, w1: number, text: string, editedStart: number, assetId?: string): TranslationLineRow => ({
  src, ...(assetId ? { assetId } : {}), index, w0, w1, text, editedStart,
});
const unit = (src: string | null, seg: number, lines: [number, number][], text = 'x', assetId?: string): TranslationUnit => ({
  src, ...(assetId ? { assetId } : {}), seg, start: 0, text, lines: lines.map(([w0, w1]) => ({ w0, w1 })),
});

describe('lineTranslationUnits', () => {
  it('writes one sentence per row as its on-screen lines joined by the line mark, in play order', () => {
    const units = lineTranslationUnits([
      row(null, 0, 0, 3, '我们看看里面', 7.0),
      row(null, 0, 4, 7, '是什么东西。', 7.8),
      row(null, 1, 0, 2, '还一个包包。', 9.1),
    ]);
    expect(units.map((u) => u.text)).toEqual([`我们看看里面${LINE_MARK}是什么东西。`, '还一个包包。']);
    expect(units[0]!.lines).toEqual([{ w0: 0, w1: 3 }, { w0: 4, w1: 7 }]);
    expect(units.map((u) => u.seg)).toEqual([0, 1]);
  });

  it('keeps every sentence its own row, ordered by where it plays, so a reordered cut never swaps two halves', () => {
    const units = lineTranslationUnits([
      row(null, 1, 0, 0, '就', 38.4),
      row(null, 0, 0, 0, '好', 43.0),
      row('blob:b', 0, 0, 0, 'B roll line', 3),
    ]);
    expect(units.map((u) => [u.src, u.text, u.seg])).toEqual([['blob:b', 'B roll line', 0], [null, '就', 1], [null, '好', 0]]);
  });

  it('groups by transcript owner when rows carry one, and strips bars from the source so the answer can be counted', () => {
    const units = lineTranslationUnits([
      row(null, 2, 0, 1, 'A | B', 1, 'asset-1'),
      row(null, 2, 2, 3, 'C', 2, 'asset-1'),
      row(null, 0, 0, 0, '', 0.5),
    ]);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ assetId: 'asset-1', seg: 2, text: `A / B${LINE_MARK}C` });
  });
});

describe('splitTranslatedLines', () => {
  it('splits on either bar and rejoins the pieces as one sentence', () => {
    expect(splitTranslatedLines("Let's take a look inside | to see what it is.")).toEqual({
      pieces: ["Let's take a look inside", 'to see what it is.'],
      whole: "Let's take a look inside to see what it is.",
    });
    expect(splitTranslatedLines('让我们看看｜盒子里有什么。')).toEqual({ pieces: ['让我们看看', '盒子里有什么。'], whole: '让我们看看盒子里有什么。' });
  });
});

describe('captionTranslationWrites', () => {
  it('writes one translation per on-screen line, keyed by the line\'s word range', () => {
    const result = captionTranslationWrites(
      [unit(null, 0, [[0, 3], [4, 7]], `我们看看里面${LINE_MARK}是什么东西。`)],
      [{ index: 0, text: "Let's take a look inside | to see what it is." }],
    );
    expect(result).toEqual({ ok: true, writes: [{ src: null, items: [
      { index: 0, w0: 0, w1: 3, text: "Let's take a look inside" },
      { index: 0, w0: 4, w1: 7, text: 'to see what it is.' },
    ] }] });
  });

  it('refuses the whole run, naming the sentence, when an answer lost or added a mark', () => {
    const lost = captionTranslationWrites(
      [unit(null, 0, [[0, 3], [4, 7]], `我们看看里面${LINE_MARK}是什么东西。`)],
      [{ index: 0, text: "Let's take a look at what's inside." }],
    );
    expect(lost.ok).toBe(false);
    expect((lost as { error: string }).error).toContain('我们看看里面');
    expect((lost as { error: string }).error).toContain('1 line(s) for 2');
    expect(captionTranslationWrites([unit(null, 1, [[0, 1], [2, 2]])], [{ index: 0, text: 'one | two | three' }]).ok).toBe(false);
  });

  it('groups items by source or transcript owner', () => {
    const result = captionTranslationWrites(
      [unit(null, 0, [[0, 2]]), unit('blob:clip', 0, [[0, 1]]), unit(null, 2, [[0, 0]], 'x', 'asset-9')],
      [{ index: 1, text: 'New clip' }, { index: 0, text: 'New main' }, { index: 2, text: 'Third' }],
    );
    expect(result).toEqual({ ok: true, writes: [
      { src: null, items: [{ index: 0, w0: 0, w1: 2, text: 'New main' }] },
      { src: 'blob:clip', items: [{ index: 0, w0: 0, w1: 1, text: 'New clip' }] },
      { src: null, assetId: 'asset-9', items: [{ index: 2, w0: 0, w1: 0, text: 'Third' }] },
    ] });
  });

  it('refuses a missing, duplicate, or out-of-range row so nothing half-lands', () => {
    expect(captionTranslationWrites([unit(null, 0, [[0, 0]]), unit(null, 1, [[0, 0]])], [{ index: 0, text: 'only one row' }]).ok).toBe(false);
    expect(captionTranslationWrites([unit(null, 0, [[0, 0]])], [{ index: 0, text: 'a' }, { index: 0, text: 'b' }]).ok).toBe(false);
    expect(captionTranslationWrites([unit(null, 0, [[0, 0]])], [{ index: 5, text: 'a' }]).ok).toBe(false);
  });
});
