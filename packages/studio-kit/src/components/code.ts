/**
 * Code Motion Graphic.
 *
 * The animation choreography and effect selection are adapted from HyperFrames'
 * Code Animations blocks (code-typing, code-diff, code-highlight, code-scroll):
 * https://github.com/heygen-com/hyperframes/tree/main/registry/blocks
 * Copyright HeyGen, Inc.; licensed under Apache-2.0. Pireel adapts the engine
 * from full-page registry blocks to scoped Studio Kit fragments and theme tokens.
 */

import { esc, tk, type RenderCtx, type RenderResult } from "../contract";
import { fadeUp } from "../motion";
import { defineSchema, en, legacy, num, reqText, shownWhen, text, type Field, type PropsOf } from "../schema";
import { inGroup } from "../groups";
import { inkOn, surfaceCss, SURFACE_FIELDS } from "../surface";
import { typeScale } from "../sizing";

export const codeSchema = defineSchema({
  variant: en(
    ["typing", "diff", "highlight", "scroll"],
    "highlight",
    "Choose by viewer intent: authorship, change, one target line, or locating a line in a long file",
  ),
  file: text(42, "edit.ts", "Truthful filename or terminal label"),
  language: text(18, "typescript", "Source language label"),
  code: reqText(
    2400,
    "const result = await run();",
    "Exact source, preserved verbatim",
  ),
  before: shownWhen(text(1600, "", "diff only: exact source before the edit"), "variant", ["diff"]),
  after: shownWhen(text(1600, "", "diff only: exact source after the edit"), "variant", ["diff"]),
  highlightLine: shownWhen(num(1, 120, 1, "highlight/scroll: one-based target line"), "variant", ["highlight", "scroll"]),
  pace: shownWhen(en(["slow", "normal", "fast"], "normal", "Typing or camera pace"), "variant", ["typing", "scroll"]),
  result: text(80, "", "Optional stable result or takeaway after the motion"),
  // Code colours only work as a set (background, text, keywords, strings, comments, highlight), so
  // the component offers editor schemes rather than separate accent / text / panel colours.
  codeTheme: inGroup(
    en(["theme", "night", "light", "contrast"], "theme", "Editor colour scheme: theme = follow the project theme; night / light = editor palettes; contrast = black with bright tokens"),
    "style",
  ),
  // The editor window is its own surface; stored panel settings still render for "theme".
  ...(Object.fromEntries(Object.entries(SURFACE_FIELDS).map(([k, f]) => [k, legacy(f as Field<string>)])) as typeof SURFACE_FIELDS),
});

/** Editor palettes: every colour the window uses, set together. */
const CODE_THEMES: Record<string, Record<string, string>> = {
  night: {
    "--sk-panel": "#1e2230", "--sk-panel-2": "#181b26", "--sk-fg": "#e4e7ee", "--sk-muted": "#8a91a3",
    "--sk-ink": "#e4e7ee", "--sk-ink-muted": "#8a91a3", "--sk-line": "rgba(255,255,255,0.08)", "--sk-accent": "#7aa2f7",
    "--code-keyword": "#c792ea", "--code-string": "#9ece6a", "--code-number": "#ff9e64", "--code-comment": "#6b7189",
  },
  light: {
    "--sk-panel": "#ffffff", "--sk-panel-2": "#f6f8fa", "--sk-fg": "#1f2328", "--sk-muted": "#6e7781",
    "--sk-ink": "#1f2328", "--sk-ink-muted": "#6e7781", "--sk-line": "rgba(31,35,40,0.12)", "--sk-accent": "#0969da",
    "--code-keyword": "#cf222e", "--code-string": "#0a3069", "--code-number": "#0550ae", "--code-comment": "#6e7781",
  },
  contrast: {
    "--sk-panel": "#0a0a0a", "--sk-panel-2": "#000000", "--sk-fg": "#ffffff", "--sk-muted": "#9a9a9a",
    "--sk-ink": "#ffffff", "--sk-ink-muted": "#a0a0a0", "--sk-line": "rgba(255,255,255,0.14)", "--sk-accent": "#ffd24d",
    "--code-keyword": "#ff5fa2", "--code-string": "#ffd24d", "--code-number": "#5ce1ff", "--code-comment": "#8a8a8a",
  },
};

export type CodeProps = PropsOf<typeof codeSchema>;

