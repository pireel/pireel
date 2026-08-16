/**
 * chart — a hand-built chart that IS the fragment (no library).
 *
 * Variants:
 *  - bars     horizontal ranking bars: label · track · value. The default.
 *  - columns  vertical columns rising from a baseline.
 *  - donut    share-of-whole ring with a center headline.
 *
 * The accent lands on one series (`highlight` index; -1 = the max value).
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { SURFACE_FIELDS, inkOn, surfaceCss } from '../surface';
import { defineSchema, en, num, rows, text, reqText, type PropsOf } from '../schema';
import { fadeUp, staggerUp } from '../motion';
import { typeScale } from '../sizing';

export const chartSchema = defineSchema({
  variant: en(['bars', 'columns', 'donut'], 'bars', 'Chart form'),
  title: text(40, '', 'One-line caption above the chart'),
  unit: text(8, '', 'Value suffix ("%", "k", "万")'),
  series: rows(
    {
      label: reqText(16, '—'),
      value: num(0, 1e9, 0),
    },
    6,
    [
      { label: 'A', value: 64 },
      { label: 'B', value: 37 },
      { label: 'C', value: 18 },
    ],
    'Up to 6 rows of real data',
  ),
  highlight: num(-1, 5, -1, 'Index of the accented row; -1 accents the max'),
  ...SURFACE_FIELDS,
});

export type ChartProps = PropsOf<typeof chartSchema>;

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export function renderChart(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = chartSchema.parse(raw);
  const series = p.series.length ? p.series : chartSchema.defaults.series;
  const s = typeScale(ctx);
  const max = Math.max(...series.map((r) => r.value), 1);
  const hi = p.highlight >= 0 && p.highlight < series.length ? p.highlight : series.findIndex((r) => r.value === max);
  const onCard = p.surface === 'card';
  const shadow = onCard ? '' : 'text-shadow:0 2px 14px rgb(0 0 0 / 0.35);';
  const panel = surfaceCss(p, s); // background / outline / corners are the component's own props
  // Charts must stay readable when the full canvas is reduced to a small style sample. Keep a
  // deliberate three-step hierarchy instead of rendering every row as footnote-sized metadata.
  const titlePx = Math.min(s.head, Math.round(s.label * 1.25));
  const rowPx = Math.max(s.kicker, Math.round(s.label * 0.9));

  const shared = `
#${id} .wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:${s.pad}px;gap:${Math.round(s.gap * 0.7)}px;${panel}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .title{font-size:${titlePx}px;font-weight:750;line-height:1.1;${shadow}}
#${id} .vtxt{font-family:${tk('--sk-font-num')};font-variant-numeric:tabular-nums;font-feature-settings:"tnum";font-weight:700;}`;

  let html: string;
  const tl: string[] = [];
  const title = p.title ? `<div class="title">${esc(p.title)}</div>` : '';

  if (p.variant === 'donut') {
    const R = Math.round(Math.min(ctx.box.w, ctx.box.h - s.pad * 2) * 0.3);
    const SW = Math.max(10, Math.round(R * 0.3));
    const C = 2 * Math.PI * R;
    const total = series.reduce((a, r) => a + r.value, 0) || 1;
    let acc = 0;
    const segs = series
      .map((r, i) => {
        const frac = r.value / total;
        const seg = `<circle class="seg s${i}" r="${R}" cx="0" cy="0" fill="none" stroke="${i === hi ? tk('--sk-accent') : `color-mix(in srgb, ${tk('--sk-muted')} ${85 - i * 12}%, transparent)`}" stroke-width="${SW}" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-acc * C).toFixed(1)}"/>`;
        acc += frac;
        return seg;
      })
      .join('');
    const hiRow = series[hi]!;
    html = `
<div class="wrap">
  ${title}
  <div class="ring">
    <svg viewBox="${-R - SW} ${-R - SW} ${(R + SW) * 2} ${(R + SW) * 2}" style="transform:rotate(-90deg);">${segs}</svg>
    <div class="center"><div class="vtxt big">${fmt((hiRow.value / total) * 100)}%</div><div class="cl">${esc(hiRow.label)}</div></div>
  </div>
</div>
<style>${shared}
#${id} .wrap{align-items:center;}
#${id} .ring{position:relative;width:${(R + SW) * 2}px;height:${(R + SW) * 2}px;}
#${id} .ring svg{width:100%;height:100%;}
#${id} .center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;}
#${id} .center .big{font-size:${Math.round(R * 0.5)}px;line-height:1;${shadow}}
#${id} .center .cl{font-size:${rowPx}px;color:${inkOn(p, true)};${shadow}}
</style>`;
    if (title) tl.push(fadeUp(`#${id} .title`, 0.05, { dur: 0.3 }));
    // Grow each segment by tweening its dash length from 0 (attr tween — GSAP core, no plugins)
    acc = 0;
    series.forEach((r, i) => {
      const frac = r.value / total;
      tl.push(
        `tl.from('#${id} .s${i}',{attr:{'stroke-dasharray':'0 ${C.toFixed(1)}'},autoAlpha:0,duration:0.45,ease:'power2.out'},${(0.15 + i * 0.08).toFixed(2)});`,
      );
      acc += frac;
    });
    tl.push(fadeUp(`#${id} .center`, 0.5, { y: 8, dur: 0.35 }));
  } else if (p.variant === 'columns') {
    const colH = Math.max(80, Math.round(ctx.box.h - s.pad * 2 - (p.title ? s.label * 1.6 : 0) - s.label * 1.8));
    const colsHtml = series
      .map(
        (r, i) => `
    <div class="col">
      <div class="vtxt cv">${fmt(r.value)}${esc(p.unit)}</div>
      <div class="stick s${i}${i === hi ? ' hi' : ''}" style="height:${Math.max(6, Math.round((r.value / max) * colH))}px"></div>
      <div class="cl">${esc(r.label)}</div>
    </div>`,
      )
      .join('');
    html = `
<div class="wrap">${title}<div class="cols">${colsHtml}</div></div>
<style>${shared}
#${id} .cols{display:flex;align-items:flex-end;justify-content:center;gap:${Math.round(s.gap * 0.9)}px;border-bottom:${s.rule}px solid ${onCard ? tk('--sk-line') : 'rgb(255 255 255 / 0.4)'};padding-bottom:0;}
#${id} .col{display:flex;flex-direction:column;align-items:center;gap:${Math.round(s.gap * 0.3)}px;}
#${id} .stick{width:${Math.max(26, Math.round((ctx.box.w - s.pad * 2) / (series.length * 2.4)))}px;background:${onCard ? tk('--sk-panel-2') : 'rgb(255 255 255 / 0.35)'};border-radius:${s.rule + 2}px ${s.rule + 2}px 0 0;transform-origin:center bottom;}
#${id} .stick.hi{background:${tk('--sk-accent')};}
#${id} .cv{font-size:${rowPx}px;${shadow}}
#${id} .cl{font-size:${rowPx}px;color:${inkOn(p, true)};margin-top:${Math.round(s.gap * 0.2)}px;${shadow}}
</style>`;
    if (title) tl.push(fadeUp(`#${id} .title`, 0.05, { dur: 0.3 }));
    tl.push(`tl.from('#${id} .stick',{scaleY:0,duration:0.5,ease:'power3.out',stagger:0.08},0.15);`);
    tl.push(staggerUp(`#${id} .cv`, 0.35, { each: 0.08, y: 8, dur: 0.25 }));
  } else {
    const rowsHtml = series
      .map(
        (r, i) => `
    <div class="r">
      <div class="cl">${esc(r.label)}</div>
      <div class="track"><i class="fill f${i}${i === hi ? ' hi' : ''}" style="width:${Math.max(3, Math.round((r.value / max) * 100))}%"></i></div>
      <div class="vtxt cv">${fmt(r.value)}${esc(p.unit)}</div>
    </div>`,
      )
      .join('');
    html = `
<div class="wrap">${title}<div class="rows">${rowsHtml}</div></div>
<style>${shared}
#${id} .rows{display:flex;flex-direction:column;gap:${Math.round(s.gap * 0.55)}px;}
#${id} .r{display:flex;align-items:center;gap:${Math.round(s.gap * 0.6)}px;}
#${id} .cl{flex:0 0 ${Math.round((ctx.box.w - s.pad * 2) * 0.22)}px;font-size:${rowPx}px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${shadow}}
#${id} .track{flex:1;height:${Math.max(14, Math.round(s.label * 0.6))}px;background:${onCard ? tk('--sk-panel-2') : 'rgb(255 255 255 / 0.22)'};border-radius:999px;overflow:hidden;}
#${id} .fill{display:block;height:100%;background:color-mix(in srgb, ${tk('--sk-muted')} 70%, transparent);border-radius:999px;transform-origin:left center;}
#${id} .fill.hi{background:${tk('--sk-accent')};}
#${id} .cv{flex:0 0 auto;font-size:${rowPx}px;${shadow}}
</style>`;
    if (title) tl.push(fadeUp(`#${id} .title`, 0.05, { dur: 0.3 }));
    tl.push(`tl.from('#${id} .fill',{scaleX:0,duration:0.55,ease:'power3.out',stagger:0.09},0.15);`);
    tl.push(staggerUp(`#${id} .cv`, 0.3, { each: 0.09, y: 6, dur: 0.25 }));
  }
  if (onCard) tl.unshift(fadeUp(`#${id} .wrap`, 0, { y: 12, dur: 0.25 }));
  return { html: html.trim(), timeline: tl.join('\n') };
}
