import { describe, expect, it } from 'vitest';
import {
  segmentSourceRate,
  segmentSourceTimeAt,
  segmentTimelineEnd,
  segmentTimelineStart,
  segmentTimelineTimeAt,
} from './video-segment-time';

describe('native video segment time mapping', () => {
  it('maps a source range proportionally across explicit V2 frame geometry', () => {
    const segment = { srcStart: 10, srcEnd: 14, timelineStart: 2, timelineEnd: 10 };
    const start = segmentTimelineStart(segment, 0);
    const end = segmentTimelineEnd(segment, start);
    expect(segmentSourceRate(segment, start, end)).toBe(0.5);
    expect(segmentSourceTimeAt(segment, 6, start, end)).toBe(12);
    expect(segmentTimelineTimeAt(segment, 13, start, end)).toBe(8);
  });

  it('retains the contiguous one-to-one fallback for legacy segments', () => {
    const segment = { srcStart: 3, srcEnd: 5 };
    const start = segmentTimelineStart(segment, 7);
    const end = segmentTimelineEnd(segment, start);
    expect(start).toBe(7);
    expect(end).toBe(9);
    expect(segmentSourceTimeAt(segment, 8, start, end)).toBe(4);
  });
});