type TokenKind = "plain" | "keyword" | "string" | "number" | "comment";
interface Token {
  kind: TokenKind;
  value: string;
}

const KEYWORDS = new Set([
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "of",
  "return",
  "static",
  "switch",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

/** A small synchronous lexer keeps the component pure. The animation consumes the same keyed,
 * colored-token idea as HyperFrames' author-time Shiki bake; unsupported syntax stays truthful
 * plain text instead of being re-authored or executed. */
function tokenize(line: string): Token[] {
  const out: Token[] = [];
  const re =
    /(\/\/.*$|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/g;
  let cursor = 0;
  for (const match of line.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > cursor)
      out.push({ kind: "plain", value: line.slice(cursor, index) });
    const value = match[0];
    const kind: TokenKind =
      value.startsWith("//") || value.startsWith("/*")
        ? "comment"
        : value.startsWith("'") ||
            value.startsWith('"') ||
            value.startsWith("`")
          ? "string"
          : /^\d/.test(value)
            ? "number"
            : KEYWORDS.has(value)
              ? "keyword"
              : "plain";
    out.push({ kind, value });
    cursor = index + value.length;
  }
  if (cursor < line.length)
    out.push({ kind: "plain", value: line.slice(cursor) });
  return out;
}

function syntaxHtml(line: string, characters = false): string {
  const html = tokenize(line)
    .map((token) => {
      if (!characters)
        return `<span class="tok tok-${token.kind}">${esc(token.value)}</span>`;
      return [...token.value]
        .map(
          (char) =>
            `<span class="tok ch tok-${token.kind}" data-space="${char === " " ? "1" : "0"}">${char === " " ? "&nbsp;" : esc(char)}</span>`,
        )
        .join("");
    })
    .join("");
  return html || "&nbsp;";
}

function codeLine(
  line: string,
  number: number,
  focus: boolean,
  characters = false,
): string {
  return `<div class="line${focus ? " focus" : ""}" data-line="${number}"><span class="ln">${number}</span><code>${syntaxHtml(line, characters)}</code></div>`;
}

interface DiffOp {
  type: "same" | "del" | "add";
  line: string;
}

/** HyperFrames' line-level LCS diff, moved from its browser engine to our pure render stage. */
function lineDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i]![j] =
        a[i] === b[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", line: b[j]! });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: "del", line: a[i++]! });
    } else {
      ops.push({ type: "add", line: b[j++]! });
    }
  }
  while (i < n) ops.push({ type: "del", line: a[i++]! });
  while (j < m) ops.push({ type: "add", line: b[j++]! });
  return ops;
}

function diffHtml(before: string, after: string): string {
  return lineDiff(before.split("\n"), after.split("\n"))
    .slice(0, 24)
    .map(
      (op) =>
        `<div class="diff-line diff-${op.type}">${op.type === "del" ? '<i class="diff-mark" aria-hidden="true"></i>' : ""}<span class="diff-sign">${op.type === "del" ? "−" : op.type === "add" ? "+" : " "}</span><code>${syntaxHtml(op.line)}</code></div>`,
    )
    .join("");
}

function typingTimeline(
  id: string,
  charCount: number,
  pace: CodeProps["pace"],
  lifeSec?: number,
): string {
  // Typing finishes inside the block: pace is the share of the block spent typing (the rest holds
  // the finished code). Without a known length, fall back to a per-character rate.
  const share = pace === "slow" ? 0.85 : pace === "fast" ? 0.5 : 0.7;
  const rate = pace === "slow" ? 0.04 : pace === "fast" ? 0.014 : 0.028;
  const budget = lifeSec && lifeSec > 1 ? Math.max(0.4, lifeSec * share - 0.45) : charCount * rate;
  const per = Math.min(rate, budget / Math.max(1, charCount));
  return `(function(){
var root=document.querySelector('#${id} .code'),caret=document.querySelector('#${id} .caret');
if(!root||!caret)return;var chars=Array.from(root.querySelectorAll('.ch'));
tl.set(chars,{opacity:0},0);tl.set(caret,{opacity:0},0);
if(chars.length){var first=chars[0];tl.set(caret,{x:first.offsetLeft,y:first.offsetTop,opacity:1},0.45);}
chars.forEach(function(el,i){var at=0.45+i*${per.toFixed(5)},ws=el.getAttribute('data-space')==='1';
tl.to(el,{opacity:1,duration:ws?0.01:Math.min(0.12,${Math.max(0.01, per * 3).toFixed(4)}),ease:'power1.out'},at);
tl.to(caret,{x:el.offsetLeft+el.offsetWidth,y:el.offsetTop,duration:${per.toFixed(5)},ease:'none'},at);});
tl.to(caret,{opacity:0,duration:0.32,ease:'steps(1)',repeat:3,yoyo:true},${(0.6 + charCount * per).toFixed(3)});
})();`;
}

