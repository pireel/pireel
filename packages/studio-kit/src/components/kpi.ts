/**
 * kpi — several numbers that belong together (2–4 cells).
 *
 * Variants:
 *  - grid   cells in a hairline-separated grid (2×2 for 4, 1×N otherwise). Default.
 *  - row    one horizontal strip, dividers between cells. Wide boxes.
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { SURFACE_FIELDS, inkOn, surfaceCss } from '../surface';
import { defineSchema, en, rows, text, reqText, type PropsOf } from '../schema';
import { countUp, fadeUp, staggerUp } from '../motion';
import { isCjk, typeScale } from '../sizing';

export const kpiSchema = defineSchema({
  variant: en(['grid', 'row'], 'grid', 'Cell arrangement'),
  motion: en(['count-up', 'stagger'], 'count-up', 'Numbers count up, or cells simply stagger in'),
  cells: rows(
    {
      label: text(24, '', 'What this number is'),
      value: reqText(12, '—', 'The number, verbatim, units included'),
      trend: en(['up', 'down', 'none'], 'none', 'Direction accent'),
    },
    4,
    [
      { label: 'metric A', value: '47%', trend: 'up' },
      { label: 'metric B', value: '1.2x', trend: 'none' },
    ],
    '2–4 numbers shown together',
  ),
  ...SURFACE_FIELDS,
});

export type KpiProps = PropsOf<typeof kpiSchema>;

export function renderKpi(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = kpiSchema.parse(raw);
  const cells = p.cells.length ? p.cells : kpiSchema.defaults.cells;
  const s = typeScale(ctx);
  const cjk = isCjk(ctx.lang);
  const n = cells.length;
  const twoByTwo = p.variant === 'grid' && n === 4;
  const cols = p.variant === 'row' ? n : twoByTwo ? 2 : n;
  const cellW = (ctx.box.w - s.pad * 2) / cols;
  const longest = Math.max(...cells.map((c) => c.value.length));
  const vpx = Math.min(Math.round(s.hero * 0.52), Math.floor((cellW * 0.82) / (longest * (cjk ? 1.02 : 0.6))));

  const onCard = p.surface === 'card';
  const shadow = onCard ? '' : 'text-shadow:0 2px 16px rgb(0 0 0 / 0.35);';
  const panel = surfaceCss(p, s); // background / outline / corners are the component's own props

  const cellHtml = cells
    .map(
      (c, i) => `
  <div class="cell c${i}">
    ${c.label ? `<div class="lbl">${esc(c.label)}</div>` : ''}
    <div class="val"><span class="num n${i}">${esc(c.value)}</span>${c.trend === 'none' ? '' : `<i class="tr ${c.trend}"></i>`}</div>
  </div>`,
    )
    .join('');

  const html = `
<div class="wrap">${cellHtml}
</div>
<style>
#${id} .wrap{position:absolute;inset:0;display:grid;grid-template-columns:repeat(${cols},1fr);${twoByTwo ? 'grid-template-rows:1fr 1fr;' : ''}align-items:center;padding:${s.pad}px;gap:${Math.round(s.gap * 0.8)}px;${panel}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .cell{display:flex;flex-direction:column;gap:${Math.round(s.gap * 0.35)}px;min-width:0;padding:0 ${Math.round(s.gap * 0.6)}px;border-left:${s.rule - 1}px solid ${onCard ? tk('--sk-line') : 'rgb(255 255 255 / 0.25)'};}
#${id} .cell:first-child${twoByTwo ? `, #${id} .c2` : ''}{border-left:none;}
#${id} .lbl{font-size:${s.kicker}px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${inkOn(p, true)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${shadow}}
#${id} .val{display:flex;align-items:baseline;gap:${Math.round(s.gap * 0.3)}px;font-family:${tk('--sk-font-num')};font-variant-numeric:tabular-nums;font-feature-settings:"tnum";font-weight:800;font-size:${vpx}px;line-height:1.05;white-space:nowrap;${shadow}}
#${id} .tr{width:${Math.round(vpx * 0.32)}px;height:${Math.round(vpx * 0.32)}px;align-self:center;clip-path:polygon(50% 12%, 92% 82%, 8% 82%);}
#${id} .tr.up{background:${tk('--sk-accent')};}
#${id} .tr.down{background:${tk('--sk-accent-2')};transform:rotate(180deg);}
</style>`.trim();

  const tl: string[] = [];
  if (onCard) tl.push(fadeUp(`#${id} .wrap`, 0, { y: 12, dur: 0.25 }));
  tl.push(staggerUp(`#${id} .cell`, 0.12, { each: 0.09 }));
  if (p.motion === 'count-up') {
    cells.forEach((c, i) => {
      const cu = countUp(`#${id} .n${i}`, c.value, 0.25 + i * 0.09, 0.6);
      if (cu) tl.push(cu);
    });
  }
  return { html, timeline: tl.join('\n') };
}
