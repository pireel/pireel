import { describe, expect, it } from 'vitest';
import {
  captionTranslationWrites,
  sentenceTranslationUnits,
  type TranslationLineRow,
  type TranslationUnit,
} from './caption-translation-transaction';

const row = (src: string | null, index: number, w0: number, w1: number, text: string, editedStart: number, assetId?: string): TranslationLineRow => ({
  src, ...(assetId ? { assetId } : {}), index, w0, w1, text, editedStart,
});
const unit = (src: string | null, seg: number, text = 'x', assetId?: string): TranslationUnit => ({
  src, ...(assetId ? { assetId } : {}), seg, start: 0, text,
});

describe('sentenceTranslationUnits', () => {
  it('sends one whole sentence per row, its on-screen lines joined in play order', () => {
    const units = sentenceTranslationUnits([
      row(null, 0, 0, 3, '我们看看里面', 7.0),
      row(null, 0, 4, 7, '是什么东西。', 7.8),
      row(null, 1, 0, 2, '还一个包包。', 9.1),
    ]);
    expect(units.map((u) => u.text)).toEqual(['我们看看里面是什么东西。', '还一个包包。']);
    expect(units.map((u) => u.seg)).toEqual([0, 1]);
  });

  it('keeps every sentence its own row, ordered by where it plays', () => {
    const units = sentenceTranslationUnits([
      row(null, 1, 0, 0, '就', 38.4),
      row(null, 0, 0, 0, '好', 43.0),
      row('blob:b', 0, 0, 0, 'B roll line', 3),
    ]);
    expect(units.map((u) => [u.src, u.text, u.seg])).toEqual([['blob:b', 'B roll line', 0], [null, '就', 1], [null, '好', 0]]);
  });

  it('groups by transcript owner when rows carry one and skips empty lines', () => {
    const units = sentenceTranslationUnits([
      row(null, 2, 0, 1, 'Part one', 1, 'asset-1'),
      row(null, 2, 2, 3, 'part two', 2, 'asset-1'),
      row(null, 0, 0, 0, '', 0.5),
    ]);
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ assetId: 'asset-1', seg: 2, text: 'Part one part two' });
  });

  it('splits a sentence the edit interrupted into one row per stretch, each with its word span', () => {
    const units = sentenceTranslationUnits([
      row(null, 1, 0, 4, '价值三万四千八百元，', 6),
      row(null, 2, 0, 3, '这是一张纸。', 8),
      row(null, 1, 5, 9, '哦，里面是一个年卡，', 10),
      row(null, 1, 10, 14, '价值一千九百九十九。', 11),
    ]);
    expect(units.map((u) => [u.seg, u.text, u.range])).toEqual([
      [1, '价值三万四千八百元，', { w0: 0, w1: 4 }],
      [2, '这是一张纸。', undefined],
      [1, '哦，里面是一个年卡，价值一千九百九十九。', { w0: 5, w1: 14 }],
    ]);
    const writes = captionTranslationWrites(units, [{ index: 0, text: 'Worth 34,800 yuan,' }, { index: 1, text: 'This is a sheet of paper.' }, { index: 2, text: 'oh, an annual pass worth 1,999.' }]);
    expect(writes.writes[0]!.items).toEqual([
      { index: 1, w0: 0, w1: 4, text: 'Worth 34,800 yuan,' },
      { index: 2, text: 'This is a sheet of paper.' },
      { index: 1, w0: 5, w1: 14, text: 'oh, an annual pass worth 1,999.' },
    ]);
  });
});

describe('captionTranslationWrites', () => {
  it('writes one translation per sentence, grouped by source or transcript owner', () => {
    const result = captionTranslationWrites(
      [unit(null, 0), unit('blob:clip', 0), unit(null, 2, 'x', 'asset-9')],
      [{ index: 1, text: 'New clip' }, { index: 0, text: 'New main' }, { index: 2, text: 'Third' }],
    );
    expect(result).toEqual({ missing: [], writes: [
      { src: null, items: [{ index: 0, text: 'New main' }] },
      { src: 'blob:clip', items: [{ index: 0, text: 'New clip' }] },
      { src: null, assetId: 'asset-9', items: [{ index: 2, text: 'Third' }] },
    ] });
  });

  it('writes what came back and reports the sentences that did not, ignoring unknown or repeated ids', () => {
    const units = [unit(null, 0, 'first'), unit(null, 1, 'second')];
    const result = captionTranslationWrites(units, [{ index: 0, text: 'a' }, { index: 0, text: 'again' }, { index: 5, text: 'stray' }]);
    expect(result.writes).toEqual([{ src: null, items: [{ index: 0, text: 'a' }] }]);
    expect(result.missing).toEqual([units[1]]);
  });
});
