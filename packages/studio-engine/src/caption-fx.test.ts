import { describe, expect, it } from 'vitest';
import {
  type FxWord,
  activeChunk,
  chunkAlpha,
  chunkWords,
  clamp01,
  easeOutCubic,
  hasCaptionFx,
} from './caption-fx';

const words: FxWord[] = [
  { text: '今天', start: 0.0, end: 0.4 },
  { text: '我们', start: 0.4, end: 0.9 },
  { text: '聊聊', start: 0.9, end: 1.5, emphasis: true },
  { text: '增长', start: 1.5, end: 2.2 },
  { text: '黑客', start: 2.2, end: 3.0 },
];

describe('chunkWords', () => {
  it('按窗口大小连续分组', () => {
    expect(chunkWords(words, 2).map((c) => c.length)).toEqual([2, 2, 1]);
    expect(chunkWords(words, 4).map((c) => c.length)).toEqual([4, 1]);
  });
  it('窗口 >= 词数 = 单组', () => {
    expect(chunkWords(words, 10)).toHaveLength(1);
  });
});

describe('activeChunk', () => {
  it('命中正确的屏 + 无缝衔接窗口', () => {
    // size=2 → chunks: [今天,我们][聊聊,增长][黑客]
    const a = activeChunk(words, 2, 0.5);
    expect(a?.index).toBe(0);
    expect(a?.chunk.map((w) => w.text)).toEqual(['今天', '我们']);
    // 第 0 屏可见到第 1 屏起点(0.9),无缝
    expect(a?.visEnd).toBeCloseTo(0.9);

    const b = activeChunk(words, 2, 1.0);
    expect(b?.index).toBe(1);
    expect(b?.chunk.map((w) => w.text)).toEqual(['聊聊', '增长']);
  });

  it('末屏末词后留尾巴', () => {
    const c = activeChunk(words, 2, 3.2);
    expect(c?.index).toBe(2);
    // 末词 end=3.0 + TAIL 0.3 = 3.3
    expect(c?.visEnd).toBeCloseTo(3.3);
  });

  it('超出范围返回 null', () => {
    expect(activeChunk(words, 2, 5)).toBeNull();
  });

  it('slam 用 size=1 时逐词成屏', () => {
    const a = activeChunk(words, 1, 0.95);
    expect(a?.chunk).toHaveLength(1);
    expect(a?.chunk[0]?.text).toBe('聊聊');
  });
});

describe('chunkAlpha', () => {
  it('入场升、出场落、稳态为 1', () => {
    expect(chunkAlpha(0.0, 0, 2)).toBeCloseTo(0, 1); // 刚入场
    expect(chunkAlpha(0.5, 0, 2)).toBeCloseTo(1, 1); // 稳态
    expect(chunkAlpha(2.0, 0, 2)).toBeCloseTo(0, 1); // 出场末
  });
});

describe('数值工具', () => {
  it('clamp01', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });
  it('easeOutCubic 单调 0→1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5); // 缓出:前段快
  });
});

describe('hasCaptionFx', () => {
  it('有 effect+words 才是花字', () => {
    expect(hasCaptionFx({ effect: 'highlight', words })).toBe(true);
    expect(hasCaptionFx({ effect: 'highlight', words: [] })).toBe(false);
    expect(hasCaptionFx({ words })).toBe(false);
    expect(hasCaptionFx({})).toBe(false);
  });
});
