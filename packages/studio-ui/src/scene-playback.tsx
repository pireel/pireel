import { Play, Pause } from 'lucide-react';
import { sceneActionClass } from './scene-action-styles';
import { useRef, type ReactNode, type PointerEvent } from 'react';
import { t } from './i18n';
export const sceneClock = (value: number) => `${Math.floor(Math.max(0, value) / 60)}:${(Math.max(0, value) % 60).toFixed(1).padStart(4, '0')}`;

/** Shared time axis and scrub/playhead implementation; transport controls share the scene action row. */
export function ScenePlayback({ time, duration, playing, onToggle, disabled = false, onPause, onSeek, actions, primary, children, header, footer, timelineRef, fps = 30 }: {
  time: number; duration: number; playing: boolean; onToggle: () => void; disabled?: boolean; fps?: number;
  onPause: () => void; onSeek: (time: number) => void;
  actions?: ReactNode; primary?: ReactNode; children?: ReactNode; header?: ReactNode; footer?: ReactNode;
  timelineRef?: { current: HTMLDivElement | null };
}) {
  const track = useRef<HTMLDivElement | null>(null); const pointer = useRef<number | null>(null);
  const total = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const current = Math.max(0, Math.min(total, Number.isFinite(time) ? time : 0)); const locked = disabled || !total;
  const seek = (value: number) => onSeek(Math.max(0, Math.min(total, value)));
  const at = (x: number) => { const rect = track.current?.getBoundingClientRect(); return rect?.width ? (x - rect.left) / rect.width * total : current; };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (locked || event.button !== 0 || (event.target as HTMLElement).closest('[data-scene-clip],input,a,select')) return;
    event.preventDefault(); pointer.current = event.pointerId; onPause(); seek(at(event.clientX)); event.currentTarget.setPointerCapture(event.pointerId);
  };
  const end = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (pointer.current !== event.pointerId) return;
    if (!cancelled && !locked) seek(at(event.clientX)); pointer.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  return <div className="shrink-0 space-y-3" data-scene-playback>
    <div className="flex flex-wrap items-center gap-1.5" data-scene-player-actions>
      <button type="button" className={sceneActionClass + ' mr-auto'} disabled={locked} onClick={onToggle} aria-label={playing ? (t('ui.scenePlayback.pause')) : (t('ui.scenePlayback.play'))}>{playing ? <Pause size={14}/> : <Play size={14}/>}</button>
      {actions}
    </div>
    <div className="bg-panel rounded-md p-3" aria-label={t('ui.scenePlayback.simpleTimeline')}>
      {header && <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">{header}</div>}
      <div className="overflow-x-auto"><div ref={element => { track.current = element; if (timelineRef) timelineRef.current = element; }} data-scene-time-track className="relative touch-none select-none cursor-crosshair" style={{ minWidth: 280 }} onPointerDown={down} onPointerMove={event => { if (!locked && pointer.current === event.pointerId) seek(at(event.clientX)); }} onPointerUp={event => end(event)} onPointerCancel={event => end(event, true)} onLostPointerCapture={() => { pointer.current = null; }}>
        <div className="text-ink-4 mb-2 flex justify-between text-[10px]">{Array.from({ length: 5 }, (_, i) => <span key={i}>{sceneClock(total * i / 4)}</span>)}</div>
        <div className="bg-panel-2 relative mb-2 h-7 overflow-hidden rounded" aria-label={t('ui.scenePlayback.videoTrack')}>{primary ?? <span className="text-ink-3 pointer-events-none px-2 text-[10px]">{t('ui.scenePlayback.video')}</span>}</div>
        {children}
        <div role="slider" aria-label={t('ui.scenePlayback.timelinePlayhead')} aria-valuemin={0} aria-valuemax={total} aria-valuenow={Number(current.toFixed(3))} aria-valuetext={sceneClock(current)} aria-disabled={locked} tabIndex={locked ? -1 : 0} className="absolute inset-y-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize rounded-sm outline-none focus-visible:bg-ink/15" style={{ left: `${total ? current / total * 100 : 0}%` }} onKeyDown={event => {
          if (locked) return;
          const steps: Record<string, number> = { ArrowLeft: -(event.shiftKey ? 1 : 1 / fps), ArrowRight: event.shiftKey ? 1 : 1 / fps, PageDown: 5, PageUp: -5 };
          const value = event.key === 'Home' ? 0 : event.key === 'End' ? total : event.key in steps ? current + steps[event.key] : null;
          if (value !== null) { event.preventDefault(); onPause(); seek(value); }
        }}><div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink"/><div className="pointer-events-none absolute -top-0.5 left-1/2 h-2.5 w-2 -translate-x-1/2 rounded-b-sm bg-ink"/></div>
      </div></div>
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  </div>;
}
