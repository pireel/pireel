import { describe, expect, it } from 'vitest';
import { draggedPlayheadSecond, snapTimelineSecond, timelineSnapPoints } from './timeline-snap';

describe('timeline snapping', () => {
  it('preserves the grab offset inside the timeline but reaches both exact endpoints', () => {
    expect(draggedPlayheadSecond(5, 0.08, 10)).toBe(4.92);
    expect(draggedPlayheadSecond(0, -0.08, 10)).toBe(0);
    expect(draggedPlayheadSecond(10, 0.08, 10)).toBe(10);
  });

  it('collects scene, component and trimmed audio edges', () => {
    const points = timelineSnapPoints(
      12,
      [{ start: 0, end: 4.5 }],
      [{ startSec: 2.25, durationSec: 1.5 }],
      [{ id: 'music', src: 'music.mp3', durationSec: 8, startSec: 6, inSec: 1, outSec: 5, speed: 2 }],
    );
    expect(points).toEqual(expect.arrayContaining([0, 2.25, 3.75, 4.5, 6, 8, 12]));
    expect(points).not.toContain(7);
  });

  it('snaps inside seven pixels and leaves a dragged playhead free from its previous position', () => {
    expect(snapTimelineSecond(4.94, [5], { pps: 100 })).toEqual({ second: 5, hit: 5 });
    expect(snapTimelineSecond(4.91, [5], { pps: 100 })).toEqual({ second: 4.91, hit: null });
    expect(snapTimelineSecond(4.94, [5], { pps: 100, dynamicPoints: [4.9], exclude: [5] })).toEqual({ second: 4.9, hit: 4.9 });
  });

  it('holds an acquired magnet until the pointer crosses a wider release radius', () => {
    expect(snapTimelineSecond(5.1, [5], { pps: 100, lockedPoint: 5 })).toEqual({ second: 5, hit: 5 });
    expect(snapTimelineSecond(5.13, [5], { pps: 100, lockedPoint: 5 })).toEqual({ second: 5.13, hit: null });
  });

  it('acquires the playhead from the wider NLE-style magnetic radius', () => {
    expect(snapTimelineSecond(5.11, [], { pps: 100, dynamicPoints: [5] })).toEqual({ second: 5, hit: 5 });
  });
});
