import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, Minus } from 'lucide-react';
import type { CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { hasText, type PlaybookSnapshot } from '@pireel/studio-engine/brand-playbook';
import { playbookEditParams, type CaptionEditParams } from '@pireel/studio-engine/brand-edit-params';
import { SCENE_TARGET_LUFS } from '@pireel/studio-engine/loudness-lufs';
import { imageThumb } from '@pireel/ui/image-url';
import { SceneBrandPicker } from './scene-brand-picker';
import { SceneCheckbox } from './scene-form-controls';

/** The scene's pause threshold when the brand gives none (the pause step's own default). */
const DEFAULT_PAUSE = { minimumPauseSec: 0.7, speechPaddingSec: 0.15 };
const PAUSE_NAMES = { tight: { zh: '紧凑', en: 'tight' }, moderate: { zh: '适中', en: 'moderate' }, natural: { zh: '保留自然停顿', en: 'natural' } } as const;
/** The first sentence of a prose block, as a hint of what it says. */
const gist = (text: string | undefined) => (text ?? '').trim().split(/(?<=[。.!！?？])\s*/)[0]?.slice(0, 80) ?? '';

/**
 * A one-click edit's settings, led by the brand: which brand; its fixed blocks, applied as they are; and
 * the parts the edit writes for this video from the brand's prompt — where moves land, and titles. Parts
 * the brand does not have are shown as such, never filled in.
 */
export function BrandPresetPanel({ options, locale, disabled, onChange, captionStyle }: {
  options: CaptionTaskOptions; locale: 'zh' | 'en'; disabled: boolean;
  onChange: (update: (current: CaptionTaskOptions) => CaptionTaskOptions) => void;
  /** The caption look controls, opened on demand. */
  captionStyle: ReactNode;
}) {
  const say = (zh: string, en: string) => locale === 'zh' ? zh : en;
  const [styleOpen, setStyleOpen] = useState(false);
  const blocks = options.brand?.blocks;
  const edit: CaptionEditParams = options.edit ?? {};
  // What the brand itself says; a switch turned back on returns to it.
  const fromBrand: CaptionEditParams = options.brand ? playbookEditParams(options.brand) : {};
  const pause = edit.pause ?? DEFAULT_PAUSE;
  const pauses = blocks?.sound?.pauses;
  const patchEdit = (patch: Partial<CaptionEditParams>) => onChange(current => {
    const next = { ...current.edit, ...patch };
    for (const key of Object.keys(next) as (keyof CaptionEditParams)[]) if (next[key] === undefined) delete next[key];
    return { ...current, edit: next };
  });
  const row = (label: string, on: boolean, note: string) => <li className="flex items-center gap-2.5 py-1.5 text-sm">
    <span className={'flex size-4 shrink-0 items-center justify-center rounded-full ' + (on ? 'bg-accent text-white' : 'bg-panel-2 text-ink-4')}>{on ? <Check size={10} strokeWidth={3} /> : <Minus size={10} />}</span>
    <span className={on ? 'text-ink' : 'text-ink-4'}>{label}</span><span className="text-ink-4 ml-auto truncate text-xs">{note}</span>
  </li>;
  const missing = say('品牌里没有', 'Not in the brand');

  return <div>
    <h2 className="text-ink mb-3 text-sm font-semibold">{say('品牌预设', 'Brand preset')}</h2>
    <SceneBrandPicker options={options} locale={locale} disabled={disabled} onChange={onChange} />
    <h3 className="text-ink-3 mb-1 text-xs font-medium">{say('固定做法', 'Fixed')}</h3>
    <ul className="divide-line divide-y">
      {row(say('字幕样式', 'Caption look'), true, blocks?.captions?.style ? say('来自品牌', 'From the brand') : say('默认样式', 'Default look'))}
      {row('Logo', !!blocks?.logo, blocks?.logo ? say('常驻角落', 'In a corner') : missing)}
      {row(say('片头', 'Intro'), !!blocks?.bookends?.intro, blocks?.bookends?.intro ? say('接在正片前', 'Before the video') : missing)}
      {row(say('片尾', 'Outro'), !!blocks?.bookends?.outro, blocks?.bookends?.outro ? say('接在正片后', 'After the video') : missing)}
    </ul>
    <div className="border-line mt-3 space-y-3 border-t pt-4">
      <SceneCheckbox label={say('剪掉停顿', 'Trim pauses')} checked={options.shortenPauses} disabled={disabled} onChange={shortenPauses => onChange(current => ({ ...current, shortenPauses }))}
        description={say(`停顿超过 ${pause.minimumPauseSec} 秒就剪${pauses ? `（品牌习惯：${PAUSE_NAMES[pauses].zh}）` : ''}`, `Cut pauses longer than ${pause.minimumPauseSec}s${pauses ? ` (the brand: ${PAUSE_NAMES[pauses].en})` : ''}`)} />
      <SceneCheckbox label={say('标出重点词', 'Mark key words')} checked={!!options.highlights} disabled={disabled} onChange={highlights => onChange(current => ({ ...current, highlights }))}
        description={say('AI 挑出每句的重点词，按字幕样式上色。', 'AI picks each sentence’s key words and colours them in the caption look.')} />
      <SceneCheckbox label={say('统一响度', 'Match loudness')} checked={edit.targetLufs !== undefined} disabled={disabled} onChange={on => patchEdit({ targetLufs: on ? fromBrand.targetLufs ?? SCENE_TARGET_LUFS : undefined })}
        description={say(`成片调到 ${edit.targetLufs ?? fromBrand.targetLufs ?? SCENE_TARGET_LUFS} LUFS${fromBrand.targetLufs !== undefined ? '（品牌作品的响度）' : ''}。`, `Brings the video to ${edit.targetLufs ?? fromBrand.targetLufs ?? SCENE_TARGET_LUFS} LUFS${fromBrand.targetLufs !== undefined ? ' (your videos’ loudness)' : ''}.`)} />
    </div>
    <div className="border-line mt-4 space-y-3 border-t pt-4">
      <div><h3 className="text-ink-3 text-xs font-medium">{say('按品牌写给这条视频', 'Written for this video from the brand')}</h3>
        <p className="text-ink-4 mt-0.5 text-[11px] leading-relaxed">{say('AI 读品牌的描述，结合这条视频的内容逐处决定。', 'AI reads the brand’s description and decides moment by moment for this video.')}</p></div>
      {hasText(blocks?.visual)
        ? <SceneCheckbox label={say('推近和转场', 'Punch-ins and transitions')} checked={!!(edit.moves?.punchIn || edit.moves?.transition)} disabled={disabled} onChange={on => patchEdit({ moves: on ? { punchIn: true, transition: true } : undefined })} description={gist(blocks!.visual!.text)} />
        : <p className="text-ink-4 text-xs">{say('推近和转场：品牌里没有画面描述', 'Punch-ins and transitions: the brand has no visual-language description')}</p>}
      {hasText(blocks?.overlay_text)
        ? <SceneCheckbox label={say('标题与标签', 'Titles and labels')} checked={!!edit.titles} disabled={disabled} onChange={on => patchEdit({ titles: on || undefined })} description={gist(blocks!.overlay_text!.text)} />
        : <p className="text-ink-4 text-xs">{say('标题与标签：品牌里没有花字描述', 'Titles and labels: the brand has no overlay-text description')}</p>}
      {hasText(blocks?.motion_graphics) && <p className="text-ink-4 text-[11px] leading-relaxed">{say('品牌里的 MG 风格需要生成元素，一键剪辑暂不自动做，可用 Agent Remix 继续。', 'The brand’s motion-graphics style needs generated elements; continue in Agent Remix.')}</p>}
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
export function BrandLogoOverlay({ brand }: { brand: PlaybookSnapshot | undefined }) {
  const logo = brand?.blocks.logo;
  if (!logo) return null;
  const left = logo.corner.endsWith('left'); const top = logo.corner.startsWith('top');
  return <img src={imageThumb(logo.key, 'thumb')} alt="" aria-hidden className="pointer-events-none absolute h-auto object-contain"
    style={{ width: `${logo.widthPct}%`, opacity: logo.opacity, [left ? 'left' : 'right']: '4%', [top ? 'top' : 'bottom']: '4%' }} />;
}
