import { describe, expect, it } from 'vitest';
import {
  areReviewFramesSimilar,
  compareReviewFingerprints,
  fingerprintReviewPixels,
  groupSimilarReviewFrames,
} from './review-similarity';

function pixels(width: number, height: number, paint: (x: number, y: number) => [number, number, number]) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const [r, g, b] = paint(x, y);
      out[index] = r;
      out[index + 1] = g;
      out[index + 2] = b;
      out[index + 3] = 255;
    }
  }
  return out;
}

const fp = (data: Uint8ClampedArray, width = 64, height = 64) => {
  const value = fingerprintReviewPixels(data, width, height);
  expect(value).not.toBeNull();
  return value!;
};

describe('local rendered-frame similarity', () => {
  it('treats identical frames and tiny localized talking-head motion as similar', () => {
    const base = fp(pixels(64, 64, (x, y) => (x > 20 && x < 44 && y > 8 ? [180, 130, 100] : [30, 35, 45])));
    const mouthMove = fp(
      pixels(64, 64, (x, y) => {
        if (x >= 30 && x < 34 && y >= 35 && y < 38) return [120, 40, 45];
        return x > 20 && x < 44 && y > 8 ? [180, 130, 100] : [30, 35, 45];
      }),
    );
    expect(areReviewFramesSimilar(base, base)).toBe(true);
    expect(areReviewFramesSimilar(base, mouthMove)).toBe(true);
    expect(compareReviewFingerprints(base, mouthMove).colorDistance).toBeLessThan(0.01);
  });

  it('keeps a changed scene distinct even when its average brightness is close', () => {
    const left = fp(pixels(64, 64, (x) => (x < 32 ? [220, 80, 40] : [20, 80, 220])));
    const right = fp(pixels(64, 64, (x) => (x < 32 ? [20, 80, 220] : [220, 80, 40])));
    expect(areReviewFramesSimilar(left, right)).toBe(false);
  });

  it('groups only locally similar frames with the same visible-content signature', () => {
    const still = fp(pixels(64, 64, () => [60, 80, 100]));
    const changed = fp(pixels(64, 64, (x) => (x < 32 ? [240, 240, 240] : [10, 10, 10])));
    const groups = groupSimilarReviewFrames([
      { atSec: 1, expected: 'no overlays', fingerprint: still },
      { atSec: 5, expected: 'no overlays', fingerprint: still },
      { atSec: 9, expected: 'overlays: title', fingerprint: still },
      { atSec: 13, expected: 'no overlays', fingerprint: changed },
      { atSec: 17, expected: 'no overlays' },
    ]);
    expect(groups.map((group) => [group.representative.atSec, group.similar.map((frame) => frame.atSec)])).toEqual([
      [1, [5]],
      [9, []],
      [13, []],
      [17, []],
    ]);
  });

  it('forceCloudAll disables local collapsing for exact per-moment inspection', () => {
    const still = fp(pixels(64, 64, () => [60, 80, 100]));
    const frames = [
      { atSec: 1, expected: 'same', fingerprint: still },
      { atSec: 2, expected: 'same', fingerprint: still },
    ];
    expect(groupSimilarReviewFrames(frames, { forceCloudAll: true })).toHaveLength(2);
  });
});
