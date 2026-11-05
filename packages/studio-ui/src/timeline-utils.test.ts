import { describe, expect, it } from 'vitest';
import {
  isTimelineDensity,
  TIMELINE_METRICS,
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

  it('keeps tiles square on a slowed or sped-up clip and samples the source by its speed', () => {
    const strip = Array.from({ length: 12 }, (_, index) => ({ t: index * 0.25, url: `frame-${index}` }));
    // 3 s of source slowed to 6 s of timeline at 50 px/s, 1 s tiles: six 50 px tiles, half a source second apart.
    const slow = visibleStripTiles(strip, 0, 3, 1, 50, 10, 10, 16, 16);
    expect(slow.map((tile) => tile.width)).toEqual(Array(6).fill(50));
    expect(slow.map((tile) => tile.left)).toEqual([0, 50, 100, 150, 200, 250]);
    expect(slow.map((tile) => tile.url)).toEqual(['frame-1', 'frame-3', 'frame-5', 'frame-7', 'frame-9', 'frame-11']);
    // The same source at 2× covers 1.5 s of timeline: two tiles of the same size.
    const fast = visibleStripTiles(strip, 0, 3, 1, 50, 10, 10, 11.5, 11.5);
    expect(fast.map((tile) => tile.width)).toEqual([50, 50]);
    expect(fast.at(-1)!.left + fast.at(-1)!.width).toBeGreaterThanOrEqual(75);
  });

  it('continues one strip across the halves of a split slowed clip', () => {
    const strip = Array.from({ length: 12 }, (_, index) => ({ t: index * 0.25, url: `frame-${index}` }));
    const whole = visibleStripTiles(strip, 0, 3, 1, 50, 0, 0, 6, 6);
    const right = visibleStripTiles(strip, 1.5, 3, 1, 50, 3, 3, 6, 6);
    expect(right.map((tile) => tile.url)).toEqual(whole.slice(3).map((tile) => tile.url));
    expect(right[0]!.left).toBe(0);
  });
});

describe('TIMELINE_METRICS', () => {
  it('compact is no taller than comfortable anywhere and still fits a chip label', () => {
    const { comfortable, compact } = TIMELINE_METRICS;
    for (const key of Object.keys(comfortable) as (keyof typeof comfortable)[]) {
      expect(compact[key], key).toBeLessThanOrEqual(comfortable[key]);
    }
    // The music chip keeps its 14px label strip plus a visible waveform body.
    expect(compact.audioRowH - 4 - 14).toBeGreaterThanOrEqual(8);
    // Video cards keep a thumbnail above the wave strip.
    expect(compact.sceneH - compact.scenePadT - compact.scenePadB - compact.sceneWaveH).toBeGreaterThanOrEqual(24);
    expect(isTimelineDensity('compact')).toBe(true);
    expect(isTimelineDensity('dense')).toBe(false);
  });
});
