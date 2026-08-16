import { describe, expect, it } from 'vitest';
import { monotonicPlaybackSecond } from './playhead';

describe('monotonicPlaybackSecond', () => {
  it('ignores a delayed playback clock instead of moving the playhead backwards', () => {
    expect(monotonicPlaybackSecond(4.12, 4.06)).toBe(4.12);
  });

  it('accepts a newer playback clock', () => {
    expect(monotonicPlaybackSecond(4.12, 4.18)).toBe(4.18);
  });
});
