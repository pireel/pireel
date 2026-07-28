/**
 * metric — one headline number, presented like it matters.
 *
 * Variants:
 *  - hero-number    the number IS the composition: kicker above, note below,
 *                   optional ghost numeral behind for depth. Any box shape.
 *  - split-editorial a magazine spread in miniature: accent-ruled left rail with
 *                   the kicker, the number owning the right column. Wide boxes.
 *  - badge          a stamped verdict chip: number in an accent-ringed badge,
 *                   label beneath. Small boxes / passing facts.
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { SURFACE_FIELDS, inkOn, surfaceCss } from '../surface';
import { defineSchema, en, text, reqText, bool, type PropsOf } from '../schema';
import { countUp, drawRule, fadeUp, heroLand, staggerUp } from '../motion';
import { fitDown, isCjk, typeScale } from '../sizing';

export const metricSchema = defineSchema({
  variant: en(['hero-number', 'split-editorial', 'badge'], 'hero-number', 'Layout staging'),
  motion: en(['count-up', 'land'], 'count-up', 'Entrance: numbers count up, or the value lands whole'),
  value: reqText(16, '—', 'The number, verbatim, units included ("47%", "¥1,284", "3.2x")'),
  label: text(40, '', 'What the number is (kicker above / rail text)'),
  note: text(60, '', 'One-line context under the number'),
  trend: en(['up', 'down', 'none'], 'none', 'Direction chip next to the value'),
  ghost: bool(false, 'Oversized ghost numeral behind the value (hero-number only)'),
  ...SURFACE_FIELDS,
});

export type MetricProps = PropsOf<typeof metricSchema>;

const ARROW = {
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14l5-6 5 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10l5 6 5-6"/></svg>',
};

export function renderMetric(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = metricSchema.parse(raw);
  const s = typeScale(ctx);
  const cjk = isCjk(ctx.lang);

  const innerW = ctx.box.w - s.pad * 2;
  // The trend chip rides on the value's baseline — charge it as extra glyphs so
  // fitDown budgets for the real rendered width.
  const valueLen = p.value.length + (p.trend === 'none' ? 0 : 2);
  const hero = fitDown(
    p.variant === 'badge' ? Math.round(s.hero * 0.62) : s.hero,
    valueLen,
    cjk,
    // split-editorial: the value owns only the main column (rail ≤34% + gap).
    p.variant === 'split-editorial' ? Math.round(innerW * 0.56) : p.variant === 'badge' ? Math.round(innerW * 0.7) : innerW,
    s.head,
  );

  const onCard = p.surface === 'card';
  const shadow = onCard ? '' : `text-shadow:0 2px 18px rgb(0 0 0 / 0.35);`;
  const panel = surfaceCss(p, s); // background / outline / corners are the component's own props

  const trendChip =
    p.trend === 'none'
      ? ''
      : `<span class="trend ${p.trend}">${ARROW[p.trend]}</span>`;

  const kicker = p.label
    ? `<div class="kicker">${esc(p.label)}</div>`
    : '';
  const note = p.note ? `<div class="note">${esc(p.note)}</div>` : '';

  const shared = `
#${id} .wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:${s.pad}px;${panel}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .kicker{font-size:${s.kicker}px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${inkOn(p, true)};${shadow}}
#${id} .value{font-family:${tk('--sk-font-num')};font-variant-numeric:tabular-nums;font-feature-settings:"tnum";font-weight:800;font-size:${hero}px;line-height:1.04;letter-spacing:-0.01em;display:flex;align-items:baseline;gap:${Math.round(s.gap * 0.5)}px;${shadow}}
#${id} .note{font-size:${s.label}px;color:${inkOn(p, true)};font-weight:500;${shadow}}
#${id} .trend{display:inline-flex;align-self:center;width:${Math.round(hero * 0.3)}px;height:${Math.round(hero * 0.3)}px;}
#${id} .trend svg{width:100%;height:100%;}
#${id} .trend.up{color:${tk('--sk-accent')};}
#${id} .trend.down{color:${tk('--sk-accent-2')};}`;

  let html: string;
  if (p.variant === 'split-editorial') {
    html = `
<div class="wrap">
  <div class="rail"><i class="rule"></i>${kicker}</div>
  <div class="main"><div class="value"><span class="num">${esc(p.value)}</span>${trendChip}</div>${note}</div>
</div>
<style>${shared}
#${id} .wrap{flex-direction:row;align-items:center;gap:${s.gap * 1.5}px;}
#${id} .rail{display:flex;flex-direction:column;gap:${Math.round(s.gap * 0.7)}px;flex:0 0 auto;max-width:34%;}
#${id} .rail .rule{display:block;width:${Math.round(s.pad * 0.75)}px;height:${s.rule + 1}px;background:${tk('--sk-accent')};}
#${id} .rail .kicker{letter-spacing:0.1em;}
#${id} .main{display:flex;flex-direction:column;gap:${Math.round(s.gap * 0.6)}px;min-width:0;}
</style>`;
  } else if (p.variant === 'badge') {
    html = `
<div class="wrap">
  <div class="badge"><div class="value"><span class="num">${esc(p.value)}</span>${trendChip}</div></div>
  ${kicker}${note}
</div>
<style>${shared}
#${id} .wrap{align-items:center;text-align:center;gap:${Math.round(s.gap * 0.8)}px;${onCard ? '' : 'background:none;'}}
#${id} .badge{display:flex;align-items:center;justify-content:center;padding:${Math.round(s.gap)}px ${Math.round(s.gap * 1.6)}px;border:${s.rule + 1}px solid ${tk('--sk-accent')};border-radius:999px;${onCard ? `background:${tk('--sk-panel-2')};` : ''}}
</style>`;
  } else {
    const ghost =
      p.ghost && !cjk
        ? `<div class="ghost" aria-hidden="true">${esc(p.value)}</div>`
        : '';
    html = `
<div class="wrap">
  ${ghost}
  ${kicker}
  <div class="value"><span class="num">${esc(p.value)}</span>${trendChip}</div>
  ${note}
</div>
<style>${shared}
#${id} .wrap{gap:${Math.round(s.gap * 0.7)}px;overflow:hidden;}
#${id} .ghost{position:absolute;right:${-Math.round(hero * 0.18)}px;bottom:${-Math.round(hero * 0.34)}px;font-family:${tk('--sk-font-num')};font-weight:800;font-size:${Math.round(hero * 2.1)}px;line-height:1;color:${onCard ? tk('--sk-panel-2') : 'rgb(255 255 255 / 0.08)'};pointer-events:none;user-select:none;}
</style>`;
  }

  const tl: string[] = [];
  if (onCard) tl.push(fadeUp(`#${id} .wrap`, 0, { y: 12, dur: 0.25 }));
  if (p.variant === 'split-editorial') tl.push(drawRule(`#${id} .rail .rule`, 0.12));
  if (p.variant === 'hero-number' && p.ghost && !cjk) tl.push(fadeUp(`#${id} .ghost`, 0.1, { y: 24, dur: 0.5 }));
  tl.push(staggerUp(`#${id} .kicker, #${id} .note`, 0.16, { each: 0.1 }));
  const heroAt = 0.3;
  const counted = p.motion === 'count-up' ? countUp(`#${id} .num`, p.value, heroAt) : null;
  if (counted) {
    tl.push(fadeUp(`#${id} .value`, heroAt, { y: 10, dur: 0.28 }));
    tl.push(counted);
  } else {
    tl.push(heroLand(`#${id} .value`, heroAt));
  }

  return { html: html.trim(), timeline: tl.join('\n') };
}
