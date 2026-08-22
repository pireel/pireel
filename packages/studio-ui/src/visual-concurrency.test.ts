import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './visual';

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
