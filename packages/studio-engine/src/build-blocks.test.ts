import { describe, expect, it } from 'vitest';
import { chunkWordsByWidth } from './caption-fx';
import { captionBlocksFromAsr } from './build-blocks';
import { renderBlock } from './composition';

const w = (text: string, start: number, end: number) => ({ text, start, end });

describe('chunkWordsByWidth(长句拆段——渲染期实时计算)', () => {
  it('短句不拆', () => {
    const groups = chunkWordsByWidth([w('今天', 0, 0.5), w('聊聊', 0.5, 1), w('剪辑', 1, 1.5)]);
    expect(groups).toHaveLength(1);
  });

  it('长句按视觉宽度断,每段 CJK ≤ 13 字口径,词无丢失顺序保持', () => {
    const words = Array.from({ length: 30 }, (_, i) => w('字', i * 0.2, i * 0.2 + 0.2));
    const groups = chunkWordsByWidth(words);
    expect(groups.length).toBeGreaterThanOrEqual(3); // 30 字 → 至少 3 段
    for (const g of groups) {
      expect(g.length).toBeLessThanOrEqual(13);
    }
    expect(groups.flat()).toEqual(words);
  });

  it('均衡断行(pretext 式):不出「13+3」孤尾,段宽贴近均分', () => {
    // 16 字 → 2 段:应 ~8+8,不是 13+3
    const words = Array.from({ length: 16 }, (_, i) => w('字', i, i + 1));
    const groups = chunkWordsByWidth(words);
    expect(groups).toHaveLength(2);
    expect(Math.abs(groups[0]!.length - groups[1]!.length)).toBeLessThanOrEqual(2);
  });

  it('标点在均宽边界附近优先断', () => {
    // 18 字,逗号在第 10 字尾(均宽边界 9 附近)→ 在逗号处断
    const words = [...Array.from({ length: 9 }, (_, i) => w('字', i, i + 1)), w('了,', 9, 10), ...Array.from({ length: 8 }, (_, i) => w('字', 10 + i, 11 + i))];
    const groups = chunkWordsByWidth(words);
    expect(groups).toHaveLength(2);
    expect(groups[0]![groups[0]!.length - 1]!.text).toBe('了,');
  });

  it('整句放得下 = 不拆;西文按半宽算', () => {
    expect(chunkWordsByWidth(Array.from({ length: 13 }, (_, i) => w('字', i, i + 1)))).toHaveLength(1);
    // 20 个拉丁词元 ≈ 10 视觉单位 < 13 → 不拆
    expect(chunkWordsByWidth(Array.from({ length: 20 }, (_, i) => w('a', i, i + 1)))).toHaveLength(1);
  });
});

describe('captionBlocksFromAsr(一句一块;拆段在渲染期,不落数据)', () => {
  it('长句也只产出一个块(拆段归渲染器),preset/yPct 透传', () => {
    const text = '这是一个非常非常长的句子它应该在渲染时被拆成好几段轮播';
    const blocks = captionBlocksFromAsr([{ start: 0, end: 10, text }], { preset: 'ln-clean', yPct: 93 });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.templateId).toBe('caption');
    expect(blocks[0]!.slots.preset).toBe('ln-clean');
    expect(blocks[0]!.slots.yPct).toBe(93);
    expect(blocks[0]!.label).toBe(text);
  });

  it('空文本句被过滤', () => {
    expect(captionBlocksFromAsr([{ start: 0, end: 1, text: '  ' }])).toHaveLength(0);
  });

  it('窗口互斥:上一句尾部与下一句起点交叠时截断到下一句 start(词时间不动)', () => {
    const blocks = captionBlocksFromAsr([
      { start: 0.5, end: 2.0, text: '第一句字幕', words: [{ text: '第一句', start: 0.5, end: 1.1 }, { text: '字幕', start: 1.1, end: 2.0 }] },
      { start: 1.7, end: 3.5, text: '第二句接着说', words: [{ text: '第二句', start: 1.7, end: 2.4 }, { text: '接着说', start: 2.4, end: 3.5 }] },
    ]);
    const [a, b] = blocks as [(typeof blocks)[0], (typeof blocks)[0]];
    expect(a.startSec + a.durationSec).toBeCloseTo(b.startSec, 5); // 不再同屏(span2 的 0.3s 尾巴也被邻句截掉)
    expect(b.startSec + b.durationSec).toBeCloseTo(3.8, 5); // 末句无邻句,保留 span2 的 0.3s 收尾
    expect((a.slots.words as { end: number }[]).at(-1)!.end).toBe(2.0); // 词时间保持转写真值
  });

  it('双语副行:sub 随句进块并渲染成 .cap-sub;没配译文的句不渲染副行', () => {
    const blocks = captionBlocksFromAsr([
      { start: 0, end: 3, text: '大家好', sub: 'Hello everyone' },
      { start: 3, end: 6, text: '今天聊剪辑' },
    ]);
    expect(blocks[0]!.slots.sub).toBe('Hello everyone');
    expect(blocks[1]!.slots.sub).toBeUndefined();
    const r0 = renderBlock(blocks[0]!);
    expect(r0.innerHtml).toContain('cap-sub');
    // 译文行与主行同一套分词拆行:词落成 span(词间距走 flex gap,不再是整句文本节点)
    // Hello→everyone 是西文相邻词:带 .sp(词界追加距,英文不再"挤在一起")
    expect(r0.innerHtml).toContain('<span class="sp">Hello</span>');
    expect(r0.innerHtml).toContain('<span>everyone</span>');
    expect(r0.innerHtml).toContain('cap-sub-line');
    expect(renderBlock(blocks[1]!).innerHtml).not.toContain('cap-sub');
  });
});
