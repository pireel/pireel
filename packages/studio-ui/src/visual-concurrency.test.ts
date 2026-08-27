import { describe, expect, it } from 'vitest';
import { analysisSegmentsFromCuts, mapWithConcurrency } from './visual';

describe('mapWithConcurrency', () => {
  it('preserves result order while bounding active requests', async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return value * 10;
    });

    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });
});

describe('analysisSegmentsFromCuts', () => {
  it('subdivides a long no-cut take without inventing scene cuts', () => {
    const segments = analysisSegmentsFromCuts([], 91);
    expect(segments).toHaveLength(8);
    expect(segments[0]).toEqual({ start: 0, end: 11.375 });
    expect(segments.at(-1)).toEqual({ start: 79.625, end: 91 });
  });

  it('preserves real cut boundaries while subdividing long intervals', () => {
    const segments = analysisSegmentsFromCuts([5], 30);
    expect(segments).toEqual([
      { start: 0, end: 5 },
      { start: 5, end: 13.333333333333334 },
      { start: 13.333333333333334, end: 21.666666666666668 },
      { start: 21.666666666666668, end: 30 },
    ]);
  });
});
