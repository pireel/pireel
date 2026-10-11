import { describe, expect, it } from 'vitest';
import { StudioVisibleTextScrubber, withoutInternalHandoffParts } from './studio-visible-text';

describe('Studio reply visibility', () => {
  it('never streams the internal recap opener even across single-character chunks', () => {
    const scrubber = new StudioVisibleTextScrubber();
    let visible = '';
    for (const char of '已完成粗剪。\n让我按时间顺序梳理这段对话。\n初始用户消息：调用 rough_cut，track_internal。') visible += scrubber.push(char);
    visible += scrubber.end();
    expect(visible.trim()).toBe('已完成粗剪。');
  });
  it('keeps technical explanations and ordinary editing summaries intact', () => {
    for (const text of ['已剪掉停顿，视频缩短到 56 秒。', '你问的 atFrame 表示片段在时间线上的起始帧。', '1. 主要请求与意图：改善开头。\n2. 结果：已去掉重复内容。']) {
      const scrubber = new StudioVisibleTextScrubber();
      expect(scrubber.push(text) + scrubber.end()).toBe(text);
    }
  });
  it('removes a multi-part handoff while preserving genuine text and tool receipts', () => {
    const receipt = { type: 'tool-get_state', text: undefined, data: 'internal state for continuation' };
    expect(withoutInternalHandoffParts([
      { type: 'text', text: '粗剪完成。' }, receipt,
      { type: 'text', text: '1. Primary Request and Intent: finish editing.' },
      { type: 'text', text: '2. Key Technical Concepts: internal track ids' },
    ])).toEqual([{ type: 'text', text: '粗剪完成。' }, receipt]);
  });
});
