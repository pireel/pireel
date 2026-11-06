import { describe, expect, it } from 'vitest';
import { onScreenTogether } from './look-fit';

describe('onScreenTogether', () => {
  it('does not count graphics that only meet at a frame boundary', () => {
    // 528/30 + 239/30 is a hair over 767/30 in floating point.
    expect(onScreenTogether({ startSec: 528 / 30, durationSec: 239 / 30 }, { startSec: 767 / 30, durationSec: 60 / 30 })).toBe(false);
    expect(onScreenTogether({ startSec: 0, durationSec: 2 }, { startSec: 1.9, durationSec: 1 })).toBe(true);
  });
});
