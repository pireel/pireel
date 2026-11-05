import { describe, expect, it } from 'vitest';
import { isSourceSplit, transitionHandleTime } from './composition-core';

describe('transition handles', () => {
  // A long recording split at a camera change: A shows 229.625–238.833, B goes on from 238.833.
  const A = { srcStart: 229.625, srcEnd: 238.833 };
  const B = { srcStart: 238.833, srcEnd: 240.917 };

  it('knows a split from two separate takes', () => {
    expect(isSourceSplit(A, B, true)).toBe(true);
    expect(isSourceSplit(A, { srcStart: 300 }, true)).toBe(false);
    expect(isSourceSplit(A, B, false)).toBe(false);
  });

  it('holds each side of a split on its edge frame: past A is B picture, before B is A picture', () => {
    expect(transitionHandleTime('post', A, 0.2, 1, true)).toBeCloseTo(238.832);
    expect(transitionHandleTime('pre', B, 0.2, 1, true)).toBe(238.833);
  });

  it('reads real handles between separate takes', () => {
    expect(transitionHandleTime('post', A, 0.2, 1, false)).toBeCloseTo(239.033);
    expect(transitionHandleTime('pre', B, 0.2, 2, false)).toBeCloseTo(238.433);
  });
});
