import { describe, expect, it } from 'vitest';
import { softClip } from './export-audio-mix';

describe('导出软限幅', () => {
  it('拐点以下逐字不动:正常素材完全不经手', () => {
    for (const v of [0, 0.05, -0.3, 0.5, 0.79, -0.8, 0.8]) expect(softClip(v)).toBe(v);
  });

  it('拐点以上压向 1.0 但永不越界,也不压成平顶(硬 clamp 的方波=爆音)', () => {
    expect(softClip(0.9)).toBeGreaterThan(0.8);
    expect(softClip(0.9)).toBeLessThan(1);
    expect(softClip(4)).toBeLessThan(1);
    expect(softClip(1e6)).toBeLessThanOrEqual(1);
    // 峰越大结果越大:平顶会让两个不同的峰输出同一个值(信息被抹平=失真)
    expect(softClip(2)).toBeGreaterThan(softClip(1.2));
    expect(softClip(1.2)).toBeGreaterThan(softClip(1));
  });

  it('奇对称 + 拐点处斜率连续(接不上会自己产生一个折角)', () => {
    for (const v of [0.85, 1.4, 3]) expect(softClip(-v)).toBeCloseTo(-softClip(v), 12);
    const e = 1e-6;
    const slopeBelow = (softClip(0.8) - softClip(0.8 - e)) / e;
    const slopeAbove = (softClip(0.8 + e) - softClip(0.8)) / e;
    expect(slopeAbove).toBeCloseTo(slopeBelow, 4);
  });
});
