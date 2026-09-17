import { describe, expect, it } from 'vitest';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { sentenceTranslationUnits, stageCaptionTranslationReplacement, type TranslationUnit } from './caption-translation-transaction';

const seg = (text: string, sub?: string): AsrSegment => ({ start: 0, end: 1, text, ...(sub ? { sub, subLang: 'old' } : {}) });
const unit = (src: string | null, segs: number[], text = 'x'): TranslationUnit => ({
  src, start: 0, end: 1, text, members: segs.map((s) => ({ seg: s, wordCount: 1 })),
});

describe('stageCaptionTranslationReplacement', () => {
  it('replaces translations across main and inserted sources as one staged value', () => {
    const main = [seg('main zero', 'old main'), seg('main one', 'old one')];
    const clip = [seg('clip zero', 'old clip')];
    const result = stageCaptionTranslationReplacement({
      units: [unit(null, [0]), unit('blob:clip', [0])],
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

  it('spreads a sentence that spans two transcript segments over both by word share', () => {
    const main = [seg('大家好，客时间寄来的'), seg('张纸。')];
    const result = stageCaptionTranslationReplacement({
      units: [{ src: null, start: 0, end: 2, text: '大家好，客时间寄来的张纸。', members: [{ seg: 0, wordCount: 4 }, { seg: 1, wordCount: 2 }] }],
      rows: [{ index: 0, text: 'Hello everyone, a sheet of paper from Geektime.' }],
      target: 'English',
      mainTranscript: main,
      clipTranscripts: {},
    });
    expect(result.ok).toBe(true);
    const staged = (result as { mainTranscript: AsrSegment[] }).mainTranscript;
    expect(staged[0]!.sub).toBeTruthy();
    expect(staged[1]!.sub).toBeTruthy();
    expect(`${staged[0]!.sub} ${staged[1]!.sub}`).toBe('Hello everyone, a sheet of paper from Geektime.');
    expect(staged[0]!.cueSubs).toBeUndefined();
  });

  it('rejects a missing result without clearing any existing translation', () => {
    const main = [seg('zero', 'keep zero'), seg('one', 'keep one')];
    const result = stageCaptionTranslationReplacement({
      units: [unit(null, [0]), unit(null, [1])],
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
      units: [unit('missing', [0])],
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
