/**
 * ranking — a top-N counted down to the winner.
 *
 * Variants:
 *  - countdown  lower places appear first, the #1 lands last on an accent slab. The default.
 *  - podium     all places at once as columns of rising height, #1 tallest in the middle.
 *
 * Rows are given best-first (#1 first); the countdown reveals them in reverse, paced across the
 * block's life when known.
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { SURFACE_FIELDS, inkOn, surfaceCss } from '../surface';
import { defineSchema, en, rows, reqText, text, type PropsOf } from '../schema';
import { EASE, fadeUp, heroLand } from '../motion';
import { fitDown, isCjk, typeScale } from '../sizing';

export const rankingSchema = defineSchema({
  variant: en(['countdown', 'podium'], 'countdown', 'countdown = lower places first, #1 last; podium = columns'),
  title: text(40, '', 'Line above the ranking'),
  items: rows({ name: reqText(24, '—'), note: text(32, '') }, 5, [{ name: 'Winner', note: '' }, { name: 'Runner-up', note: '' }, { name: 'Third', note: '' }], 'Best first: #1, #2, …'),
  ...SURFACE_FIELDS,
  surface: en(['card', 'none'], 'none', 'Rankings sit on the footage by default'),
});

export type RankingProps = PropsOf<typeof rankingSchema>;

export function renderRanking(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = rankingSchema.parse(raw);
  const items = p.items.length ? p.items : rankingSchema.defaults.items;
  const n = items.length;
  const s = typeScale(ctx);
  const cjk = isCjk(ctx.lang);
  const shadow = p.surface === 'card' ? '' : 'text-shadow:0 3px 18px rgb(0 0 0 / 0.45);';
  const tl: string[] = [];
  const title = p.title ? `<div class="k">${esc(p.title)}</div>` : '';
  const longest = Math.max(...items.map((item) => item.name.length));

  if (p.variant === 'podium') {
    const order = n >= 3 ? [1, 0, 2, ...Array.from({ length: n - 3 }, (_, i) => i + 3)] : items.map((_, i) => i);
    const colW = (ctx.box.w - s.pad * 2) / n;
    const size = fitDown(s.label, longest, cjk, colW * 0.9, Math.min(s.label, 16));
    const maxH = (ctx.box.h - s.pad * 2 - (p.title ? s.kicker * 2 : 0)) * 0.62;
    const html = `
<div class="wrap">
  ${title}
  <div class="cols">${order.map((i) => `<div class="col c${i}"><span class="nm">${esc(items[i]!.name)}</span><span class="bar"><b>${i + 1}</b></span></div>`).join('')}</div>
</div>
<style>
#${id} .wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;gap:${Math.round(s.gap * 0.6)}px;padding:${s.pad}px;${surfaceCss(p, s)}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .k{font-size:${s.kicker}px;font-weight:700;${shadow}}
#${id} .cols{display:flex;align-items:flex-end;gap:${Math.round(s.gap * 0.4)}px;}
#${id} .col{flex:1;display:flex;flex-direction:column;align-items:center;gap:${Math.round(s.gap * 0.3)}px;}
#${id} .nm{font-size:${size}px;font-weight:var(--sk-head-weight, 800);text-transform:var(--sk-head-case, none);text-align:center;${shadow}}
#${id} .bar{width:100%;display:grid;place-items:start center;padding-top:${Math.round(s.gap * 0.4)}px;border-radius:min(${Math.round(s.gap * 0.3)}px, ${tk('--sk-radius')}) ${Math.round(s.gap * 0.3)}px 0 0;background:${tk('--sk-panel-2')};transform-origin:bottom center;}
#${id} .bar b{font-family:${tk('--sk-font-num')};font-size:${Math.round(s.head * 0.9)}px;font-weight:var(--sk-head-weight, 900);text-transform:var(--sk-head-case, none);color:${tk('--sk-fg')};}
#${id} .c0 .bar{background:${tk('--sk-accent')};}
#${id} .c0 .bar b{color:${tk('--sk-panel')};}
${items.map((_, i) => `#${id} .c${i} .bar{height:${Math.round(maxH * (1 - i * (0.55 / Math.max(1, n - 1))))}px;}`).join('\n')}
</style>`;
    [...items.keys()].reverse().forEach((i, k) => {
      tl.push(`tl.from('#${id} .c${i} .bar',{scaleY:0,duration:0.4,ease:'${EASE.out}'},${(0.2 + k * 0.22).toFixed(2)});`);
      tl.push(fadeUp(`#${id} .c${i} .nm`, 0.35 + k * 0.22, { y: 10 }));
    });
    return { html: html.trim(), timeline: tl.join('\n') };
  }

  const rowH = (ctx.box.h - s.pad * 2 - (p.title ? s.kicker * 2 : 0)) / (n + 0.6);
  const size = Math.max(16, fitDown(Math.min(s.head, Math.round(rowH * 0.55)), longest, cjk, ctx.box.w - s.pad * 2 - rowH * 1.3, Math.min(s.label, 18)));
  const html = `
<div class="wrap">
  ${title}
  ${[...items.keys()].reverse().map((i) => `<div class="r r${i}${i === 0 ? ' top' : ''}"><span class="no">${i + 1}</span><span class="nm">${esc(items[i]!.name)}</span>${items[i]!.note ? `<span class="nt">${esc(items[i]!.note)}</span>` : ''}</div>`).join('')}
</div>
<style>
#${id} .wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:${Math.round(rowH * 0.18)}px;padding:${s.pad}px;${surfaceCss(p, s)}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .k{font-size:${s.kicker}px;font-weight:700;letter-spacing:0.04em;margin-bottom:${Math.round(s.gap * 0.3)}px;${shadow}}
#${id} .r{display:flex;align-items:baseline;gap:${Math.round(size * 0.5)}px;${shadow}}
#${id} .no{font-family:${tk('--sk-font-num')};font-size:${Math.round(size * 1.05)}px;font-weight:var(--sk-head-weight, 900);text-transform:var(--sk-head-case, none);min-width:${Math.round(size * 0.9)}px;color:${inkOn(p, true)};}
#${id} .nm{font-size:${size}px;font-weight:var(--sk-head-weight, 800);text-transform:var(--sk-head-case, none);}
#${id} .nt{font-size:${Math.max(14, Math.round(size * 0.5))}px;font-weight:600;color:${inkOn(p, true)};}
#${id} .top{margin-top:${Math.round(rowH * 0.12)}px;padding:${Math.round(rowH * 0.12)}px ${Math.round(rowH * 0.25)}px;border-radius:min(${Math.round(rowH * 0.2)}px, ${tk('--sk-radius')});background:${tk('--sk-accent')};color:${tk('--sk-panel')};text-shadow:none;}
#${id} .top .no,#${id} .top .nt{color:${tk('--sk-panel')};}
#${id} .top .no{font-size:${Math.round(size * 1.3)}px;}
#${id} .top .nm{font-size:${Math.round(size * 1.25)}px;}
</style>`;
  const life = ctx.durationSec ?? 0;
  const step = life > 2 ? Math.min(1.3, Math.max(0.35, (life * 0.7) / n)) : 0.4;
  if (p.title) tl.push(fadeUp(`#${id} .k`, 0, { y: 10 }));
  [...items.keys()].reverse().forEach((i, k) => {
    const at = Math.round((0.25 + k * step) * 100) / 100;
    tl.push(i === 0 ? heroLand(`#${id} .r0`, at, { from: 0.7 }) : `tl.from('#${id} .r${i}',{autoAlpha:0,x:-${Math.round(size * 0.8)},duration:0.34,ease:'${EASE.out}'},${at});`);
  });
  return { html: html.trim(), timeline: tl.join('\n') };
}
