/** Shared caption line measurement for cue generation and final rendering. */

import type { FxWord } from './caption-fx';
import { PUNCT_END, chunkWordsBalanced, estWordEm, latinJoin, measureTextPx } from './caption-fx';
import {
  BASE_CAPTION_FONT_PX,
  CAPTION_WEIGHT_BOLD,
  CAPTION_WEIGHT_REGULAR,
  type CaptionPreset,
  type CaptionStack,
} from './caption-presets';
import { displayTextFontCss, displayTextLocalFontFamily } from './display-text-presets';
import { cjkPartnerFamilyCss, webFontFamilyCss } from './font-library';
import { googleFontFamilyCss } from './google-fonts';

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
  const google = font ? googleFontFamilyCss(font) : null;
  if (google) return `${google},${cjkPartnerFamilyCss()},sans-serif`;
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
  const m = lineMetrics(words, preset, widthPct, scale, canvasWidth, options);
  if (preset.stack) {
    // Artistic stack: one segment = what fits in maxRows rows; the renderer re-plans its rows.
    const rows = stackRows(words, preset.stack, m);
    const out: W[][] = [];
    for (let at = 0; at < rows.length; at += preset.stack.maxRows) out.push(rows.slice(at, at + preset.stack.maxRows).flat());
    return out;
  }
  return chunkWordsBalanced(words, m.availablePx, m.widthOf);
}

/** Rows of one stacked segment (preset.stack), in render order. Empty for non-stack presets. */
export function captionStackRows<W extends FxWord>(
  words: W[],
  preset: CaptionPreset,
  widthPct: number,
  scale: number,
  canvasWidth = 1080,
  options: CaptionLineMetricsOptions = {},
): W[][] {
  if (!preset.stack) return [];
  return stackRows(words, preset.stack, lineMetrics(words, preset, widthPct, scale, canvasWidth, options));
}

/** Size multiplier of stacked row `row`. */
export function captionStackScale(stack: CaptionStack, row: number): number {
  const scales = stack.scales?.length ? stack.scales : [1];
  return scales[row % scales.length]!;
}

interface LineMetrics<W> { fontPx: number; availablePx: number; widthOf: (word: W) => number }

function lineMetrics<W extends FxWord>(
  words: W[],
  preset: CaptionPreset,
  widthPct: number,
  scale: number,
  canvasWidth: number,
  options: CaptionLineMetricsOptions,
): LineMetrics<W> {
  const fontPx = Math.max(10, Math.round(BASE_CAPTION_FONT_PX * scale));
  const spacePx = Math.round(fontPx * 0.3);
  const plated = preset.bg || preset.stack?.plates?.length;
  const paddingPx = plated ? Math.round(fontPx * 0.42) * 2 : 0;
  const weight = options.bold === true ? CAPTION_WEIGHT_BOLD : options.bold === false ? CAPTION_WEIGHT_REGULAR : preset.weight ?? CAPTION_WEIGHT_REGULAR;
  const canvasFont = `${preset.italic ? 'italic ' : ''}${weight} ${fontPx}px ${captionCanvasFontFamilies(preset, options.font)}`;
  const measure = options.measureText ?? measureTextPx;
  const trackingPx = (preset.trackingEm ?? 0) * fontPx;
  const indexByWord = new Map(words.map((word, index) => [word, index] as const));
  const widthOf = (word: W) => {
    const index = indexByWord.get(word) ?? 0;
    const text = preset.upper ? word.text.toUpperCase() : word.text;
    const estimated = estWordEm(text) * fontPx;
    const measured = measure(text, canvasFont);
    const wordPx = (measured == null ? estimated : measured) + trackingPx * [...text].length;
    const latinSpace = index < words.length - 1 && latinJoin(word.text, words[index + 1]!.text) ? spacePx : 0;
    return wordPx + latinSpace;
  };
  const availablePx = Math.max(
    fontPx * 2,
    (Math.max(1, widthPct) / 100) * Math.max(1, canvasWidth) - paddingPx - fontPx * 0.15,
  );
  return { fontPx, availablePx, widthOf };
}

/** Greedy row fill: row k holds min(rowEm, box) / scale_k at base size; a row may end early at
 *  punctuation once it is half full, so short-video phrasing breaks where the speaker pauses. */
function stackRows<W extends FxWord>(words: W[], stack: CaptionStack, m: LineMetrics<W>): W[][] {
  const rows: W[][] = [];
  let row: W[] = [];
  let used = 0;
  const capacity = (k: number) => Math.min(stack.rowEm * m.fontPx, m.availablePx) / captionStackScale(stack, k);
  for (const word of words) {
    const w = m.widthOf(word);
    const cap = capacity(rows.length);
    if (row.length && used + w > cap + 1e-6) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(word);
    used += w;
    if (PUNCT_END.test(word.text) && used >= capacity(rows.length) * 0.5) {
      rows.push(row);
      row = [];
      used = 0;
    }
  }
  if (row.length) rows.push(row);
  return rows;
}
