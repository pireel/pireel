/**
 * Timeline waveform drawing — the pure path builders shared by the music lane's chips and the scene
 * cards' audio bands. No React, no state: given peaks and a box, they return an SVG path string, which
 * is what lets the callers memoize them (rebuilding these inside a render is what made dragging stutter).
 */

import { fadeShape } from '@pireel/studio-engine/composition';

/** Waveform vertical scale: dBFS against a noise floor, the pro-tool convention (the reference editor
 *  normalizes 20·log10(peak) over a -50 dB floor; Audacity's Waveform (dB) view and Premiere's
 *  "logarithmic waveform scaling" are the same idea). Linear amplitude draws everything quiet as a flat
 *  line — hearing is logarithmic, so the drawing is too. */
export const WAVE_FLOOR_DB = -50;
/** Bars are 1px with no gaps (filled silhouette); the cap only kicks in on absurdly zoomed-in chips, to
 *  bound the path string. */
const WAVE_BAR_PX = 1;
const WAVE_MAX_BARS = 2400;

/** Waveform bars for one audio chip, in BODY pixel coordinates (the svg is 1:1 with px — no viewBox
 *  stretching, which is what squashed earlier shapes). Bar height = the source peak in dBFS shifted by
 *  the clip's VOLUME (dB-axis shift), then SHAPED BY THE FADE ENVELOPE — the wave's own top edge is the
 *  fade curve, which is how the reference reads: the fades cut the wave, no wedge is painted over it.
 *  Built over the clip's trimmed [in,out] slice against its true content width, so trimming an edge only
 *  reveals or hides the content. */
export function waveBars(
  peaks: Float32Array,
  from: number,
  to: number,
  widthPx: number,
  heightPx: number,
  shiftDb: number,
  envelopeAt?: (frac: number) => number,
): string {
  const a = Math.max(0, Math.min(peaks.length - 1, from));
  const b = Math.max(a + 1, Math.min(peaks.length, to));
  const cols = Math.max(1, Math.min(WAVE_MAX_BARS, Math.round(widthPx / WAVE_BAR_PX)));
  const barW = widthPx / cols;
  const step = (b - a) / cols;
  const parts: string[] = [];
  for (let i = 0; i < cols; i++) {
    const s0 = a + Math.floor(i * step);
    const s1 = Math.max(s0 + 1, a + Math.floor((i + 1) * step));
    let peak = 0;
    for (let j = s0; j < s1 && j < peaks.length; j++) if (peaks[j]! > peak) peak = peaks[j]!;
    // dB axis shifted by the level: a boost pushes bars up against the ceiling (where they flatten, exactly
    // as the level itself does), an attenuation lowers the whole shape
    const db = peak > 0 ? 20 * Math.log10(peak) + shiftDb : WAVE_FLOOR_DB;
    const frac = Math.max(0, Math.min(1, (db - WAVE_FLOOR_DB) / -WAVE_FLOOR_DB));
    const h = Math.max(0.7, frac * (heightPx - 1)) * (envelopeAt ? envelopeAt((i + 0.5) / cols) : 1);
    if (h <= 0.05) continue;
    const x = i * barW;
    parts.push(`M${x.toFixed(2)},${heightPx}h${barW.toFixed(2)}v${-h.toFixed(1)}h${(-barW).toFixed(2)}Z`);
  }
  return parts.join('');
}

/** An audio body's own silhouette: full height through the middle, tapering along the fade envelope at
 *  both ends — so the BACKGROUND reads as the fade too, not just the wave sitting inside a flat block.
 *  Shared by the lane chips and the scene cards' audio band; same fadeShape the gain uses. */
export function fadeBodyPath(widthPx: number, H: number, fadeInSec: number, fadeOutSec: number, spanSec: number): string {
  const STEPS = 12;
  const pts: string[] = [`0,${H}`];
  const ramp = (fromX: number, toX: number, rising: boolean) => {
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      const px = fromX + (toX - fromX) * t;
      const f = rising ? fadeShape(t) : fadeShape(1 - t);
      pts.push(`${px.toFixed(2)},${(H - f * H).toFixed(2)}`);
    }
  };
  const fi = fadeInSec > 0 ? (fadeInSec / Math.max(0.05, spanSec)) * widthPx : 0;
  const fo = fadeOutSec > 0 ? (fadeOutSec / Math.max(0.05, spanSec)) * widthPx : 0;
  if (fi > 0) ramp(0, Math.min(widthPx, fi), true);
  else pts.push(`0,0`);
  pts.push(`${Math.max(0, widthPx - fo).toFixed(2)},0`);
  if (fo > 0) ramp(Math.max(0, widthPx - fo), widthPx, false);
  else pts.push(`${widthPx.toFixed(2)},0`);
  pts.push(`${widthPx.toFixed(2)},${H}`);
  return `M${pts.join('L')}Z`;
}

