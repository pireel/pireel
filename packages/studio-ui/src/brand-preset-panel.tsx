import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, Minus } from 'lucide-react';
import type { CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import type { BrandSnapshot } from '@pireel/studio-engine/brand-kit';
import { brandEditParams, PAUSE_BY_MODE, type CaptionEditParams } from '@pireel/studio-engine/brand-edit-params';
import { SCENE_TARGET_LUFS } from '@pireel/studio-engine/loudness-lufs';
import { imageThumb } from '@pireel/ui/image-url';
import { SceneBrandPicker } from './scene-brand-picker';
import { SceneCheckbox } from './scene-form-controls';

/** The scene's pause threshold when the brand gives none (the pause step's own default). */
const DEFAULT_PAUSE = { minimumPauseSec: 0.7, speechPaddingSec: 0.15 };
const DEFAULT_PUNCH: NonNullable<CaptionEditParams['punchIn']> = { preset: 'punch', scale: 1.2, minGapSec: 8 };
const PAUSE_NAMES = { aggressive: { zh: '紧凑', en: 'tight' }, moderate: { zh: '适中', en: 'moderate' }, natural: { zh: '保留自然停顿', en: 'natural' } } as const;

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
  const edit: CaptionEditParams = options.edit ?? {};
  // What the brand itself says; a switch turned back on returns to it.
  const fromBrand: CaptionEditParams = brand ? brandEditParams(brand) : {};
  const pause = edit.pause ?? DEFAULT_PAUSE;
  const pauseMode = (Object.keys(PAUSE_BY_MODE) as (keyof typeof PAUSE_BY_MODE)[]).find(mode => edit.pause && PAUSE_BY_MODE[mode].minimumPauseSec === edit.pause.minimumPauseSec);
  const patchEdit = (patch: Partial<CaptionEditParams>) => onChange(current => {
    const next = { ...current.edit, ...patch };
    for (const key of Object.keys(next) as (keyof CaptionEditParams)[]) if (next[key] === undefined) delete next[key];
    return { ...current, edit: next };
  });
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
    <div className="border-line mt-3 space-y-3 border-t pt-4">
      <h3 className="text-ink-3 text-xs font-medium">{say('剪辑习惯', 'Editing habits')}</h3>
      <SceneCheckbox label={say('剪掉停顿', 'Trim pauses')} checked={options.shortenPauses} disabled={disabled} onChange={shortenPauses => onChange(current => ({ ...current, shortenPauses }))}
        description={say(`停顿超过 ${pause.minimumPauseSec} 秒就剪${pauseMode ? `（品牌习惯：${PAUSE_NAMES[pauseMode].zh}）` : ''}`, `Cut pauses longer than ${pause.minimumPauseSec}s${pauseMode ? ` (the brand: ${PAUSE_NAMES[pauseMode].en})` : ''}`)} />
      <SceneCheckbox label={say('标出重点词', 'Mark key words')} checked={!!options.highlights} disabled={disabled} onChange={highlights => onChange(current => ({ ...current, highlights }))}
        description={say('AI 挑出每句的重点词，按字幕样式上色。', 'AI picks each sentence’s key words and colours them in the caption look.')} />
      <SceneCheckbox label={say('重点处推近', 'Punch in on key words')} checked={!!edit.punchIn} disabled={disabled} onChange={on => patchEdit({ punchIn: on ? fromBrand.punchIn ?? DEFAULT_PUNCH : undefined })}
        description={say(`在每句的重点词上推近到句末，相邻至少隔 ${(edit.punchIn ?? fromBrand.punchIn ?? DEFAULT_PUNCH).minGapSec} 秒。`, `Pushes in from a sentence’s key word to its end, at least ${(edit.punchIn ?? fromBrand.punchIn ?? DEFAULT_PUNCH).minGapSec}s apart.`)} />
      <SceneCheckbox label={say('统一响度', 'Match loudness')} checked={edit.targetLufs !== undefined} disabled={disabled} onChange={on => patchEdit({ targetLufs: on ? fromBrand.targetLufs ?? SCENE_TARGET_LUFS : undefined })}
        description={say(`成片调到 ${edit.targetLufs ?? fromBrand.targetLufs ?? SCENE_TARGET_LUFS} LUFS${fromBrand.targetLufs !== undefined ? '（品牌作品的响度）' : ''}。`, `Brings the video to ${edit.targetLufs ?? fromBrand.targetLufs ?? SCENE_TARGET_LUFS} LUFS${fromBrand.targetLufs !== undefined ? ' (your videos’ loudness)' : ''}.`)} />
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
