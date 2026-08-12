import { describe, expect, it } from 'vitest';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { stageCaptionTranslationReplacement } from './caption-translation-transaction';

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
