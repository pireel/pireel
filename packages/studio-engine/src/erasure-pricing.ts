import { t } from './i18n';
export type ErasureTier = 'lite' | 'standard' | 'precise';
export const ERASURE_TIERS = [
  { id: 'lite' },
  { id: 'standard' },
  { id: 'precise' },
] as const;
/** A tier's name and what it suits, in the engine catalog. */
export const erasureTierKeys = (tier: ErasureTier) => ({ name: `engine.erasureTier.${tier}`, detail: `engine.erasureTier.${tier}Detail` });
export const ERASURE_OUTPUT = { fps: 30, resolution: '1080p' } as const;
/** Output size caps the erasure service takes (`maximum_resolution`): a larger video is shrunk to the cap
 *  at its own aspect, a smaller one is never enlarged, so `4k` keeps any source up to 4K as it is. */
export const ERASURE_RESOLUTIONS = ['720p', '1080p', '4k'] as const;
export type ErasureResolution = typeof ERASURE_RESOLUTIONS[number];
const CAP_PIXELS: Record<ErasureResolution, number> = { '720p': 1280 * 720, '1080p': 1920 * 1080, '4k': 3840 * 2160 };
/** The size a source comes out at under a cap. */
export function erasureOutputSize(width: number, height: number, resolution: ErasureResolution = ERASURE_OUTPUT.resolution) {
  const scale = Math.min(1, Math.sqrt(CAP_PIXELS[resolution] / (width * height)));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
/** The caps worth offering for a source, smallest first: those that shrink it, then the first that keeps it whole. */
export function erasureResolutions(width: number, height: number): ErasureResolution[] {
  const out: ErasureResolution[] = [];
  for (const resolution of ERASURE_RESOLUTIONS) { out.push(resolution); if (width * height <= CAP_PIXELS[resolution]) break; }
  return out;
}
/** The cap a run uses: the one picked when the source offers it, else the default cap or the largest it offers. */
export function erasureResolutionFor(width: number, height: number, picked?: ErasureResolution): ErasureResolution {
  const offered = erasureResolutions(width, height);
  if (picked && offered.includes(picked)) return picked;
  return offered.includes(ERASURE_OUTPUT.resolution) ? ERASURE_OUTPUT.resolution : offered.at(-1)!;
}
export interface ErasureMeter { durationSec: number; fps: number; width: number; height: number }
/** Published LAS coefficients. Use actual output pixels, independent of portrait/landscape orientation. */
export function erasureCoefficients(tier: ErasureTier, meter: ErasureMeter) {
  if (!ERASURE_TIERS.some(row => row.id === tier) || ![meter.durationSec, meter.fps, meter.width, meter.height].every(value => Number.isFinite(value) && value > 0) || meter.durationSec > 10800 || meter.fps > 240 || Math.max(meter.width, meter.height) > 3840 || Math.min(meter.width, meter.height) > 2160) throw new Error(t('engine.erasureInvalidMeter'));
  const fpsFactor = meter.fps <= 24 ? .8 : meter.fps <= 30 ? 1 : Math.ceil(meter.fps / 30);
  const pixels = meter.width * meter.height;
  const resolutionFactor = pixels > 1920 * 1080 ? 2 : tier !== 'lite' && pixels <= 1280 * 720 ? .6 : 1;
  return { fpsFactor, resolutionFactor };
}
/** Millisecond metering, with one rounding at whole-order credit conversion, never per minute/frame. */
export function erasureCost(tier: ErasureTier, rateMicroCnyPerMinute: number, meter: ErasureMeter, microCnyPerCredit: number) {
  if (!Number.isSafeInteger(rateMicroCnyPerMinute) || rateMicroCnyPerMinute <= 0 || !Number.isSafeInteger(microCnyPerCredit) || microCnyPerCredit <= 0) throw new Error('erasure cost configuration is invalid');
  const { fpsFactor, resolutionFactor } = erasureCoefficients(tier, meter);
  const durationMs = Math.round(meter.durationSec * 1000);
  const numerator = BigInt(durationMs) * BigInt(rateMicroCnyPerMinute) * BigInt(Math.round(fpsFactor * 10)) * BigInt(Math.round(resolutionFactor * 10));
  const denominator = 60000n * 100n;
  const creditsDenominator = denominator * BigInt(microCnyPerCredit);
  const credits = Number((numerator + creditsDenominator - 1n) / creditsDenominator);
  return { credits, costCny: Number(numerator) / Number(denominator) / 1e6, durationMs, fpsFactor, resolutionFactor };
}
