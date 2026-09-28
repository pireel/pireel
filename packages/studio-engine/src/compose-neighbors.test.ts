import { describe, expect, it } from 'vitest';
import type { Block } from './composition-core';
import { motionGraphicNeighbors } from './compose-neighbors';

const block = (id: string, startSec: number, templateId = 'custom', innerHtml = '', label?: string): Block => ({
  id, templateId, startSec, durationSec: 3, trackIndex: 2, slots: { innerHtml }, ...(label ? { label } : {}),
} as Block);

describe('motionGraphicNeighbors', () => {
  const blocks = [
    block('b', 8, 'custom', '<div><span>67%</span><style>.x{}</style></div>', 'Metric'),
    block('cap', 5, 'caption'),
    block('a', 2, 'kit:steps', '', 'Three steps'),
    block('c', 14, 'custom', '<p>Before &amp; after</p>'),
  ];

  it('lists Motion Graphics in play order and marks the edited one', () => {
    expect(motionGraphicNeighbors(blocks, { blockId: 'b' })).toEqual([
      '1. [steps] Three steps',
      '2. [custom] Metric — 67%  «THIS»',
      '3. [custom] Before after',
    ]);
  });

  it('slots a new fragment in by its start time', () => {
    const lines = motionGraphicNeighbors(blocks, { atSec: 10 });
    expect(lines[2]).toBe('3. (new fragment)  «THIS»');
    expect(lines).toHaveLength(4);
  });

  it('returns nothing when there is no other fragment', () => {
    expect(motionGraphicNeighbors([], { atSec: 1 })).toEqual([]);
    expect(motionGraphicNeighbors([block('only', 0)], { blockId: 'only' })).toEqual([]);
  });
});
