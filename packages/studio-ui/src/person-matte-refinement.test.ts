import { expect, it } from 'vitest';
import { matteInputSize, refinePersonAlpha } from './person-matte-refinement';
it('preserves portrait detail while bounding model size and keeping strides valid', () => {
  expect(matteInputSize(1080, 1920)).toEqual({ width: 512, height: 896 });
  expect(matteInputSize(432, 768)).toEqual({ width: 416, height: 768 });
  expect(matteInputSize(1920, 1080)).toEqual({ width: 896, height: 512 });
  for (const [w, h] of [[4000, 500], [100, 100], [1, 9], [8000, 8000]]) {
    const size = matteInputSize(w!, h!);
    expect(size.width % 32).toBe(0); expect(size.height % 32).toBe(0);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(1024);
  }
});
it('removes only faint haze and preserves opaque skin and fractional fine strands', () => {
  const values = new Float32Array([0, .01, .25, .5, .75, .99, 1]);
  const result = refinePersonAlpha(values, new Uint8ClampedArray(values.length * 4).fill(100), values.length, 1);
  expect(result[3]).toBe(0); expect(result[7]).toBe(0);
  expect(result[23]).toBe(255); expect(result[27]).toBe(255);
  for (let i = 2; i <= 4; i++) expect(Math.abs(result[i * 4 + 3]! / 255 - values[i]!)).toBeLessThan(.06);
});
it('reduces alpha noise in same-color regions without bleeding across a strong image boundary', () => {
  const alpha = new Float32Array([.3, .35, .3]);
  const same = new Uint8ClampedArray(12).fill(100);
  const filtered = refinePersonAlpha(alpha, same, 3, 1);
  expect(filtered[7]! / 255).toBeLessThan(.34);
  const colors = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  const boundary = refinePersonAlpha(new Float32Array([0, .5, .5]), colors, 3, 1);
  expect(boundary[3]).toBe(0); expect(boundary[7]).toBeCloseTo(128, 0);
});
it('handles corrupt model values and refuses incompatible shapes', () => {
  expect([...refinePersonAlpha(new Float32Array([NaN, Infinity, -1]), new Uint8ClampedArray(12), 3, 1)]).toEqual(new Array(12).fill(0));
  expect(() => refinePersonAlpha(new Float32Array(1), new Uint8ClampedArray(4), 2, 1)).toThrow('尺寸不匹配');
});
