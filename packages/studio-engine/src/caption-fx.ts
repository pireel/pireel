/**
 * Animated caption-effect engine (client-side, native canvas).
 *
 * The core of "enhanced AI cloud editing": interpolate word-level timing + effect id per frame and draw straight
 * into an OffscreenCanvas (bake) — the same render surface as the existing drawSubtitleLayer/drawCaptionLayer,
 * no server-side Chrome needed.
 *
 * Design:
 *  - Pure time functions; any frame depends only on t (no rAF/random), naturally aligned & deterministic with WebCodecs per-frame seek.
 *  - Pure logic (chunking/easing) is reusable by the DOM preview layer (WYSIWYG), so effect timing matches on both ends.
 *  - Effect ids share names with the server-side Hyperframes subset (highlight/pill-karaoke/kinetic-slam/
 *    editorial-emphasis/word-pop), for a 1:1 mapping when long videos fall back to the server later.
 *
 * All time is ABSOLUTE SECONDS ON THE EDITED TIMELINE.
 */

export type CaptionEffect = 'highlight' | 'pill-karaoke' | 'kinetic-slam' | 'editorial-emphasis' | 'word-pop';

/** Word + time window (absolute edited seconds). */
export interface FxWord {
  text: string;
  start: number;
  end: number;
  emphasis?: boolean;
}

/** Caption-effect render input (RenderOverlay takes the effect branch when it carries these fields). */
export interface CaptionFxInput {
  effect: CaptionEffect;
  words: FxWord[];
  /** Normalized center (reusing SubtitleCue's x/y). Default x=0.5, y=0.82. */
  x?: number;
  y?: number;
  /** Font-size scale, 1=default. */
  fontScale?: number;
  color?: string;
  /** Accent color for highlight/karaoke. */
  accentColor?: string;
  strokeColor?: string;
  /** Words per screen (sliding window). slam forces 1. */
  windowWords?: number;
  uppercase?: boolean;
}

const CtxFont = (weight: number, px: number, font: string) => `${weight} ${px}px ${font}`;
const TAIL = 0.3; // trailing hold at a chunk's end, to bridge into the next screen

/* ============================ Pure logic (testable / reusable) ============================ */

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
export function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
}
export function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const v = Math.max(0, Math.min(1, x));
  return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2);
}

/** Two adjacent words both Latin/digit → a real space between them (adjacent CJK doesn't need one). Shared predicate
 *  across three places: render-layer .sp spacing, sentence rebuild (joinWords), transcript panel word stream. */
