import { describe, expect, it } from 'vitest';
import { lookPieceContractIssues, lookPieceProbes } from './look-contract';
import type { DocumentLook, LookPiece } from './look';

const lookOf = (piece: Partial<LookPiece>): DocumentLook => ({
  id: 'look-1',
  css: '',
  pieces: { card: { label: 'Card', source: '', propsSchema: { type: 'object', properties: { kick: { type: 'string' }, head: { type: 'string' }, tone: { type: 'string', enum: ['warm', 'cool'] }, items: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' } } } } } }, ...piece } },
});

/** Stand-in for the browser render: a piece as a function of props, read back as text. */
function render(look: DocumentLook, piece: (props: Record<string, unknown>) => string) {
  const [probe] = lookPieceProbes(look);
  const renders = Object.fromEntries(Object.entries(probe!.variants).map(([name, props]) => [name, { text: piece(props) }]));
  return lookPieceContractIssues(probe!, renders);
}

describe('look piece words contract', () => {
  it('passes a piece whose words all come from its props', () => {
    const issues = render(lookOf({}), (p) => `${p.kick} ${p.head} ${((p.items as { text: string }[]) ?? []).map((row) => row.text).join(' ')} ✓ ¥`);
    expect(issues).toEqual({ hard: [], soft: [] });
  });

  it('refuses a prop that never shows and an empty prop that falls back to the default wording', () => {
    const issues = render(lookOf({}), (p) => `${p.kick || '开箱抽奖'} 拆开看看 ${((p.items as { text: string }[]) ?? []).map((row) => row.text).join(' ')}`);
    const messages = issues.hard.map((issue) => issue.message).join('\n');
    expect(messages).toContain('prop "head" never shows');
    expect(messages).toContain('an empty "kick" still shows "开箱抽奖"');
    expect(issues.soft[0]!.message).toContain('拆开看看');
  });

  it('refuses a list that refills itself with default rows when emptied', () => {
    const issues = render(lookOf({}), (p) => {
      const rows = (p.items as { text: string }[]).length ? (p.items as { text: string }[]) : [{ text: '包包' }, { text: '水杯' }];
      return `${p.kick} ${p.head} ${rows.map((row) => row.text).join(' ')}`;
    });
    expect(issues.hard.map((issue) => issue.message)).toEqual([expect.stringContaining('an empty "items" still shows "包包水杯"')]);
  });

  it('reports a piece that throws', () => {
    const [probe] = lookPieceProbes(lookOf({}));
    expect(lookPieceContractIssues(probe!, { base: { error: 'x is undefined' } }).hard[0]!.message).toContain('x is undefined');
  });
});
