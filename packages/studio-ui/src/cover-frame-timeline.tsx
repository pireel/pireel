import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { fmtTick, rulerStep, RULER_H } from '@pireel/studio-ui/timeline-utils';
import { coverFrameAtTime, type CoverFrameStripData, type CoverSourceFrame } from '@pireel/studio-ui/cover-frame-selection';

/** Read-only Studio filmstrip: an independent playhead never seeks or edits the project. */
export function CoverFrameTimeline({ strip, at, disabled, zh, onPreview, onCommit, onCancel }: {
  strip: CoverFrameStripData; at: number; disabled: boolean; zh: boolean;
  onPreview(frame: CoverSourceFrame): void; onCommit(frame: CoverSourceFrame): void; onCancel(): void;
}) {
  const viewport = useRef<HTMLDivElement>(null); const content = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600); const [zoom, setZoom] = useState(1);
  const drag = useRef<CoverSourceFrame | null>(null);
  useEffect(() => {
    const element = viewport.current; if (!element) return;
    const measure = () => setWidth(element.clientWidth || 600); measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    const wheel = (event: WheelEvent) => { if (event.ctrlKey) return; event.preventDefault(); element.scrollLeft += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY; };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); element.removeEventListener('wheel', wheel); };
  }, []);
  const duration = Math.max(strip.durationSec, 1 / strip.fps);
  const pps = Math.max(width - 16, strip.frames.length * 72) / duration * zoom;
  const step = rulerStep(pps); const max = Math.max(0, duration - 1 / strip.fps);
  const select = (seconds: number, commit = false) => { const frame = coverFrameAtTime(strip.ranges, seconds, strip.fps); if (frame) { drag.current = frame; onPreview(frame); if (commit) { onCommit(frame); drag.current = null; } } };
  const seek = (clientX: number) => {
    const element = viewport.current;
    if (element) { const bounds = element.getBoundingClientRect(); if (clientX < bounds.left || clientX > bounds.right) element.scrollLeft += clientX < bounds.left ? clientX - bounds.left : clientX - bounds.right; }
    select((clientX - (content.current?.getBoundingClientRect().left ?? 0)) / pps);
  };
  useEffect(() => {
    const element = viewport.current; if (!element || drag.current) return;
    const x = at * pps;
    if (x < element.scrollLeft || x > element.scrollLeft + element.clientWidth - 12) element.scrollLeft = Math.max(0, x - element.clientWidth / 2);
  }, [at, pps]);
  return <section aria-label={zh ? '视频缩略图时间轴' : 'Video frame strip'} className="border-line bg-panel shrink-0 overflow-hidden rounded-md border">
    <div className="text-ink-3 flex items-center gap-2 px-3 py-2 text-xs"><span>{zh ? '选帧' : 'Choose a frame'}</span><span className="font-mono text-[11px] tabular-nums">{at.toFixed(3)}s / {duration.toFixed(2)}s</span><span className="ml-auto text-[10px]">{zh ? '拖动选帧 · 滚动浏览' : 'Drag to scrub · Scroll to browse'}</span><button type="button" aria-label={zh ? '缩小时间轴' : 'Zoom out timeline'} disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value / 2))} className="p-1 disabled:opacity-30"><Minus size={13} /></button><button type="button" aria-label={zh ? '放大时间轴' : 'Zoom in timeline'} disabled={zoom >= 8} onClick={() => setZoom(value => Math.min(8, value * 2))} className="p-1 disabled:opacity-30"><Plus size={13} /></button></div>
    <div ref={viewport} data-cover-frame-scroll className="overflow-x-auto overscroll-contain pb-2">
      <div ref={content} role="slider" aria-label={zh ? '精确选帧' : 'Precise frame selection'} aria-valuemin={0} aria-valuemax={max} aria-valuenow={at} aria-valuetext={`${at.toFixed(3)}s`} aria-disabled={disabled} tabIndex={disabled ? -1 : 0} className="relative cursor-ew-resize touch-pan-x select-none focus-visible:outline-2 focus-visible:outline-accent" style={{ width: duration * pps + 16 }}
        onPointerDown={event => { if (disabled || event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); seek(event.clientX); }}
        onPointerMove={event => { if (drag.current) seek(event.clientX); }}
        onPointerUp={event => { if (!drag.current) return; seek(event.clientX); const frame = drag.current; drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); if (frame) onCommit(frame); }}
        onPointerCancel={() => { drag.current = null; onCancel(); }}
        onKeyDown={event => { if (disabled) return; const times: Record<string, number> = { ArrowLeft: at - 1 / strip.fps, ArrowRight: at + 1 / strip.fps, Home: 0, End: max, PageUp: at - 1, PageDown: at + 1 }; if (event.key in times) { event.preventDefault(); select(times[event.key], true); } }}>
        <div className="border-line bg-panel text-ink-4 relative border-b text-[9px]" style={{ height: RULER_H }}>{Array.from({ length: Math.ceil(duration / step) }, (_, index) => <div key={index} className="absolute inset-y-0" style={{ left: index * step * pps }}><span className="absolute left-1 top-0.5 tabular-nums">{fmtTick(index * step)}</span><div className="bg-line absolute bottom-0 h-1.5 w-px" /><div className="bg-line/60 absolute bottom-0 h-[3px] w-px" style={{ left: step * pps / 2 }} /></div>)}</div>
        <div className="relative my-2 h-14 overflow-hidden rounded-sm">{Array.from({ length: Math.ceil(duration * pps / 72) }, (_, index) => { const second = (index * 72 + 36) / pps; const frame = strip.frames.reduce<typeof strip.frames[number] | undefined>((best, item) => !best || Math.abs(item.timelineSec - second) < Math.abs(best.timelineSec - second) ? item : best, undefined); return frame ? <img key={index} src={frame.url} alt="" draggable={false} className="pointer-events-none absolute h-full object-cover" style={{ left: index * 72, width: Math.min(72, duration * pps - index * 72) }} /> : null; })}</div>
        <div data-cover-frame-playhead className="pointer-events-none absolute inset-y-0 w-0.5 bg-rose" style={{ left: at * pps }}><div className="absolute top-0 -left-[3px] h-0 w-0 border-x-4 border-t-[6px] border-x-transparent border-t-rose" /></div>
      </div>
    </div>
  </section>;
}
