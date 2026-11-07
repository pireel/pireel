import { describe, expect, it } from 'vitest';
import { FOOTAGE_SHOT_SEC, footageWindows } from './footage-windows';

describe('footageWindows', () => {
  it('takes each shot between cuts, with frames at its start, middle and end', () => {
    const windows = footageWindows([4, 8], 12, 8);
    expect(windows.map(({ start, end }) => [start, end])).toEqual([[0, 4], [4, 8], [8, 12]]);
    expect(windows[1]!.frames.map((t) => +t.toFixed(2))).toEqual([4.6, 6, 7.4]);
  });

  it('uses the middle five seconds of a long shot, and splits a long take', () => {
    const windows = footageWindows([], 30, 8);
    expect(windows).toHaveLength(3);
    for (const window of windows) expect(window.end - window.start).toBeCloseTo(FOOTAGE_SHOT_SEC);
    expect(windows[0]!.start).toBeCloseTo(2.5);
  });

  it('ignores cuts at the very ends, and keeps at most maxShots spread over the file', () => {
    expect(footageWindows([0.1, 11.95], 12, 8)).toHaveLength(1);
    const cuts = Array.from({ length: 59 }, (_, i) => (i + 1) * 4);
    const windows = footageWindows(cuts, 240, 8);
    expect(windows).toHaveLength(8);
    expect(windows[0]!.start).toBe(0);
    expect(windows.at(-1)!.start).toBeGreaterThan(200);
  });
});
