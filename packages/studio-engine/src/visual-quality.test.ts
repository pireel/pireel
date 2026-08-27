import { describe, expect, it } from 'vitest';
import { buildVisualQualityWindows, type FrameQualityObservation } from './visual-quality';

const sample = (timeSec: number, quality: number, subjectPresence = 1): FrameQualityObservation => ({
  timeSec,
  sharpness: quality,
  exposure: quality,
  stability: quality,
  subjectPresence,
});

describe('buildVisualQualityWindows', () => {
  it('ranks sustained clean ranges above a good midpoint with bad edge frames', () => {
    const observations = [
      sample(0, 0.2), sample(0.5, 0.95), sample(1, 0.95), sample(1.5, 0.2),
      sample(2, 0.82), sample(2.5, 0.84), sample(3, 0.83), sample(3.5, 0.82),
    ];
    const windows = buildVisualQualityWindows(observations, 4, [], { maxWindows: 2 });
    expect(windows[0]).toMatchObject({ rank: 1, startSec: 1.75, endSec: 3.25, score: 82 });
    expect(windows[0]!.score).toBeGreaterThan(windows[1]!.score);
  });

  it('never returns a candidate that crosses a real scene cut', () => {
    const observations = Array.from({ length: 13 }, (_, index) => sample(index * 0.5, 0.9));
    const windows = buildVisualQualityWindows(observations, 6.5, [3], { maxWindows: 6 });
    expect(windows.length).toBeGreaterThan(0);
    expect(windows.every((window) => window.endSec <= 3 || window.startSec >= 3)).toBe(true);
  });

  it('reports subject presence separately from technical score', () => {
    const absent = buildVisualQualityWindows([sample(0, 0.9, 0), sample(0.5, 0.9, 0), sample(1, 0.9, 0)], 1.5)[0]!;
    const present = buildVisualQualityWindows([sample(0, 0.9, 1), sample(0.5, 0.9, 1), sample(1, 0.9, 1)], 1.5)[0]!;
    expect(absent.score).toBe(present.score);
    expect(absent.subjectPresence).toBe(0);
    expect(present.subjectPresence).toBe(1);
  });
});
