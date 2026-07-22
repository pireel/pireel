/**
 * Playhead external store — the per-frame t during playback no longer goes through React state
 * (re-rendering the whole tree at 60fps is too expensive); only the small components that genuinely
 * need continuous time (transport readout, timeline cursor, current-scene highlight) subscribe.
 * Coarse-grained consumers (debug overlay, liveGeom) still use the workbench's t state (updated only on seek/pause).
 */

import { useSyncExternalStore } from 'react';

let t = 0;
const subs = new Set<() => void>();

export const playhead = {
  get: (): number => t,
  set(v: number): void {
    if (v === t) return;
    t = v;
    subs.forEach((f) => f());
  },
  subscribe(f: () => void): () => void {
    subs.add(f);
    return () => subs.delete(f);
  },
};

/** Subscribe to the playhead (seconds); use only in leaf components that must follow every frame. */
export function usePlayheadT(): number {
  return useSyncExternalStore(playhead.subscribe, playhead.get, () => 0);
}
