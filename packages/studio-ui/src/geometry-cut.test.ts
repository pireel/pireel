import { describe, expect, it } from 'vitest';
import { pictureCutFrame } from './geometry';

/** Frame-to-frame change at 24 fps, measured on a real talk (32×18 thumbnails). */
const run = (first: number, values: number[]) => values.map((change, index) => ({ t: (first + index) / 24, change }));

describe('pictureCutFrame', () => {
  it('keeps a hard cut on its own frame, never a fraction of a millisecond before it', () => {
    // 5732 / 24 = 238.8333…: rounded down, a clip starting there would open on frame 5731, the previous shot.
    const cut = pictureCutFrame(run(5728, [0, 0, 0, 0, 46.4, 0.1, 0.1]))!;
    expect(cut).toBe(238.834);
    expect(cut).toBeGreaterThanOrEqual(5732 / 24);
    expect(pictureCutFrame(run(5285, [0, 0, 0, 0, 24.9, 0.3]))).toBe(220.375);
  });

  it('puts a wipe on the first frame that changes, not its middle', () => {
    expect(pictureCutFrame(run(5779, [0.2, 0.1, 2.3, 5.6, 19.3, 48.8, 51.7, 49.5, 36.6, 24.6, 15.5, 7.5, 2.1, 0.2]))).toBeCloseTo(5782 / 24);
  });

  it('finds no cut where the picture only moves', () => {
    expect(pictureCutFrame(run(5512, [0.1, 1.8, 2, 1.5, 0.9]))).toBeNull();
    expect(pictureCutFrame([])).toBeNull();
  });
});
