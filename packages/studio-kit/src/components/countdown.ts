/**
 * countdown — a number counting down to the moment ("you have 3 seconds…").
 *
 * Variants:
 *  - ring   the digit sits inside a ring that drains as it counts. The default.
 *  - slam   digits alone, each one slamming in large.
 *
 * The count is paced across the block's life when known (last digit lands just before the end),
 * so the host places the block where the speaker counts and the digits follow.
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { SURFACE_FIELDS, inkOn, surfaceCss } from '../surface';
import { defineSchema, en, num, text, type PropsOf } from '../schema';
import { EASE, fadeUp } from '../motion';
import { fitDown, isCjk, typeScale } from '../sizing';

export const countdownSchema = defineSchema({
  variant: en(['ring', 'slam'], 'ring', 'ring = draining ring around the digit; slam = digits alone'),
  from: num(1, 10, 3, 'Counts down from this number to 1'),
  label: text(40, '', 'Line above the count'),
  ...SURFACE_FIELDS,
  surface: en(['card', 'none'], 'none', 'Counts sit on the footage by default'),
});

export type CountdownProps = PropsOf<typeof countdownSchema>;

export function renderCountdown(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = countdownSchema.parse(raw);
  const s = typeScale(ctx);
  const cjk = isCjk(ctx.lang);
  const count = Math.max(1, Math.min(10, Math.round(p.from)));
  const shadow = p.surface === 'card' ? '' : 'text-shadow:var(--sk-ink-shadow, 0 4px 24px rgb(0 0 0 / 0.45));';
  const labelSize = fitDown(s.label, p.label.length, cjk, ctx.box.w - s.pad * 2, Math.min(s.label, 20));
  const labelH = p.label ? labelSize * 1.6 : 0;
  const dial = Math.round(Math.max(60, Math.min(ctx.box.w - s.pad * 2, ctx.box.h - s.pad * 2 - labelH)));
  const digit = Math.min(Math.round(s.hero * 1.8), Math.round(dial * (p.variant === 'ring' ? 0.5 : 0.8)));
  const ring = p.variant === 'ring';
  const C = 2 * Math.PI * 88;

  const digits = Array.from({ length: count }, (_, i) => count - i);
  const html = `
<div class="wrap">
  ${p.label ? `<div class="k">${esc(p.label)}</div>` : ''}
  <div class="dial">
    ${ring ? `<svg class="ring" viewBox="0 0 200 200" aria-hidden="true"><circle class="bg" cx="100" cy="100" r="88"/><circle class="fg" cx="100" cy="100" r="88"/></svg>` : ''}
    ${digits.map((d, i) => `<span class="n n${i}">${d}</span>`).join('')}
  </div>
</div>
<style>
#${id} .wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(s.gap * 0.6)}px;padding:${s.pad}px;${surfaceCss(p, s)}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .k{font-size:${labelSize}px;font-weight:var(--sk-head-weight, 800);text-transform:var(--sk-head-case, none);${shadow}}
#${id} .dial{position:relative;width:${dial}px;height:${dial}px;display:grid;place-items:center;}
#${id} .ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);}
#${id} .ring circle{fill:none;stroke-width:12;}
#${id} .bg{stroke:currentColor;opacity:0.16;}
#${id} .fg{stroke:${tk('--sk-accent')};stroke-linecap:round;stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:0;}
#${id} .n{grid-area:1/1;font-family:${tk('--sk-font-num')};font-size:${digit}px;font-weight:var(--sk-head-weight, 900);text-transform:var(--sk-head-case, none);line-height:1;${shadow}}
#${id} .n${count - 1}{color:${tk('--sk-accent')};}
</style>`;

  // Paced across the block: the last digit lands a beat before the end.
  const life = ctx.durationSec && ctx.durationSec > 1 ? ctx.durationSec : count * 0.9 + 0.8;
  const step = Math.max(0.35, (life - 0.8) / count);
  const at = (i: number) => Math.round((0.3 + i * step) * 100) / 100;
  const tl: string[] = [];
  if (p.label) tl.push(fadeUp(`#${id} .k`, 0, { y: 12 }));
  if (ring) {
    tl.push(`tl.from('#${id} .dial',{autoAlpha:0,scale:0.8,duration:0.35,ease:'${EASE.land}'},0.05);`);
    // The ring fills as the count runs, so the held last frame is a complete accent ring.
    tl.push(`tl.fromTo('#${id} .fg',{strokeDashoffset:${C.toFixed(1)}},{strokeDashoffset:0,duration:${(step * (count - 1) + 0.16).toFixed(2)},ease:'none'},${at(0)});`);
  }
  digits.forEach((_, i) => {
    tl.push(`tl.fromTo('#${id} .n${i}',{autoAlpha:0,scale:${ring ? 1.5 : 1.9}},{autoAlpha:1,scale:1,duration:0.16,ease:'power4.in'},${at(i)});`);
    if (i < count - 1) tl.push(`tl.to('#${id} .n${i}',{autoAlpha:0,duration:0.08},${at(i + 1)});`);
  });
  return { html: html.trim(), timeline: tl.join('\n') };
}
