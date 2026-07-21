/**
 * 动效花字引擎(客户端,canvas 原生)。
 *
 * 这是"增强版 AI 云剪辑"的核:把词级时间 + 效果 id 逐帧插值,直接画进 OffscreenCanvas
 * (烧录) —— 与现有 drawSubtitleLayer/drawCaptionLayer 同一渲染面,无需服务端 Chrome。
 *
 * 设计:
 *  - 纯时间函数,任意帧画面只依赖 t(无 rAF/random),与 WebCodecs 逐帧 seek 天然对齐、确定。
 *  - chunking/缓动等纯逻辑可被 DOM 预览层复用(WYSIWYG),效果时序两端一致。
 *  - 效果 id 与服务端 Hyperframes 子集同名(highlight/pill-karaoke/kinetic-slam/
 *    editorial-emphasis/word-pop),将来长片走服务端兜底时 1:1 映射。
 *
 * 时间一律【成片时间轴绝对秒】。
 */

export type CaptionEffect = 'highlight' | 'pill-karaoke' | 'kinetic-slam' | 'editorial-emphasis' | 'word-pop';

/** 词 + 时间窗(成片绝对秒)。 */
export interface FxWord {
  text: string;
  start: number;
  end: number;
  emphasis?: boolean;
}

/** 花字渲染输入(RenderOverlay 携带这些字段时即走花字分支)。 */
export interface CaptionFxInput {
  effect: CaptionEffect;
  words: FxWord[];
  /** 归一化中心(沿用 SubtitleCue 的 x/y)。缺省 x=0.5,y=0.82。 */
  x?: number;
  y?: number;
  /** 字号缩放,1=默认。 */
  fontScale?: number;
  color?: string;
  /** 高亮/卡拉OK 强调色。 */
  accentColor?: string;
  strokeColor?: string;
  /** 一屏词数(滑窗)。slam 强制 1。 */
  windowWords?: number;
  uppercase?: boolean;
}

const CtxFont = (weight: number, px: number, font: string) => `${weight} ${px}px ${font}`;
const TAIL = 0.3; // chunk 末尾留白,衔接下一屏

/* ============================ 纯逻辑(可测 / 可复用) ============================ */

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

/**
 * 从一条字幕的文本 + 时间窗,切出词级时间(把静态字幕一键变花字用)。
 * 中文按 cjkChunk 字成块,英文按空白分词,按字符长度在 [start,end] 内线性分配时间。
 * 真·词级时间应来自 ASR(DashScope filetrans 原生词级),这是无 ASR 时的体面回退。
 */
/** 相邻两词都是西文/数字 → 词间要真实空格(中文相邻不需要)。渲染层 .sp 追加距、
 *  句文本重建(joinWords)、剪口播面板词流三处同族判据。 */
export const latinJoin = (a: string, b: string): boolean => /[A-Za-z0-9.,!?;:'")\]%]$/.test(a) && /^[A-Za-z0-9('"[$]/.test(b);

/** 词数组 → 句文本:西文词界补空格(join('') 会把英文拼成一串,字幕轴 chip 踩过)。 */
export function joinWords(texts: string[]): string {
  let out = '';
  texts.forEach((t, i) => {
    out += t;
    if (i < texts.length - 1 && latinJoin(t, texts[i + 1]!)) out += ' ';
  });
  return out;
}

export function wordsFromText(text: string, start: number, end: number, cjkChunk = 2): FxWord[] {
  const toks: string[] = [];
  for (const piece of text.trim().split(/\s+/).filter(Boolean)) {
    if (/[一-鿿぀-ヿ가-힯]/.test(piece)) {
      for (let i = 0; i < piece.length; i += cjkChunk) toks.push(piece.slice(i, i + cjkChunk));
    } else {
      toks.push(piece);
    }
  }
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

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** 连续词分组成"屏"。 */
export function chunkWords(words: FxWord[], size: number): FxWord[][] {
  const out: FxWord[][] = [];
  const s = Math.max(1, size);
  for (let i = 0; i < words.length; i += s) out.push(words.slice(i, i + s));
  return out;
}

/** 单条字幕的目标视觉宽度(CJK 字数口径;西文字符算半个)。 */
export const CAPTION_LINE_UNITS = 13;
/** 视觉宽度:CJK≈1,西文/数字≈0.5。 */
const visualWidth = (t: string) => [...t].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e7f ? 1 : 0.5), 0);
const PUNCT_END = /[,。,.!?!?;;、::…]$/;

