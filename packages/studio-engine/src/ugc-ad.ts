/** Product facts supplied by the advertiser. Never treat model output as a new product fact. */
export interface UgcAdOptions {
  productName: string;
  claim: string;
  callToAction: string;
  hook: string;
  angle: 'demo' | 'problem' | 'review';
}
export const DEFAULT_UGC_AD_OPTIONS: UgcAdOptions = {
  productName: '', claim: '', callToAction: '', hook: '', angle: 'demo',
};
const short = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !/[\u0000-\u0009\u000b-\u001f]/u.test(value);
export function validUgcAdOptions(raw: unknown): raw is UgcAdOptions {
  const value = raw as UgcAdOptions | null;
  return !!value && short(value.productName, 100) && short(value.claim, 240)
    && short(value.callToAction, 100) && short(value.hook, 100)
    && ['demo', 'problem', 'review'].includes(value.angle);
}
export function readyUgcAdOptions(raw: unknown): UgcAdOptions {
  if (!validUgcAdOptions(raw)) throw new Error('广告设置无效。');
  if (!raw.productName.trim()) throw new Error('请填写商品名称。');
  if (!raw.callToAction.trim()) throw new Error('请填写行动引导。');
  return {
    productName: raw.productName.trim(), claim: raw.claim.trim(),
    callToAction: raw.callToAction.trim(), hook: raw.hook.trim(), angle: raw.angle,
  };
}