export const latinJoin = (a: string, b: string): boolean => /[A-Za-z0-9.,!?;:'")\]%]$/.test(a) && /^[A-Za-z0-9('"[$]/.test(b);

/** Word array → sentence text: add spaces at Latin word boundaries (join('') would run English together; the caption-track chip hit this). */
export function joinWords(texts: string[]): string {
  let out = '';
  texts.forEach((t, i) => {
    out += t;
    if (i < texts.length - 1 && latinJoin(t, texts[i + 1]!)) out += ' ';
  });
  return out;
}

/** ICU dictionary word segmentation (Intl.Segmenter, granularity 'word'): CJK breaks at real word
 *  boundaries (「科学家」 stays one token — the old fixed 2-char slicing cut through words), Latin splits
 *  on spaces, and punctuation glues onto the token before it (a subtitle token = word + trailing
 *  punctuation, never a standalone token). Runtimes without Intl.Segmenter (defensive; all our
 *  targets ship full ICU) fall back to whitespace + 2-char CJK slicing. */
let icuSegmenter: Intl.Segmenter | null | undefined;
export function segmentTokens(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  if (icuSegmenter === undefined) {
    try {
      icuSegmenter = new Intl.Segmenter('zh-Hans', { granularity: 'word' });
    } catch {
      icuSegmenter = null;
    }
  }
  if (!icuSegmenter) {
    const toks: string[] = [];
    for (const piece of t.split(/\s+/).filter(Boolean)) {
      if (/[一-鿿぀-ヿ가-힯]/.test(piece)) {
        for (let i = 0; i < piece.length; i += 2) toks.push(piece.slice(i, i + 2));
      } else toks.push(piece);
    }
    return toks;
  }
  const toks: string[] = [];
  for (const g of icuSegmenter.segment(t)) {
    const piece = g.segment.trim();
    if (!piece) continue;
    if (g.isWordLike || !toks.length) toks.push(piece);
    else toks[toks.length - 1] += piece;
  }
  return toks;
}

/**
 * Cut word-level timing from one caption's text + time window. Tokens come from ICU word
 * segmentation (segmentTokens); time is allocated linearly within [start,end] by char length.
 * This is the NO-ASR fallback — real word timing comes from ASR (groupAsrWords).
 */
export function wordsFromText(text: string, start: number, end: number): FxWord[] {
  const toks = segmentTokens(text);
  if (toks.length === 0) return [];
  const totalLen = toks.reduce((n, t) => n + t.length, 0) || 1;
  const span = Math.max(0.0001, end - start);
  let cur = start;
  const out: FxWord[] = [];
  for (const tk of toks) {
    const dur = (tk.length / totalLen) * span;
    out.push({ text: tk, start: round3(cur), end: round3(cur + dur) });
    cur += dur;
  }
  return out;
}

/** Letters+digits only (any script) — the alignment currency between ASR tokens and ICU words:
 *  punctuation/space counts are unreliable across tokenizers, letter counts are not. */
const alnumCount = (s: string): number => {
  let n = 0;
  for (const ch of s) if (/[\p{L}\p{N}]/u.test(ch)) n++;
  return n;
};

/** ASR word tokens (zh models often emit per-char/per-morpheme pieces) → ICU-word groups with merged
 *  timings: re-segment the sentence text into real words, then walk the ASR token stream and consume
 *  tokens by letter/digit count until each word is covered (first token's start / last token's end
 *  become the word's window). Any mismatch → return the raw ASR tokens unchanged (real timing beats
 *  pretty grouping). */
export function groupAsrWords(text: string, asr: { text: string; start: number; end: number }[]): FxWord[] {
  const flat = asr.filter((w) => w.text.trim() && w.end > w.start);
  const toks = segmentTokens(text);
  if (!toks.length || !flat.length) return flat.map((w) => ({ text: w.text.trim(), start: w.start, end: w.end }));
  const out: FxWord[] = [];
  let i = 0;
  for (const tk of toks) {
    const want = alnumCount(tk);
    if (want === 0) {
      // pure-punctuation token (only possible at sentence start — elsewhere punctuation is glued): merge into the previous word
      if (out.length) out[out.length - 1]!.text += tk;
      continue;
    }
    let got = 0;
    let first: number | null = null;
    let last = 0;
    while (i < flat.length && got < want) {
      if (first == null) first = flat[i]!.start;
      last = flat[i]!.end;
      got += alnumCount(flat[i]!.text);
      i++;
    }
    if (first == null) break;
    out.push({ text: tk, start: round3(first), end: round3(Math.max(first, last)) });
  }
  return out.length === toks.length ? out : flat.map((w) => ({ text: w.text.trim(), start: w.start, end: w.end }));
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** Group consecutive words into "screens". */
export function chunkWords(words: FxWord[], size: number): FxWord[][] {
  const out: FxWord[][] = [];
  const s = Math.max(1, size);
  for (let i = 0; i < words.length; i += s) out.push(words.slice(i, i + s));
  return out;
}

/** Target visual width of one caption line (in CJK-char units; a Latin char counts as half). */
export const CAPTION_LINE_UNITS = 13;
/** Visual width: CJK≈1, Latin/digit≈0.5. */
const visualWidth = (t: string) => [...t].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e7f ? 1 : 0.5), 0);
const PUNCT_END = /[,。,.!?!?;;、::…]$/;

