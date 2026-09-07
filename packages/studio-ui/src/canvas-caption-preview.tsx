import { useEffect, useRef } from 'react';
import { drawPresetCaption } from '@pireel/studio-engine/caption-canvas';
import type { CaptionStyle } from '@pireel/studio-engine/composition';
import { loadFont } from './web-fonts';
import type { FxWord } from '@pireel/studio-engine/caption-fx';

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

export function CanvasCaptionPreview({ style, locale, tile = false, aspect = 9 / 16 }: {
  style: Partial<CaptionStyle>; locale: 'zh' | 'en'; tile?: boolean; aspect?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const words: FxWord[] = (locale === 'zh' ? ['让', '每句话', '都被', '看见'] : ['MAKE', 'EVERY', 'WORD', 'COUNT']).map((text, index) => ({ text, start: index * .6, end: (index + 1) * .6, emphasis: index >= 2 }));
    const viewStyle = tile ? { ...style, scale: 3.2, xPct: 50, yPct: 66, wPct: 78 } : style;
    const designWidth = 1080;
    const designHeight = tile ? designWidth / 1.15 : designWidth / aspect;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0; let height = 0; let visible = false; let disposed = false;
    let unsubscribe: (() => void) | undefined;
    const draw = (clock: number) => {
      if (!width || !height) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      ctx.setTransform(dpr * width / designWidth, 0, 0, dpr * height / designHeight, 0, 0);
      ctx.clearRect(0, 0, designWidth, designHeight);
      drawPresetCaption(ctx, words, viewStyle, reduced.matches ? 1.5 : clock % 2.4, designWidth, designHeight);
    };
    const update = () => { unsubscribe?.(); unsubscribe = undefined; draw(1.5); if (visible && !reduced.matches) unsubscribe = subscribe(draw); };
    const resize = new ResizeObserver(([entry]) => {
      if (!entry) return;
      width = entry.contentRect.width; height = entry.contentRect.height;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); draw(1.5);
    });
    const observer = new IntersectionObserver(([entry]) => { visible = !!entry?.isIntersecting; update(); });
    resize.observe(canvas); observer.observe(canvas); reduced.addEventListener('change', update);
    const fontReady = style.font ? loadFont(style.font, words.map((word) => word.text).join('')) : document.fonts.ready;
    void fontReady.then(() => { if (!disposed) draw(1.5); });
    return () => { disposed = true; unsubscribe?.(); resize.disconnect(); observer.disconnect(); reduced.removeEventListener('change', update); };
  }, [style, locale, tile, aspect]);
  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}
