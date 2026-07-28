/**
 * Type scale, computed — not guessed.
 *
 * Components receive their box in canvas pixels and derive every font size,
 * padding and gap from it here. The scale anchors on the box's short side with a
 * gentle bias toward width (overlay boxes are usually wider than tall), and every
 * step is clamped to a designed range so extreme boxes degrade to safe sizes
 * instead of absurd ones. CJK display type steps down one notch relative to
 * latin — ideographs read denser at equal px.
 */

import type { RenderCtx } from './contract';

export interface TypeScale {
  /** The one oversized focal element (a number, a keyword). */
  hero: number;
  /** Headline / strong emphasis. */
  head: number;
  /** Labels, supporting copy. */
  label: number;
  /** Kickers, meta, footnotes. */
  kicker: number;
  /** Outer padding of the composition. */
  pad: number;
  /** Gap between stacked groups. */
  gap: number;
  /** Hairline weight (px). */
  rule: number;
  /** True when the box is wider than tall by enough to prefer side-by-side layouts. */
  wide: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));

export function isCjk(lang?: string): boolean {
  return !!lang && /^(zh|ja|ko)\b/i.test(lang);
}

export function typeScale(ctx: RenderCtx): TypeScale {
  const { w, h } = ctx.box;
  // Anchor: short side, nudged by the long side — a 900×500 box deserves larger
  // type than a 500×500 one, but not proportionally to its full width.
  const base = Math.min(w, h) * 0.72 + Math.max(w, h) * 0.1;
  const cjk = isCjk(ctx.lang) ? 0.88 : 1;
  return {
    hero: clamp(base * 0.38 * cjk, 64, 300),
    head: clamp(base * 0.16 * cjk, 34, 120),
    label: clamp(base * 0.075, 24, 46),
    kicker: clamp(base * 0.058, 20, 34),
    pad: clamp(base * 0.11, 28, 96),
    gap: clamp(base * 0.06, 14, 48),
    rule: base > 460 ? 3 : 2,
    wide: w / h > 1.35,
  };
}

/**
 * Fit a text run into a width by stepping the font down (never below `min`).
 * Estimation, not measurement — CJK counts 1em per glyph, latin ~0.56em — biased
 * slightly generous so the failure mode is "a touch small", never overflow.
 */
export function fitDown(px: number, textLen: number, cjk: boolean, maxWidth: number, min: number): number {
  const emPerChar = cjk ? 1.02 : 0.6;
  const need = textLen * emPerChar * px;
  if (need <= maxWidth) return px;
  return Math.max(min, Math.floor(maxWidth / (textLen * emPerChar)));
}

/**
 * Fit WRAPPING text into a width × height budget: estimate the wrapped line count
 * at each size and step down until the block fits vertically (never below `min`).
 * Words don't break mid-run, so short latin texts round lines up pessimistically.
 */
export function fitWrap(
  px: number,
  textLen: number,
  cjk: boolean,
  maxW: number,
  maxH: number,
  opts: { lineH?: number; min?: number } = {},
): number {
  const { lineH = 1.16, min = 24 } = opts;
  const emPerChar = cjk ? 1.02 : 0.6;
  for (let p = px; p > min; p = Math.max(min, Math.floor(p * 0.92))) {
    const lines = Math.max(1, Math.ceil((textLen * emPerChar * p) / Math.max(1, maxW)));
    if (lines * p * lineH <= maxH) return p;
    if (p === min) break;
  }
  return min;
}
