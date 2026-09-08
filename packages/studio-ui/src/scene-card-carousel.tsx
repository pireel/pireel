import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Same 88px card floor and 6px gap as Studio's asset grid, in a continuous two-row strip. */
export function SceneCardCarousel<T extends { id: string }>({ items, selectedId, header, label, previousLabel, nextLabel, renderItem, empty }: {
  items: T[]; selectedId?: string; header: ReactNode; label: string;
  previousLabel: string; nextLabel: string; renderItem: (item: T) => ReactNode; empty?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);
  const [edges, setEdges] = useState({ start: true, end: true });
  const measure = () => {
    const el = scrollRef.current;
    if (el) setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  };
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const resize = () => { if (el.clientWidth > 0) setColumns(Math.max(1, Math.floor((el.clientWidth + 6) / (88 + 6)))); measure(); };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    return () => observer.disconnect();
  }, []);
  const ids = items.map((item) => item.id).join('|');
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const selected = items.findIndex((item) => item.id === selectedId);
    const target = el.children[selected] as HTMLElement | undefined;
    if (target) {
      const left = target.offsetLeft;
      const right = left + target.offsetWidth;
      if (left < el.scrollLeft) el.scrollTo?.({ left });
      else if (right > el.scrollLeft + el.clientWidth) el.scrollTo?.({ left: right - el.clientWidth });
    }
    measure();
  }, [selectedId, ids, columns]);
  const page = (direction: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + direction * el.clientWidth)), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return <div>
    <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
      {header}
      <div className="flex shrink-0 gap-1">
        <button type="button" aria-label={previousLabel} disabled={edges.start} onClick={() => page(-1)} className="text-ink hover:bg-panel-2 flex size-7 items-center justify-center rounded-md disabled:opacity-25"><ChevronLeft size={15} /></button>
        <button type="button" aria-label={nextLabel} disabled={edges.end} onClick={() => page(1)} className="text-ink hover:bg-panel-2 flex size-7 items-center justify-center rounded-md disabled:opacity-25"><ChevronRight size={15} /></button>
      </div>
    </div>
    <div ref={scrollRef} onScroll={measure} role="region" aria-label={label} tabIndex={0}
      className="relative grid grid-flow-col grid-rows-2 gap-1.5 pt-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ gridAutoColumns: `calc((100% - ${(columns - 1) * 6}px) / ${columns})` }}>
      {items.map((item) => <div key={item.id} className="min-w-0">{renderItem(item)}</div>)}
    </div>
    {!items.length && empty}
  </div>;
}
