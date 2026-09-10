import { useEffect, useRef } from 'react';
import { fitCaptionTaskBilingualStyle } from '@pireel/studio-engine/caption-task';
import { drawPresetCaption } from '@pireel/studio-engine/caption-canvas';
import { emptyComposition, resolveSubCaptionStyle, type CaptionStyle } from '@pireel/studio-engine/composition';
import { loadFont } from './web-fonts';
import type { FxWord } from '@pireel/studio-engine/caption-fx';
import { captionLineSegments } from '@pireel/studio-engine/caption-layout-metrics';
import { getCaptionPreset } from '@pireel/studio-engine/caption-presets';

const listeners = new Set<(time: number) => void>();
let frame = 0;
let last = 0;
function tick(time: number) {
  if (time - last > 1000 / 24 && !document.hidden) { for (const draw of listeners) draw(time / 1000); last = time; }
  frame = listeners.size ? requestAnimationFrame(tick) : 0;
}
function subscribe(draw: (time: number) => void) {
  listeners.add(draw); if (!frame) frame = requestAnimationFrame(tick);
  return () => { listeners.delete(draw); if (!listeners.size && frame) { cancelAnimationFrame(frame); frame = 0; } };
}

export function CanvasCaptionPreview({ style, locale, tile = false, aspect = 9 / 16, sampleText, sampleSubText, playbackTime, paused = false }: {
  style: Partial<CaptionStyle>; locale: 'zh' | 'en'; tile?: boolean; aspect?: number; sampleText?: string; sampleSubText?: string; playbackTime?: () => number; paused?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const words: FxWord[] = (sampleText ? sampleText.split('|') : locale === 'zh' ? ['让', '每句话', '都被', '看见'] : ['MAKE', 'EVERY', 'WORD', 'COUNT']).map((text, index) => ({ text, start: index * .6, end: (index + 1) * .6, emphasis: sampleText ? index === 1 : index >= 2 }));
    let viewStyle = tile ? { ...style, scale: 3.2, xPct: 50, yPct: 66, wPct: 78 } : style;
    const designWidth = 1080;
    const designHeight = tile ? designWidth / 1.15 : designWidth / aspect;
    const fitTile = () => {
      if (!tile) return;
      const base = getCaptionPreset(style.preset);
      const preset = style.bg === undefined ? base : { ...base, bg: style.bg ?? undefined };
      const fits = (scale: number) => captionLineSegments(words, preset, 78, scale, designWidth, {
        font: style.font, bold: style.bold, measureText: (text, font) => { ctx.font = font; return ctx.measureText(text).width; },
      }).length <= 2;
      let low = .25; let high = 3.2;
      for (let i = 0; i < 12; i++) {
        const mid = (low + high) / 2;
        if (fits(mid)) low = mid; else high = mid;
      }
      viewStyle = { ...viewStyle, scale: fits(3.2) ? 3.2 : low };
    };
    fitTile();
    if (!tile && sampleSubText) viewStyle = fitCaptionTaskBilingualStyle(viewStyle, { width: designWidth, height: designHeight }, [sampleSubText]);
    const subStyle = sampleSubText && style.sub?.lang ? resolveSubCaptionStyle({ ...emptyComposition(), width: designWidth, height: designHeight, captionStyle: viewStyle }) : null;
    const subWords: FxWord[] = sampleSubText ? [{ text: sampleSubText, start: 0, end: words.length * .6 }] : [];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0; let height = 0; let visible = false; let disposed = false;
    let unsubscribe: (() => void) | undefined;
    const draw = (clock: number) => {
      if (!width || !height) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      ctx.setTransform(dpr * width / designWidth, 0, 0, dpr * height / designHeight, 0, 0);
      ctx.clearRect(0, 0, designWidth, designHeight);
      drawPresetCaption(ctx, words, viewStyle, reduced.matches ? 1.5 : (playbackTime?.() ?? clock) % (words.length * .6), designWidth, designHeight);
      if (subStyle) drawPresetCaption(ctx, subWords, subStyle, 0, designWidth, designHeight);
    };
    const update = () => { unsubscribe?.(); unsubscribe = undefined; draw(1.5); if (visible && !reduced.matches && !paused) unsubscribe = subscribe(draw); };
    const resize = new ResizeObserver(([entry]) => {
      if (!entry) return;
      width = entry.contentRect.width; height = entry.contentRect.height;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); draw(1.5);
    });
    const observer = new IntersectionObserver(([entry]) => { visible = !!entry?.isIntersecting; update(); });
    resize.observe(canvas); observer.observe(canvas); reduced.addEventListener('change', update);
    const fontReady = Promise.all([style.font ? loadFont(style.font, words.map((word) => word.text).join('')) : document.fonts.ready, subStyle?.font ? loadFont(subStyle.font, sampleSubText) : Promise.resolve()]);
    void fontReady.then(() => { if (!disposed) { fitTile(); draw(1.5); } });
    return () => { disposed = true; unsubscribe?.(); resize.disconnect(); observer.disconnect(); reduced.removeEventListener('change', update); };
  }, [style, locale, tile, aspect, sampleText, sampleSubText, playbackTime, paused]);
  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}