function diffTimeline(id: string, lineH: number): string {
  // A real diff: the old code appears, the removed lines are marked and dimmed but stay in place,
  // then the added lines open up beneath them. The held frame shows both, red over green.
  return `tl.from('#${id} .diff-same, #${id} .diff-del',{autoAlpha:0,y:8,duration:0.22,stagger:0.045,ease:'power1.out'},0.16);
tl.fromTo('#${id} .diff-del .diff-mark',{scaleX:0},{scaleX:1,duration:0.4,stagger:0.08,ease:'power2.out'},0.7);
tl.to('#${id} .diff-del code',{opacity:0.6,duration:0.3,stagger:0.08},0.8);
tl.fromTo('#${id} .diff-add',{height:0,minHeight:0,opacity:0},{height:${lineH},minHeight:${lineH},opacity:1,duration:0.5,stagger:0.1,ease:'power2.out'},1.15);`;
}

function highlightTimeline(id: string): string {
  return `tl.from('#${id} .line',{autoAlpha:0,y:7,duration:0.22,stagger:0.04,ease:'power1.out'},0.15);
tl.fromTo('#${id} .hl-box',{scaleX:0,opacity:0},{scaleX:1,opacity:1,duration:0.9,ease:'power2.inOut'},0.62);
tl.fromTo('#${id} .line:not(.focus)',{opacity:1},{opacity:0.45,duration:0.9,ease:'power2.inOut'},0.62);`;
}

function scrollTimeline(id: string): string {
  return `(function(){
var surface=document.querySelector('#${id} .viewport'),code=document.querySelector('#${id} .code'),gutter=document.querySelector('#${id} .gutter'),line=document.querySelector('#${id} .line.focus');
if(!surface||!code||!gutter||!line)return;var dy=surface.clientHeight*.5-(line.offsetTop+line.offsetHeight*.5);
tl.fromTo([code,gutter],{y:0},{y:dy,duration:1.7,ease:'power2.inOut'},0.72);
tl.fromTo('#${id} .line:not(.focus)',{opacity:1},{opacity:.35,duration:.5,ease:'power1.out'},2.07);
tl.fromTo('#${id} .hl-box',{opacity:0},{opacity:1,duration:.45,ease:'power1.out'},2.07);
})();`;
}

