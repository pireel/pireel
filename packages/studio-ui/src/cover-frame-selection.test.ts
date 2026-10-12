import { expect, it } from 'vitest';
import { coverFrameAtTime, coverFrameTime, coverFrameIdentity } from './cover-frame-selection';

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
