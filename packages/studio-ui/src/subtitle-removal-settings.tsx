import { ERASURE_TIERS } from '@pireel/studio-engine/erasure-pricing';
import { useEffect, useRef } from 'react';
import { DEFAULT_SUBTITLE_REGION, erasureKind, type SubtitleRemovalOptions, type SubtitleRegion } from '@pireel/studio-engine/subtitle-removal';
import { SceneSelect, SceneCheckbox } from './scene-form-controls';
export function SubtitleRemovalSettings({ value, locale, disabled, onChange }: { value: SubtitleRemovalOptions; locale: 'zh' | 'en'; disabled: boolean; onChange(value: SubtitleRemovalOptions): void }) {
  const zh = locale === 'zh'; const kind = erasureKind(value); const tier = value.tier ?? 'standard';
  return <div className="space-y-4">
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="text-ink mb-2 text-sm font-medium">{zh ? '擦除档位' : 'Quality'}</legend>
      <div role="radiogroup" aria-label={zh ? '擦除档位' : 'Erasure quality'} className="space-y-2">
        {ERASURE_TIERS.map(item => <label key={item.id} className={'flex cursor-pointer items-start gap-3 rounded-lg border p-3 ' + (tier === item.id ? 'border-ink bg-panel' : 'border-line')}>
          <input type="radio" name="erasure-tier" value={item.id} checked={tier === item.id} onChange={() => onChange({ ...value, tier: item.id })} className="mt-0.5 accent-current"/>
          <span><span className="text-ink block text-sm font-medium">{item[locale]}</span><span className="text-ink-3 mt-1 block text-xs leading-relaxed">{item.description[locale]}</span></span>
        </label>)}
      </div>
    </fieldset>
    <SceneSelect label={zh ? '擦除内容' : 'Remove'} ariaLabel={zh ? '擦除内容' : 'Remove'} value={kind} disabled={disabled} onChange={kind => onChange({ tier, kind: kind as SubtitleRemovalOptions['kind'], mode: 'auto', ...(kind === 'all' ? { targets: ['subtitle', 'watermark'] } : {}) })} options={[
      { value: 'subtitles', label: zh ? '去字幕' : 'Subtitles' }, { value: 'watermark', label: zh ? '去水印' : 'Watermarks' }, { value: 'all', label: zh ? '字幕与水印' : 'Subtitles and watermarks' },
    ]}/>
    {kind === 'all' && <div className="space-y-3">
      {(['subtitle', 'watermark'] as const).map(target => { const targets = value.targets ?? ['subtitle', 'watermark']; return <SceneCheckbox key={target} label={target === 'subtitle' ? (zh ? '字幕' : 'Subtitles') : (zh ? (tier === 'precise' ? '水印与 Logo' : '文字水印') : (tier === 'precise' ? 'Watermarks and logos' : 'Text watermarks'))} checked={targets.includes(target)} disabled={disabled || (targets.length === 1 && targets.includes(target))} onChange={checked => onChange({ ...value, targets: checked ? [...targets, target] : targets.filter(item => item !== target) })}/>; })}
      <p className="text-ink-4 text-xs leading-relaxed">{zh ? '一次清理选中的字幕和水印。图形 Logo 请选精准档。' : 'Remove the selected subtitles and watermarks together.'}</p>
    </div>}
    {kind === 'watermark' && tier !== 'precise' && <p className="text-ink-3 text-xs leading-relaxed">{zh ? '本档自动检测文字水印；图形 Logo 和非文字角标请选精准档。' : 'This tier automatically detects text watermarks. Choose Precise for graphic logos and non-text corner marks.'}</p>}
    <SceneSelect label={zh ? '擦除范围' : 'Removal area'} ariaLabel={zh ? '擦除范围' : 'Removal area'} value={value.mode} disabled={disabled} onChange={mode => onChange(mode === 'region' ? { ...value, mode: 'region', region: DEFAULT_SUBTITLE_REGION } : { ...value, mode: 'auto', region: undefined })} options={[{ value: 'auto', label: zh ? '自动识别' : 'Detect automatically' }, { value: 'region', label: zh ? '限定区域' : 'Select a region' }]} />
    <p className="text-ink-3 text-xs leading-relaxed">{zh ? value.mode === 'auto' ? '自动检测所选类型的内容并修复背景。可限定区域以保护需要保留的画面。' : '拖动框选固定区域，整个选区都会被修复。请避开要保留的人物和物体；选区不会跟随目标移动。' : value.mode === 'auto' ? 'Detect selected content and repair the background. Select a region to protect the rest of the image.' : 'The entire fixed selection will be repaired. Avoid content you want to keep. The region does not follow moving objects.'}</p>
    {value.mode === 'region' && tier === 'precise' && <p className="text-ink-3 text-xs leading-relaxed">{zh ? '固定区域会跳过目标识别，可选择专业档降低成本。' : 'Fixed regions skip target detection. Professional can reduce the cost.'}</p>}
    <p className="text-ink-4 text-xs leading-relaxed">{zh ? '效果受背景、遮挡和运动影响，原视频保留。当前输出最高 1080p、30fps，较小视频不放大。' : 'Results depend on the background, occlusion and motion. Your original is kept. Output is capped at 1080p and 30fps; smaller videos are not upscaled.'}</p>
  </div>;
}

export function SubtitleRegionOverlay({ region, disabled, locale, onChange }: { region: SubtitleRegion; disabled: boolean; locale: 'zh' | 'en'; onChange(region: SubtitleRegion): void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => { if (disabled) start.current = null; }, [disabled]);
  const point = (event: React.PointerEvent<HTMLDivElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }; };
  return <div role="slider" aria-label={locale === 'zh' ? '擦除区域' : 'Removal region'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(region.y * 100)} aria-valuetext={`${Math.round(region.x * 100)}%, ${Math.round(region.y * 100)}%, ${Math.round(region.width * 100)}% × ${Math.round(region.height * 100)}%`} tabIndex={disabled ? -1 : 0} aria-disabled={disabled} data-scene-clip className="absolute inset-0 touch-none cursor-crosshair focus-visible:outline-2 focus-visible:outline-accent" onClick={event => event.stopPropagation()} onPointerDown={event => { if (disabled) return; event.preventDefault(); event.stopPropagation(); start.current = point(event); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => {
    if (!start.current || disabled) return; const end = point(event); const x = Math.min(start.current.x, end.x); const y = Math.min(start.current.y, end.y); const width = Math.abs(end.x - start.current.x); const height = Math.abs(end.y - start.current.y);
    if (width >= .01 && height >= .01) onChange({ x, y, width, height });
  }} onPointerUp={event => { start.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { start.current = null; }} onLostPointerCapture={() => { start.current = null; }} onKeyDown={event => {
    if (disabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); const delta = event.shiftKey ? .05 : .01;
    onChange({ ...region, x: Math.max(0, Math.min(1 - region.width, region.x + (event.key === 'ArrowRight' ? delta : event.key === 'ArrowLeft' ? -delta : 0))), y: Math.max(0, Math.min(1 - region.height, region.y + (event.key === 'ArrowDown' ? delta : event.key === 'ArrowUp' ? -delta : 0))) });
  }}><div className="pointer-events-none absolute border-2 border-white bg-white/10" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}><span className="absolute left-0 top-0 bg-black/70 px-2 py-1 text-[10px] text-white">{locale === 'zh' ? '擦除区域' : 'Removal area'}</span></div></div>;
}
