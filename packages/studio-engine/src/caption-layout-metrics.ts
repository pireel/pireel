/** Shared caption line measurement for cue generation and final rendering. */

import type { FxWord } from './caption-fx';
import { chunkWordsBalanced, estWordEm, latinJoin, measureTextPx } from './caption-fx';
import {
  BASE_CAPTION_FONT_PX,
  CAPTION_WEIGHT_BOLD,
  CAPTION_WEIGHT_REGULAR,
  type CaptionPreset,
} from './caption-presets';
import { displayTextFontCss, displayTextLocalFontFamily } from './display-text-presets';
import { cjkPartnerFamilyCss, webFontFamilyCss } from './font-library';

/** Font family used by rendered CSS: the user's override (same font ids as display text —
 *  built-in sans/serif/mono or a local family) when set, else the preset's own font. */
export function captionFontCss(preset: CaptionPreset, font?: string): string {
  const override = font ? displayTextFontCss(font) : null;
  if (override) return override;
  if (preset.font === 'serif') return `'Noto Serif SC','Songti SC',serif`;
  if (preset.font === 'mono') return 'var(--font-num)';
  return 'var(--font-body)';
}

/** Concrete equivalent for CanvasRenderingContext2D (CSS variables are invalid in ctx.font). */
export function captionCanvasFontFamilies(preset: CaptionPreset, font?: string): string {
  const web = font ? webFontFamilyCss(font) : null;
  if (web) return web;
  const localFamily = font ? displayTextLocalFontFamily(font) : null;
  if (localFamily) return `"${localFamily.replaceAll('"', '\\"')}",${cjkPartnerFamilyCss()},sans-serif`;
  const kind = font === 'sans' || font === 'serif' || font === 'mono' ? font : preset.font;
  if (kind === 'serif') return "'Noto Serif SC','Songti SC',serif";
  if (kind === 'mono') return "'IBM Plex Mono',ui-monospace,monospace";
  return "'Noto Sans SC','PingFang SC',sans-serif";
}

export interface CaptionLineMetricsOptions {
  bold?: boolean;
  /** Font override id (see captionFontCss); measurement must use the same face the renderer draws. */
  font?: string;
  /** Test seam; production uses the browser canvas and falls back to glyph estimates in Node. */
  measureText?: (text: string, font: string) => number | null;
}

/**
 * Split words using the exact same font, plate padding and Latin spacing as the renderer.
 * Browser callers get real font-engine widths; server/test callers deterministically fall back to
 * the conservative glyph estimate. Keeping this in a leaf module prevents preview/layout drift.
 */
export function captionLineSegments<W extends FxWord>(
  words: W[],
  preset: CaptionPreset,
  widthPct: number,
  scale: number,
  canvasWidth = 1080,
  options: CaptionLineMetricsOptions = {},
): W[][] {
  const fontPx = Math.max(10, Math.round(BASE_CAPTION_FONT_PX * scale));
  const spacePx = Math.round(fontPx * 0.3);
  const paddingPx = preset.bg ? Math.round(fontPx * 0.42) * 2 : 0;
  const weight = options.bold ? CAPTION_WEIGHT_BOLD : CAPTION_WEIGHT_REGULAR;
  const canvasFont = `${preset.italic ? 'italic ' : ''}${weight} ${fontPx}px ${captionCanvasFontFamilies(preset, options.font)}`;
  const measure = options.measureText ?? measureTextPx;
  const indexByWord = new Map(words.map((word, index) => [word, index] as const));
  const widthOf = (word: W) => {
    const index = indexByWord.get(word) ?? 0;
    const estimated = estWordEm(word.text) * fontPx;
    const measured = measure(word.text, canvasFont);
    const wordPx = measured == null ? estimated : measured;
    const latinSpace = index < words.length - 1 && latinJoin(word.text, words[index + 1]!.text) ? spacePx : 0;
    return wordPx + latinSpace;
  };
  const availablePx = Math.max(
    fontPx * 2,
    (Math.max(1, widthPct) / 100) * Math.max(1, canvasWidth) - paddingPx - fontPx * 0.15,
  );
  return chunkWordsBalanced(words, availablePx, widthOf);
}
