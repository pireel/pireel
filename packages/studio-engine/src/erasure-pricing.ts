export type ErasureTier = 'lite' | 'standard' | 'precise';
export const ERASURE_TIERS = [
  { id: 'lite', zh: '极速', en: 'Fast', description: { zh: '处理更快、成本更低，适合普通字幕和角落文字水印。', en: 'Faster and lower cost, for ordinary subtitles and corner text watermarks.' } },
  { id: 'standard', zh: '专业', en: 'Professional', description: { zh: '更注重背景修复，适合对画质要求较高的字幕和文字水印。', en: 'Higher-quality background repair for subtitles and text watermarks.' } },
  { id: 'precise', zh: '精准', en: 'Precise', description: { zh: '加强目标识别，适合图形 Logo、角标和复杂目标区分，成本更高。', en: 'More precise detection for graphic logos, corner marks and complex target selection, at higher cost.' } },
] as const;
export const ERASURE_OUTPUT = { fps: 30, resolution: '1080p' } as const;
export interface ErasureMeter { durationSec: number; fps: number; width: number; height: number }
/** Published LAS coefficients. Use actual output pixels, independent of portrait/landscape orientation. */
export function erasureCoefficients(tier: ErasureTier, meter: ErasureMeter) {
  if (!ERASURE_TIERS.some(row => row.id === tier) || ![meter.durationSec, meter.fps, meter.width, meter.height].every(value => Number.isFinite(value) && value > 0) || meter.durationSec > 10800 || meter.fps > 240 || Math.max(meter.width, meter.height) > 3840 || Math.min(meter.width, meter.height) > 2160) throw new Error('无效的擦除计量规格。');
  const fpsFactor = meter.fps <= 24 ? .8 : meter.fps <= 30 ? 1 : Math.ceil(meter.fps / 30);
  const pixels = meter.width * meter.height;
  const resolutionFactor = pixels > 1920 * 1080 ? 2 : tier !== 'lite' && pixels <= 1280 * 720 ? .6 : 1;
  return { fpsFactor, resolutionFactor };
}
/** Millisecond metering, with one rounding at whole-order credit conversion, never per minute/frame. */
export function erasureCost(tier: ErasureTier, rateMicroCnyPerMinute: number, meter: ErasureMeter, microCnyPerCredit: number) {
  if (!Number.isSafeInteger(rateMicroCnyPerMinute) || rateMicroCnyPerMinute <= 0 || !Number.isSafeInteger(microCnyPerCredit) || microCnyPerCredit <= 0) throw new Error('擦除成本配置无效。');
  const { fpsFactor, resolutionFactor } = erasureCoefficients(tier, meter);
  const durationMs = Math.round(meter.durationSec * 1000);
  const numerator = BigInt(durationMs) * BigInt(rateMicroCnyPerMinute) * BigInt(Math.round(fpsFactor * 10)) * BigInt(Math.round(resolutionFactor * 10));
  const denominator = 60000n * 100n;
  const creditsDenominator = denominator * BigInt(microCnyPerCredit);
  const credits = Number((numerator + creditsDenominator - 1n) / creditsDenominator);
  return { credits, costCny: Number(numerator) / Number(denominator) / 1e6, durationMs, fpsFactor, resolutionFactor };
}