/**
 * 均衡断行核心(pretext 式:整句量总宽 → 定段数 → 各段贴近均宽断,不出"13+2"的孤尾;
 * 标点在目标宽附近优先断)。整句放得下就不拆。**只在句内断,绝不跨句补齐**(调用方一句一调)。
 * widthOf 由调用方定口径(粗视觉单位/像素估宽);limit 与 widthOf 同单位。
 */
export function chunkWordsBalanced<W extends { text: string }>(words: W[], limit: number, widthOf: (w: W) => number): W[][] {
  const widths = words.map(widthOf);
  const total = widths.reduce((a, b) => a + b, 0);
  if (total <= limit) return words.length ? [words] : [];
  const nSeg = Math.ceil(total / limit);
  const target = total / nSeg;
  const punctTol = limit * 0.15; // 标点优先带宽(随口径缩放)
  const out: W[][] = [];
  let cur: W[] = [];
  let len = 0; // 当前段宽
  let acc = 0; // 已消费总宽
  let segIdx = 1;
  for (let i = 0; i < words.length; i++) {
    cur.push(words[i]!);
    len += widths[i]!;
    acc += widths[i]!;
    if (i === words.length - 1) break;
    const boundary = segIdx * target;
    const nextW = widths[i + 1]!;
    // 断:①标点且已近目标 ②当前位置比"再吞下一词"更贴近均宽边界 ③硬上限兜底。
    // 均衡断点紧邻标点时推迟一词到标点断(读感优先,仍在容忍带内)
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

/** 粗视觉单位口径(CJK=1/西文=0.5):无字号上下文时的退路。 */
export function chunkWordsByWidth(words: FxWord[], maxUnits = CAPTION_LINE_UNITS): FxWord[][] {
  return chunkWordsBalanced(words, maxUnits, (w) => visualWidth(w.text));
}

/**
 * 字符像素估宽(单位 em,乘字号得 px):CJK/全角(含全角标点)=1;大写/数字≈0.62;
 * 小写≈0.52;半角标点/空格≈0.34。比"CJK=1/西文=0.5"细一档,配合 gap/padding 精确摊算,
 * 拆出的段保证放得进定宽字幕框(否则视觉换行 = 事故)。
 */
export function estCharEm(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  if (c >= 0x2e80) return 1; // CJK 部首区起 + 全角标点/假名/谚文
  if (/[A-Z0-9]/.test(ch)) return 0.62;
  if (/[a-z]/.test(ch)) return 0.52;
  return 0.34;
}
export function estWordEm(text: string): number {
  return [...text].reduce((a, ch) => a + estCharEm(ch), 0);
}

/** canvas 量宽(pretext 式,以浏览器字体引擎为准):font 用与渲染完全一致的
 *  `[italic] weight px family` 字符串。node/测试环境无 canvas → 返回 null 走估表。 */
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

/** 当前时刻命中的屏 + 它的可见窗口 [start,end](绝对秒,无缝衔接下一屏)。 */
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

/** 屏级进出场透明度(入场 0.22s 升,出场末 0.15s 落)。 */
export function chunkAlpha(t: number, visStart: number, visEnd: number): number {
  const inA = easeOutCubic((t - visStart) / 0.22);
  const outA = clamp01((visEnd - t) / 0.15);
  return clamp01(Math.min(inA, outA));
}

/* ============================ 渲染 ============================ */

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

/** 花字分支总入口。drawOverlays 命中 effect 时调它。 */
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

/** 一行词的布局 + 逐词动画(highlight/karaoke/emphasis/pop 共用)。 */
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
  // 用 emphasis 词的潜在大字号统一测量行宽(保证布局稳定)
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

    // 逐词进场(pop / emphasis 关键词)
    let scale = 1;
    let dy = 0;
    if (mode === 'pop') {
      const p = easeOutBack((t - w.start) / 0.16);
      if (t < w.start) continue; // 还没到
      scale = 0.8 + 0.2 * clamp01(p);
    } else if (emph) {
      const p = easeOutBack((t - w.start) / 0.2);
      scale = 0.7 + 0.3 * clamp01(p);
    } else {
      // highlight / karaoke 行整体升入
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
      // 底色(暗白) + 强调色按词时长左到右填充
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
      // emphasis / pop:emphasis 关键词用强调色
      drawText(ctx, texts[i]!, fs, emph ? accent : color, stroke);
    }
    ctx.restore();
  }
}

/** 单词全屏砸入(kinetic-slam):大字、居中、交替方向回弹。 */
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

/** 描边 + 填充一行文字(已在调用方做好 translate/scale,故画在原点)。 */
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
