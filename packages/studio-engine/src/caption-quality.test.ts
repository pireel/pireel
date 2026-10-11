import { describe, expect, it } from 'vitest';
import { groupAsrWords, segmentTokens } from './caption-fx';
import { editedCaptionWords } from './caption-word-edit';
import { speechPhraseChunks } from './captions-relay';
import { captionBlocksFromAsr, sanitizeTranscriptSegs } from './build-blocks';
import { validateEmphasisSelection } from './caption-emphasis';
import { renderBlock } from './composition';

const word = (text: string, start: number, end: number) => ({ text, start, end });
describe('caption quality invariants', () => {
  it('keeps model names, quantities and opening quotes intact', () => {
    expect(segmentTokens('用 GPT-4o 把成本从 3.5万元降到 800元。')).toEqual(['用', 'GPT-4o', '把', '成本', '从', '3.5万元', '降到', '800元。']);
    expect(segmentTokens("GPT4o can't use A380")).toEqual(['GPT4o', "can't", 'use', 'A380']);
    expect(segmentTokens('「人工智能」')).toEqual(['「人工', '智能」']);
  });
  it('rejects equal-length but different text, boundary overshoots and leftover ASR tokens', () => {
    for (const [text, raw] of [
      ['ABC DEF', [word('XYZ', 0, 1), word('UVW', 1, 2)]],
      ['one two', [word('onet', 0, 1), word('wo', 1, 2)]],
      ['one', [word('one', 0, 1), word('two', 1, 2)]],
    ] as const) expect(groupAsrWords(text, [...raw])).toEqual(raw);
  });
  it('keeps real anchors after a middle-word edit instead of redistributing the whole sentence', () => {
    const source = [word('Alpha', 0, 0.15), word('beta', 0.8, 1), word('gamma', 1.6, 1.9)];
    const result = editedCaptionWords('Alpha better gamma', source, 0, 2);
    expect(result[0]).toEqual(source[0]); expect(result[2]).toEqual(source[2]);
    expect(result[1]).toMatchObject({ text: 'better', start: 0.8, end: 1, timing: 'estimated', emphasis: false });
  });
  it('does not move following words when inserted text has no time available', () => {
    const result = editedCaptionWords('one new two', [word('one', 0, 1), word('two', 1, 2)], 0, 2);
    expect(result[1]).toMatchObject({ start: 1, end: 1, timing: 'estimated' });
    expect(result[2]).toEqual(word('two', 1, 2));
  });
  it('breaks at Chinese sentence boundaries and audible pauses even when text fits', () => {
    const words = [word('你好。', 0, 1), word('接着', 1.1, 1.5), word('讲', 2.1, 2.4)];
    expect(speechPhraseChunks(words)).toEqual(words.map((w) => [w]));
  });
  it('lets the length cap wait briefly instead of splitting two lone Han characters', () => {
    const words = [word('今天', 0, 3), word('聊', 3, 5.5), word('口', 5.6, 5.9), word('播', 5.9, 6.3), word('视频', 6.3, 6.8)];
    expect(speechPhraseChunks(words).map((chunk) => chunk.map((w) => w.text).join(''))).toEqual(['今天聊口播', '视频']);
  });
  it('persists emphasis while stripping runtime source indices', () => {
    const cleaned = sanitizeTranscriptSegs([{ text: '重点', start: 0, end: 1, words: [{ ...word('重点', 0, 1), emphasis: true, si: 8 } as never], cue: true }]);
    expect(cleaned[0]?.words?.[0]).toEqual({ ...word('重点', 0, 1), emphasis: true });
  });
  it('renders selected keywords differently while keeping follow-along independent', () => {
    const segment = { text: 'not free today', start: 0, end: 3, words: [{ ...word('not', 0, 1), emphasis: true }, { ...word('free', 1, 2), emphasis: true }, { ...word('today', 2, 3), emphasis: false }] };
    const block = captionBlocksFromAsr([segment], { preset: 'kw-yellow' })[0]!;
    const keywords = renderBlock(block).timelineBody;
    expect(keywords).toContain('-w0 .t'); expect(keywords).toContain('-w1 .t'); expect(keywords).not.toContain('-w2 .t');
    const karaoke = renderBlock({ ...block, slots: { ...block.slots, preset: 'em-yellow' } }).timelineBody;
    expect(karaoke).toContain('-w2 .t');
  });
  it('validates complete model selections and rejects fabricated indexes', () => {
    const rows = [{ index: 7, words: ['不是', '免费', '而是', '按次', '收费'] }];
    expect(validateEmphasisSelection(rows, [{ index: 7, words: [0, 1] }])).not.toBeNull();
    expect(validateEmphasisSelection(rows, [{ index: 7, words: [0, 1, 2, 3, 4] }])).not.toBeNull();
    for (const response of [[], [{ index: 7, words: [5] }], [{ index: 7, words: [1, 1] }], [{ index: 8, words: [] }]]) expect(validateEmphasisSelection(rows, response)).toBeNull();
  });
});

it('accepts more than eight valid highlighted positions through the workflow contract', async () => {
  const { emphasisSchema } = await import('./workflow-node-contracts');
  const { assertWorkflowValue } = await import('./workflow-schema');
  const words = Array.from({ length: 12 }, (_, index) => index);
  const rows = [{ index: 0, words: words.map(index => 'word' + index) }];
  expect(validateEmphasisSelection(rows, [{ index: 0, words }])).toEqual([{ index: 0, words }]);
  expect(() => assertWorkflowValue({ sourceKey: 'source', items: [{ id: 'line', words }] }, emphasisSchema)).not.toThrow();
});
