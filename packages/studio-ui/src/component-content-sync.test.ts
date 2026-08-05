import { describe, expect, it } from 'vitest';
import type { Block } from '@pireel/studio-engine/composition';
import { componentContentSyncTarget, isBlockContentSyncable } from './component-content-sync';

const block = (templateId: string, slots: Block['slots']): Block => ({
  id: 'sync_target',
  templateId,
  slots,
  startSec: 0,
  durationSec: 4,
  trackIndex: 2,
});

describe('组件内容同步能力', () => {
  it('HTML 和 kit 组件都按内容槽显示同步入口', () => {
    expect(isBlockContentSyncable(block('custom', { innerHtml: '<b data-edit="title">标题</b>' }))).toBe(true);
    expect(isBlockContentSyncable(block('custom', { innerHtml: '<b>装饰文字</b>' }))).toBe(false);
    expect(isBlockContentSyncable(block('kit:metric', { props: { value: '47%' } }))).toBe(true);
  });

  it('从 kit schema 提取内容字段，排除布局、动效和颜色字段', () => {
    const target = componentContentSyncTarget(block('kit:comparison', {
      props: { aLabel: '方案 A', aValue: '42', bLabel: '方案 B', bValue: '68', winner: 'b', surfaceColor: '#ffffff' },
    }));

    expect(target?.items.map((item) => item.text)).toEqual(['方案 A', '42', '方案 B', '68']);
  });

  it('把同步结果写回 kit props，并保持数字字段的 schema 类型', () => {
    const target = componentContentSyncTarget(block('kit:chart', {
      props: { title: '旧数据', unit: '%', series: [{ label: '甲', value: 42 }, { label: '乙', value: 31 }] },
    }))!;
    const rewritten = target.apply([
      { index: 0, text: '新数据' },
      { index: 1, text: '万' },
      { index: 2, text: '产品一' },
      { index: 3, text: '56' },
      { index: 4, text: '产品二' },
      { index: 5, text: '44' },
    ]);

    expect(rewritten.title).toBe('新数据');
    expect(rewritten.unit).toBe('万');
    expect(rewritten.series).toEqual([
      { label: '产品一', value: 56 },
      { label: '产品二', value: 44 },
    ]);
  });
});
