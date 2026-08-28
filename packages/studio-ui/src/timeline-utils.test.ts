import { describe, expect, it } from 'vitest';
import {
  packedPrimaryPlacement,
  quantizeTimelineFrameSecond,
  timelinePointerSecond,
  timelineResizeSurfaceDuration,
  timelineSourceResizeEnd,
  timelinePlacementOverlaps,
  visibleStripTiles,
} from './timeline-utils';

describe('quantizeTimelineFrameSecond', () => {
  it('picks the nearest exact frame and never returns the exclusive duration edge', () => {
    expect(quantizeTimelineFrameSecond(1.021, 5, 30)).toBe(1 + 1 / 30);
    expect(quantizeTimelineFrameSecond(5, 5, 30)).toBe(5 - 1 / 30);
    expect(quantizeTimelineFrameSecond(-2, 5, 30)).toBe(0);
  });

  it('stays safe for empty or invalid timeline values', () => {
    expect(quantizeTimelineFrameSecond(3, 0, 30)).toBe(0);
    expect(quantizeTimelineFrameSecond(Number.NaN, 5, Number.NaN)).toBe(0);
  });
});

describe('timeline placement rules', () => {
  const spans = [
    { id: 'a', startSec: 2, endSec: 5 },
    { id: 'b', startSec: 8, endSec: 10 },
  ];

  it('treats touching edges as free space but detects a real same-lane overlap', () => {
    expect(timelinePlacementOverlaps(spans, 5, 3)).toBe(false);
    expect(timelinePlacementOverlaps(spans, 4.99, 3)).toBe(true);
    expect(timelinePlacementOverlaps(spans, 2, 3, 'a')).toBe(false);
  });

  it('packs the primary lane from zero regardless of its previous head and middle gaps', () => {
    expect(packedPrimaryPlacement(spans, 'moving', 0, 1)).toEqual({ index: 0, startSec: 0 });
    expect(packedPrimaryPlacement(spans, 'moving', 5, 1)).toEqual({ index: 1, startSec: 3 });
    expect(packedPrimaryPlacement(spans, 'moving', 20, 1)).toEqual({ index: 2, startSec: 5 });
  });

  it('excludes the moving primary clip before choosing its new packed position', () => {
    expect(packedPrimaryPlacement(spans, 'a', 20, 3)).toEqual({ index: 1, startSec: 2 });
  });
});

describe('timeline end resizing', () => {
  it('lets an end handle move beyond the current project duration', () => {
    expect(timelinePointerSecond(14, 10)).toBe(10);
    expect(timelinePointerSecond(14, 10, true)).toBe(14);
  });

  it('adds scrollable tail space while the end handle is active', () => {
    expect(timelineResizeSurfaceDuration(10, 80)).toBeGreaterThan(10);
    expect(timelineResizeSurfaceDuration(10, 80, 10)).toBeGreaterThan(10);
    expect(timelineResizeSurfaceDuration(10, 80, 14)).toBeGreaterThan(14);
  });

  it('stops a media end handle at the remaining source duration', () => {
    expect(timelineSourceResizeEnd(5, 10, 2, 7, 12)).toBe(15);
    expect(timelineSourceResizeEnd(5, 10, 2, 7, undefined)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('visibleStripTiles', () => {
  it('mounts only tiles intersecting the visible timeline window', () => {
    const strip = Array.from({ length: 120 }, (_, index) => ({ t: index + 0.5, url: `frame-${index}` }));
    const visible = visibleStripTiles(strip, 0, 120, 1, 50, 0, 40, 50);
    expect(visible.length).toBeLessThan(15);
    expect(visible[0]?.left).toBe(1_950);
    expect(visible.at(-1)?.left).toBe(2_500);
  });

  it('stretches source-time tiles across a slowed timeline clip', () => {
    const strip = Array.from({ length: 4 }, (_, index) => ({ t: index + 0.5, url: `frame-${index}` }));
    const visible = visibleStripTiles(strip, 0, 3.3, 1, 50, 42.7, 42.7, 48.5, 48.5);
    expect(visible).toHaveLength(4);
    expect(visible[0]).toMatchObject({ left: 0, url: 'frame-0' });
    expect(visible[0]!.width).toBeCloseTo(87.88, 1);
    expect(visible.at(-1)!.left + visible.at(-1)!.width).toBeGreaterThan(290);
  });
});
