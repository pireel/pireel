import { describe, expect, it } from 'vitest';
import { frameRegistry } from '../vite';
import { coverBlock, showcaseBlock } from '../showcase-blocks';

/**
 * EN 预览溢出审计:对每个块的 html,按类名解析 font-size/letter-spacing/nowrap,
 * 粗估每段文本的行宽(CJK≈1em、大写拉丁≈0.62em、小写≈0.5em、数字≈0.56em),
 * nowrap 整行 >1840px 或 单词(不可断)>1720px 视为溢出。粗但足以抓灾难级溢出;
 * 中文 canonical 也一并扫(方言自身的保险)。
 */

const CANVAS = 1920;
const LINE_MAX = CANVAS - 80; // 允许双年展式轻微出血,只抓灾难级
const WORD_MAX = CANVAS - 200;

function charW(ch: string): number {
  if (/[⺀-鿿豈-﫿！-｠]/.test(ch)) return 1; // CJK/全角
  if (/[A-Z0-9@#%&]/.test(ch)) return 0.62;
  if (/[a-z]/.test(ch)) return 0.5;
  if (ch === ' ') return 0.3;
  return 0.4;
}

function textW(text: string, px: number, lsEm: number): number {
  let w = 0;
  for (const ch of text) w += charW(ch);
  return (w + lsEm * Math.max(0, text.length - 1)) * px;
}

interface Cls {
  px: number;
  ls: number;
  nowrap: boolean;
}

function parseCss(html: string): Map<string, Cls> {
  const out = new Map<string, Cls>();
  const css = html.match(/<style>([\s\S]*)<\/style>/)?.[1] ?? '';
  for (const m of css.matchAll(/#[\w$]+ ((?:[.\w\s>:,-]|\.)+?)\{([^}]*)\}/g)) {
    const body = m[2]!;
    const px = Number(/font-size:\s*(\d+(?:\.\d+)?)px/.exec(body)?.[1] ?? 0);
    const lsm = /letter-spacing:\s*(-?[\d.]+)em/.exec(body)?.[1];
    const nowrap = /white-space:\s*nowrap/.test(body) || /writing-mode/.test(body) === false;
    for (const sel of m[1]!.split(',')) {
      const cls = /\.([\w-]+)/.exec(sel.trim())?.[1];
      if (!cls) continue;
      const prev = out.get(cls) ?? { px: 0, ls: 0, nowrap: false };
      out.set(cls, {
        px: px || prev.px,
        ls: lsm != null ? Number(lsm) : prev.ls,
        nowrap: prev.nowrap || /white-space:\s*nowrap/.test(body),
      });
    }
  }
  return out;
}

function audit(html: string): string[] {
  const issues: string[] = [];
  const cssMap = parseCss(html);
  const bodyHtml = html.split('<style>')[0]!;
  // 收尾 `<` 用 lookahead:全局匹配不吞下一个标签的开头(否则相邻元素会被整段跳过)
  for (const m of bodyHtml.matchAll(/<(?:div|span|b|i|em|strong)([^>]*class="[^"]+"[^>]*)>([^<]{1,200})(?=<)/g)) {
    const attrs = m[1]!;
    const classes = /class="([^"]+)"/.exec(attrs)![1]!.split(/\s+/);
    const text = m[2]!.trim();
    if (!text) continue;
    let px = 0;
    let ls = 0;
    let nowrap = false;
    for (const c of classes) {
      const info = cssMap.get(c);
      if (info && info.px > px) {
        px = info.px;
        ls = info.ls;
      }
      if (info?.nowrap) nowrap = true;
    }
    // 行内 style 覆盖类(locale 包用上下文键注入的 font-size 压字号就落在这)
    const inlinePx = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(/style="([^"]*)"/.exec(attrs)?.[1] ?? '');
    if (inlinePx) px = Number(inlinePx[1]);
    if (px < 160) continue; // 小字不会灾难溢出
    const lineW = textW(text, px, ls);
    if (nowrap && lineW > LINE_MAX) {
      issues.push(`nowrap 行溢出 ~${Math.round(lineW)}px @${px}px:「${text}」`);
      continue;
    }
    for (const word of text.split(/\s+/)) {
      const ww = textW(word, px, ls);
      if (ww > WORD_MAX) issues.push(`单词不可断溢出 ~${Math.round(ww)}px @${px}px:「${word}」`);
    }
  }
  return issues;
}

describe('EN 预览宽度审计(粗估,抓灾难级溢出)', () => {
  it('封面与 showcase 块无灾难级溢出', () => {
    const bad: string[] = [];
    for (const f of frameRegistry.list()) {
      for (const locale of ['en', undefined] as const) {
        const blocks = [
          ['cover', coverBlock(f.id, locale)] as const,
          ...f.showcase.map((k) => [k, showcaseBlock(f.id, k, locale)] as const),
        ];
        for (const [name, b] of blocks) {
          if (!b) continue;
          for (const issue of audit(String(b.slots.innerHtml))) {
            bad.push(`${f.id}/${name}(${locale ?? 'zh'}): ${issue}`);
          }
        }
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});
