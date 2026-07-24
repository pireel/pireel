import { describe, expect, it } from 'vitest';
import { type Block, type Composition, compReceiptDelta } from './composition';

function blk(id: string, startSec: number, durationSec: number, over: Partial<Block> = {}): Block {
  return { id, templateId: 'custom', slots: {}, startSec, durationSec, trackIndex: 1, box: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 }, ...over } as Block;
}
function cap(id: string, startSec: number, durationSec: number): Block {
  return { id, templateId: 'caption', slots: { text: 'hi' }, startSec, durationSec, trackIndex: 0 } as Block;
}
function comp(blocks: Block[], shots?: Composition['shots']): Composition {
  return { width: 1080, height: 1920, theme: 'general', video: null, blocks, shots: shots ?? [{ id: 's1', srcStart: 0, srcEnd: 20, treatment: 'full' }] } as Composition;
}

describe('compReceiptDelta', () => {
  it('无变化 → null', () => {
    const a = comp([blk('b1', 1, 3)]);
    expect(compReceiptDelta(a, a)).toBeNull();
  });

  it('统一位移折叠成一条规则(≤3 带 ids)', () => {
    const before = comp([blk('b1', 5, 3), blk('b2', 9, 2), blk('b3', 14, 2)]);
    const after = comp([blk('b1', 3, 3), blk('b2', 7, 2), blk('b3', 12, 2)]);
    const d = compReceiptDelta(before, after)!;
    expect(d.blocksShifted).toEqual([{ by: -2, count: 3, fromSec: 5, ids: ['b1', 'b2', 'b3'] }]);
    expect(d.blocksDropped).toBeUndefined();
  });

  it('大组位移省略 ids(规则即完整描述)', () => {
    const mk = (s: number) => Array.from({ length: 5 }, (_, i) => blk(`b${i}`, s + i * 3, 2));
    const d = compReceiptDelta(comp(mk(10)), comp(mk(8)))!;
    expect(d.blocksShifted![0]!.count).toBe(5);
    expect(d.blocksShifted![0]!.ids).toBeUndefined();
  });

  it('被剪短的块列 resized,整段被吞的块列 dropped', () => {
    const before = comp([blk('b1', 2, 6), blk('b2', 4, 1)]);
    const after = comp([blk('b1', 2, 3)]);
    const d = compReceiptDelta(before, after)!;
    expect(d.blocksResized).toEqual([{ id: 'b1', from: [2, 8], to: [2, 5] }]);
    expect(d.blocksDropped).toEqual(['b2']);
  });

  it('字幕层聚合:重铺=relaid(换 id)/同 id 平移=shifted/清空=removed,不逐行罗列', () => {
    const before = comp([cap('c1', 0, 2), cap('c2', 2, 2), blk('b1', 1, 3)]);
    const relaid = compReceiptDelta(before, comp([cap('c3', 0, 2), cap('c4', 2, 2), blk('b1', 1, 3)]))!;
    expect(relaid.captionLayer).toBe('relaid');
    expect(relaid.blocksShifted).toBeUndefined();
    const shifted = compReceiptDelta(before, comp([cap('c1', 0, 2), cap('c2', 1.5, 2), blk('b1', 1, 3)]))!;
    expect(shifted.captionLayer).toBe('shifted');
    const removed = compReceiptDelta(before, comp([blk('b1', 1, 3)]))!;
    expect(removed.captionLayer).toBe('removed');
  });

  it('时长与镜头数变化', () => {
    const before = comp([], [{ id: 's1', srcStart: 0, srcEnd: 20, treatment: 'full' }]);
    const after = comp(
      [],
      [
        { id: 's1', srcStart: 0, srcEnd: 8, treatment: 'full' },
        { id: 's2', srcStart: 10, srcEnd: 20, treatment: 'full' },
      ],
    );
    const d = compReceiptDelta(before, after)!;
    expect(d.durationSec).toEqual([20, 18]);
    expect(d.shotCount).toEqual([1, 2]);
  });
});
