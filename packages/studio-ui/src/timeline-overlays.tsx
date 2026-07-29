'use client';

/** Playhead-store-subscribed timeline overlays: only these small components re-render at 60fps during playback. */

import { usePlayheadT } from './playhead';
import { SHOT_GAP } from './timeline-utils';

/** Playhead cursor: subscribes to the playhead store — at 60fps during playback only this small
 *  component re-renders, not the whole timeline.
 *  Horizontal move must use transform: changing left triggers layout + layout-shift every frame,
 *  fights the engine's rAF for the main thread, and causes visible stutter inside transition
 *  windows (confirmed via the user's Performance panel). */
export function PlayheadCursor({ pps }: { pps: number }) {
  const t = usePlayheadT();
  return (
    // above the sticky ruler (z-45), so the line still reads across it — but under the sticky gutter (z-50)
    <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-[46] will-change-transform" style={{ transform: `translateX(${t * pps}px)` }}>
      <div className="absolute top-0 bottom-0 -left-px w-0.5 bg-rose" />
      {/* Head marker: down-pointing arrow (border triangle, 8px base aligned with the line) */}
      <div className="absolute top-0 -left-[4px] h-0 w-0 border-x-4 border-t-[6px] border-x-transparent border-t-rose drop-shadow" />
    </div>
  );
}

/** Highlight ring for the scene under the playhead (selected state has its own indigo ring, drawn by the scene card). */
export function ActiveSceneRing({
  sceneSpans,
  pps,
  selectedShotIds,
}: {
  sceneSpans: { shot: { id: string }; start: number; end: number }[];
  pps: number;
  selectedShotIds: Set<string>;
}) {
  const t = usePlayheadT();
  const active = sceneSpans.find((sp) => t >= sp.start - 1e-3 && t < sp.end - 1e-3);
  // Selected shots (including all marquee members) already have an accent selection ring; the playhead's white ring yields so they don't stack
  if (!active || selectedShotIds.has(active.shot.id)) return null;
  const lastEnd = sceneSpans.length ? sceneSpans[sceneSpans.length - 1]!.end : 0;
  const gapR = active.end < lastEnd - 1e-3 ? SHOT_GAP : 0; // same rule as scene cards: hairline gap off the right edge
  return (
    <div
      className="pointer-events-none absolute top-3 bottom-2 left-0 z-10 rounded ring-2 ring-white/70 will-change-transform"
      // Horizontal move via transform: if the ring's jump at cut points went through left it would log layout-shift + full-track reflow, landing exactly on the transition's peak frame
      style={{ transform: `translateX(${active.start * pps}px)`, width: Math.max(8, (active.end - active.start) * pps - gapR) }}
    />
  );
}
