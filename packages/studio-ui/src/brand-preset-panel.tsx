import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, Minus } from 'lucide-react';
import type { CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import type { BrandSnapshot } from '@pireel/studio-engine/brand-kit';
import { imageThumb } from '@pireel/ui/image-url';
import { SceneBrandPicker } from './scene-brand-picker';
import { SceneCheckbox } from './scene-form-controls';

/**
 * A one-click edit's settings: the brand preset first — which brand, and what of it this edit
 * applies — with the caption look tucked under it for fine-tuning. Parts the brand does not have are
 * shown as such, never filled in.
 */
export function BrandPresetPanel({ options, locale, disabled, onChange, captionStyle }: {
  options: CaptionTaskOptions; locale: 'zh' | 'en'; disabled: boolean;
  onChange: (update: (current: CaptionTaskOptions) => CaptionTaskOptions) => void;
  /** The caption look controls, opened on demand. */
  captionStyle: ReactNode;
}) {
  const say = (zh: string, en: string) => locale === 'zh' ? zh : en;
  const [styleOpen, setStyleOpen] = useState(false);
  const brand = options.brand;
  const row = (label: string, on: boolean, note: string) => <li className="flex items-center gap-2.5 py-1.5 text-sm">
    <span className={'flex size-4 shrink-0 items-center justify-center rounded-full ' + (on ? 'bg-accent text-white' : 'bg-panel-2 text-ink-4')}>{on ? <Check size={10} strokeWidth={3} /> : <Minus size={10} />}</span>
    <span className={on ? 'text-ink' : 'text-ink-4'}>{label}</span><span className="text-ink-4 ml-auto truncate text-xs">{note}</span>
  </li>;
  return <div>
    <h2 className="text-ink mb-3 text-sm font-semibold">{say('品牌预设', 'Brand preset')}</h2>
    <SceneBrandPicker options={options} locale={locale} disabled={disabled} onChange={onChange} />
    <ul className="divide-line -mt-1 divide-y">
      {row(say('字幕样式', 'Caption look'), true, brand ? say('来自品牌', 'From the brand') : say('默认样式', 'Default look'))}
      {row('Logo', !!brand?.logo, brand?.logo ? say('常驻角落', 'In a corner') : say('品牌里没有', 'Not in the brand'))}
      {row(say('片头', 'Intro'), !!brand?.intro, brand?.intro ? say('接在正片前', 'Before the video') : say('品牌里没有', 'Not in the brand'))}
      {row(say('片尾', 'Outro'), !!brand?.outro, brand?.outro ? say('接在正片后', 'After the video') : say('品牌里没有', 'Not in the brand'))}
    </ul>
    <div className="border-line mt-3 border-t pt-4">
      <SceneCheckbox label={say('剪掉停顿', 'Trim pauses')} checked={options.shortenPauses} disabled={disabled} onChange={shortenPauses => onChange(current => ({ ...current, shortenPauses }))}
        description={brand ? say(`品牌习惯：${brand.pacing.trimSilence ? '剪掉停顿' : '保留停顿'}`, `The brand ${brand.pacing.trimSilence ? 'trims pauses' : 'keeps pauses'}`) : say('缩短长停顿，保留自然语气。', 'Trim long pauses while keeping a natural rhythm.')} />
    </div>
    <div className="border-line mt-4 border-t pt-3">
      <button type="button" aria-expanded={styleOpen} onClick={() => setStyleOpen(open => !open)} className="text-ink-2 hover:text-ink flex w-full items-center justify-between py-1 text-sm">
        {say('微调字幕样式', 'Fine-tune captions')}<ChevronDown size={15} className={'transition-transform ' + (styleOpen ? 'rotate-180' : '')} />
      </button>
      {styleOpen && <div className="mt-3">{captionStyle}</div>}
    </div>
  </div>;
}

/** The brand's logo over a scene preview, where the export puts it (4% from the corner, width as a share of the frame). */
export function BrandLogoOverlay({ brand }: { brand: BrandSnapshot | undefined }) {
  const logo = brand?.logo;
  if (!logo) return null;
  const left = logo.corner.endsWith('left'); const top = logo.corner.startsWith('top');
  return <img src={imageThumb(logo.key, 'thumb')} alt="" aria-hidden className="pointer-events-none absolute h-auto object-contain"
    style={{ width: `${logo.widthPct}%`, opacity: logo.opacity, [left ? 'left' : 'right']: '4%', [top ? 'top' : 'bottom']: '4%' }} />;
}
