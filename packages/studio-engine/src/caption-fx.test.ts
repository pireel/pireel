import { describe, expect, it } from 'vitest';
import {
  type FxWord,
  activeChunk,
  chunkAlpha,
  chunkWords,
  clamp01,
  easeOutCubic,
  groupAsrWords,
  hasCaptionFx,
  segmentTokens,
  wordsFromText,
} from './caption-fx';

const words: FxWord[] = [
  { text: '今天', start: 0.0, end: 0.4 },
  { text: '我们', start: 0.4, end: 0.9 },
  { text: '聊聊', start: 0.9, end: 1.5, emphasis: true },
  { text: '增长', start: 1.5, end: 2.2 },
  { text: '黑客', start: 2.2, end: 3.0 },
];

describe('segmentTokens(ICU 词典分词——废除盲切 2 字)', () => {
  it('中文按真实词界切,不产出跨词的假二元组', () => {
    const toks = segmentTokens('这个方案不科学');
    expect(toks).toContain('科学');
    expect(toks).not.toContain('不科'); // 旧盲切 2 字会产出「不科|学」
    expect(toks.join('')).toBe('这个方案不科学');
  });
  it('标点并入前一个词元,不独立成词', () => {
    expect(segmentTokens('你好,世界。')).toEqual(['你好,', '世界。']);
  });
  it('西文按空格,数字/带点标识符保持完整', () => {
    expect(segmentTokens('Hello world, this is 3.14')).toEqual(['Hello', 'world,', 'this', 'is', '3.14']);
    expect(segmentTokens('我们用 Intl.Segmenter 分词')).toContain('Intl.Segmenter');
  });
  it('空文本 → 空数组', () => {
    expect(segmentTokens('  ')).toEqual([]);
  });
});

describe('wordsFromText(无 ASR 词级时间的兜底:ICU 词元 + 按字长均摊)', () => {
  it('时间连续覆盖整句,词元与文本一致', () => {
    const out = wordsFromText('这个方案不科学', 1, 3);
    expect(out[0]!.start).toBe(1);
    expect(out[out.length - 1]!.end).toBeCloseTo(3, 2);
    for (let i = 1; i < out.length; i++) expect(out[i]!.start).toBeCloseTo(out[i - 1]!.end, 3);
    expect(out.map((w) => w.text).join('')).toBe('这个方案不科学');
  });
});

describe('groupAsrWords(ASR 词元按 ICU 词界归组,时间戳合并)', () => {
  it('逐字 ASR 词元归组成词,窗口取首字 start / 末字 end', () => {
    const asr = [...'这个方案不科学'].map((ch, i) => ({ text: ch, start: i * 0.2, end: i * 0.2 + 0.2 }));
    const out = groupAsrWords('这个方案不科学', asr);
    expect(out.map((w) => w.text)).toEqual(segmentTokens('这个方案不科学'));
    const kexue = out.find((w) => w.text === '科学')!;
    expect(kexue.start).toBeCloseTo(1.0, 3); // 第 6 字(索引 5)开始
    expect(kexue.end).toBeCloseTo(1.4, 3); // 第 7 字(索引 6)结束
  });
  it('标点差异不破坏对齐(字母数字计数口径)', () => {
    const asr = [
      { text: '你好', start: 0, end: 0.4 },
      { text: '世界', start: 0.5, end: 0.9 },
    ];
    const out = groupAsrWords('你好,世界。', asr);
    expect(out.map((w) => w.text)).toEqual(['你好,', '世界。']);
    expect(out[1]!.start).toBe(0.5);
  });
  it('对不齐时退回原始 ASR 词元(真实时序优先)', () => {
    const asr = [{ text: '完全不同的内容', start: 0, end: 1 }];
    const out = groupAsrWords('这个方案不科学好长好长', asr);
    expect(out).toEqual([{ text: '完全不同的内容', start: 0, end: 1 }]);
  });
});

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