/**
 * Balanced line-breaking core (pretext-style: measure the whole sentence's total width → decide segment count →
 * break each segment near equal width, no "13+2" orphan tail; punctuation near the target width breaks first).
 * Don't split if the whole sentence fits. ONLY breaks within a sentence, NEVER pads across sentences (caller calls per sentence).
 * widthOf's unit is the caller's choice (coarse visual units / pixel estimate); limit shares widthOf's unit.
 */
export function chunkWordsBalanced<W extends { text: string }>(words: W[], limit: number, widthOf: (w: W) => number): W[][] {
  const widths = words.map(widthOf);
  const total = widths.reduce((a, b) => a + b, 0);
  if (total <= limit) return words.length ? [words] : [];
  const nSeg = Math.ceil(total / limit);
  const target = total / nSeg;
  const punctTol = limit * 0.15; // punctuation-priority band (scales with the unit)
  const out: W[][] = [];
  let cur: W[] = [];
  let len = 0; // current segment width
  let acc = 0; // total width consumed
  let segIdx = 1;
  for (let i = 0; i < words.length; i++) {
    cur.push(words[i]!);
    len += widths[i]!;
    acc += widths[i]!;
    if (i === words.length - 1) break;
    const boundary = segIdx * target;
    const nextW = widths[i + 1]!;
    // Break when: (1) punctuation and already near target, (2) current position is closer to the equal-width boundary than "swallow one more word", (3) hard-limit fallback.
    // If a balanced break is right next to punctuation, defer one word to break at the punctuation (readability first, still within tolerance).
    const punctBreak = PUNCT_END.test(words[i]!.text) && acc >= boundary - punctTol;
    const balancedBreak = acc >= boundary - target * 0.04 && Math.abs(acc + nextW - boundary) >= Math.abs(acc - boundary);
    const deferToPunct =
      !punctBreak && PUNCT_END.test(words[i + 1]!.text) && acc + nextW <= boundary + punctTol && len + nextW <= limit;
    if (!deferToPunct && (punctBreak || balancedBreak || len + nextW > limit + 1e-6)) {
      out.push(cur);
      cur = [];
      len = 0;
      segIdx++;
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Coarse visual-unit measure (CJK=1/Latin=0.5): the fallback when there's no font-size context. */
export function chunkWordsByWidth(words: FxWord[], maxUnits = CAPTION_LINE_UNITS): FxWord[][] {
  return chunkWordsBalanced(words, maxUnits, (w) => visualWidth(w.text));
}

/**
 * Per-char pixel width estimate (in em, times font size gives px): CJK/full-width (incl. full-width punctuation)=1;
 * uppercase/digit≈0.62; lowercase≈0.52; half-width punctuation/space≈0.34. One notch finer than "CJK=1/Latin=0.5";
 * combined with gap/padding it apportions precisely so split segments are guaranteed to fit the fixed-width caption box
 * (otherwise a visual line wrap = accident).
 */
export function estCharEm(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  if (c >= 0x2e80) return 1; // from CJK radicals + full-width punctuation/kana/hangul
  if (/[A-Z0-9]/.test(ch)) return 0.62;
  if (/[a-z]/.test(ch)) return 0.52;
  return 0.34;
}
export function estWordEm(text: string): number {
  return [...text].reduce((a, ch) => a + estCharEm(ch), 0);
}

/** Canvas text measurement (pretext-style, trusting the browser font engine): font uses the exact same
 *  `[italic] weight px family` string as rendering. No canvas in node/test → returns null, falls back to the estimate table. */
let measureCtx: CanvasRenderingContext2D | null | undefined;
export function measureTextPx(text: string, font: string): number | null {
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    } catch {
      measureCtx = null;
    }
  }
  if (!measureCtx) return null;
  try {
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
  } catch {
    return null;
  }
}

/** The screen hit at the current time + its visible window [start,end] (absolute seconds, seamlessly bridging into the next screen). */
export function activeChunk(
  words: FxWord[],
  size: number,
  t: number,
): { chunk: FxWord[]; index: number; visStart: number; visEnd: number } | null {
  const cs = chunkWords(words, size);
  for (let i = 0; i < cs.length; i++) {
    const chunk = cs[i]!;
    const visStart = chunk[0]!.start;
    const next = cs[i + 1];
    const visEnd = next ? next[0]!.start : (chunk[chunk.length - 1]!.end + TAIL);
    if (t >= visStart && t < visEnd) return { chunk, index: i, visStart, visEnd };
  }
  return null;
}

/** Screen-level in/out opacity (0.22s rise on enter, 0.15s fall at the end). */
export function chunkAlpha(t: number, visStart: number, visEnd: number): number {
  const inA = easeOutCubic((t - visStart) / 0.22);
  const outA = clamp01((visEnd - t) / 0.15);
  return clamp01(Math.min(inA, outA));
}

/* ============================ Rendering ============================ */

export function hasCaptionFx(o: { effect?: string; words?: unknown }): o is CaptionFxInput {
  return typeof o.effect === 'string' && Array.isArray(o.words) && o.words.length > 0;
}

interface Ctx2D {
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  globalAlpha: number;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  fillText(t: string, x: number, y: number): void;
  strokeText(t: string, x: number, y: number): void;
  measureText(t: string): { width: number };
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  moveTo(x: number, y: number): void;
  arcTo(x: number, y: number, x2: number, y2: number, r: number): void;
  closePath(): void;
  fill(): void;
}

/** Main entry for the caption-effect branch. drawOverlays calls it when an effect is present. */
export function drawCaptionFx(ctx: Ctx2D, o: CaptionFxInput, t: number, W: number, H: number, font: string): void {
  const size = o.effect === 'kinetic-slam' ? 1 : Math.max(1, o.windowWords ?? 4);
  const ac = activeChunk(o.words, size, t);
  if (!ac) return;
  const alpha = chunkAlpha(t, ac.visStart, ac.visEnd);
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  switch (o.effect) {
    case 'kinetic-slam':
      drawSlam(ctx, o, ac.chunk[0]!, t, W, H, font);
      break;
    case 'pill-karaoke':
      drawLine(ctx, o, ac.chunk, t, ac.visStart, W, H, font, 'karaoke');
      break;
    case 'highlight':
      drawLine(ctx, o, ac.chunk, t, ac.visStart, W, H, font, 'highlight');
      break;
    case 'editorial-emphasis':
      drawLine(ctx, o, ac.chunk, t, ac.visStart, W, H, font, 'emphasis');
      break;
    case 'word-pop':
    default:
      drawLine(ctx, o, ac.chunk, t, ac.visStart, W, H, font, 'pop');
      break;
  }
  ctx.restore();
}

type LineMode = 'highlight' | 'karaoke' | 'emphasis' | 'pop';

/** Layout of one line of words + per-word animation (shared by highlight/karaoke/emphasis/pop). */
function drawLine(
  ctx: Ctx2D,
  o: CaptionFxInput,
  chunk: FxWord[],
  t: number,
  chunkStart: number,
  W: number,
  H: number,
  font: string,
  mode: LineMode,
): void {
  const base = Math.round(H * 0.046 * (o.fontScale ?? 1));
  const weight = 800;
  const space = base * 0.34;
  const cx = (o.x ?? 0.5) * W;
  const cy = (o.y ?? 0.82) * H;
  const accent = o.accentColor ?? '#ff2e4d';
  const color = o.color ?? '#fff';
  const stroke = o.strokeColor ?? '#000';

  const texts = chunk.map((w) => (o.uppercase ? w.text.toUpperCase() : w.text));
  // measure line width using the emphasis words' potential larger size, uniformly (keeps layout stable)
  ctx.font = CtxFont(weight, base, font);
  const widths = texts.map((tx, i) => {
    const emph = mode === 'emphasis' && chunk[i]!.emphasis;
    ctx.font = CtxFont(weight, emph ? base * 1.28 : base, font);
    return ctx.measureText(tx).width;
  });
  const totalW = widths.reduce((a, b) => a + b, 0) + space * (chunk.length - 1);
  let penX = cx - totalW / 2;

  for (let i = 0; i < chunk.length; i++) {
    const w = chunk[i]!;
    const wWidth = widths[i]!;
    const wcx = penX + wWidth / 2;
    penX += wWidth + space;

    const emph = mode === 'emphasis' && w.emphasis;
    const fs = emph ? base * 1.28 : base;
    ctx.font = CtxFont(weight, fs, font);

    // per-word entrance (pop / emphasis keyword)
    let scale = 1;
    let dy = 0;
    if (mode === 'pop') {
      const p = easeOutBack((t - w.start) / 0.16);
      if (t < w.start) continue; // not yet reached
      scale = 0.8 + 0.2 * clamp01(p);
    } else if (emph) {
      const p = easeOutBack((t - w.start) / 0.2);
      scale = 0.7 + 0.3 * clamp01(p);
    } else {
      // highlight / karaoke: the whole line rises in
      dy = (1 - easeOutCubic((t - chunkStart) / 0.2)) * base * 0.22;
    }

    ctx.save();
    ctx.translate(wcx, cy + dy);
    if (scale !== 1) ctx.scale(scale, scale);

    if (mode === 'highlight') {
      const activeWord = t >= w.start && t < w.end;
      if (activeWord) {
        const grow = easeOutCubic((t - w.start) / 0.12);
        const pad = fs * 0.16;
        ctx.fillStyle = accent;
        roundRect(ctx, -wWidth / 2 - pad, -fs * 0.62, (wWidth + pad * 2) * clamp01(grow), fs * 1.24, fs * 0.16);
        ctx.fill();
      }
      drawText(ctx, texts[i]!, fs, color, stroke);
    } else if (mode === 'karaoke') {
      // base color (dim white) + accent fills left to right over the word's duration
      drawText(ctx, texts[i]!, fs, 'rgba(255,255,255,0.5)', stroke);
      const fill = clamp01((t - w.start) / Math.max(0.08, w.end - w.start));
      if (fill > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-wWidth / 2, -fs, wWidth * fill, fs * 2);
        ctx.clip();
        drawText(ctx, texts[i]!, fs, accent, stroke);
        ctx.restore();
      }
    } else {
      // emphasis / pop: emphasis keywords use the accent color
      drawText(ctx, texts[i]!, fs, emph ? accent : color, stroke);
    }
    ctx.restore();
  }
}

