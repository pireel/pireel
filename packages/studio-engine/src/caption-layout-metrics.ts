/** Shared caption line measurement for cue generation and final rendering. */

import type { FxWord } from './caption-fx';
import { PUNCT_END, agreedWordSpans, alnumCount, chunkWordsBalanced, estWordEm, joinWords, latinJoin, loneHan, measureTextPx, segmentTokens } from './caption-fx';
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
  const members = (gs: readonly WordGroup<W>[]) => gs.flatMap((group) => group.members);
  // A caption holds whole clauses: clauses that fit together share a caption, and only a clause too
  // long for one caption is split, on its own. Packing by width alone ran a caption across clause
  // ends (他不在这个 | 圈子，他根本), whatever the size, and in two-row looks just as much.
  const out: W[][] = [];
  const share = breakShare(groups);
  const width = (gs: readonly WordGroup<W>[]) => gs.reduce((total, group) => total + m.widthOf(group), 0);
  if (preset.stack) {
    // Artistic stack: one caption = what fits in maxRows rows; the renderer plans the same rows.
    const stack = preset.stack;
    const fitsCaption = (gs: WordGroup<W>[]) => planStackRows(gs, stack, m, share) !== null;
    let caption: WordGroup<W>[] = [];
    for (const clause of clauseRuns(groups)) {
      if (caption.length && fitsCaption([...caption, ...clause])) { caption.push(...clause); continue; }
      if (caption.length) out.push(members(caption));
      caption = [];
      if (fitsCaption(clause)) { caption = [...clause]; continue; }
      // Too long for one caption: the fewest even parts that each fit, so no word is left alone.
      const room = Array.from({ length: stack.maxRows }, (_, row) => stackRowCapacity(stack, m, row)).reduce((a, b) => a + b, 0);
      let parts: WordGroup<W>[][] | null = null;
      for (const fill of [1, 0.9, 0.8, 0.7]) {
        const tried = chunkWordsBalanced(clause, room * fill, m.widthOf, (left, right) => share(left, right) * room);
        if (tried.every(fitsCaption)) { parts = tried; break; }
      }
      if (parts) for (const part of parts) out.push(members(part));
      else {
        const rows = stackRows(clause, stack, m);
        for (let at = 0; at < rows.length; at += stack.maxRows) out.push(members(rows.slice(at, at + stack.maxRows).flat()));
      }
    }
    if (caption.length) out.push(members(caption));
    return out;
  }
  const fits = (gs: readonly WordGroup<W>[]) => width(gs) <= m.availablePx + 1e-6;
  let line: WordGroup<W>[] = [];
  for (const clause of clauseRuns(groups)) {
    if (line.length && fits([...line, ...clause])) { line.push(...clause); continue; }
    if (line.length) out.push(members(line));
    line = [];
    if (fits(clause)) { line = [...clause]; continue; }
    // Longer than a line: split this clause alone, at its best breaks.
    for (const part of chunkWordsBalanced(clause, m.availablePx, m.widthOf, (left, right) => share(left, right) * m.availablePx)) out.push(members(part));
  }
  if (line.length) out.push(members(line));
  return out;
}

/** What breaking between two dictionary words costs, as a share of a line: the reading rules, a
 *  break inside a bracket or quote, and less where the speaker pauses. */
function breakShare<G extends { text: string; members: readonly FxWord[] }>(groups: readonly G[]): (left: G, right: G) => number {
  const enclosed = enclosedBreaks(groups.map((group) => group.text));
  const nested = new Set(groups.filter((_, index) => enclosed.has(index)));
  return (left, right) => lineBreakCost(left.text, right.text) + (nested.has(left) ? ENCLOSED_BREAK_COST : 0)
    - pauseBreakBonus(left.members[left.members.length - 1]!, right.members[0]!);
}

/** Width a stacked look's row holds at this size. */
function stackRowCapacity(stack: CaptionStack, m: { availablePx: number }, row: number): number {
  return Math.min(stack.rowEm * BASE_CAPTION_FONT_PX, m.availablePx) / captionStackScale(stack, row);
}

/** A row that ends after punctuation reads as a phrase; worth this share of a row. */
const PUNCT_ROW_BONUS = 0.3;
/**
 * The rows of one caption in a stacked look: one row when it fits, else the two-row split that keeps
 * the rows even and breaks where it reads best. Filling the first row before the second left a word
 * alone underneath (看你这个挣钱 | 了，). Null when it needs more rows than the look has.
 */
function planStackRows<G extends { text: string }>(groups: readonly G[], stack: CaptionStack, m: LineMetrics<G>, share: (left: G, right: G) => number): G[][] | null {
  const widths = groups.map((group) => m.widthOf(group));
  const total = widths.reduce((a, b) => a + b, 0);
  const first = stackRowCapacity(stack, m, 0);
  if (total <= first + 1e-6) return [[...groups]];
  if (stack.maxRows < 2) return null;
  const second = stackRowCapacity(stack, m, 1);
  let best = -1;
  let bestScore = Infinity;
  let left = 0;
  for (let at = 1; at < groups.length; at++) {
    left += widths[at - 1]!;
    if (left > first + 1e-6 || total - left > second + 1e-6) continue;
    const score = Math.abs(left / first - (total - left) / second) + share(groups[at - 1]!, groups[at]!) - (PUNCT_END.test(groups[at - 1]!.text) ? PUNCT_ROW_BONUS : 0);
    if (score < bestScore) { bestScore = score; best = at; }
  }
  return best < 0 ? null : [groups.slice(0, best), groups.slice(best)];
}

