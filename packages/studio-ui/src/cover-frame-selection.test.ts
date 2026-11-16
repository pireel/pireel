import { expect, it } from 'vitest';
import { coverFrameAtTime, coverFrameTime, coverFrameIdentity, overviewOrder } from '@pireel/studio-ui/cover-frame-selection';

it('maps edited time to exact source frames across cuts, speed changes and multiple sources', () => {
  const ranges = [{ assetId: 'a', startSec: 0, endSec: 2, sourceInSec: 10, sourceOutSec: 14 }, { assetId: 'b', startSec: 3, endSec: 5, sourceInSec: 20, sourceOutSec: 22 }];
  expect(coverFrameAtTime(ranges, 1, 30)).toEqual({ assetId: 'a', sourceSec: 12, timelineSec: 1 });
  expect(coverFrameAtTime(ranges, 4, 30)).toEqual({ assetId: 'b', sourceSec: 21, timelineSec: 4 });
  const gap = coverFrameAtTime(ranges, 2.2, 30)!;
  expect(gap.assetId).toBe('a'); expect(gap.sourceSec).toBeLessThan(14);
  const end = coverFrameAtTime(ranges, 5, 30)!;
  expect(end.sourceSec).toBeLessThan(22); expect(coverFrameTime(ranges, end)).toBeCloseTo(end.timelineSec!);
  expect(coverFrameAtTime([], 0, 30)).toBeNull();
});
it('does not carry thumbnail pixels or URLs into saved frame identity', () => {
  const frame = { assetId: 'a', sourceSec: 1.25, timelineSec: 0.25, url: 'data:image/jpeg;base64,pixels' };
  expect(coverFrameIdentity(frame)).toEqual({ assetId: 'a', sourceSec: 1.25, timelineSec: 0.25 });
});

it('reads a strip over the whole video first and then in between, every picture once', () => {
  expect(overviewOrder(0)).toEqual([]);
  expect(overviewOrder(1)).toEqual([0]);
  expect(overviewOrder(2)).toEqual([0, 1]);
  expect(overviewOrder(9)).toEqual([0, 8, 4, 2, 6, 1, 3, 5, 7]);
  for (const count of [3, 8, 12, 24]) {
    const order = overviewOrder(count);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: count }, (_, index) => index));
    expect(order.slice(0, 3)).toEqual([0, count - 1, Math.floor((count - 1) / 2)]);
  }
});
