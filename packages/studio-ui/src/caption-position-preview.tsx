import { dubbingCaptionSample } from './caption-preview-text';
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { CAPTION_TRANSLATION_LANGUAGES, captionTaskGroupBottom, captionTaskStyle, fitCaptionTaskBilingualStyle, type CaptionTaskDimensions, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { emptyComposition, resolveSubCaptionStyle, type CaptionStyle } from '@pireel/studio-engine/composition';
import { BASE_CAPTION_FONT_PX, getCaptionPreset } from '@pireel/studio-engine/caption-presets';
import { captionLineSegments } from '@pireel/studio-engine/caption-layout-metrics';
import type { FxWord } from '@pireel/studio-engine/caption-fx';
import { CaptionStageSample } from './caption-stage-sample';
import { t } from './i18n';

function lineHeightPct(text: string, style: Partial<CaptionStyle>, canvas: CaptionTaskDimensions) {
  const base = getCaptionPreset(style.preset);
  const preset = style.bg === undefined ? base : { ...base, bg: style.bg ?? undefined };
  const words: FxWord[] = text.split('|').map((text, index) => ({ text, start: index, end: index + 1 }));
  const size = Math.max(10, Math.round(BASE_CAPTION_FONT_PX * (style.scale ?? 1)));
  const lines = captionLineSegments(words, preset, style.wPct ?? 84, style.scale ?? 1, canvas.width, { font: style.font, bold: style.bold });
  const lineHeight = size * 1.35 + (preset.bg ? Math.round(size * .22) * 2 : 0);
  return (lines.length * lineHeight + Math.max(0, lines.length - 1) * size * .15) / canvas.height * 100;
}

/** Dragging is local until release; cancel leaves the saved draft untouched. */
export function CaptionPositionPreview({ options, source, locale, disabled = false, onChange }: {
  options: CaptionTaskOptions; source: CaptionTaskDimensions; locale: 'zh' | 'en'; disabled?: boolean; onChange: (yPct: number) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; y: number; height: number; start: number; value: number; min: number; max: number } | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const canvas = { width: 1080, height: 1080 * source.height / source.width };
  const value = captionTaskGroupBottom(options, source);
  const shown = position ?? value;
  // Same sample words as the style cards, so a picked card and the preview read alike.
  const sample = dubbingCaptionSample(options) ?? [t('captions.samplePre'), t('captions.sampleWord'), t('captions.samplePost')].join('|');
  const translation = CAPTION_TRANSLATION_LANGUAGES.find((language) => language.id === options.translationLanguage)?.sample;
  const style = useMemo(() => fitCaptionTaskBilingualStyle(captionTaskStyle(options, source), canvas, translation ? [translation] : []), [options, source.width, source.height, translation]);
  const subStyle = translation && style.sub?.lang ? resolveSubCaptionStyle({ ...emptyComposition(), ...canvas, captionStyle: style }) : null;
  const delta = shown - value;
  const top = delta + Math.min(style.yPct! - lineHeightPct(sample, style, canvas), subStyle ? subStyle.yPct - lineHeightPct(translation!, subStyle, canvas) : 100);
  const bottom = delta + Math.max(style.yPct!, subStyle?.yPct ?? 0);
  const min = Math.min(90, Math.max(5, Math.ceil(shown - top + 2)));
  const max = Math.max(min, Math.min(95, Math.floor(98 - (bottom - shown))));
  const clamp = (next: number, lower = min, upper = max) => Math.round(Math.max(lower, Math.min(upper, next)) * 10) / 10;
  const cancel = () => { drag.current = null; setPosition(null); };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0 || drag.current) return;
    const height = frame.current?.getBoundingClientRect().height;
    if (!height) return;
    event.preventDefault(); event.currentTarget.focus();
    drag.current = { pointerId: event.pointerId, y: event.clientY, height, start: value, value, min, max };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPosition(value);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.value = clamp(current.start + (event.clientY - current.y) / current.height * 100, current.min, current.max);
    setPosition(current.value);
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const next = Math.abs(event.clientY - current.y) < .5 ? current.start : clamp(current.start + (event.clientY - current.y) / current.height * 100, current.min, current.max);
    drag.current = null; setPosition(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (next !== current.start) onChange(next);
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && drag.current) { event.preventDefault(); const pointerId = drag.current.pointerId; cancel(); event.currentTarget.releasePointerCapture?.(pointerId); return; }
    if (disabled || drag.current) return;
    const step = event.shiftKey ? 5 : 1;
    const next = event.key === 'ArrowUp' ? value - step : event.key === 'ArrowDown' ? value + step : event.key === 'Home' ? min : event.key === 'End' ? max : null;
    if (next == null) return;
    event.preventDefault(); onChange(clamp(next));
  };
  return <div ref={frame} data-caption-position-preview className="absolute inset-0">
    <div className="pointer-events-none absolute inset-0" aria-hidden style={{ transform: delta ? `translateY(${delta}%)` : undefined }}><CaptionStageSample style={style} canvas={canvas} text={sample} subText={translation} /></div>
    <div role="slider" aria-label={locale === 'zh' ? '字幕位置' : 'Caption position'} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={shown} aria-valuetext={`${shown}%`} aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
      title={locale === 'zh' ? '上下拖动字幕' : 'Drag captions up or down'}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={(event) => { if (drag.current?.pointerId === event.pointerId) cancel(); }} onLostPointerCapture={(event) => { if (drag.current?.pointerId === event.pointerId) cancel(); }} onKeyDown={key} data-dragging={position != null}
      className="absolute z-10 touch-none select-none rounded-md border border-transparent outline-none hover:border-white/50 focus-visible:border-white/70 data-[dragging=true]:border-white/70"
      style={{ left: `${(style.xPct ?? 50) - (style.wPct ?? 84) / 2}%`, width: `${style.wPct ?? 84}%`, top: `${(top + bottom) / 2}%`, transform: 'translateY(-50%)', height: `max(44px, ${bottom - top}%)`, cursor: position != null ? 'grabbing' : 'ns-resize', pointerEvents: disabled ? 'none' : 'auto' }} />
  </div>;
}
