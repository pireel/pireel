import { expect, it } from 'vitest';
import { erasureCost, erasureCoefficients } from './erasure-pricing';
const unit = 72000;
const video = { durationSec: 60, fps: 30, width: 1920, height: 1080 };
it('charges the three base supplier costs with one whole-order conversion and no markup', () => {
  expect(erasureCost('lite', 500000, video, unit)).toMatchObject({ costCny: .5, credits: 7 });
  expect(erasureCost('standard', 1500000, video, unit)).toMatchObject({ costCny: 1.5, credits: 21 });
  expect(erasureCost('precise', 3000000, video, unit)).toMatchObject({ costCny: 3, credits: 42 });
  expect(erasureCost('lite', 500000, { ...video, durationSec: 8.64 }, unit).credits).toBe(1);
});
it('accounts for low FPS, low resolution, portrait pixels and higher-frame-rate coefficients', () => {
  const low = { ...video, fps: 24, width: 720, height: 1280 };
  expect(erasureCost('standard', 1500000, low, unit)).toMatchObject({ costCny: .72, credits: 10, fpsFactor: .8, resolutionFactor: .6 });
  expect(erasureCost('lite', 500000, low, unit)).toMatchObject({ costCny: .4, credits: 6, resolutionFactor: 1 });
  expect(erasureCost('precise', 3000000, { ...video, fps: 60, width: 3840, height: 2160 }, unit)).toMatchObject({ costCny: 12, credits: 167 });
  expect(erasureCoefficients('standard', { ...video, fps: 24.001 }).fpsFactor).toBe(1);
  expect(erasureCoefficients('standard', { ...video, fps: 30.001 }).fpsFactor).toBe(2);
  expect(erasureCost('precise', 3000000, { ...video, width: 1080, height: 1920 }, unit)).toEqual(erasureCost('precise', 3000000, video, unit));
});
it('rejects missing or invalid actual metering instead of treating it as free', () => {
  for (const patch of [{ fps: 0 }, { durationSec: NaN }, { height: Infinity }, { width: 8000 }]) expect(() => erasureCost('lite', 500000, { ...video, ...patch }, unit)).toThrow();
});
