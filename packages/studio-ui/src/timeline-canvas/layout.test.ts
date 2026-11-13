import { describe, expect, it } from 'vitest';
import type { Composition } from '@pireel/studio-engine/composition';
import { captionBlocksFromAsr } from '@pireel/studio-engine/build-blocks';
import { CAP_LANE, TIMELINE_METRICS } from '../timeline-utils';
import { type TimelineItem, itemBox, itemsBetween, timelineLayout } from './layout';

const metrics = TIMELINE_METRICS.comfortable;
const item = (id: string, startSec: number, endSec: number): TimelineItem => ({ kind: 'pending', id, lane: 0, startSec, endSec, top: 0, height: 10, minWidth: 28, gapRight: 0, range: { id, startSec, endSec, label: id, lane: { kind: 'new' } } });

describe('itemsBetween', () => {
  const sorted = [item('bed', 0, 2600), item('a', 10, 12), item('b', 20, 22), item('c', 30, 32), item('d', 40, 42)];
  it('returns what overlaps the window, in order', () => {
    expect(itemsBetween(sorted, 19, 31, 0).map((entry) => entry.id)).toEqual(['bed', 'b', 'c']);
    expect(itemsBetween(sorted, 50, 60, 0).map((entry) => entry.id)).toEqual(['bed']);
    expect(itemsBetween(sorted.slice(1), 50, 60, 0)).toEqual([]);
  });
  it('keeps a long clip that starts far before the window', () => {
    const many = [item('bed', 0, 2600), ...Array.from({ length: 2000 }, (_, index) => item(`c${index}`, index + 1, index + 1.5))];
    expect(itemsBetween(many, 1500.2, 1500.4, 0).map((entry) => entry.id)).toEqual(['bed', 'c1499']);
  });
  it('reaches back by the slack for an item drawn wider than its time', () => {
    expect(itemsBetween(sorted.slice(1), 12.4, 13, 0)).toEqual([]);
    expect(itemsBetween(sorted.slice(1), 12.4, 13, 0.5).map((entry) => entry.id)).toEqual(['a']);
  });
});

describe('itemBox', () => {
  it('puts the left edge on the start and never draws narrower than the minimum', () => {
    expect(itemBox(item('a', 10, 12), 50)).toEqual({ left: 500, width: 100 });
    expect(itemBox(item('a', 10, 10.1), 50)).toEqual({ left: 500, width: 28 });
  });
});

describe('timelineLayout', () => {
  const blocks = captionBlocksFromAsr([{ start: 0, end: 2, text: 'one' }, { start: 2, end: 4, text: 'two' }, { start: 9, end: 12, text: 'past the end' }]);
  const comp = { width: 1920, height: 1080, theme: 'general', video: null, shots: [], blocks } as unknown as Composition;
  const layout = timelineLayout({ comp, metrics, durationSec: 10, transitionsEditable: true, audioDropLane: false });

  it('gives an empty project its story lane and the captions a lane under it', () => {
    expect(layout.lanes.map((lane) => lane.key)).toEqual([0, CAP_LANE]);
    expect(layout.lanes[0]).toMatchObject({ top: 0, height: metrics.rowH, kind: 'video' });
    expect(layout.lanes[1]).toMatchObject({ top: metrics.rowH + metrics.rowGap, height: metrics.rowH, kind: 'caption' });
    expect(layout.tracksHeight).toBe(metrics.rowH * 2 + metrics.rowGap);
    expect(layout.transitionLane).toBeNull();
  });
  it('places each caption on that lane, cut at the end of the project', () => {
    const captions = layout.byKind.caption;
    expect(captions.map((caption) => [caption.startSec, caption.endSec])).toEqual(blocks.map((block) => [block.startSec, Math.min(10, block.startSec + block.durationSec)]));
    expect(captions.at(-1)!.endSec).toBe(10);
    expect(captions.every((caption) => caption.top === layout.lanes[1]!.top + 4 && caption.height === metrics.rowH - 8)).toBe(true);
    expect(layout.items).toHaveLength(3);
  });
  it('shows a lane to drop sound on while an audio asset is dragged', () => {
    const dragging = timelineLayout({ comp, metrics, durationSec: 10, transitionsEditable: true, audioDropLane: true });
    expect(dragging.lanes.at(-1)).toMatchObject({ audio: true, height: metrics.audioRowH });
  });
});
