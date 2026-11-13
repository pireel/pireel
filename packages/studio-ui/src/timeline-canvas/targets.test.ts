import { describe, expect, it } from 'vitest';
import type { Composition } from '@pireel/studio-engine/composition';
import type { TimelineTrackState } from '../studio-timeline';
import { TIMELINE_METRICS } from '../timeline-utils';
import { type TimelineItem, timelineLayout, visualLaneKey } from './layout';
import { blockMoveTarget, dropRows, edgeAt, insertionLineTop, newVisualTarget, visualMoveTarget } from './targets';

const metrics = TIMELINE_METRICS.comfortable;
const track = (trackId: string, timelineIndex: number, type: TimelineTrackState['type'], stackOrder: number, extra: Partial<TimelineTrackState> = {}): TimelineTrackState =>
  ({ trackId, timelineIndex, type, stackOrder, hidden: false, muted: false, ...extra });
// Top to bottom: a graphics lane, a media lane, the story spine.
const trackStates = [
  track('graphics', 0, 'graphics', 3),
  track('media', 1, 'visual', 2, { clips: [{ clipId: 'clip', startSec: 1, endSec: 3, kind: 'image', sourceInSec: 0, sourceOutSec: 2, enabled: true }] }),
  track('spine', 2, 'visual', 0, { role: 'primaryNarrative' }),
];
const comp = { width: 1920, height: 1080, theme: 'general', video: null, shots: [], blocks: [] } as unknown as Composition;
const layout = timelineLayout({ comp, metrics, durationSec: 10, trackStates, transitionsEditable: false, audioDropLane: false });
const rows = dropRows(layout);
const middle = (trackId: string) => { const row = rows.find((candidate) => candidate.trackId === trackId)!; return row.top + row.height / 2; };

describe('edgeAt', () => {
  const item = (kind: 'block' | 'caption' | 'shot', startSec: number, endSec: number) => ({ kind, id: 'a', lane: 0, startSec, endSec, top: 0, height: 10, minWidth: 8, gapRight: 0 }) as unknown as TimelineItem;
  it('finds an edge within the handle and nothing in the body', () => {
    expect(edgeAt(item('block', 1, 3), 103, 100)).toBe('left');
    expect(edgeAt(item('block', 1, 3), 200, 100)).toBeNull();
    expect(edgeAt(item('block', 1, 3), 296, 100)).toBe('right');
    expect(edgeAt(item('shot', 1, 3), 107, 100)).toBe('left'); // a shot's handles are wider
    expect(edgeAt(item('block', 1, 3), 107, 100)).toBeNull();
  });
  it('gives a card narrower than two handles to its right edge, and a narrow caption no edge', () => {
    expect(edgeAt(item('block', 1, 1.1), 105, 100)).toBe('right');
    expect(edgeAt(item('caption', 1, 1.1), 105, 100)).toBeNull();
  });
});

describe('drop targets', () => {
  it('lists the lanes that have a track, top to bottom', () => {
    expect(rows.map((row) => row.trackId)).toEqual(['graphics', 'media', 'spine']);
  });
  it('lands media on a media lane, on the spine only when allowed, and makes a lane elsewhere', () => {
    expect(visualMoveTarget(layout, rows, middle('media'), true, metrics.visualSceneH)).toEqual({ kind: 'visual', trackId: 'media' });
    expect(visualMoveTarget(layout, rows, middle('spine'), true, metrics.visualSceneH)).toEqual({ kind: 'primary' });
    expect(visualMoveTarget(layout, rows, middle('spine'), false, metrics.visualSceneH).kind).toBe('visual-new');
    expect(visualMoveTarget(layout, rows, middle('graphics'), true, metrics.visualSceneH).kind).toBe('visual-new');
  });
  it('stacks a new lane between its neighbours', () => {
    expect(newVisualTarget(layout, rows, 1)).toEqual({ kind: 'visual-new', stackOrder: 2.5, slot: 1 });
    expect(newVisualTarget(layout, rows, 0)).toEqual({ kind: 'visual-new', stackOrder: 4, slot: 0 });
    expect(insertionLineTop(rows, 1)).toBe((rows[0]!.top + rows[0]!.height + rows[1]!.top) / 2);
  });
  it('lands a graphic on a graphics lane, in a gap as a new lane, and nowhere over the spine without one', () => {
    expect(blockMoveTarget(layout, rows, middle('graphics'), metrics.rowH, true)).toEqual({ to: visualLaneKey('graphics'), gap: null });
    expect(blockMoveTarget(layout, rows, middle('media'), metrics.rowH, true)?.gap?.kind).toBe('new-track');
    expect(blockMoveTarget(layout, rows, middle('media'), metrics.rowH, false)).toBeNull();
  });
});
