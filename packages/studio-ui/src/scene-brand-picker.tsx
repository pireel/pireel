import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { brandCaptionStyle, brandSnapshot, type BrandKit } from '@pireel/studio-engine/brand-kit';
import type { CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { studioProviders } from '@pireel/studio-engine/providers';
import { SceneSelect } from './scene-form-controls';

const ASPECT = { '9:16': 'portrait', '16:9': 'landscape', '1:1': 'square' } as const;

/** A scene's options with a brand applied (a copy taken now), or with the brand removed when `kit` is null.
 *  The brand's captions become the scene's caption style; later edits in the panel override them. */
export function withSceneBrand(options: CaptionTaskOptions, kit: BrandKit | null): CaptionTaskOptions {
  if (!kit) { const { brand: _brand, ...rest } = options; return rest; }
  const brand = brandSnapshot(kit);
  return { ...options, brand, caption: brandCaptionStyle(brand), aspect: ASPECT[kit.framing.aspect] };
}

/** Picks one of the user's brands for this scene. The scene keeps a copy taken now, so later edits to
 * the brand never restyle this project; picking again takes the latest version. */
export function SceneBrandPicker({ options, locale, disabled, onChange }: {
  options: CaptionTaskOptions; locale: 'zh' | 'en'; disabled: boolean;
  onChange: (update: (current: CaptionTaskOptions) => CaptionTaskOptions) => void;
}) {
  const provider = studioProviders().brands;
  const [brands, setBrands] = useState<BrandKit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!provider) return;
    const load = () => provider.list().then(list => { setBrands(list); setError(null); }, reason => setError(reason instanceof Error ? reason.message : String(reason)));
    void load();
    // Brands are created in another tab; pick them up when the user comes back.
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [provider]);
  if (!provider) return null;
  const say = (zh: string, en: string) => locale === 'zh' ? zh : en;
  const current = options.brand;
  const listed = brands ?? [];
  const choices = [{ value: 'none', label: say('不使用品牌', 'No brand') },
    ...(current && !listed.some(brand => brand.id === current.id) ? [{ value: current.id, label: current.name }] : []),
    ...listed.map(brand => ({ value: brand.id, label: brand.name }))];
  return <div className="border-line mb-4 border-b pb-4">
    <SceneSelect label={say('品牌', 'Brand')} value={current?.id ?? 'none'} disabled={disabled || brands === null} options={choices}
      footer={provider.manage && <button type="button" onClick={() => provider.manage!()} className="text-ink-2 hover:bg-panel-2 flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-xs"><Plus size={12} />{say('去创建品牌', 'Create a brand')}</button>}
      onChange={id => {
      const kit = listed.find(brand => brand.id === id) ?? null;
      onChange(options => withSceneBrand(options, kit));
    }} />
    {error ? <p role="alert" className="text-ink-3 mt-2 text-xs">{say('品牌列表加载失败：', 'Could not load brands: ')}{error}</p>
      : current ? <p className="text-ink-3 mt-2 text-xs">{say('使用选择时的品牌版本：字幕、配色', 'Uses the brand as it was when picked: captions, colors')}{current.logo ? say('、Logo', ', logo') : ''}{current.intro || current.outro ? say('、片头片尾', ', intro/outro') : ''}{say('。', '.')}</p>
      : brands?.length === 0 ? <p className="text-ink-3 mt-2 text-xs">{say('还没有品牌，可在首页「我的品牌」创建。', 'No brands yet — create one under My brand on the Studio home.')}</p> : null}
  </div>;
}
