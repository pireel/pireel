'use client';

/** Playhead-store-subscribed timeline overlays: only these small components re-render at 60fps during playback. */

import { usePlayheadT } from './playhead';
import type { PointerEvent as ReactPointerEvent } from 'react';

const PLAYHEAD_HIT_RADIUS_PX = 8;

/** Hover guide yields inside the playhead's full-height drag target. */
export function HoverCursor({ second, pps }: { second: number; pps: number }) {
  const playheadSecond = usePlayheadT();
  if (Math.abs(second - playheadSecond) * pps <= PLAYHEAD_HIT_RADIUS_PX) return null;
  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 left-0 z-20 w-px bg-yellow-400/90 shadow-[0_0_4px_rgba(250,204,21,0.65)] will-change-transform"
      style={{ transform: `translateX(${second * pps}px)` }}
    />
  );
}

/** Inspector-style guide shown while Chat is asking the user to pick an exact frame. */
export function FramePickCursor({ second, pps }: { second: number; pps: number }) {
  return (
    <div
      data-frame-pick-cursor
      className="pointer-events-none absolute top-0 bottom-0 left-0 z-[48] w-px bg-accent shadow-[0_0_7px_color-mix(in_srgb,var(--color-accent)_55%,transparent)] will-change-transform"
      style={{ transform: `translateX(${second * pps}px)` }}
    >
      <span className="bg-ink text-bg absolute top-1 left-1.5 rounded-sm px-1.5 py-0.5 font-mono text-[9px] leading-none whitespace-nowrap shadow-sm">
        {second.toFixed(2)}s
      </span>
    </div>
  );
}

/** Playhead cursor: subscribes to the playhead store — at 60fps during playback only this small
 *  component re-renders, not the whole timeline.
 *  Horizontal move must use transform: changing left triggers layout + layout-shift every frame,
 *  fights the engine's rAF for the main thread, and causes visible stutter inside transition
 *  windows (confirmed via the user's Performance panel). */
export function PlayheadCursor({
  pps,
  onPointerDown,
}: {
  pps: number;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const t = usePlayheadT();
  return (
    // above the sticky ruler (z-45), so the line still reads across it — but under the sticky gutter (z-50)
    <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-[46] will-change-transform" style={{ transform: `translateX(${t * pps}px)` }}>
      {/* The full-height transparent hit target makes every part of the playhead draggable without
          making the visible cursor visually heavy. */}
      <div
        data-playhead-drag
        className="pointer-events-auto absolute top-0 bottom-0 -left-2 w-4 cursor-ew-resize touch-none"
        onPointerDown={onPointerDown}
      />
      <div className="absolute top-0 bottom-0 -left-px w-0.5 bg-rose" />
      {/* Head marker: down-pointing arrow (border triangle, 8px base aligned with the line) */}
      <div className="absolute top-0 -left-[4px] h-0 w-0 border-x-4 border-t-[6px] border-x-transparent border-t-rose drop-shadow" />
    </div>
  );
}
