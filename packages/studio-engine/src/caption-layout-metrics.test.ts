import { describe, expect, it } from 'vitest';
import { captionLineSegments, captionStackRows, lexicalWordGroups, lineBreakCost } from './caption-layout-metrics';
import { CAPTION_ART_PRESETS, getCaptionPreset } from './caption-presets';
import { groupAsrWords } from './caption-fx';

describe('captionLineSegments', () => {
  it('keeps words the dictionary splits into lone Han characters on one line (口播, 聊一聊)', () => {
    const text = '大家好，今天我们聊一聊怎么把一条口播视频做得更好看。';
    const words = groupAsrWords(text, [...text].map((char, index) => ({ text: char, start: index * 0.2, end: index * 0.2 + 0.2 })));
    const lines = captionLineSegments(words, getCaptionPreset('ln-clean'), 70, 1, 1080).map(line => line.map(word => word.text).join(''));
    expect(lines.join('')).toBe(text);
    for (const [left, right] of lines.slice(0, -1).map((line, index) => [line, lines[index + 1]!] as const)) {
      expect(`${left.at(-1)}${right[0]}`).not.toBe('口播');
      expect(`${left.at(-1)}${right[0]}`).not.toBe('聊一');
    }
  });
  it('uses actual font-engine measurements when available instead of only glyph estimates', () => {
    const words = ['one', 'two', 'three', 'four'].map((text, index) => ({ text, start: index, end: index + 1 }));
    const preset = getCaptionPreset('ln-clean');
    const estimated = captionLineSegments(words, preset, 100, 1, 600, { measureText: () => null });
    const measured = captionLineSegments(words, preset, 100, 1, 600, { measureText: () => 200 });
    expect(estimated).toHaveLength(1);
    expect(measured.length).toBeGreaterThan(estimated.length);
  });

  // Chinese recognizers time single characters; lines must still break between dictionary words.
  const perChar = (text: string) => [...text].map((ch, index) => ({ text: ch, start: index * 0.2, end: index * 0.2 + 0.2 }));
  const lineTexts = (lines: { text: string }[][]) => lines.map((line) => line.map((word) => word.text).join(''));

  it('groups per-character recognizer words into dictionary words', () => {
    expect(lexicalWordGroups(perChar('我们看看里面是什么东西。')).map((group) => group.map((word) => word.text).join('')))
      .toEqual(['我们', '看看', '里面', '是', '什么东西。']);
    // A recognizer word spanning several dictionary words stays whole.
    const coarse = [{ text: '我们看看', start: 0, end: 1 }, { text: '里面', start: 1, end: 2 }];
    expect(lexicalWordGroups(coarse)).toEqual([[coarse[0]], [coarse[1]]]);
    // Recognizer words that cut a dictionary word in two (他不|在这个 over 他|不在|这个) stay together.
    const across = ['目标', '用户', '他不', '在这个', '圈子，'].map((text, index) => ({ text, start: index * 0.3, end: index * 0.3 + 0.3 }));
    expect(lexicalWordGroups(across).map((group) => group.map((word) => word.text).join('|'))).toEqual(['目标', '用户', '他不|在这个', '圈子，']);
  });

  it('never breaks a line or stacked row inside a dictionary word', () => {
    const words = perChar('极客时间寄来的礼物，我们拿来给大家抽一个奖，我们看看里面是什么东西。');
    const groups = lexicalWordGroups(words).map((group) => group.map((word) => word.text).join(''));
    const boundaries = new Set<number>();
    groups.reduce((at, group) => { boundaries.add(at + group.length); return at + group.length; }, 0);
    const preset = getCaptionPreset('ln-clean');
    for (const lines of [
      captionLineSegments(words, preset, 40, 1, 1080, { measureText: () => null }),
      ...CAPTION_ART_PRESETS.filter((art) => art.stack).map((art) => captionStackRows(words, art, 80, 1, 1080, { measureText: () => null })),
    ]) {
      let at = 0;
      for (const text of lineTexts(lines)) { at += text.length; expect(boundaries.has(at)).toBe(true); }
      expect(lineTexts(lines).join('')).toBe(words.map((word) => word.text).join(''));
    }
  });
  it('keeps lone Han characters together in stacked rows (口播, 聊一聊)', () => {
    const words = perChar('大家好，今天我们聊一聊怎么把一条口播视频做得更好看。');
    for (const art of CAPTION_ART_PRESETS) {
      const rows = lineTexts(captionStackRows(words, art, 80, 1, 1080, { measureText: () => null }));
      for (let at = 1; at < rows.length; at++) {
        const seam = rows[at - 1]!.slice(-1) + rows[at]!.slice(0, 1);
        expect(['口播', '聊一', '一聊']).not.toContain(seam);
      }
    }
  });

  it('fits more on a stacked row at a smaller size and less at a larger one', () => {
    const words = perChar('今天我们来聊一聊怎么把一条视频的字幕做得更加好看');
    const longest = (scale: number) => Math.max(...lineTexts(captionStackRows(words, getCaptionPreset('art-beast'), 80, scale, 1080, { measureText: () => null })).map(row => row.length));
    expect(longest(.5)).toBeGreaterThan(longest(1));
    expect(longest(1.5)).toBeLessThan(longest(1));
  });

  it('breaks a long phrase where the speaker pauses rather than at the most balanced point', () => {
    const text = '正确的做法是先调研目标用户在哪里';
    const pauseAfter = text.indexOf('是'); // 正确的做法是 | 先调研目标用户在哪里
    const timed = (gapSec: number) => [...text].map((ch, index) => {
      const start = index * 0.2 + (index > pauseAfter ? gapSec : 0);
      return { text: ch, start, end: start + 0.2 };
    });
    const layout = (gapSec: number) => lineTexts(captionLineSegments(groupAsrWords(text, timed(gapSec)), getCaptionPreset('ln-clean'), 40, 1, 1080, { measureText: () => null }));
    const even = layout(0);
    const paused = layout(0.3);
    expect(even.length).toBeGreaterThan(1);
    expect(paused.join('')).toBe(text);
    expect(paused[0]).toBe('正确的做法是');
    expect(even[0]).not.toBe('正确的做法是');
  });

  it('keeps numbers, particles and words the dictionary does not know off line edges', () => {
    expect(lineBreakCost('一千', '九百')).toBeGreaterThan(0.5);
    expect(lineBreakCost('五十', '毫克')).toBeGreaterThan(0);
    expect(lineBreakCost('抽奖方式', '的话')).toBeGreaterThan(0);
    expect(lineBreakCost('极', '客')).toBeGreaterThanOrEqual(1);
    expect(lineBreakCost('礼物，', '我们')).toBe(0);
    const words = groupAsrWords('这个应该是如何和极客时间合作的一些方法', [...'这个应该是如何和极客时间合作的一些方法'].map((ch, i) => ({ text: ch, start: i * 0.2, end: i * 0.2 + 0.2 })));
    const lines = captionLineSegments(words, getCaptionPreset('ln-clean'), 56, 1, 1080).map(line => line.map(word => word.text).join(''));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.some(line => line.endsWith('极') || line.startsWith('客'))).toBe(false);
  });
});

describe('caption font override', () => {
  it('renders and measures with the same overridden face, and falls back to the preset font', async () => {
    const { captionCanvasFontFamilies, captionFontCss } = await import('./caption-layout-metrics');
    const { getCaptionPreset } = await import('./caption-presets');
    const preset = getCaptionPreset('ln-clean');
    expect(captionFontCss(preset)).toBe('var(--font-body)');
    expect(captionFontCss(preset, 'serif')).toContain('Noto Serif SC');
    expect(captionCanvasFontFamilies(preset, 'serif')).toContain('Noto Serif SC');
    // A local (typically Latin-only) face carries the CJK display partner behind it.
    expect(captionFontCss(preset, 'local:Avenir%20Next')).toBe('"Avenir Next","Smiley Sans",sans-serif');
    expect(captionCanvasFontFamilies(preset, 'local:Avenir%20Next')).toBe('"Avenir Next","Smiley Sans",sans-serif');
    expect(captionFontCss(preset, 'preset')).toBe('var(--font-body)');
    expect(captionFontCss(preset, 'nonsense')).toBe('var(--font-body)');
  });
});
