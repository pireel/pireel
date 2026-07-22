'use client';

/**
 * Palette derivation — sample thumbnail frames to derive a "lightly blended" palette: one accent taken
 * from the footage + a subtle tint of the footage's color temperature on panels/hairlines/grid. Structural
 * and body colors stay untouched (neutral and highly readable). Output = overrides for #root color vars
 * (keys without --). Pure client-side canvas sampling, deterministic (same frame → same result);
 * washed-out/gray footage falls back to taking the accent from the average color temperature.
 */

import type { Thumbnail } from '@pireel/studio-engine/video-edit/types';

export type DerivedPalette = Record<string, string>;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60;
    else if (max === gg) h = ((bb - rr) / d + 2) * 60;
    else h = ((rr - gg) / d + 4) * 60;
  }
  return [h, s, l];
}

/** Sample thumbnail frames → derive palette (overrides accent/panel/panel-2/line/grid). Returns null on failure/no frames (use theme defaults). */
export async function extractPalette(thumbs: Thumbnail[]): Promise<DerivedPalette | null> {
  if (!thumbs.length || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  try {
    const W = 28;
    const H = 50;
    const cv = new OffscreenCanvas(W, H);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    let rs = 0;
    let gs = 0;
    let bs = 0;
    let n = 0;
    const hueWeight = new Array(12).fill(0); // Saturation-weighted hue histogram (only vivid pixels count)

    for (const th of thumbs) {
      let bm: ImageBitmap;
      try {
        bm = await createImageBitmap(th.blob);
      } catch {
        continue;
      }
      ctx.drawImage(bm, 0, 0, W, H);
      bm.close();
      const d = ctx.getImageData(0, 0, W, H).data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i]!;
        const g = d[i + 1]!;
        const b = d[i + 2]!;
        rs += r;
        gs += g;
        bs += b;
        n++;
        const [h, s, l] = rgbToHsl(r, g, b);
        if (s > 0.28 && l > 0.18 && l < 0.86) hueWeight[Math.min(11, Math.floor(h / 30))] += s;
      }
    }
    if (!n) return null;

    const [tintH] = rgbToHsl(rs / n, gs / n, bs / n); // average color → color temperature
    const th = Math.round(tintH);

    // accent: center of the strongest vivid hue bin; if the footage is too gray (nothing vivid) → fall back to the color temperature
    let best = -1;
    let bestV = 0;
    for (let i = 0; i < 12; i++) {
      if (hueWeight[i] > bestV) {
        bestV = hueWeight[i];
        best = i;
      }
    }
    const accent = best >= 0 ? `hsl(${best * 30 + 15} 64% 50%)` : `hsl(${th} 52% 48%)`;

    return {
      accent,
      panel: `hsl(${th} 14% 97%)`,
      'panel-2': `hsl(${th} 12% 92%)`,
      line: `hsl(${th} 24% 26% / 0.16)`,
      grid: `hsl(${th} 24% 26% / 0.08)`,
    };
  } catch {
    return null;
  }
}
