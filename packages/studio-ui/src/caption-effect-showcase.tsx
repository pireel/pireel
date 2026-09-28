import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { CAPTION_ART_PRESETS, CAPTION_STYLE_PRESETS } from '@pireel/studio-engine/caption-presets';
import { CanvasCaptionPreview } from './canvas-caption-preview';
import { t } from './i18n';

/** The workbench's own style catalog, so what the landing shows is what the editor offers. */
const SHOWCASE = [...CAPTION_ART_PRESETS, ...CAPTION_STYLE_PRESETS].map(preset => ({ id: preset.id, name: preset.name, style: { preset: preset.id } }));

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
  const active = SHOWCASE.find((item) => item.id === (hovered ?? focused ?? touchSelection)) ?? SHOWCASE[automatic]!;
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
    const interval = setInterval(() => { if (!document.hidden) setAutomatic((index) => (index + 1) % SHOWCASE.length); }, 1400);
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
  return <div className="my-2 grid grid-cols-[100px_minmax(0,1fr)] gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
    <div className="relative min-h-0">
    <div ref={list} role="group" aria-label={locale === 'zh' ? '字幕效果' : 'Caption styles'} className="absolute inset-0 space-y-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]" onPointerLeave={() => setHovered(null)}>
      {SHOWCASE.map((item, index) => <button key={item.id} type="button" data-preset={item.id} aria-pressed={active.id === item.id} aria-label={t(item.name)}
        onPointerEnter={(event) => { if (event.pointerType !== 'touch') { setAutomatic(index); setHovered(item.id); } }}
        onPointerDown={(event) => { lastPointer.current = event.pointerType; }}
        onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) { setAutomatic(index); setFocused(item.id); } }}
        onBlur={() => setFocused(null)}
        onClick={() => { if (lastPointer.current === 'touch') setTouchSelection((current) => current === item.id ? null : item.id); }}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.currentTarget.blur(); setTouchSelection(null); } }}
        className={'block w-full overflow-hidden rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-accent ' + (active.id === item.id ? 'border-ink bg-panel-2' : 'border-transparent bg-panel hover:border-ink-4')}>
        <span className="block aspect-[4] w-full"><CanvasCaptionPreview style={{ ...item.style, scale: 2.4, xPct: 50, yPct: 78, wPct: 94 }} locale={locale} aspect={4} sampleText={locale === 'zh' ? '让表达|更精彩' : 'YOUR|WORDS'} playbackTime={playbackTime} paused={paused || suspended || reduced} /></span>
      </button>)}
    </div>
    </div>
    <div data-caption-demo-frame className="relative w-full self-start overflow-hidden rounded-lg bg-panel" style={{ aspectRatio: '16 / 9' }}>
      <video ref={video} src={demoUrl} autoPlay loop muted playsInline preload="auto" aria-label={locale === 'zh' ? '字幕视频预览' : 'Caption video preview'} className="absolute inset-0 h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-0"><CanvasCaptionPreview style={{ ...active.style, scale: 1, yPct: 83, wPct: 90 }} locale={locale} aspect={16 / 9} playbackTime={playbackTime} paused={paused || suspended || reduced} /></div>
      {!reduced && <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? (locale === 'zh' ? '播放预览' : 'Play preview') : (locale === 'zh' ? '暂停预览' : 'Pause preview')} className="absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/40 text-white">{paused ? <Play size={12} /> : <Pause size={12} />}</button>}
    </div>
  </div>;
}
