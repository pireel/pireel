import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { CAPTION_TASK_PRESETS } from '@pireel/studio-engine/caption-task';
import { CanvasCaptionPreview } from './canvas-caption-preview';

const demoUrl = new URL('./workflow-art/caption-demo.mp4', import.meta.url).href;

export function CaptionEffectShowcase({ locale, suspended = false }: { locale: 'zh' | 'en'; suspended?: boolean }) {
  const [automatic, setAutomatic] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [touchSelection, setTouchSelection] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const lastPointer = useRef('mouse');
  const active = CAPTION_TASK_PRESETS.find((item) => item.id === (hovered ?? focused ?? touchSelection)) ?? CAPTION_TASK_PRESETS[automatic]!;
  const playbackTime = useCallback(() => video.current?.currentTime ?? 0, []);
  const cycling = !hovered && !focused && !touchSelection && !paused && !suspended && !reduced;
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(preference.matches);
    change(); preference.addEventListener('change', change);
    return () => preference.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!cycling) return;
    const interval = setInterval(() => { if (!document.hidden) setAutomatic((index) => (index + 1) % CAPTION_TASK_PRESETS.length); }, 2800);
    return () => clearInterval(interval);
  }, [cycling]);
  useEffect(() => {
    if (!video.current) return;
    if (paused || suspended || reduced) video.current.pause();
    else void video.current.play().catch(() => setPaused(true));
  }, [paused, suspended, reduced]);
  useEffect(() => {
    if (!cycling || !list.current) return;
    const element = list.current.querySelector<HTMLElement>(`[data-preset="${active.id}"]`);
    if (!element) return;
    const viewport = list.current.getBoundingClientRect();
    const row = element.getBoundingClientRect();
    if (row.bottom > viewport.bottom) list.current.scrollTop += row.bottom - viewport.bottom;
    if (row.top < viewport.top) list.current.scrollTop -= viewport.top - row.top;
  }, [active.id, cycling]);
  return <div className="my-2 grid grid-cols-[minmax(0,1fr)_minmax(0,180px)] gap-4">
    <div ref={list} role="group" aria-label={locale === 'zh' ? '字幕效果' : 'Caption styles'} className="max-h-80 space-y-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]" onPointerLeave={() => setHovered(null)}>
      {CAPTION_TASK_PRESETS.map((item, index) => <button key={item.id} type="button" data-preset={item.id} aria-pressed={active.id === item.id}
        onPointerEnter={(event) => { if (event.pointerType !== 'touch') { setAutomatic(index); setHovered(item.id); } }}
        onPointerDown={(event) => { lastPointer.current = event.pointerType; }}
        onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) { setAutomatic(index); setFocused(item.id); } }}
        onBlur={() => setFocused(null)}
        onClick={() => { if (lastPointer.current === 'touch') setTouchSelection((current) => current === item.id ? null : item.id); }}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.currentTarget.blur(); setTouchSelection(null); } }}
        className={'flex min-h-9 w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent ' + (active.id === item.id ? 'bg-panel-2 text-ink font-medium' : 'text-ink-3 hover:text-ink')}>
        {item.name[locale]}
      </button>)}
    </div>
    <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-panel">
      <video ref={video} src={demoUrl} autoPlay loop muted playsInline preload="auto" aria-label={locale === 'zh' ? '字幕视频预览' : 'Caption video preview'} className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-0"><CanvasCaptionPreview style={{ ...active.style, scale: 1.7, yPct: 83, wPct: 90 }} locale={locale} aspect={9 / 16} playbackTime={playbackTime} paused={paused || suspended || reduced} /></div>
      {!reduced && <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? (locale === 'zh' ? '播放预览' : 'Play preview') : (locale === 'zh' ? '暂停预览' : 'Pause preview')} className="absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/40 text-white">{paused ? <Play size={12} /> : <Pause size={12} />}</button>}
    </div>
  </div>;
}
