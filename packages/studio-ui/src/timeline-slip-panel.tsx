'use client';

/**
 * The slip panel: a shot's whole source as one strip, with the part the shot plays as a box on it.
 * Dragging the box slides the shot's window along its source (the shot stays where it is on the
 * timeline and keeps its length); the box's edges trim it; a press elsewhere on the strip centres
 * the window there. The strip zooms like the timeline (ctrl/⌘ + wheel, or pinch) and a plain wheel
 * pans it. Nothing is committed until a drag is let go; while it lasts the timeline is told, so
 * the card and the preview can follow.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FilmstripFrame } from '@pireel/studio-ui/media';
import { t } from './i18n';
import { stripTiles } from './timeline-utils';

/** What a drag in the panel would do if let go now. */
export type SlipPanelLive = { kind: 'slip'; deltaSec: number } | { kind: 'trim'; edge: 'left' | 'right'; atSec: number };

const PANEL_H = 100;
const TILE_W = 40;
const MAX_ZOOM = 16;

export function TimelineSlipPanel({ shot, startSec, endSec, sourceDurationSec, strip, pps, host, onLive, onSlip, onTrim, onClose, keepOpen }: {
  shot: { id: string; srcStart: number; srcEnd: number };
  /** Where the shot sits on the timeline. */
  startSec: number;
  endSec: number;
  sourceDurationSec: number;
  strip: readonly FilmstripFrame[];
  pps: number;
  /** The timeline's scroll area: the panel floats above it, centred. */
  host: HTMLElement;
  onLive: (live: SlipPanelLive | null) => void;
  onSlip: (deltaSec: number) => void;
  /** Absent: the window's edges cannot be moved here. */
  onTrim?: (edge: 'left' | 'right', atSec: number) => void;
  onClose: () => void;
  /** A press outside the panel that must not close it (the button that opened it toggles it itself). */
  keepOpen?: (event: PointerEvent) => boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [live, setLiveState] = useState<SlipPanelLive | null>(null);
  const liveRef = useRef<SlipPanelLive | null>(null);
  const setLive = (next: SlipPanelLive | null) => { liveRef.current = next; setLiveState(next); onLive(next); };
  /** Null: the panel shows the source at the timeline's own scale, centred on the window. */
  const [view, setView] = useState<{ zoom: number; startSec: number } | null>(null);

  const dur = sourceDurationSec;
  const rate = (shot.srcEnd - shot.srcStart) / Math.max(0.001, endSec - startSec); // source seconds per timeline second
  const minSpan = Math.max(0.05, 0.2 * rate);
  const length = shot.srcEnd - shot.srcStart;
  let winStart = shot.srcStart + (live?.kind === 'slip' ? live.deltaSec : 0);
  let winEnd = shot.srcEnd + (live?.kind === 'slip' ? live.deltaSec : 0);
  if (live?.kind === 'trim' && live.edge === 'left') winStart = Math.min(Math.max(0, shot.srcStart + (live.atSec - startSec) * rate), winEnd - minSpan);
  if (live?.kind === 'trim' && live.edge === 'right') winEnd = Math.max(Math.min(dur, shot.srcEnd + (live.atSec - endSec) * rate), winStart + minSpan);
  winStart = Math.max(0, winStart);
  winEnd = Math.min(dur, Math.max(winEnd, winStart + minSpan));

  const hostBox = host.getBoundingClientRect();
  const W = Math.max(240, Math.min(960, hostBox.width - 80));
  const zoom = view ? Math.min(MAX_ZOOM, Math.max(1, view.zoom)) : Math.min(MAX_ZOOM, Math.max(1, (dur * pps) / W));
  const viewLen = dur / zoom;
  const viewStart = Math.min(Math.max(view ? view.startSec : (winStart + winEnd) / 2 - viewLen / 2, 0), Math.max(0, dur - viewLen));
  // Drags and the wheel read the view as it is now: zooming and following shift it mid-gesture.
  const geometry = useRef({ dur, W, zoom, viewStart, viewLen });
  useLayoutEffect(() => { geometry.current = { dur, W, zoom, viewStart, viewLen }; });
  const secAt = (clientX: number, box: DOMRect) => geometry.current.viewStart + ((clientX - box.left) / W) * geometry.current.viewLen;
  const pxOf = (sec: number) => ((sec - viewStart) / viewLen) * W;
  const clampDelta = (deltaSec: number) => Math.min(Math.max(deltaSec, -shot.srcStart), Math.max(0, dur - shot.srcEnd));
  const applyZoom = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const len = dur / z;
    setView({ zoom: z, startSec: Math.min(Math.max((winStart + winEnd) / 2 - len / 2, 0), Math.max(0, dur - len)) });
  };
  /** A zoomed view keeps the window in sight while it is dragged. */
  const follow = (from: number, to: number) => {
    const now = geometry.current;
    if (now.zoom <= 1) return;
    if (from < now.viewStart) setView({ zoom: now.zoom, startSec: Math.max(0, from) });
    else if (to > now.viewStart + now.viewLen) setView({ zoom: now.zoom, startSec: Math.min(Math.max(0, dur - now.viewLen), to - now.viewLen) });
  };
  const drag = (event: React.PointerEvent, onMove: (clientX: number) => void, onEnd: () => void) => {
    event.preventDefault();
    const move = (next: PointerEvent) => { if (next.buttons === 0) end(); else onMove(next.clientX); };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      onEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  // The panel takes every wheel event over it: the timeline underneath would scroll or zoom along.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const zoomAt = (clientX: number, factor: number) => {
      const now = geometry.current;
      const next = Math.min(MAX_ZOOM, Math.max(1, now.zoom * factor));
      if (Math.abs(next - now.zoom) < 1e-4) return;
      const len = now.dur / next;
      const box = (stripRef.current ?? panel).getBoundingClientRect();
      const fraction = Math.min(1, Math.max(0, (clientX - box.left) / now.W));
      setView({ zoom: next, startSec: Math.min(Math.max(now.viewStart + fraction * now.viewLen - fraction * len, 0), Math.max(0, now.dur - len)) });
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey || event.metaKey) { zoomAt(event.clientX, event.deltaY < 0 ? 1.1 : 0.9); return; }
      const now = geometry.current;
      if (now.zoom <= 1 + 1e-4) return; // the whole source is in view: nothing to pan
      const by = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      setView({ zoom: now.zoom, startSec: Math.min(Math.max(now.viewStart + (by / now.W) * now.viewLen, 0), Math.max(0, now.dur - now.viewLen)) });
    };
    const touches = new Map<number, number>();
    let pinch: { distance: number; zoom: number } | null = null;
    const spread = () => { const [a, b] = [...touches.values()]; return { distance: Math.max(8, Math.abs(a! - b!)), middle: (a! + b!) / 2 }; };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      touches.set(event.pointerId, event.clientX);
      if (touches.size === 2) pinch = { distance: spread().distance, zoom: geometry.current.zoom };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!touches.has(event.pointerId)) return;
      touches.set(event.pointerId, event.clientX);
      if (touches.size !== 2 || !pinch) return;
      const now = spread();
      const target = Math.min(MAX_ZOOM, Math.max(1, pinch.zoom * (now.distance / pinch.distance)));
      if (Math.abs(target - geometry.current.zoom) > 0.01) zoomAt(now.middle, target / geometry.current.zoom);
    };
    const onPointerEnd = (event: PointerEvent) => { touches.delete(event.pointerId); if (touches.size < 2) pinch = null; };
    panel.addEventListener('wheel', onWheel, { passive: false });
    panel.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      panel.removeEventListener('wheel', onWheel);
      panel.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    };
  }, []);

  // A press anywhere else, or Escape, closes it.
  const closeRef = useRef({ onClose, keepOpen });
  closeRef.current = { onClose, keepOpen };
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node | null) || closeRef.current.keepOpen?.(event)) return;
      closeRef.current.onClose();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current.onClose(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const startSlip = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    // A press inside the window drags it from where it was taken; one outside brings its centre there.
    const pressed = secAt(event.clientX, box);
    const windowStart = shot.srcStart + (liveRef.current?.kind === 'slip' ? liveRef.current.deltaSec : 0);
    const grab = pressed >= windowStart && pressed <= windowStart + length ? pressed - windowStart : length / 2;
    const apply = (clientX: number) => {
      const deltaSec = clampDelta(secAt(clientX, box) - grab - shot.srcStart);
      setLive({ kind: 'slip', deltaSec });
      follow(shot.srcStart + deltaSec, shot.srcEnd + deltaSec);
    };
    apply(event.clientX);
    drag(event, apply, () => {
      const last = liveRef.current;
      setLive(null);
      if (last?.kind === 'slip' && Math.abs(last.deltaSec) > 0.001) onSlip(last.deltaSec);
    });
  };
  const startTrim = (event: React.PointerEvent<HTMLDivElement>, edge: 'left' | 'right') => {
    if (!onTrim || event.button !== 0) return;
    event.stopPropagation();
    const box = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    let moved = false;
    drag(event, (clientX) => {
      moved = true;
      const sec = secAt(clientX, box);
      if (edge === 'left') {
        const next = Math.min(Math.max(0, sec), shot.srcEnd - minSpan);
        setLive({ kind: 'trim', edge, atSec: startSec + (next - shot.srcStart) / rate });
        follow(next, shot.srcEnd);
      } else {
        const next = Math.max(Math.min(dur, sec), shot.srcStart + minSpan);
        setLive({ kind: 'trim', edge, atSec: endSec + (next - shot.srcEnd) / rate });
        follow(shot.srcStart, next);
      }
    }, () => {
      const last = liveRef.current;
      setLive(null);
      if (moved && last?.kind === 'trim') onTrim(edge, last.atSec);
    });
  };

  const panelPps = W / viewLen;
  const tiles = stripTiles(strip as FilmstripFrame[], viewStart, viewStart + viewLen, Math.max(0.05, TILE_W / panelPps), panelPps);
  const left = Math.min(Math.max(hostBox.left + hostBox.width / 2 - (W + 16) / 2, 8), Math.max(8, window.innerWidth - W - 24));
  const handle = (edge: 'left' | 'right', at: number) => at >= -4 && at <= W + 4
    ? <div role="none" onPointerDown={(event) => startTrim(event, edge)} className="bg-accent absolute inset-y-0 z-10 w-1.5 cursor-ew-resize rounded-full opacity-80 hover:opacity-100" style={{ left: at - 3 }} />
    : null;
  return (
    <div ref={panelRef} className="fixed z-[70] rounded-lg border border-white/10 bg-black/85 p-2 shadow-xl backdrop-blur"
      style={{ left, top: Math.max(8, hostBox.top - PANEL_H - 6), width: W + 16 }} onPointerDown={(event) => event.stopPropagation()}>
      <div className="mb-1 flex items-center gap-2 text-[10px] text-white/70">
        <span className="shrink-0">{t('panels.slipWindow')}</span>
        <span className="min-w-0 flex-1 truncate text-right tabular-nums">{`${winStart.toFixed(1)}s – ${winEnd.toFixed(1)}s (${(winEnd - winStart).toFixed(1)}s) / ${dur.toFixed(1)}s`}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <button type="button" aria-label={t('panels.zoomOut')} className="h-4 w-4 rounded bg-white/10 leading-none hover:bg-white/20" onClick={() => applyZoom(zoom / 1.25)}>−</button>
          <input type="range" min={1} max={MAX_ZOOM} step={0.1} value={zoom} onChange={(event) => applyZoom(Number(event.target.value))} className="zoom-range w-24" aria-label={t('panels.slipWindow')} />
          <button type="button" aria-label={t('common.zoomIn')} className="h-4 w-4 rounded bg-white/10 leading-none hover:bg-white/20" onClick={() => applyZoom(zoom * 1.25)}>+</button>
        </span>
        <button type="button" aria-label={t('workbench.close')} className="shrink-0 text-white/60 hover:text-white" onClick={onClose}>✕</button>
      </div>
      <div className="relative" style={{ width: W }}>
        <div ref={stripRef} className="relative h-14 cursor-crosshair overflow-hidden rounded bg-white/5" style={{ width: W, touchAction: 'none' }} onPointerDown={startSlip}>
          {tiles.length
            ? tiles.map((tile, index) => <img key={index} src={tile.url} alt="" draggable={false} className="absolute top-0 h-full object-cover" style={{ left: tile.left, width: TILE_W + 1 }} />)
            : <div className="absolute inset-0 bg-gradient-to-r from-sky-500/25 to-sky-500/10" />}
          <div className="pointer-events-none absolute inset-y-0 left-0 bg-black/50" style={{ width: Math.min(W, Math.max(0, pxOf(winStart))) }} />
          <div className="pointer-events-none absolute inset-y-0 right-0 bg-black/50" style={{ width: Math.min(W, Math.max(0, W - pxOf(winEnd))) }} />
          <div className="ring-accent absolute inset-y-0 cursor-grab rounded ring-2 active:cursor-grabbing" style={{ left: pxOf(winStart), width: Math.max(6, pxOf(winEnd) - pxOf(winStart)) }} />
        </div>
        {/* The handles sit outside the strip's clipping, so a window at the edge of the view keeps
            them in reach; an end scrolled out of a zoomed view has none. */}
        {onTrim && handle('left', pxOf(winStart))}
        {onTrim && handle('right', pxOf(winEnd))}
      </div>
    </div>
  );
}
