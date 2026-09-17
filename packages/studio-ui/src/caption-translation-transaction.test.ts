import { describe, expect, it } from 'vitest';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { sentenceTranslationGroups, stageCaptionTranslationReplacement } from './caption-translation-transaction';

const seg = (text: string, sub?: string): AsrSegment => ({ start: 0, end: 1, text, ...(sub ? { sub, subLang: 'old' } : {}) });

describe('stageCaptionTranslationReplacement', () => {
  it('replaces translations across main and inserted sources as one staged value', () => {
    const main = [seg('main zero', 'old main'), seg('main one', 'old one')];
    const clip = [seg('clip zero', 'old clip')];
    const result = stageCaptionTranslationReplacement({
      groups: [
        { ref: { src: null, seg: 0, w0: 0, w1: 1 } },
        { ref: { src: 'blob:clip', seg: 0, w0: 0, w1: 1 } },
      ],
      rows: [{ index: 1, text: 'New clip' }, { index: 0, text: 'New main' }],
      target: 'English',
      mainTranscript: main,
      clipTranscripts: { 'blob:clip': clip },
    });

    expect(result).toMatchObject({
      ok: true,
      mainTranscript: [{ sub: 'New main', subLang: 'English' }, { text: 'main one' }],
      clipTranscripts: { 'blob:clip': [{ sub: 'New clip', subLang: 'English' }] },
    });
    expect(main[0]?.sub).toBe('old main');
    expect(clip[0]?.sub).toBe('old clip');
  });

  it('rejects a missing result without clearing any existing translation', () => {
    const main = [seg('zero', 'keep zero'), seg('one', 'keep one')];
    const result = stageCaptionTranslationReplacement({
      groups: [
        { ref: { src: null, seg: 0, w0: 0, w1: 0 } },
        { ref: { src: null, seg: 1, w0: 0, w1: 0 } },
      ],
      rows: [{ index: 0, text: 'only one row' }],
      target: 'English',
      mainTranscript: main,
      clipTranscripts: {},
    });

    expect(result.ok).toBe(false);
    expect(main.map((item) => item.sub)).toEqual(['keep zero', 'keep one']);
  });

  it('rejects a stale inserted source without mutating main or clip transcripts', () => {
    const main = [seg('main', 'keep main')];
    const clips = { present: [seg('clip', 'keep clip')] };
    const result = stageCaptionTranslationReplacement({
      groups: [{ ref: { src: 'missing', seg: 0, w0: 0, w1: 0 } }],
      rows: [{ index: 0, text: 'translation' }],
      target: 'English',
      mainTranscript: main,
      clipTranscripts: clips,
    });

    expect(result.ok).toBe(false);
    expect(main[0]?.sub).toBe('keep main');
    expect(clips.present[0]?.sub).toBe('keep clip');
  });
});

describe('sentenceTranslationGroups', () => {
  const word = (text: string, si: number, start: number) => ({ text, si, start, end: start + 0.2 });

  it('folds the fragments a mid-sentence cut left behind into one sentence row', () => {
    // "大家好，客时间寄来的[一]张纸。" with 一 removed: the relay yields two fragments of sentence 0.
    const fragments = [
      { start: 0, end: 1, text: '大家好，客时间寄来的', words: [word('大家好', 0, 0), word('，', 1, 0.3), word('客时间', 2, 0.4), word('寄来的', 3, 0.7)], ref: { src: null, seg: 0, w0: 0, w1: 3 } },
      { start: 1.2, end: 1.6, text: '张纸。', words: [word('张纸', 5, 1.2), word('。', 6, 1.4)], ref: { src: null, seg: 0, w0: 5, w1: 6 } },
      { start: 2, end: 3, text: '还一个包包。', words: [word('还', 0, 2), word('一个', 1, 2.2), word('包包。', 2, 2.5)], ref: { src: null, seg: 1, w0: 0, w1: 2 } },
    ];
    const rows = sentenceTranslationGroups(fragments as never);
    expect(rows.map((row) => row.text)).toEqual(['大家好，客时间寄来的张纸。', '还一个包包。']);
    expect(rows[0]!.ref).toEqual({ src: null, seg: 0, w0: 0, w1: 6 });
    // One row per sentence, so the staged result is a sentence-level sub, not per-fragment cueSubs.
    const staged = stageCaptionTranslationReplacement({
      groups: rows,
      rows: [{ index: 0, text: 'Hello everyone, a sheet of paper from Geektime.' }, { index: 1, text: 'And a bag.' }],
      target: 'English',
      mainTranscript: [seg('大家好，客时间寄来的一张纸。'), seg('还一个包包。')],
      clipTranscripts: {},
    });
    expect(staged).toMatchObject({ ok: true, mainTranscript: [{ sub: 'Hello everyone, a sheet of paper from Geektime.' }, { sub: 'And a bag.' }] });
    expect((staged as { mainTranscript: AsrSegment[] }).mainTranscript[0]!.cueSubs).toBeUndefined();
  });

  it('keeps sentences from different sources apart and orders rows by edited time', () => {
    const fragments = [
      { start: 5, end: 6, text: 'clip', words: [word('clip', 0, 5)], ref: { src: 'blob:b', seg: 0, w0: 0, w1: 0 } },
      { start: 1, end: 2, text: 'main', words: [word('main', 0, 1)], ref: { src: null, seg: 0, w0: 0, w1: 0 } },
    ];
    expect(sentenceTranslationGroups(fragments as never).map((row) => [row.ref.src, row.text])).toEqual([[null, 'main'], ['blob:b', 'clip']]);
  });
});