/** One word slams in full-screen (kinetic-slam): large, centered, alternating-direction bounce. */
function drawSlam(ctx: Ctx2D, o: CaptionFxInput, w: FxWord, t: number, W: number, H: number, font: string): void {
  const fs = Math.round(H * 0.09 * (o.fontScale ?? 1));
  ctx.font = CtxFont(800, fs, font);
  const cx = (o.x ?? 0.5) * W;
  const cy = (o.y ?? 0.5) * H;
  const text = o.uppercase ? w.text.toUpperCase() : w.text;

  const tIn = (t - w.start) / 0.22;
  const p = easeOutBack(tIn);
  const idx = Math.max(0, o.words.indexOf(w));
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  const d = dirs[idx % dirs.length]!;
  const off = (1 - clamp01(p)) * fs * 0.6;
  const scale = 0.55 + 0.45 * clamp01(p);

  ctx.save();
  ctx.translate(cx + d[0] * off, cy + d[1] * off);
  ctx.scale(scale, scale);
  drawText(ctx, text, fs, o.color ?? '#fff', o.strokeColor ?? '#000');
  ctx.restore();
}

/** Stroke + fill one line of text (caller already applied translate/scale, so drawn at the origin). */
function drawText(ctx: Ctx2D, text: string, fs: number, color: string, stroke: string): void {
  const hasStroke = !!stroke && stroke !== 'none';
  if (hasStroke) {
    ctx.lineWidth = Math.max(3, fs * 0.14);
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, 0, 0);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
