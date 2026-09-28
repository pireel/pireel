import { dubbingCaptionSample } from './caption-preview-text';
import { SceneSelect, SceneRange, SceneCheckbox, SceneColor } from './scene-form-controls';
import { CanvasCaptionPreview } from './canvas-caption-preview';
import { WEB_FONTS } from '@pireel/studio-engine/font-library';
import { CAPTION_TRANSLATION_LANGUAGES, captionTaskStyle, captionTaskCanvas, captionTaskGroupBottom, type CaptionTaskDimensions, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { BASE_CAPTION_FONT_PX, getCaptionPreset } from '@pireel/studio-engine/caption-presets';

export function CaptionTaskCustomize({ options, locale, disabled, source, onChange, onReset, customized = !!options.custom }: {
  customized?: boolean; options: CaptionTaskOptions; locale: 'zh' | 'en'; disabled: boolean; source?: CaptionTaskDimensions;
  onChange: (patch: NonNullable<CaptionTaskOptions['custom']>) => void; onReset: () => void;
}) {
  const zh = locale === 'zh';
  const say = (cn: string, en: string) => zh ? cn : en;
  const canvas = captionTaskCanvas(options.aspect, source ?? { width: 1080, height: 1920 });
  const style = captionTaskStyle(options, canvas);
  const outputScale = 1080 / Math.min(canvas.width, canvas.height);
  const outputFontPx = Math.round(BASE_CAPTION_FONT_PX * (style.scale ?? 1) * outputScale);
  const preset = getCaptionPreset(style.preset);
  const bg = style.bg === undefined ? preset.bg : style.bg;
  const color = (value: string | undefined | null, fallback: string) => value && /^#[a-f0-9]{6}$/i.test(value) ? value : fallback;
  return <details className="border-line mt-5 border-t pt-4">
    <summary className="text-ink cursor-pointer text-sm font-medium">{say('自定义样式', 'Customize style')}{customized && <span className="text-ink-3 ml-2 text-xs">{say('已调整', 'Edited')}</span>}</summary>
    <div role="region" aria-label={say('自定义字幕实时预览', 'Live custom caption preview')} className="border-line bg-bg sticky top-3 z-10 mt-4 rounded-lg border p-3 shadow-sm">
      <div className="bg-panel aspect-[2.4] w-full overflow-hidden rounded-md"><CanvasCaptionPreview style={{ ...style, xPct: 50, yPct: 75, sub: style.sub ? { ...style.sub, xPct: 50, yPct: options.layoutVersion === 2 ? 90 : undefined } : undefined }} locale={locale} aspect={2.4} sampleText={dubbingCaptionSample(options) ?? say('字幕|预览', 'Caption|preview')} sampleSubText={CAPTION_TRANSLATION_LANGUAGES.find((language) => language.id === options.translationLanguage)?.sample} /></div>
    </div>
    <fieldset disabled={disabled} className="mt-4 space-y-4 disabled:opacity-50">
      <SceneSelect label={say('字体', 'Font')} disabled={disabled} value={style.font ?? 'sans'} onChange={font => onChange({ font })} options={[
        { value: 'preset', label: say('跟随样式', 'Follow style') },
        { value: 'sans', label: say('现代黑体', 'Sans serif') }, { value: 'serif', label: say('经典宋体', 'Serif') }, { value: 'mono', label: say('等宽字体', 'Monospace') },
        ...WEB_FONTS.map(font => ({ value: 'web:' + font.id, label: font.label[locale] })),
      ]} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,120px),1fr))] gap-5">
        <SceneRange label={say('字号', 'Size')} value={outputFontPx} min={24} max={192} unit="px" onChange={pixels => onChange({ scale: pixels / outputScale / BASE_CAPTION_FONT_PX })} />
        <SceneRange label={say('每行宽度', 'Line width')} value={style.wPct ?? 84} min={40} max={94} unit="%" onChange={wPct => onChange({ wPct })} />
      </div>
      <SceneRange label={say('字幕底部位置', 'Caption bottom position')} value={captionTaskGroupBottom(options, canvas)} min={45} max={95} unit="%" onChange={yPct => onChange({ yPct })} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,120px),1fr))] gap-5">
        <SceneColor label={say('文字颜色', 'Text color')} value={color(style.color ?? preset.text, '#ffffff')} onChange={color => onChange({ color })} />
        {preset.mode === 'emphasis' && <SceneColor label={say('高亮颜色', 'Accent color')} value={color(style.accentColor ?? preset.emphasis, '#ffe34f')} onChange={accentColor => onChange({ accentColor })} />}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,120px),1fr))] gap-5">
        <SceneRange label={say('描边粗细', 'Outline')} value={style.strokeWidth ?? 0} min={0} max={8} step={.5} onChange={strokeWidth => onChange({ strokeWidth })} />
        <SceneColor label={say('描边颜色', 'Outline color')} value={color(style.strokeColor, '#000000')} onChange={strokeColor => onChange({ strokeColor })} />
      </div>
      <div className="flex flex-wrap gap-5">
        <SceneCheckbox label={say('加粗', 'Bold')} checked={!!style.bold} onChange={bold => onChange({ bold })} />
        <SceneCheckbox label={say('背景底色', 'Background')} checked={!!bg} onChange={checked => onChange({ bg: checked ? '#000000' : null })} />
      </div>
      {!!bg && <SceneColor label={say('背景颜色', 'Background color')} value={color(bg, '#000000')} onChange={bg => onChange({ bg })} />}
      <button type="button" onClick={onReset} className="text-ink-3 text-xs underline underline-offset-4">{say('恢复预设', 'Reset to preset')}</button>
    </fieldset>
  </details>;
}
