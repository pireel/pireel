import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CAPTION_TASK_PRESETS, captionTaskStyle, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { studioProviders } from '@pireel/studio-engine/providers';
import { CanvasCaptionPreview } from './canvas-caption-preview';

export function CaptionPresetCarousel({ options, locale, disabled, onSelect }: { options: CaptionTaskOptions; locale: 'zh' | 'en'; disabled: boolean; onSelect: (id: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const measure = () => { const el = scrollRef.current; if (el) setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 }); };
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const observer = new ResizeObserver(measure); observer.observe(el); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    const selected = el?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!el || !selected) return;
    const left = selected.offsetLeft;
    if (left < el.scrollLeft || left + selected.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollTo({ left });
  }, [options.presetId]);
  const page = (direction: number) => {
    const el = scrollRef.current;
    el?.scrollBy({ left: direction * el.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return <div>
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-ink text-sm font-medium">{locale === 'zh' ? '字幕样式' : 'Caption style'}</h2>
      <div className="flex gap-1">
        <button type="button" aria-label={locale === 'zh' ? '上一页样式' : 'Previous styles'} disabled={edges.start} onClick={() => page(-1)} className="border-line text-ink flex size-7 items-center justify-center rounded-full border disabled:opacity-25"><ChevronLeft size={15} /></button>
        <button type="button" aria-label={locale === 'zh' ? '下一页样式' : 'Next styles'} disabled={edges.end} onClick={() => page(1)} className="border-line text-ink flex size-7 items-center justify-center rounded-full border disabled:opacity-25"><ChevronRight size={15} /></button>
      </div>
    </div>
    <div ref={scrollRef} onScroll={measure} role="region" aria-label={locale === 'zh' ? '字幕样式列表' : 'Caption styles'} tabIndex={0} className="relative flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-0.5 pb-2 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {CAPTION_TASK_PRESETS.filter((item) => item.id !== 'keywords' || !!studioProviders().captionEmphasis).map((item) => <button key={item.id} type="button" disabled={disabled} aria-pressed={options.presetId === item.id} onClick={() => onSelect(item.id)} className="group w-[92px] shrink-0 snap-start text-center focus-visible:outline-2 focus-visible:outline-accent">
        <span className={'bg-panel block aspect-[1.15] overflow-hidden rounded-lg border-2 ' + (options.presetId === item.id ? 'border-ink' : 'border-transparent group-hover:border-ink-4')}><CanvasCaptionPreview style={options.presetId === item.id ? captionTaskStyle(options) : item.style} locale={locale} tile /></span>
        <span className="text-ink-3 mt-2 block truncate text-xs">{item.name[locale]}</span>
      </button>)}
    </div>
  </div>;
}