/** Runs of dictionary words, each ending after punctuation (a clause), or at the end. */
function clauseRuns<G extends { text: string }>(groups: readonly G[]): G[][] {
  const runs: G[][] = [];
  let run: G[] = [];
  for (const group of groups) {
    run.push(group);
    if (PUNCT_END.test(group.text)) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  return runs;
}

/** A pause this long or longer earns the full bonus. */
const PAUSE_FULL_SEC = 0.35;
const PAUSE_BONUS = 0.6;
/**
 * Where the speaker pauses is where a line reads as a phrase: a measured gap between two words
 * lowers the cost of breaking there, as a share of the line width. Without it a long phrase split at
 * the most balanced point (先调研目标|用户在哪里). Estimated word times leave no gaps, so they keep
 * the plain layout.
 */
export function pauseBreakBonus(left: { end: number }, right: { start: number }): number {
  const gap = right.start - left.end;
  return Number.isFinite(gap) && gap > 0.04 ? Math.min(1, gap / PAUSE_FULL_SEC) * PAUSE_BONUS : 0;
}

/** Breaking inside a title, quote or aside (《奥德|赛》) reads as a broken name: it costs more than a line. */
const ENCLOSED_BREAK_COST = 1.5;
const OPENERS = '《“‘「『（(【〈';
const CLOSERS = '》”’」』）)】〉';

/** Indexes of the words after which a break would fall inside a bracket or quote pair. Straight
 *  quotes ("…") toggle; a pair left open by the text (a typo) stops counting at its sentence end. */
function enclosedBreaks(texts: readonly string[]): Set<number> {
  const inside = new Set<number>();
  let depth = 0;
  let straight = false;
  texts.forEach((text, index) => {
    for (const ch of text) {
      if (OPENERS.includes(ch)) depth += 1;
      else if (CLOSERS.includes(ch)) depth = Math.max(0, depth - 1);
      else if (ch === '"') straight = !straight;
      else if (/[。！？!?]/u.test(ch)) { depth = 0; straight = false; }
    }
    if (depth > 0 || straight) inside.add(index);
  });
  return inside;
}

const NUMERAL_END = /[\p{N}零〇一二三四五六七八九十百千万亿两]$/u;
const NUMERAL_START = /^[\p{N}零〇一二三四五六七八九十百千万亿]/u;
/** Particles that only ever follow what they attach to; a line never opens with one. */
const CJK_TRAILING = /^(?:[的了吗呢啊吧呀哦嘛么们]|[着过得地]$)/u;
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
  // 着/过/得/地 count only standing alone: 得到, 过去 and 地方 are words that merely start with one.
  if (CJK_TRAILING.test(after.replace(/[^\p{L}\p{N}]/gu, ''))) cost += 0.6;
  // Two lone characters side by side are usually one word the dictionary does not know (极|客).
  if (loneHan(left) && loneHan(right)) cost += 1;
  else if (loneHan(left) || loneHan(right)) cost += 0.5;
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
  const m = groupedMetrics(lineMetrics(words, preset, widthPct, scale, canvasWidth, options));
  // The same rows the caption was cut for; a caption cut elsewhere (a manual layout) may need more.
  return (planStackRows(groups, preset.stack, m, breakShare(groups)) ?? stackRows(groups, preset.stack, m))
    .map((row) => row.flatMap((group) => group.members));
}

/**
 * Recognizer words grouped into dictionary words, so a caption line never breaks inside one: the
 * same agreed-boundary rule as groupAsrWords (agreedWordSpans), over the sentence the words spell.
 * Transcripts stored before words were grouped on arrival still time single characters (「什」「么」).
 */
export function lexicalWordGroups<W extends FxWord>(words: readonly W[]): W[][] {
  if (words.length < 2) return words.map((word) => [word]);
  // Words alone do not say where the sentence had spaces, so Latin words keep theirs (one two); Latin
  // a recognizer spelled out letter by letter is joined on arrival, where the sentence is known.
  const tokens = segmentTokens(joinWords(words.map((word) => word.text)));
  const spans = agreedWordSpans(words.map((word) => alnumCount(word.text)), tokens.map(alnumCount));
  return spans ? spans.map(([from, to]) => words.slice(from, to)) : words.map((word) => [word]);
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
  // rowEm is a width at the base size, so a smaller caption fits more on a row and a larger one less.
  const capacity = (k: number) => Math.min(stack.rowEm * BASE_CAPTION_FONT_PX, m.availablePx) / captionStackScale(stack, k);
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
