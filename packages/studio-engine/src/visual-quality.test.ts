import { describe, expect, it } from 'vitest';
import {
  buildVisualQualityWindows,
  fineQualitySampleTimes,
  frameStabilityScore,
  type FrameQualityObservation,
} from './visual-quality';

const sample = (timeSec: number, quality: number, subjectPresence = 1): FrameQualityObservation => ({
  timeSec,
  sharpness: quality,
  exposure: quality,
  stability: quality,
  subjectPresence,
});

describe('buildVisualQualityWindows', () => {
  it('keeps the sustained clean range and rejects the pretty midpoint with bad edges', () => {
    const observations = [
      sample(0, 0.2), sample(0.5, 0.95), sample(1, 0.95), sample(1.5, 0.2),
      sample(2, 0.82), sample(2.5, 0.84), sample(3, 0.83), sample(3.5, 0.82),
    ];
    const windows = buildVisualQualityWindows(observations, 4, [], { maxWindows: 2 });
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ rank: 1, startSec: 1.75, endSec: 3.75, score: 82 });
    expect(windows[0]!.edgeScore).toBeGreaterThanOrEqual(80);
    expect(windows[0]!.hardFailureFraction).toBe(0);
  });

  it('never returns a candidate that crosses a real scene cut', () => {
    const observations = Array.from({ length: 13 }, (_, index) => sample(index * 0.5, 0.9));
    const windows = buildVisualQualityWindows(observations, 6.5, [3], { maxWindows: 6 });
    expect(windows.length).toBeGreaterThan(0);
    expect(windows.every((window) => window.endSec <= 3 || window.startSec >= 3)).toBe(true);
  });

  it('preserves a long clean interval as reusable capacity instead of forcing a final short shot', () => {
    const observations = Array.from({ length: 41 }, (_, index) => sample(index * 0.25, 0.9));
    const [reservoir] = buildVisualQualityWindows(observations, 10.25, [], { maxWindows: 1 });
    expect(reservoir!.endSec - reservoir!.startSec).toBeGreaterThan(9.5);
  });

  it('reports subject presence separately from technical score', () => {
    const absent = buildVisualQualityWindows([sample(0, 0.9, 0), sample(0.5, 0.9, 0), sample(1, 0.9, 0)], 1.5)[0]!;
    const present = buildVisualQualityWindows([sample(0, 0.9, 1), sample(0.5, 0.9, 1), sample(1, 0.9, 1)], 1.5)[0]!;
    expect(absent.score).toBe(present.score);
    expect(absent.subjectPresence).toBe(0);
    expect(present.subjectPresence).toBe(1);
  });

  it('carries centeredness as editorial evidence without changing technical score', () => {
    const left = Array.from({ length: 4 }, (_, index): FrameQualityObservation => ({
      ...sample(index * 0.5, 0.9),
      subjectCenteredness: 0.2,
    }));
    const centered = left.map((entry) => ({ ...entry, subjectCenteredness: 0.95 }));
    const leftWindow = buildVisualQualityWindows(left, 2)[0]!;
    const centeredWindow = buildVisualQualityWindows(centered, 2)[0]!;
    expect(leftWindow.score).toBe(centeredWindow.score);
    expect(leftWindow.subjectCenteredness).toBeCloseTo(0.2);
    expect(centeredWindow.subjectCenteredness).toBeCloseTo(0.95);
  });

  it('returns no candidate when the whole source is below the absolute quality floor', () => {
    const observations = Array.from({ length: 12 }, (_, index) => sample(index * 0.25, 0.4));
    expect(buildVisualQualityWindows(observations, 3)).toEqual([]);
    expect(buildVisualQualityWindows(observations, 3, [], { enforceThresholds: false }).length).toBeGreaterThan(0);
  });

  it('rejects a range containing even one severe failure after dense refinement', () => {
    const observations = Array.from({ length: 13 }, (_, index) => sample(index / 6, index === 6 ? 0.05 : 0.85));
    expect(buildVisualQualityWindows(observations, 2.1)).toEqual([]);
  });

  it('rejects a hidden single-metric failure even when the composite average is high', () => {
    const observations = Array.from({ length: 10 }, (_, index): FrameQualityObservation => ({
      timeSec: index * 0.2,
      sharpness: 0.15,
      exposure: 0.95,
      stability: 0.95,
      subjectPresence: 1,
    }));
    expect(buildVisualQualityWindows(observations, 2)).toEqual([]);
  });

  it('builds a bounded fine-scan plan across distant coarse candidates', () => {
    const windows = [
      { startSec: 1, endSec: 4 },
      { startSec: 40, endSec: 43 },
      { startSec: 80, endSec: 83 },
    ];
    const stamps = fineQualitySampleTimes(windows, 100, { fps: 8, paddingSec: 0.25, maxFrames: 24 });
    expect(stamps.length).toBeLessThanOrEqual(24);
    expect(stamps.some((stamp) => stamp < 4.3)).toBe(true);
    expect(stamps.some((stamp) => stamp > 39.7 && stamp < 43.3)).toBe(true);
    expect(stamps.some((stamp) => stamp > 79.7)).toBe(true);
  });

  it('scores a consistent tracking move above direction-reversing shake', () => {
    const pan = frameStabilityScore({ dx: 3, dy: 0 }, { dx: 3, dy: 0 }, 0.08);
    const shake = frameStabilityScore({ dx: -3, dy: 0 }, { dx: 3, dy: 0 }, 0.08);
    expect(pan).toBeGreaterThan(0.75);
    expect(shake).toBeLessThan(0.25);
  });
});
