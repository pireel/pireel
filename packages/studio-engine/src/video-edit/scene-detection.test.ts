import { describe, expect, it } from 'vitest';
import { consolidateSceneCuts } from './scene-detection';

const at = (timestamp: number, score: number) => ({ timestamp, score });
const INTERVAL = 0.2; // 5 fps sampling

describe('consolidateSceneCuts', () => {
  it('keeps isolated over-threshold samples as cuts', () => {
    const cuts = consolidateSceneCuts([at(3.0, 80), at(9.4, 45)], INTERVAL);
    expect(cuts.map((c) => c.timestamp)).toEqual([3.0, 9.4]);
  });

  it('treats a run of consecutive flagged samples as motion, not a cut every sample', () => {
    // handheld greenhouse footage: every 0.2s sample over the threshold for 3 seconds
    const run = Array.from({ length: 15 }, (_, i) => at(0.4 + i * INTERVAL, 30 + (i % 3) * 4));
    expect(consolidateSceneCuts(run, INTERVAL)).toEqual([]);
  });

  it('keeps a hard cut that opens a run of movement, and a spike inside one', () => {
    const run = [at(2.0, 110), at(2.2, 34), at(2.4, 38), at(2.6, 33), at(2.8, 36), at(3.0, 31)];
    expect(consolidateSceneCuts(run, INTERVAL).map((c) => c.timestamp)).toEqual([2.0]);
    const interior = [at(5.0, 30), at(5.2, 33), at(5.4, 32), at(5.6, 120), at(5.8, 35), at(6.0, 31)];
    expect(consolidateSceneCuts(interior, INTERVAL).map((c) => c.timestamp)).toEqual([5.6]);
  });

  it('enforces a minimum scene length between kept cuts', () => {
    const cuts = consolidateSceneCuts([at(1.0, 90), at(1.2, 20), at(1.4, 95), at(2.0, 70)], INTERVAL, { minSceneLenSec: 0.5 });
    // 1.0 / 1.2 / 1.4 form one run: 1.0 and 1.4 are spikes over the 20 between them, but 1.4 is
    // within 0.5s of 1.0 and is dropped; 2.0 is far enough.
    expect(cuts.map((c) => c.timestamp)).toEqual([1.0, 2.0]);
  });
});
