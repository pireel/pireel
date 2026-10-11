import { DEFAULT_UGC_AD_OPTIONS, type UgcAdOptions } from '@pireel/studio-engine/ugc-ad';
import { SceneSelect, SceneTextField } from './scene-form-controls';

export function UgcAdSettings({ value = DEFAULT_UGC_AD_OPTIONS, locale, disabled, onChange }: {
  value?: UgcAdOptions; locale: 'zh' | 'en'; disabled: boolean; onChange: (value: UgcAdOptions) => void;
}) {
  const zh = locale === 'zh';
  const patch = (change: Partial<UgcAdOptions>) => onChange({ ...value, ...change });
  return <div className="space-y-3" aria-label={zh ? '广告信息' : 'Ad brief'}>
    <p className="text-ink-3 text-xs leading-relaxed">{zh ? '根据真实口播与商品素材制作短广告。屏幕文案只取自视频或你填写的商品信息。' : 'Build a short ad from your footage and product media. On-screen copy uses only the narration and product facts you provide.'}</p>
    <SceneTextField label={zh ? '商品名称' : 'Product name'} value={value.productName} onChange={productName => patch({ productName })} placeholder={zh ? '商品或品牌名称' : 'Product or brand'} disabled={disabled} />
    <SceneSelect label={zh ? '开场角度' : 'Opening angle'} value={value.angle} disabled={disabled} onChange={angle => patch({ angle })} options={[
      { value: 'demo', label: zh ? '产品演示' : 'Product demo' },
      { value: 'problem', label: zh ? '问题切入' : 'Start with a problem' },
      { value: 'review', label: zh ? '使用体验' : 'Creator experience' },
    ]} />
    <SceneTextField label={zh ? '开场文字（可选）' : 'Opening text (optional)'} value={value.hook} onChange={hook => patch({ hook })} placeholder={zh ? '留空则从口播提取' : 'Leave blank to use narration'} disabled={disabled} />
    <SceneTextField label={zh ? '可证实的卖点（可选）' : 'Verified product claim (optional)'} value={value.claim} onChange={claim => patch({ claim })} placeholder={zh ? '只填写真实、有依据的信息' : 'Only facts you can support'} rows={2} disabled={disabled} />
    <SceneTextField label={zh ? '行动引导' : 'Call to action'} value={value.callToAction} onChange={callToAction => patch({ callToAction })} placeholder={zh ? '例如：了解更多' : 'For example: Learn more'} disabled={disabled} />
  </div>;
}
