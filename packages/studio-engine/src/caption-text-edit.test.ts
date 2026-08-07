import { describe, expect, it } from 'vitest';
import type { AsrSegment } from './build-blocks';
import { applyCaptionTextEdits } from './caption-text-edit';

const transcript = (): AsrSegment[] => [{
  start: 0,
  end: 4,
  text: '今天天气很好',
  words: [
    { text: '今天', start: 0, end: 1 },
    { text: '天气', start: 1, end: 2 },
    { text: '很', start: 2, end: 3 },
    { text: '好', start: 3, end: 4 },
  ],
  sub: 'The weather is nice today',
  cueSubs: { '0:1': 'Today', '2:3': 'is nice' },
}];

describe('applyCaptionTextEdits', () => {
  it('人工改字只写 cue copy，ASR 文本、词索引和时间槽完全不动', () => {
    const original = transcript();
    const next = applyCaptionTextEdits(original, [{ index: 0, w0: 0, w1: 1, text: '明天天气' }]);

    expect(next).not.toBe(original);
    expect(next[0]).toMatchObject({
      text: '今天天气很好',
      captionText: '明天天气很好',
      cueTexts: { '0:1': '明天天气' },
      cueLayout: ['0:1'],
    });
    expect(next[0]!.words).toEqual(original[0]!.words);
    expect(next[0]!.cueSubs).toEqual({ '2:3': 'is nice' });
  });

  it('词数变化也不重分段、不平移后续 cue key', () => {
    const original = transcript();
    const next = applyCaptionTextEdits(original, [{ index: 0, w0: 0, w1: 1, text: '明天' }]);

    expect(next[0]!.words).toEqual(original[0]!.words);
    expect(next[0]!.cueTexts).toEqual({ '0:1': '明天' });
    expect(next[0]!.cueLayout).toEqual(['0:1']);
    expect(next[0]!.captionText).toBe('明天很好');
    expect(next[0]!.cueSubs).toEqual({ '2:3': 'is nice' });
  });

  it('整句单 cue 纠错保留源转写并清理失效翻译', () => {
    const original = transcript();
    const next = applyCaptionTextEdits(original, [{ index: 0, text: 'Tomorrow weather is nice' }]);

    expect(next[0]).toMatchObject({
      start: 0,
      end: 4,
      text: '今天天气很好',
      captionText: 'Tomorrow weather is nice',
      cueTexts: { '0:3': 'Tomorrow weather is nice' },
    });
    expect(next[0]!.words).toEqual(original[0]!.words);
    expect(next[0]!.sub).toBeUndefined();
    expect(next[0]!.cueSubs).toBeUndefined();
  });

  it('改回源文案会删除覆盖，恢复自动 cue 内容', () => {
    const edited = applyCaptionTextEdits(transcript(), [{ index: 0, w0: 0, w1: 1, text: '明天天气' }]);
    const restored = applyCaptionTextEdits(edited, [{ index: 0, w0: 0, w1: 1, text: '今天天气' }]);
    expect(restored[0]!.cueTexts).toBeUndefined();
    expect(restored[0]!.captionText).toBeUndefined();
    expect(restored[0]!.cueLayout).toEqual(['0:1']);
  });

  it('无变化时保留数组引用', () => {
    const original = transcript();
    expect(applyCaptionTextEdits(original, [{ index: 0, text: original[0]!.text }])).toBe(original);
  });
});
