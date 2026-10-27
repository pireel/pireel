/** Shared caption line measurement for cue generation and final rendering. */

import type { FxWord } from './caption-fx';
import { PUNCT_END, alnumCount, chunkWordsBalanced, estWordEm, joinWords, latinJoin, loneHan, measureTextPx, segmentTokens } from './caption-fx';
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
  const m = groupedMetrics(lineMetrics(words, preset, widthPct, scale, canvasWidth, options));
  const groups = lexicalWordGroups(words).map((members) => ({ text: joinWords(members.map((word) => word.text)), members }));
  if (preset.stack) {
    // Artistic stack: one segment = what fits in maxRows rows; the renderer re-plans its rows.
    const rows = stackRows(groups, preset.stack, m);
    const out: W[][] = [];
    for (let at = 0; at < rows.length; at += preset.stack.maxRows) out.push(rows.slice(at, at + preset.stack.maxRows).flat().flatMap((group) => group.members));
    return out;
  }
  return chunkWordsBalanced(groups, m.availablePx, m.widthOf, (left, right) => lineBreakCost(left.text, right.text) * m.availablePx)
    .map((line) => line.flatMap((group) => group.members));
}

const NUMERAL_END = /[\p{N}零〇一二三四五六七八九十百千万亿两]$/u;
const NUMERAL_START = /^[\p{N}零〇一二三四五六七八九十百千万亿]/u;
/** Particles that only ever follow what they attach to; a line never opens with one. */
const CJK_TRAILING = /^[的了吗呢啊吧呀哦嘛么着过得地们]/u;
/**
 * How bad a line break between two dictionary words reads, as a share of the line width. Numbers
 * stay whole and with the unit or measure after them; a line does not open with a particle; a lone
 * Han character (a function word, or a suffix the dictionary split off: 评论|区) stays with its
 * neighbour. Punctuation already ends the left word, so a break after it costs nothing.
 */
export function lineBreakCost(left: string, right: string): number {
  if (PUNCT_END.test(left)) return 0;
  const before = left.replace(/[^\p{L}\p{N}]+$/u, '');
  const after = right.replace(/^[^\p{L}\p{N}]+/u, '');
  let cost = 0;
  if (NUMERAL_END.test(before) && NUMERAL_START.test(after)) cost += 0.6;
  else if (NUMERAL_END.test(before) && /^\p{Script=Han}/u.test(after)) cost += 0.35;
  if (CJK_TRAILING.test(after)) cost += 0.3;
  // Two lone characters side by side are usually one word the dictionary does not know (极|客).
  if (loneHan(left) && loneHan(right)) cost += 1;
  else if (loneHan(left) || loneHan(right)) cost += 0.2;
  return cost;
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
  const groups = lexicalWordGroups(words).map((members) => ({ text: joinWords(members.map((word) => word.text)), members }));
  return stackRows(groups, preset.stack, groupedMetrics(lineMetrics(words, preset, widthPct, scale, canvasWidth, options)))
    .map((row) => row.flatMap((group) => group.members));
}

/**
 * Recognizer words grouped into dictionary words, so a caption line never breaks inside one.
 * Chinese recognizers often time single characters (「什」「么」); ICU segmentation of the joined
 * sentence says which of them belong together. Letters and digits are the alignment currency, as in
 * groupAsrWords; a recognizer word spanning several dictionary words simply covers all of them.
 */
export function lexicalWordGroups<W extends FxWord>(words: readonly W[]): W[][] {
  if (words.length < 2) return words.map((word) => [word]);
  const groups: W[][] = [];
  let next = 0;
  let excess = 0;
  for (const token of segmentTokens(joinWords(words.map((word) => word.text)))) {
    let want = alnumCount(token);
    if (!want) continue;
    if (excess >= want) { excess -= want; continue; }
    want -= excess;
    excess = 0;
    const group: W[] = [];
    let got = 0;
    while (next < words.length && (got < want || !group.length)) {
      got += alnumCount(words[next]!.text);
      group.push(words[next++]!);
    }
    if (!group.length) break;
    excess = Math.max(0, got - want);
    groups.push(group);
  }
  // Anything the segmentation did not account for (trailing punctuation words) joins the last group.
  while (next < words.length) {
    if (groups.length) groups[groups.length - 1]!.push(words[next++]!);
    else groups.push([words[next++]!]);
  }
  return groups;
}

interface WordGroup<W> { text: string; members: W[] }

/** Width of a group = the widths its words already have side by side. */
function groupedMetrics<W extends FxWord>(m: LineMetrics<W>): LineMetrics<WordGroup<W>> {
  return { fontPx: m.fontPx, availablePx: m.availablePx, widthOf: (group) => group.members.reduce((total, word) => total + m.widthOf(word), 0) };
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
function stackRows<W extends { text: string }>(words: W[], stack: CaptionStack, m: LineMetrics<W>): W[][] {
  const rows: W[][] = [];
  let row: W[] = [];
  let used = 0;
  const capacity = (k: number) => Math.min(stack.rowEm * m.fontPx, m.availablePx) / captionStackScale(stack, k);
  for (const word of words) {
    const w = m.widthOf(word);
    const cap = capacity(rows.length);
    if (row.length && used + w > cap + 1e-6) {
      // Keep a run of lone Han characters together (口播, 聊一聊): carry the row's trailing run down with this word.
      let run = 0;
      if (loneHan(word.text)) while (run < 3 && run < row.length - 1 && loneHan(row[row.length - 1 - run]!.text)) run++;
      const carry = row.splice(row.length - run, run);
      rows.push(row);
      row = carry;
      used = carry.reduce((sum, item) => sum + m.widthOf(item), 0);
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
