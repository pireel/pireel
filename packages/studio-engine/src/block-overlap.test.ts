/**
 * blockOverlapWarnings — deterministic same-window collision receipt for lay_out/add_graphics.
 * The first fixture is the real incident: two closing cards sharing 88→90.2s, the farewell
 * card's lower half buried under the lottery card, and the agent's sampled review never
 * looked at that window.
 */
import { describe, expect, it } from 'vitest';
import { type Block, blockOverlapWarnings } from './composition';

const blk = (id: string, startSec: number, durationSec: number, box: { x: number; y: number; w: number; h: number } | undefined, templateId = 'custom'): Block => ({
  id,
  templateId,
  slots: templateId === 'custom' ? { innerHtml: '<div></div>', timelineBody: '' } : {},
  startSec,
  durationSec,
  trackIndex: 2,
  ...(box ? { box } : {}),
});

describe('blockOverlapWarnings', () => {
  it('reports the real incident pair: closing cards sharing a window with the smaller box half-covered', () => {
    const lottery = blk('media61', 88.011, 2.489, { x: 0.0616, y: 0.4858, w: 0.84, h: 0.36 });
    const farewell = blk('media60', 88.012, 2.16, { x: 0.0009, y: 0.41, w: 0.46, h: 0.18 });
    const warns = blockOverlapWarnings([lottery, farewell]);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toMatchObject({ a: 'media61', b: 'media60' });
    expect(warns[0]!.coverage).toBeGreaterThan(0.4); // ~half of the farewell card is buried
    expect(warns[0]!.atSec).toBeCloseTo(89.1, 1); // midpoint of the shared window
  });

  it('ignores pairs that only touch in time or only touch in space', () => {
    const a = blk('a', 0, 5, { x: 0.1, y: 0.1, w: 0.4, h: 0.2 });
    const laterSamePlace = blk('b', 10, 5, { x: 0.1, y: 0.1, w: 0.4, h: 0.2 }); // no time overlap
    const sameTimeApart = blk('c', 0, 5, { x: 0.1, y: 0.7, w: 0.4, h: 0.2 }); // no box overlap
    const grazing = blk('d', 0, 5, { x: 0.45, y: 0.25, w: 0.4, h: 0.2 }); // tiny sliver < 25% of smaller
    expect(blockOverlapWarnings([a, laterSamePlace, sameTimeApart, grazing])).toEqual([]);
  });

  it('skips sentence captions and transitions, and boxless blocks never pair', () => {
    const card = blk('card', 0, 5, { x: 0.1, y: 0.1, w: 0.8, h: 0.4 });
    const caption = blk('cap', 0, 5, undefined, 'caption'); // sentence caption: global layer
    const transition = blk('tr', 0, 5, { x: 0, y: 0, w: 1, h: 1 }, 'transition');
    expect(blockOverlapWarnings([card, caption, transition])).toEqual([]);
  });
});
