import { useEffect, useState } from 'react';
import { brandSnapshot, type BrandKit } from '@pireel/studio-engine/brand-kit';
import { BRAND_CAPTION_PRESET_ID, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { studioProviders } from '@pireel/studio-engine/providers';
import { SceneSelect } from './scene-form-controls';

const ASPECT = { '9:16': 'portrait', '16:9': 'landscape', '1:1': 'square' } as const;

/** Picks one of the user's brands for this scene. The scene keeps a copy taken now, so later edits to
 * the brand never restyle this project; picking again takes the latest version. */
export function SceneBrandPicker({ options, locale, disabled, onChange }: {
  options: CaptionTaskOptions; locale: 'zh' | 'en'; disabled: boolean;
  onChange: (update: (current: CaptionTaskOptions) => CaptionTaskOptions) => void;
}) {
  const provider = studioProviders().brands;
  const [brands, setBrands] = useState<BrandKit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { provider?.list().then(setBrands, reason => setError(reason instanceof Error ? reason.message : String(reason))); }, [provider]);
  if (!provider) return null;
  const say = (zh: string, en: string) => locale === 'zh' ? zh : en;
  const current = options.brand;
  const listed = brands ?? [];
  const choices = [{ value: 'none', label: say('不使用品牌', 'No brand') },
    ...(current && !listed.some(brand => brand.id === current.id) ? [{ value: current.id, label: current.name }] : []),
    ...listed.map(brand => ({ value: brand.id, label: brand.name }))];
  return <div className="border-line mb-5 border-b pb-5">
    <SceneSelect label={say('品牌', 'Brand')} value={current?.id ?? 'none'} disabled={disabled || brands === null} options={choices} onChange={id => {
      const kit = listed.find(brand => brand.id === id);
      onChange(options => {
        if (!kit) { const { brand: _brand, ...rest } = options; return { ...rest, presetId: rest.presetId === BRAND_CAPTION_PRESET_ID ? 'clean' : rest.presetId }; }
        return { ...options, brand: brandSnapshot(kit), presetId: BRAND_CAPTION_PRESET_ID, custom: undefined, aspect: ASPECT[kit.framing.aspect] };
      });
    }} />
    {error ? <p role="alert" className="text-ink-3 mt-2 text-xs">{say('品牌列表加载失败：', 'Could not load brands: ')}{error}</p>
      : current ? <p className="text-ink-3 mt-2 text-xs">{say('使用选择时的品牌版本：字幕、配色', 'Uses the brand as it was when picked: captions, colors')}{current.logo ? say('、Logo', ', logo') : ''}{current.intro || current.outro ? say('、片头片尾', ', intro/outro') : ''}{say('。', '.')}</p>
      : brands?.length === 0 ? <p className="text-ink-3 mt-2 text-xs">{say('还没有品牌，可在左侧「我的品牌」创建。', 'No brands yet — create one under Brand kits in the sidebar.')}</p> : null}
  </div>;
}
