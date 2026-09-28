import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { CAPTION_ART_PRESETS, CAPTION_STYLE_PRESETS } from '@pireel/studio-engine/caption-presets';
import { CaptionPresetSample } from './captions-panel';
import { t } from './i18n';

const demoUrl = new URL('./workflow-art/caption-demo.mp4', import.meta.url).href;

/** The editor's own style catalog, drawn by the same renderer as its style panel, so what the
 *  landing shows is what the editor offers. */
const SHOWCASE = [...CAPTION_ART_PRESETS, ...CAPTION_STYLE_PRESETS];
/** Entry motion replayed on every switch; stacked looks pop, flat lines rise. */
const motionOf = (preset: (typeof SHOWCASE)[number]) => (preset.stack ? 'pop' : 'rise');

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
  const cycling = !hovered && !focused && !touchSelection && !paused && !suspended && !reduced;
  const demoText: [string, string, string] = locale === 'zh' ? ['让每句话', '都被', '看见'] : ['Make every', 'word', 'count'];
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
    // Keep the cycling card in view inside the strip without scrolling the dialog.
    if (!cycling || !list.current) return;
    const element = list.current.querySelector<HTMLElement>(`[data-preset="${active.id}"]`);
    if (!element) return;
    const viewport = list.current.getBoundingClientRect();
    const card = element.getBoundingClientRect();
    if (card.right > viewport.right) list.current.scrollLeft += card.right - viewport.right + 8;
    if (card.left < viewport.left) list.current.scrollLeft -= viewport.left - card.left + 8;
  }, [active.id, cycling]);
  return <div className="my-2 w-full min-w-0 space-y-3">
    <div data-caption-demo-frame className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: '16 / 9' }}>
      <video ref={video} src={demoUrl} autoPlay loop muted playsInline preload="auto" aria-label={locale === 'zh' ? '字幕视频预览' : 'Caption video preview'} className="absolute inset-0 h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/45 to-transparent" />
      <div data-preview-style={active.id} className="pointer-events-none absolute inset-x-0 bottom-[11%] flex justify-center">
        <div key={active.id} className="caption-motion-preview origin-bottom scale-[1.7] sm:scale-[2.1]" data-motion={reduced ? undefined : motionOf(active)}>
          <span className="caption-motion-line"><CaptionPresetSample p={active} segments={demoText} /></span>
        </div>
      </div>
      <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">{t(active.name)}</span>
      {!reduced && <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? (locale === 'zh' ? '播放预览' : 'Play preview') : (locale === 'zh' ? '暂停预览' : 'Pause preview')} className="absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/40 text-white">{paused ? <Play size={12} /> : <Pause size={12} />}</button>}
    </div>
    <div ref={list} role="group" aria-label={locale === 'zh' ? '字幕效果' : 'Caption styles'} onPointerLeave={() => setHovered(null)}
      className="-mx-1 flex snap-x gap-2 overflow-x-auto overscroll-contain px-1 pb-1 [scrollbar-width:thin]">
      {SHOWCASE.map((item, index) => <button key={item.id} type="button" data-preset={item.id} aria-pressed={active.id === item.id} aria-label={t(item.name)}
        onPointerEnter={(event) => { if (event.pointerType !== 'touch') { setAutomatic(index); setHovered(item.id); } }}
        onPointerDown={(event) => { lastPointer.current = event.pointerType; }}
        onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) { setAutomatic(index); setFocused(item.id); } }}
        onBlur={() => setFocused(null)}
        onClick={() => { if (lastPointer.current === 'touch') setTouchSelection((current) => current === item.id ? null : item.id); }}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.currentTarget.blur(); setTouchSelection(null); } }}
        className="group w-[118px] shrink-0 snap-start text-left focus-visible:outline-none">
        <span className={'flex h-[76px] items-center justify-center overflow-hidden rounded-lg border-2 bg-[#26262a] px-2 transition-colors ' + (active.id === item.id ? 'border-accent' : 'border-transparent group-hover:border-ink-4 group-focus-visible:border-ink-4')}>
          <CaptionPresetSample p={item} />
        </span>
        <span className={'mt-1.5 block truncate text-[11px] ' + (active.id === item.id ? 'text-ink font-medium' : 'text-ink-3')}>{t(item.name)}</span>
      </button>)}
    </div>
  </div>;
}
