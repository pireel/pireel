import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, Minus } from 'lucide-react';
import type { CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { moveOf, type Frequency, type PlaybookSnapshot } from '@pireel/studio-engine/brand-playbook';
import { playbookEditParams, PAUSE_BY_MODE, type CaptionEditParams } from '@pireel/studio-engine/brand-edit-params';
import { SCENE_TARGET_LUFS } from '@pireel/studio-engine/loudness-lufs';
import { imageThumb } from '@pireel/ui/image-url';
import { SceneBrandPicker } from './scene-brand-picker';
import { SceneCheckbox } from './scene-form-controls';

/** The scene's pause threshold when the brand gives none (the pause step's own default). */
const DEFAULT_PAUSE = { minimumPauseSec: 0.7, speechPaddingSec: 0.15 };
const PAUSE_NAMES = { tight: { zh: '紧凑', en: 'tight' }, moderate: { zh: '适中', en: 'moderate' }, natural: { zh: '保留自然停顿', en: 'natural' } } as const;
const FREQUENCY_NAMES: Record<Frequency, { zh: string; en: string }> = { rare: { zh: '偶尔', en: 'rarely' }, moderate: { zh: '适中', en: 'now and then' }, frequent: { zh: '频繁', en: 'often' } };

/**
 * A one-click edit's settings, led by the brand: which brand; its fixed habits, run as they are; and
 * the moves this edit may draw on, each placed per moment by the edit planner from the brand's own
 * triggers. Parts the brand does not have are shown as such, never filled in.
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
  const fixed = brand?.fixed;
  const edit: CaptionEditParams = options.edit ?? {};
  // What the brand itself says; a switch turned back on returns to it.
  const fromBrand: CaptionEditParams = brand ? playbookEditParams(brand) : {};
  const pause = edit.pause ?? DEFAULT_PAUSE;
  const patchEdit = (patch: Partial<CaptionEditParams>) => onChange(current => {
    const next = { ...current.edit, ...patch };
    for (const key of Object.keys(next) as (keyof CaptionEditParams)[]) if (next[key] === undefined) delete next[key];
    return { ...current, edit: next };
  });
  const movesWith = (patch: NonNullable<CaptionEditParams['moves']>) => {
    const next = { ...edit.moves, ...patch };
    for (const key of Object.keys(next) as (keyof typeof next)[]) if (!next[key]) delete next[key];
    return Object.keys(next).length ? next : undefined;
  };
  const textsWith = (patch: NonNullable<CaptionEditParams['texts']>) => {
    const next = { ...edit.texts, ...patch };
    for (const key of Object.keys(next) as (keyof typeof next)[]) if (!next[key]) delete next[key];
    return Object.keys(next).length ? next : undefined;
  };
  const row = (label: string, on: boolean, note: string) => <li className="flex items-center gap-2.5 py-1.5 text-sm">
    <span className={'flex size-4 shrink-0 items-center justify-center rounded-full ' + (on ? 'bg-accent text-white' : 'bg-panel-2 text-ink-4')}>{on ? <Check size={10} strokeWidth={3} /> : <Minus size={10} />}</span>
    <span className={on ? 'text-ink' : 'text-ink-4'}>{label}</span><span className="text-ink-4 ml-auto truncate text-xs">{note}</span>
  </li>;
  const missing = say('品牌里没有', 'Not in the brand');
  const punch = brand ? moveOf(brand, 'punch_in') : undefined;
  const transition = brand ? moveOf(brand, 'transition') : undefined;
  const moveNote = (move: NonNullable<typeof punch>) => `${FREQUENCY_NAMES[move.frequency][locale]} · ${move.trigger.text}`;

  return <div>
    <h2 className="text-ink mb-3 text-sm font-semibold">{say('品牌预设', 'Brand preset')}</h2>
    <SceneBrandPicker options={options} locale={locale} disabled={disabled} onChange={onChange} />
    <h3 className="text-ink-3 mb-1 text-xs font-medium">{say('固定做法', 'Fixed habits')}</h3>
    <ul className="divide-line divide-y">
      {row(say('字幕样式', 'Caption look'), true, fixed?.captions?.style ? say('来自品牌', 'From the brand') : say('默认样式', 'Default look'))}
      {row('Logo', !!fixed?.logo, fixed?.logo ? say('常驻角落', 'In a corner') : missing)}
      {row(say('片头', 'Intro'), !!fixed?.intro, fixed?.intro ? say('接在正片前', 'Before the video') : missing)}
      {row(say('片尾', 'Outro'), !!fixed?.outro, fixed?.outro ? say('接在正片后', 'After the video') : missing)}
    </ul>
    <div className="border-line mt-3 space-y-3 border-t pt-4">
      <SceneCheckbox label={say('剪掉停顿', 'Trim pauses')} checked={options.shortenPauses} disabled={disabled} onChange={shortenPauses => onChange(current => ({ ...current, shortenPauses }))}
        description={say(`停顿超过 ${pause.minimumPauseSec} 秒就剪${fixed?.pauses ? `（品牌习惯：${PAUSE_NAMES[fixed.pauses.mode].zh}）` : ''}`, `Cut pauses longer than ${pause.minimumPauseSec}s${fixed?.pauses ? ` (the brand: ${PAUSE_NAMES[fixed.pauses.mode].en})` : ''}`)} />
      <SceneCheckbox label={say('标出重点词', 'Mark key words')} checked={!!options.highlights} disabled={disabled} onChange={highlights => onChange(current => ({ ...current, highlights }))}
        description={say('AI 挑出每句的重点词，按字幕样式上色。', 'AI picks each sentence’s key words and colours them in the caption look.')} />
      {fixed?.bands?.header && <SceneCheckbox label={say('顶部标题栏', 'Headline band')} checked={!!edit.texts?.header} disabled={disabled} onChange={on => patchEdit({ texts: textsWith({ header: on }) })}
        description={say('按品牌标题栏的位置和样式，全程显示；文字按本条内容写。', 'In the brand’s headline band, for the whole video; the words are written for this video.')} />}
      {fixed?.bands?.hookLabel && <SceneCheckbox label={say('开头标签', 'Opening label')} checked={!!edit.texts?.hookLabel} disabled={disabled} onChange={on => patchEdit({ texts: textsWith({ hookLabel: on }) })}
        description={say(`开头 ${fixed.bands.hookLabel.durationSec} 秒，按品牌标签的样式；文字按本条内容写。`, `Over the first ${fixed.bands.hookLabel.durationSec}s in the brand’s label style; the words are written for this video.`)} />}
      <SceneCheckbox label={say('统一响度', 'Match loudness')} checked={edit.targetLufs !== undefined} disabled={disabled} onChange={on => patchEdit({ targetLufs: on ? fromBrand.targetLufs ?? SCENE_TARGET_LUFS : undefined })}
        description={say(`成片调到 ${edit.targetLufs ?? fromBrand.targetLufs ?? SCENE_TARGET_LUFS} LUFS${fromBrand.targetLufs !== undefined ? '（品牌作品的响度）' : ''}。`, `Brings the video to ${edit.targetLufs ?? fromBrand.targetLufs ?? SCENE_TARGET_LUFS} LUFS${fromBrand.targetLufs !== undefined ? ' (your videos’ loudness)' : ''}.`)} />
    </div>
    <div className="border-line mt-4 space-y-3 border-t pt-4">
      <div><h3 className="text-ink-3 text-xs font-medium">{say('招式', 'Moves')}</h3>
        <p className="text-ink-4 mt-0.5 text-[11px] leading-relaxed">{say('每一处用不用、用哪种，由剪辑规划按这条视频的内容和品牌的触发规则决定。', 'Where each lands and in which form is decided per moment, from this video’s content and the brand’s triggers.')}</p></div>
      {punch && fromBrand.moves?.punchIn ? <SceneCheckbox label={say('推近', 'Punch-ins')} checked={!!edit.moves?.punchIn} disabled={disabled} onChange={on => patchEdit({ moves: movesWith({ punchIn: on ? fromBrand.moves!.punchIn : undefined }) })} description={moveNote(punch)} />
        : <p className="text-ink-4 text-xs">{say('推近：品牌里没有', 'Punch-ins: not in the brand')}</p>}
      {transition && fromBrand.moves?.transition ? <SceneCheckbox label={say('转场点缀', 'Transition accents')} checked={!!edit.moves?.transition} disabled={disabled} onChange={on => patchEdit({ moves: movesWith({ transition: on ? fromBrand.moves!.transition : undefined }) })} description={moveNote(transition)} />
        : <p className="text-ink-4 text-xs">{say('转场：品牌里只有硬切', 'Transitions: hard cuts only')}</p>}
      {brand && brand.moves.filter(move => move.kind !== 'punch_in' && move.kind !== 'transition').length > 0 && <p className="text-ink-4 text-[11px] leading-relaxed">{say(`品牌里还有 ${brand.moves.filter(move => move.kind !== 'punch_in' && move.kind !== 'transition').length} 种招式（如插素材、图形标注），需要素材或生成，一键剪辑暂不自动做，可用 Agent Remix 继续。`, `The brand has ${brand.moves.filter(move => move.kind !== 'punch_in' && move.kind !== 'transition').length} more moves (footage, graphics) that need material or generation; continue in Agent Remix.`)}</p>}
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
  const logo = brand?.fixed.logo;
  if (!logo) return null;
  const left = logo.corner.endsWith('left'); const top = logo.corner.startsWith('top');
  return <img src={imageThumb(logo.key, 'thumb')} alt="" aria-hidden className="pointer-events-none absolute h-auto object-contain"
    style={{ width: `${logo.widthPct}%`, opacity: logo.opacity, [left ? 'left' : 'right']: '4%', [top ? 'top' : 'bottom']: '4%' }} />;
}

/** The brand's text bands over a scene preview, where and how they will show; the words are placeholders
 *  until the edit writes them for this video. */
export function BrandTemplateOverlay({ options, locale }: { options: CaptionTaskOptions; locale: 'zh' | 'en' }) {
  const bands = options.brand?.fixed.bands; const texts = options.edit?.texts;
  if (!bands || !texts) return null;
  const band = (item: NonNullable<typeof bands.header>, label: string) => <div aria-hidden className="pointer-events-none absolute flex items-center justify-center overflow-hidden rounded-sm text-center font-extrabold leading-none"
    style={{ left: `${item.box.x * 100}%`, top: `${item.box.y * 100}%`, width: `${item.box.w * 100}%`, height: `${item.box.h * 100}%`, color: item.color, background: item.plate ?? 'transparent', containerType: 'size' }}>
    <span style={{ fontSize: 'min(70cqh, 9cqw)' }}>{label}</span>
  </div>;
  return <>
    {texts.header && bands.header && band(bands.header, locale === 'zh' ? '标题栏（按本条内容生成）' : 'Headline (written for this video)')}
    {texts.hookLabel && bands.hookLabel && band(bands.hookLabel, locale === 'zh' ? '开头标签' : 'Opening label')}
  </>;
}

export { PAUSE_BY_MODE };
