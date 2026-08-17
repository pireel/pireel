import { describe, expect, it } from 'vitest';
import { normalizeDims } from './workbench-utils';

describe('workbench canvas dimensions', () => {
  it('falls back to a 16:9 canvas when source dimensions are unavailable', () => {
    expect(normalizeDims(0, 0)).toEqual({ width: 1920, height: 1080 });
  });

  it('continues to follow a source with known dimensions', () => {
    expect(normalizeDims(1080, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(normalizeDims(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });
});