export function renderCode(
  id: string,
  raw: unknown,
  ctx: RenderCtx,
): RenderResult {
  const p = codeSchema.parse(raw);
  const s = typeScale(ctx);
  // Size to both the box height (via the type scale) and its width: the longest shown line must fit
  // beside the gutter instead of being cut at the window edge.
  const shownText = p.variant === "diff" ? `${p.before || p.code}\n${p.after || p.code}` : p.code;
  const longest = Math.max(8, ...shownText.split("\n").slice(0, 120).map((line) => [...line.replace(/\t/g, "  ")].length));
  const byHeight = Math.max(14, Math.min(42, Math.round(s.label * 0.94)));
  const byWidth = Math.floor((ctx.box.w - s.pad * 1.2) / (longest * 0.6 + 3.4));
  const fontPx = Math.max(12, Math.min(byHeight, byWidth));
  const lineH = Math.round(fontPx * 1.55);
  const chromeH = Math.max(34, Math.round(s.label * 1.8));
  const footerH = p.result ? Math.max(32, Math.round(s.label * 1.55)) : 0;
  const maxVisible = Math.max(
    3,
    Math.floor((ctx.box.h - chromeH - footerH - s.gap) / lineH),
  );
  const lines = p.code.split("\n").slice(0, 120);
  const focus = Math.min(
    lines.length - 1,
    Math.max(0, Math.round(p.highlightLine) - 1),
  );
  const windowStart = Math.max(
    0,
    Math.min(lines.length - maxVisible, focus - Math.floor(maxVisible / 2)),
  );
  const visibleStart = p.variant === "highlight" ? windowStart : 0;
  const visible = lines.slice(visibleStart, visibleStart + maxVisible);
  const typing = p.variant === "typing";
  const rows = (p.variant === "scroll" ? lines : visible)
    .map((line, index) => {
      const actual =
        (p.variant === "scroll" ? index : visibleStart + index) + 1;
      return codeLine(line, actual, actual - 1 === focus, typing);
    })
    .join("");
  const gutter = (p.variant === "scroll" ? lines : visible)
    .map(
      (_, index) =>
        `<span>${(p.variant === "scroll" ? index : visibleStart + index) + 1}</span>`,
    )
    .join("");
  const body =
    p.variant === "diff"
      ? `<div class="diff">${diffHtml(p.before || p.code, p.after || p.code)}</div>`
      : `<div class="gutter">${gutter}</div><div class="code">${p.variant === "scroll" ? '<i class="hl-box scroll-box"></i>' : ""}${rows}${typing ? '<i class="caret"></i>' : ""}</div>${p.variant === "highlight" ? '<i class="hl-box"></i>' : ""}`;
  const scheme = CODE_THEMES[p.codeTheme];
  // An editor scheme is a window: always on its own panel, whatever the stored surface says.
  const panel = scheme ? { ...p, surface: "card", surfaceColor: "", border: "none", borderColor: "" } : p;
  const surface = surfaceCss(panel, s);
  const onCard = panel.surface === "card";
  const schemeVars = scheme ? Object.entries(scheme).map(([k, v]) => `${k}:${v};`).join("") : "";

  const html = `<div class="wrap">
<header><span class="lights"><i></i><i></i><i></i></span><b>${esc(p.file)}</b><small>${esc(p.language)}</small></header>
<div class="viewport">${body}</div>
${p.result ? `<footer><i></i><span>${esc(p.result)}</span></footer>` : ""}
</div><style>
#${id} .wrap{${schemeVars}position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;${surface}color:${inkOn(panel)};font-family:${tk("--sk-font-num")};}
#${id} header{height:${chromeH}px;flex:0 0 ${chromeH}px;display:flex;align-items:center;gap:${Math.round(s.gap * 0.55)}px;padding:0 ${Math.round(s.pad * 0.55)}px;border-bottom:1px solid ${tk("--sk-line")};background:${onCard ? `color-mix(in srgb,${tk("--sk-panel-2")} 58%,transparent)` : "rgb(0 0 0 / .18)"};}
#${id} .lights{display:flex;gap:${Math.max(4, s.rule * 2)}px;}
#${id} .lights i{width:${Math.max(6, Math.round(fontPx * 0.38))}px;height:${Math.max(6, Math.round(fontPx * 0.38))}px;border-radius:50%;background:${tk("--sk-muted")};opacity:.5;}
#${id} header b{font-size:${Math.max(12, Math.round(fontPx * 0.84))}px;font-weight:650;}
#${id} header small{margin-left:auto;font-size:${Math.max(12, Math.round(fontPx * 0.68))}px;color:${inkOn(panel, true)};text-transform:uppercase;letter-spacing:.08em;}
#${id} .viewport{position:relative;flex:1;min-height:0;overflow:hidden;padding:${Math.round(s.gap * 0.6)}px 0;background:${onCard ? `color-mix(in srgb,${tk("--sk-panel")} 94%,${tk("--sk-panel-2")})` : "rgb(0 0 0 / .24)"};}
#${id} .code{position:relative;margin-left:${Math.max(38, Math.round(fontPx * 2.9))}px;padding-right:${Math.round(s.pad * 0.55)}px;will-change:transform;}
#${id} .gutter{position:absolute;z-index:2;left:0;top:${Math.round(s.gap * 0.6)}px;width:${Math.max(34, Math.round(fontPx * 2.5))}px;color:${inkOn(panel, true)};font-size:${Math.max(12, Math.round(fontPx * 0.7))}px;line-height:${lineH}px;text-align:right;opacity:.55;will-change:transform;}
#${id} .gutter span{display:block;height:${lineH}px;}
#${id} .line{position:relative;display:block;min-height:${lineH}px;font-size:${fontPx}px;line-height:${lineH}px;white-space:pre;}
#${id} .line .ln{display:none;}
#${id} .line code{position:relative;z-index:1;display:block;overflow:hidden;white-space:pre;font:inherit;}
#${id} .tok{display:inline-block;white-space:pre;}
#${id} .tok-keyword{color:var(--code-keyword, ${tk("--sk-accent")});font-weight:700;}
#${id} .tok-string{color:var(--code-string, ${tk("--sk-accent-2")});}
#${id} .tok-number{color:var(--code-number, ${tk("--sk-accent")});font-weight:650;}
#${id} .tok-comment{color:var(--code-comment, ${inkOn(panel, true)});font-style:italic;}
#${id} .caret{position:absolute;left:0;top:0;width:${Math.max(2, s.rule)}px;height:${Math.max(16, lineH - 8)}px;margin-top:4px;background:${tk("--sk-accent")};border-radius:1px;z-index:3;}
#${id} .hl-box{position:absolute;z-index:0;left:${Math.max(30, Math.round(fontPx * 2.55))}px;right:${Math.round(s.gap * 0.5)}px;top:calc(${Math.round(s.gap * 0.6)}px + ${(focus - (p.variant === "scroll" ? 0 : visibleStart)) * lineH}px);height:${lineH}px;border-left:${Math.max(2, s.rule)}px solid ${tk("--sk-accent")};background:color-mix(in srgb,${tk("--sk-accent")} 14%,transparent);border-radius:${Math.max(2, s.rule)}px;transform-origin:left center;}
#${id} .scroll-box{left:-8px;right:0;top:${focus * lineH}px;}
#${id} .diff{display:flex;flex-direction:column;padding:0 ${Math.round(s.pad * 0.45)}px;}
#${id} .diff-line{display:grid;grid-template-columns:${Math.max(28, Math.round(fontPx * 1.7))}px 1fr;align-items:center;min-height:${lineH}px;overflow:hidden;font-size:${fontPx}px;line-height:${lineH}px;}
#${id} .diff-line code{display:block;min-width:0;overflow:hidden;white-space:pre;font:inherit;}
#${id} .diff-sign{font-weight:800;text-align:center;}
#${id} .diff-same{color:${inkOn(panel, true)};}
#${id} .diff-line{position:relative;}
#${id} .diff-line > *{position:relative;z-index:1;}
#${id} .diff-del > .diff-mark{position:absolute;z-index:0;inset:0;background:rgb(248 81 73 / .16);box-shadow:inset ${Math.max(2, s.rule)}px 0 #f85149;transform-origin:left center;}
#${id} .diff-del code{text-decoration:line-through;text-decoration-color:rgb(248 81 73 / .7);}
#${id} .diff-add{background:rgb(63 185 80 / .12);box-shadow:inset ${Math.max(2, s.rule)}px 0 #3fb950;}
#${id} .diff-del .diff-sign{color:#f85149;}
#${id} .diff-add .diff-sign{color:#3fb950;}
#${id} footer{height:${footerH}px;flex:0 0 ${footerH}px;display:flex;align-items:center;gap:${Math.round(s.gap * 0.45)}px;padding:0 ${Math.round(s.pad * 0.55)}px;border-top:1px solid ${tk("--sk-line")};font-size:${Math.max(12, Math.round(fontPx * 0.78))}px;color:${inkOn(panel, true)};}
#${id} footer i{width:${Math.max(6, Math.round(fontPx * 0.35))}px;height:${Math.max(6, Math.round(fontPx * 0.35))}px;border-radius:50%;background:${tk("--sk-accent")};}
</style>`;

  const timeline: string[] = [];
  if (onCard) timeline.push(fadeUp(`#${id} .wrap`, 0, { y: 10, dur: 0.25 }));
  timeline.push(fadeUp(`#${id} header`, 0.04, { y: 6, dur: 0.22 }));
  if (p.variant === "typing")
    timeline.push(typingTimeline(id, [...visible.join("")].length, p.pace, ctx.durationSec));
  else if (p.variant === "diff") timeline.push(diffTimeline(id, lineH));
  else if (p.variant === "scroll") timeline.push(scrollTimeline(id));
  else timeline.push(highlightTimeline(id));
  if (p.result)
    timeline.push(fadeUp(`#${id} footer`, 2.45, { y: 7, dur: 0.28 }));
  return { html: html.trim(), timeline: timeline.join("\n") };
}
