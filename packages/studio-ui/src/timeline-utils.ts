/** Pure layout constants and helpers for the studio timeline (no React state). */

import { type BlockKind, SHOT_TREATMENTS } from '@pireel/studio-engine/composition';
import type { FilmstripFrame } from './media';

export const PREVIEW_W = 108; // hover element preview width

export const ROW_H = 30; // overlay track (element/caption) row height: compact to save space (user's call)
export const SCENE_H = 78; // track 0 = scene rail, taller to fit scene cards
export const SCENE_PAD_T = 12; // gap above scene card (like a mainstream editor): drag from gap = marquee, from card = reorder; bigger on top for easier hit
export const SCENE_PAD_B = 8; // gap below scene card
export const ROW_GAP = 6;
export const RULER_H = 24;
export const GUTTER = 40;
export const CAP_LANE = -1; // "caption lane" sentinel track number: read-only, no drag/reorder, not in z-reorder, not in marquee; real track numbers are always >=0
export const EDGE_PAD = 12; // breathing room between gutter and content: keeps first block's selection ring (ring-2 outset) and first cut-point "+" half-circle (10px) from being clipped by the sticky gutter
export const SHOT_GAP = 2; // hairline gap between shot cards (taken off the right edge, left edge stays time-accurate)
export const MIN_PPS = 2; // min zoom: ~2px/s, shows minute scale (1 min ~= 120px, ticks go by minutes)
export const MAX_PPS = 260;
export const DEFAULT_PPS = 78;
export const MIN_DUR = 0.3;
export const SNAP_PX = 7;

/** Source-time-anchored filmstrip window (like a mainstream editor): tile k always covers source time
 *  [k,k+1)*tileDur; take tiles that intersect the window [srcStart,srcEnd). First tile's left
 *  can be negative (clipped by the card's overflow-hidden) — a split at 2.5 tiles gives 2.5
 *  tiles before and the rest continuing from the middle of tile 2.5, so trailing tiles never resample. */
export function stripTiles(strip: FilmstripFrame[], srcStart: number, srcEnd: number, tileDur: number, pps: number): { left: number; url: string }[] {
  if (!strip.length || tileDur <= 0 || srcEnd <= srcStart) return [];
  const tiles: { left: number; url: string }[] = [];
  for (let k = Math.floor(srcStart / tileDur); k * tileDur < srcEnd; k++) {
    const srcT = (k + 0.5) * tileDur;
    let url = strip[0]!.url;
    let bd = Infinity;
    for (const f of strip) {
      const d = Math.abs(f.t - srcT);
      if (d < bd) {
        bd = d;
        url = f.url;
      }
    }
    tiles.push({ left: (k * tileDur - srcStart) * pps, url });
  }
  return tiles;
}

/** Timeline chip category background colors (base label/icon/dot live in shared kind-meta.ts). */
export const KIND_CHIP: Record<BlockKind, { chip: string; chipSel: string }> = {
  caption: { chip: 'bg-rose-500/15 ring-rose-400/30 hover:bg-rose-500/25', chipSel: 'bg-rose-500/30 ring-2 ring-rose-400' },
  title: { chip: 'bg-amber-500/15 ring-amber-400/30 hover:bg-amber-500/25', chipSel: 'bg-amber-500/30 ring-2 ring-amber-400' },
  stat: { chip: 'bg-emerald-500/15 ring-emerald-400/30 hover:bg-emerald-500/25', chipSel: 'bg-emerald-500/30 ring-2 ring-emerald-400' },
  list: { chip: 'bg-sky-500/15 ring-sky-400/30 hover:bg-sky-500/25', chipSel: 'bg-sky-500/30 ring-2 ring-sky-400' },
  transition: { chip: 'bg-violet-500/15 ring-violet-400/30 hover:bg-violet-500/25', chipSel: 'bg-violet-500/30 ring-2 ring-violet-400' },
  media: { chip: 'bg-teal-500/15 ring-teal-400/30 hover:bg-teal-500/25', chipSel: 'bg-teal-500/30 ring-2 ring-teal-400' },
  custom: { chip: 'bg-slate-400/15 ring-slate-300/30 hover:bg-slate-400/25', chipSel: 'bg-slate-400/30 ring-2 ring-slate-400' },
};
export const TREATMENT_NAME: Record<string, string> = Object.fromEntries(SHOT_TREATMENTS.map((t) => [t.id, t.name]));

/** Adaptive ruler step: keep each cell >= ~64px. */
export function rulerStep(pps: number): number {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  for (const s of steps) if (s * pps >= 64) return s;
  return 1200;
}

/** Tick label: mm:ss for >=60s, otherwise Xs. */
export function fmtTick(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
