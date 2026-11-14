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

  describe('a prop that marks part of another prop', () => {
    // A title with one of its words highlighted: "head" shows; "kick" names the part of it to mark.
    const markup = (p: Record<string, unknown>, mark: boolean) => {
      const head = String(p.head ?? '');
      const word = String(p.kick ?? '');
      const at = mark && word ? head.indexOf(word) : -1;
      const title = at < 0 ? head : `${head.slice(0, at)}<span class="mark">${word}</span>${head.slice(at + word.length)}`;
      return { text: `${head} ${((p.items as { text: string }[]) ?? []).map((row) => row.text).join(' ')}`, html: `<div class="title">${title}</div>` };
    };
    const check = (mark: boolean) => {
      const [probe] = lookPieceProbes(lookOf({}));
      return lookPieceContractIssues(probe!, Object.fromEntries(Object.entries(probe!.variants).map(([name, props]) => [name, markup(props, mark)])));
    };

    it('renders each text prop holding a part of every other text prop', () => {
      const [probe] = lookPieceProbes(lookOf({}));
      const head = probe!.markers.head![0]!;
      expect(probe!.variants['within:kick:head']).toMatchObject({ kick: head.slice(1, -1), head });
      expect(head).toContain(String(probe!.variants['within:kick:head']!.kick));
      // A list is not a word to mark with.
      expect(Object.keys(probe!.variants).some((name) => name.startsWith('within:items:'))).toBe(false);
    });

    it('passes it: it never shows as text of its own, and the markup changes where it matches', () => {
      expect(check(true).hard).toEqual([]);
    });

    it('still refuses a prop the piece ignores, and says what a text prop may do', () => {
      const messages = check(false).hard.map((issue) => issue.message);
      expect(messages).toEqual([expect.stringContaining('prop "kick" never shows')]);
      expect(messages[0]).toContain('marks a part of another text prop');
    });

    it('refuses it when the renderer gives no markup to compare', () => {
      expect(render(lookOf({}), (p) => `${p.head} ${((p.items as { text: string }[]) ?? []).map((row) => row.text).join(' ')}`).hard.map((issue) => issue.message)).toEqual([expect.stringContaining('prop "kick" never shows')]);
    });
  });

  it('reports a piece that throws', () => {
    const [probe] = lookPieceProbes(lookOf({}));
    expect(lookPieceContractIssues(probe!, { base: { error: 'x is undefined' } }).hard[0]!.message).toContain('x is undefined');
  });
});
