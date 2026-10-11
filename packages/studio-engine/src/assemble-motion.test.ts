import { describe, expect, it } from 'vitest';
import { withMotionTiming } from './assemble';

describe('withMotionTiming', () => {
  it('leaves an untouched component alone', () => {
    expect(withMotionTiming("tl.from('#a',{x:1},0);", undefined)).toBe("tl.from('#a',{x:1},0);");
    expect(withMotionTiming("tl.from('#a',{x:1},0);", { speed: 1, delaySec: 0 })).toBe("tl.from('#a',{x:1},0);");
  });

  it('runs the component timeline as a time-scaled, offset child of the block timeline', () => {
    const body = withMotionTiming("tl.from('#a',{x:1},0);", { speed: 2, delaySec: 0.5 });
    expect(body).toContain("(function (tl) {\ntl.from('#a',{x:1},0);\n})(__hfInner);");
    expect(body).toContain('__hfInner.timeScale(2);');
    expect(body).toContain('tl.add(__hfInner, 0.5);');
    expect(withMotionTiming('x', { speed: 99 })).toContain('timeScale(4)');
  });
});
