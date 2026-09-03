import { describe, expect, it } from 'vitest';
import { alignTranscriptToScript, alignmentUnits, measuredSpeechTranscript } from './script-alignment';
import { transcriptFromExactText } from './agent-timeline';
import type { TranscriptSegment } from './project-dto';

/** ASR "hearing" with one word per CJK character / Latin word, 0.2s each from `start`. */
function heard(text: string, start = 0): TranscriptSegment {
  const units = alignmentUnits(text);
  const words = units.map((unit, index) => ({ text: unit, start: start + index * 0.2, end: start + (index + 1) * 0.2 }));
  return { start, end: start + units.length * 0.2, text, words, lang: 'zh' };
}

describe('script alignment', () => {
  it('tokenises CJK per character and Latin per word, dropping punctuation', () => {
    expect(alignmentUnits('看 Foochy 的食用说明，别急。')).toEqual(['看', 'Foochy', '的', '食', '用', '说', '明', '别', '急']);
  });

  it('keeps the script text and takes ASR timing on a substituted character', () => {
    const asr = [heard('再看食用说明和保质期')]; // recogniser heard 食 — exact
    const out = alignTranscriptToScript('再看食用说明和保质期。', asr);
    expect(out).toHaveLength(1);
    expect(out[0]!.text).toBe('再看食用说明和保质期。');
    expect(out[0]!.words!.map((w) => w.text).join('')).toBe('再看食用说明和保质期');
    expect(out[0]!.start).toBeCloseTo(0, 6);
    expect(out[0]!.end).toBeCloseTo(2.0, 6);

    const misheard = [heard('再看使用说明和保质期')]; // 食 → 使
    const fixed = alignTranscriptToScript('再看食用说明和保质期。', misheard);
    expect(fixed[0]!.text).toBe('再看食用说明和保质期。');
    const shi = fixed[0]!.words!.find((w) => w.text === '食')!;
    expect(shi.start).toBeCloseTo(0.4, 6); // the slot the recogniser spent on 使
    expect(shi.end).toBeCloseTo(0.6, 6);
  });

  it('gives a misheard brand name the span of the homophone it replaced', () => {
    const asr = [heard('以肤契水晶白番茄为例')]; // Foochy → 肤契 (two characters)
    const out = alignTranscriptToScript('以 Foochy 水晶白番茄为例。', asr);
    const brand = out[0]!.words!.find((w) => w.text === 'Foochy')!;
    expect(brand.start).toBeCloseTo(0.2, 6);
    expect(brand.end).toBeCloseTo(0.6, 6);
    const shui = out[0]!.words!.find((w) => w.text === '水')!;
    expect(shui.start).toBeCloseTo(0.6, 6);
  });

  it('splits sentences by the script punctuation, not the recogniser segmentation', () => {
    const asr = [heard('第一看原料来源第二看标示含量第三看配料表')]; // one ASR blob
    const out = alignTranscriptToScript('第一看原料来源；第二看标示含量。第三看配料表。', asr);
    expect(out.map((s) => s.text)).toEqual(['第一看原料来源；', '第二看标示含量。', '第三看配料表。']);
    expect(out[1]!.start).toBeCloseTo(out[0]!.end, 6);
    expect(out[2]!.start).toBeCloseTo(1.4 * 2, 6);
    expect(out.every((s) => s.lang === 'zh')).toBe(true);
  });

  it('spreads words the recogniser dropped over the gap and falls back proportionally with no overlap', () => {
    const asr = [heard('买营养补充食品先翻包装')]; // "我不会先听故事" missing
    const out = alignTranscriptToScript('买营养补充食品，我不会先听故事，先翻包装。', asr);
    const words = out[0]!.words!;
    for (let k = 1; k < words.length; k += 1) expect(words[k]!.start).toBeGreaterThanOrEqual(words[k - 1]!.end - 1e-9);
    expect(words[words.length - 1]!.end).toBeCloseTo(asr[0]!.end, 6);
    const none = alignTranscriptToScript('完全不同的话。', [heard('abc def', 3)]);
    expect(none[0]!.start).toBeCloseTo(3, 6);
    expect(none[0]!.end).toBeCloseTo(3.4, 6);
    expect(alignTranscriptToScript('有话。', [])).toEqual([]);
  });

  it('measures scripted assets against ASR and stores plain ASR for everything else', () => {
    const asr = [heard('再看使用说明')];
    const exact = measuredSpeechTranscript({ metadata: { transcriptText: '再看食用说明。' } }, undefined, asr);
    expect(exact[0]!.text).toBe('再看食用说明。');
    const provisional = transcriptFromExactText('再看食用说明。', 1.2);
    expect(provisional[0]!.scripted).toBe(true);
    expect(measuredSpeechTranscript({ metadata: {} }, provisional, asr)[0]!.text).toBe('再看食用说明。');
    const recorded = measuredSpeechTranscript({ metadata: {} }, [{ start: 0, end: 1, text: '旧转写', words: [{ text: '旧', start: 0, end: 1 }] }], asr);
    expect(recorded[0]!.text).toBe('再看使用说明');
  });
});
