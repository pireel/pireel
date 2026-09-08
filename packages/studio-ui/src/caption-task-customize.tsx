import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@pireel/ui/select';
import { CanvasCaptionPreview } from './canvas-caption-preview';
import { WEB_FONTS } from '@pireel/studio-engine/font-library';
import { CAPTION_TRANSLATION_LANGUAGES, captionTaskStyle, captionTaskCanvas, type CaptionTaskDimensions, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { getCaptionPreset } from '@pireel/studio-engine/caption-presets';

export function CaptionTaskCustomize({ options, locale, disabled, source, onChange, onReset }: {
  options: CaptionTaskOptions; locale: 'zh' | 'en'; disabled: boolean; source?: CaptionTaskDimensions;
  onChange: (patch: NonNullable<CaptionTaskOptions['custom']>) => void; onReset: () => void;
}) {
  const zh = locale === 'zh';
  const say = (cn: string, en: string) => zh ? cn : en;
  const canvas = captionTaskCanvas(options.aspect, source ?? { width: 1080, height: 1920 });
  const style = captionTaskStyle(options, canvas);
  const outputScale = 1080 / Math.min(canvas.width, canvas.height);
  const outputFontPx = Math.round(48 * (style.scale ?? 1) * outputScale);
  const preset = getCaptionPreset(style.preset);
  const bg = style.bg === undefined ? preset.bg : style.bg;
  const color = (value: string | undefined | null, fallback: string) => value && /^#[a-f0-9]{6}$/i.test(value) ? value : fallback;
  const range = (label: string, value: number, min: number, max: number, step: number, change: (value: number) => void, display: string) => <label className="text-ink flex flex-col gap-2 text-xs"><span className="flex justify-between gap-3">{label}<span aria-hidden="true" className="text-ink-3 tabular-nums">{display}</span></span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(event) => change(Number(event.target.value))} className="w-full accent-[var(--color-accent)]" /></label>;
  const swatch = (label: string, value: string, change: (color: string) => void) => <label className="text-ink flex items-center justify-between gap-2 text-xs">{label}<input type="color" value={value} onChange={(event) => change(event.target.value)} className="border-line bg-panel h-7 w-9 cursor-pointer rounded border p-0.5" /></label>;
  return <details className="border-line mt-5 border-t pt-4">
    <summary className="text-ink cursor-pointer text-sm font-medium">{say('自定义样式', 'Customize style')}{options.custom && <span className="text-ink-3 ml-2 text-xs">{say('已调整', 'Edited')}</span>}</summary>
    <div role="region" aria-label={say('自定义字幕实时预览', 'Live custom caption preview')} className="border-line bg-bg sticky top-3 z-10 mt-4 rounded-lg border p-3 shadow-sm">
      <div className="bg-panel aspect-[2.4] w-full overflow-hidden rounded-md"><CanvasCaptionPreview style={{ ...style, xPct: 50, yPct: 75, sub: style.sub ? { ...style.sub, xPct: 50, yPct: options.layoutVersion === 2 ? 90 : undefined } : undefined }} locale={locale} aspect={2.4} sampleText={say('字幕|预览', 'Caption|preview')} sampleSubText={CAPTION_TRANSLATION_LANGUAGES.find((language) => language.id === options.translationLanguage)?.sample} /></div>
    </div>
    <fieldset disabled={disabled} className="mt-4 space-y-4 disabled:opacity-50">
      <div className="text-ink flex items-center justify-between gap-4 text-xs"><span>{say('字体', 'Font')}</span>
        <Select disabled={disabled} value={style.font ?? 'sans'} onValueChange={(font) => onChange({ font })}>
          <SelectTrigger aria-label={say('字体', 'Font')} className="border-line bg-bg w-[220px] max-w-[75%] text-xs shadow-none hover:bg-panel-2"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="sans">{say('现代黑体', 'Sans serif')}</SelectItem><SelectItem value="serif">{say('经典宋体', 'Serif')}</SelectItem><SelectItem value="mono">{say('等宽字体', 'Monospace')}</SelectItem>
            {WEB_FONTS.map((font) => <SelectItem key={font.id} value={'web:' + font.id}>{font.label[locale]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-5">{range(say('字号', 'Size'), outputFontPx, 24, 192, 1, (pixels) => onChange({ scale: pixels / outputScale / 48 }), `${outputFontPx}px`)}{range(say('每行宽度', 'Line width'), style.wPct ?? 84, 40, 94, 1, (wPct) => onChange({ wPct }), `${style.wPct ?? 84}%`)}</div>
      <div className="grid grid-cols-2 gap-5">{swatch(say('文字颜色', 'Text color'), color(style.color ?? preset.text, '#ffffff'), (value) => onChange({ color: value }))}{preset.mode === 'emphasis' && swatch(say('高亮颜色', 'Accent color'), color(style.accentColor ?? preset.emphasis, '#ffe34f'), (accentColor) => onChange({ accentColor }))}</div>
      <div className="grid grid-cols-2 gap-5">{range(say('描边粗细', 'Outline'), style.strokeWidth ?? 0, 0, 8, .5, (strokeWidth) => onChange({ strokeWidth }), String(style.strokeWidth ?? 0))}{swatch(say('描边颜色', 'Outline color'), color(style.strokeColor, '#000000'), (strokeColor) => onChange({ strokeColor }))}</div>
      <div className="grid grid-cols-2 gap-5"><label className="text-ink flex items-center gap-2 text-xs"><input type="checkbox" checked={!!style.bold} onChange={(event) => onChange({ bold: event.target.checked })} className="accent-[var(--color-accent)]" />{say('加粗', 'Bold')}</label><label className="text-ink flex items-center gap-2 text-xs"><input type="checkbox" checked={!!bg} onChange={(event) => onChange({ bg: event.target.checked ? '#000000' : null })} className="accent-[var(--color-accent)]" />{say('背景底色', 'Background')}</label></div>
      {!!bg && swatch(say('背景颜色', 'Background color'), color(bg, '#000000'), (value) => onChange({ bg: value }))}
      <button type="button" onClick={onReset} className="text-ink-3 text-xs underline underline-offset-4">{say('恢复预设', 'Reset to preset')}</button>
    </fieldset>
  </details>;
}
