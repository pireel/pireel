import { describe, expect, it } from 'vitest';
import { MAX_SOURCE_DURATION_SEC, sourceTooLong } from './source-length';

describe('source length', () => {
  it('takes a recording of exactly two hours and refuses one past it', () => {
    expect(MAX_SOURCE_DURATION_SEC).toBe(2 * 60 * 60);
    expect(sourceTooLong(91 * 60)).toBe(false);
    expect(sourceTooLong(MAX_SOURCE_DURATION_SEC)).toBe(false);
    expect(sourceTooLong(MAX_SOURCE_DURATION_SEC + 0.5)).toBe(true);
  });

  it('does not call a length it could not read too long', () => {
    expect(sourceTooLong(undefined)).toBe(false);
    expect(sourceTooLong(null)).toBe(false);
    expect(sourceTooLong(Number.NaN)).toBe(false);
  });
});
