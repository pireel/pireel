import { describe, expect, it } from 'vitest';
import { readingWindows, spokenLines, spread } from './brand-facts';
import { WINDOWS } from './brand-method';

describe('brand facts', () => {
  it('splits words into lines at pauses and long runs', () => {
    const words = [{ text: 'a', start: 0, end: 0.3 }, { text: 'b', start: 0.4, end: 0.7 }, { text: 'c', start: 1.5, end: 1.8 }];
    expect(spokenLines(words)).toEqual([{ index: 0, startSec: 0, endSec: 0.7, text: 'a b' }, { index: 1, startSec: 1.5, endSec: 1.8, text: 'c' }]);
  });

  it('spreads times evenly and reads a video through overview, ends and moments', () => {
    expect(spread(0, 1, 3)).toEqual([0, 0.5, 1]);
    const windows = readingWindows(60, [{ startSec: 20, endSec: 24, why: 'x' }]);
    expect(windows.overview).toHaveLength(16);
    expect(windows.strips.map(strip => strip.role)).toEqual(['opening strip', 'ending strip', 'moment 1 strip']);
    expect(windows.strips[2]!.times).toHaveLength(WINDOWS.framesPerWindow);
  });
});
