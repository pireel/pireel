import { describe, expect, it } from 'vitest';
import type { Block } from '@pireel/studio-engine/composition';
import { blockContentTitle, blockDisplayTitle } from './block-display-title';
import { buildAgentElementRoster } from './agent-element-roster';

const block = (patch: Partial<Block> = {}): Block => ({
  id: 'b1',
  templateId: 'custom',
  slots: { innerHtml: '<div></div>', timelineBody: '' },
  startSec: 0,
  durationSec: 3,
  trackIndex: 2,
  ...patch,
});

describe('component display titles', () => {
  it('uses visible component copy instead of the persisted theme-and-shape label', () => {
    const b = block({
      label: '孟菲斯卖点卡：白色圆角方形',
      slots: {
        innerHtml: '<div><strong>省下 3 小时</strong><span>每天都能做到</span></div><style>.x{content:"wrong"}</style>',
        timelineBody: '',
      },
    });
    expect(blockDisplayTitle(b)).toBe('省下 3 小时 · 每天都能做到');
  });

  it('discovers meaningful fields generically for current and future kit components', () => {
    const b = block({
      templateId: 'kit:comparison',
      slots: { props: { variant: 'columns', aLabel: '传统方案', aValue: '3 天', bLabel: 'AI 方案', bValue: '20 分钟', surfaceColor: '#fff' } },
    });
    expect(blockContentTitle(b)).toBe('传统方案 · 3 天 · AI 方案 · 20 分钟');
  });

  it('falls back to the semantic component type when there is no readable content', () => {
    expect(blockDisplayTitle(block({ templateId: 'kit:metric', slots: { props: {} }, label: '蓝紫渐变圆形' }))).toBe('指标卡');
  });
});

describe('chat @ roster', () => {
  it('does not expand derived sentence captions into one item per cue', () => {
    const caption = (id: string): Block => block({
      id,
      templateId: 'caption',
      slots: { words: [{ text: id, start: 0, end: 1 }], cue: true, ref: { src: null, seg: 0, w0: 0, w1: 1 } },
      trackIndex: 1,
    });
    const graphic = block({ id: 'graphic', slots: { innerHtml: '<b>重点结论</b>', timelineBody: '' } });
    expect(buildAgentElementRoster([caption('cap-1'), caption('cap-2'), graphic], [])).toEqual([
      { id: 'graphic', label: '重点结论', kind: 'custom', isShot: false },
    ]);
  });
});
