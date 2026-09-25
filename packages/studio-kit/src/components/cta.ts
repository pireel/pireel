/**
 * cta — the ask at the end of a talking-head video.
 *
 * Variants:
 *  - follow  a follow pill: avatar dot + action button that gets "pressed" and flips to its done
 *            state, with an optional teaser line underneath. The default.
 *  - banner  an arrow-led action line ("comment 'guide' to get the checklist") set as a strip.
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { SURFACE_FIELDS, inkOn, surfaceCss } from '../surface';
import { defineSchema, en, text, reqText, type PropsOf } from '../schema';
import { EASE, fadeUp, heroLand } from '../motion';
import { fitDown, isCjk, typeScale } from '../sizing';

export const ctaSchema = defineSchema({
  variant: en(['follow', 'banner'], 'follow', 'follow = pressed follow button; banner = arrow-led action line'),
  action: reqText(16, 'Follow', 'The button / action words, verbatim'),
  done: text(16, 'Following', 'Follow only: what the button reads once pressed'),
  line: text(48, '', 'Teaser or instruction under the action'),
  ...SURFACE_FIELDS,
  surface: en(['card', 'none'], 'none', 'The ask sits on the footage by default'),
});

export type CtaProps = PropsOf<typeof ctaSchema>;

export function renderCta(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = ctaSchema.parse(raw);
  const s = typeScale(ctx);
  const cjk = isCjk(ctx.lang);
  const shadow = p.surface === 'card' ? '' : 'text-shadow:0 2px 16px rgb(0 0 0 / 0.45);';
  const panel = surfaceCss(p, s);
  const innerW = ctx.box.w - s.pad * 2;
  const lineSize = fitDown(s.label, p.line.length, cjk, innerW, Math.min(s.label, 20));
  const line = p.line ? `<div class="line">${esc(p.line)}</div>` : '';
  const tl: string[] = [];
  let html: string;

  if (p.variant === 'banner') {
    const size = fitDown(s.head, p.action.length + 2, cjk, innerW - s.head, Math.min(s.head, 28));
    html = `
<div class="wrap">
  <div class="act"><svg class="arr" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6"/></svg><span>${esc(p.action)}</span></div>
  ${line}
</div>
<style>
#${id} .wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:${Math.round(s.gap * 0.6)}px;padding:${s.pad}px;${panel}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .act{display:flex;align-items:center;gap:${Math.round(s.gap * 0.6)}px;font-size:${size}px;font-weight:var(--sk-head-weight, 800);text-transform:var(--sk-head-case, none);line-height:1.1;${shadow}}
#${id} .arr{flex:none;width:${Math.round(size * 0.9)}px;height:${Math.round(size * 0.9)}px;fill:none;stroke:${tk('--sk-accent')};stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
#${id} .line{font-size:${lineSize}px;font-weight:600;color:${inkOn(p, true)};${shadow}}
</style>`;
    tl.push(`tl.from('#${id} .arr',{autoAlpha:0,x:-${Math.round(size * 0.6)},duration:0.3,ease:'${EASE.out}'},0.05);`);
    tl.push(fadeUp(`#${id} .act span`, 0.15, { y: 12 }));
    tl.push(`tl.to('#${id} .arr',{x:${Math.round(size * 0.18)},duration:0.28,repeat:3,yoyo:true,ease:'${EASE.inOut}'},0.6);`);
    if (p.line) tl.push(fadeUp(`#${id} .line`, 0.45, { y: 10 }));
    return { html: html.trim(), timeline: tl.join('\n') };
  }

  const btn = Math.round(Math.min(s.head * 1.6, ctx.box.h * 0.42));
  const btnFont = fitDown(Math.round(btn * 0.42), Math.max(p.action.length, p.done.length), cjk, btn * 2.6, Math.min(s.label, 20));
  html = `
<div class="wrap">
  <div class="pill">
    <span class="av"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg></span>
    <span class="btn"><i class="pressed" aria-hidden="true"></i><span class="b1">${esc(p.action)}</span><span class="b2">${esc(p.done || p.action)}</span></span>
  </div>
  ${line}
</div>
<style>
#${id} .wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(s.gap * 0.7)}px;padding:${s.pad}px;${panel}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .pill{display:flex;align-items:center;gap:${Math.round(btn * 0.2)}px;padding:${Math.round(btn * 0.12)}px;border-radius:min(${btn}px, ${tk('--sk-radius')});background:${tk('--sk-panel')};box-shadow:0 ${Math.round(btn * 0.12)}px ${Math.round(btn * 0.4)}px rgb(0 0 0 / 0.3);}
#${id} .av{width:${btn}px;height:${btn}px;border-radius:50%;background:${tk('--sk-accent')};display:grid;place-items:center;}
#${id} .av svg{width:${Math.round(btn * 0.56)}px;height:${Math.round(btn * 0.56)}px;fill:none;stroke:${tk('--sk-panel')};stroke-width:2;}
#${id} .btn{display:grid;place-items:center;min-width:${Math.round(btn * 2.4)}px;height:${btn}px;padding:0 ${Math.round(btn * 0.3)}px;border-radius:min(${btn}px, ${tk('--sk-radius')});background:${tk('--sk-accent')};overflow:hidden;}
#${id} .pressed{grid-area:1/1;align-self:stretch;justify-self:stretch;margin:0 -${Math.round(btn * 0.3)}px;background:${tk('--sk-panel-2')};opacity:0;}
#${id} .b1,#${id} .b2{grid-area:1/1;position:relative;font-size:${btnFont}px;font-weight:var(--sk-head-weight, 800);text-transform:var(--sk-head-case, none);white-space:nowrap;}
#${id} .b1{color:${tk('--sk-panel')};}
#${id} .b2{color:${tk('--sk-fg')};}
#${id} .line{font-size:${lineSize}px;font-weight:700;${shadow}}
</style>`;
  tl.push(heroLand(`#${id} .pill`, 0, { from: 0.82 }));
  tl.push(`tl.set('#${id} .b2',{autoAlpha:0},0);`);
  tl.push(`tl.to('#${id} .btn',{scale:0.92,duration:0.1,yoyo:true,repeat:1,ease:'${EASE.inOut}'},0.9);`);
  // The pressed state fades a surface in over the accent (colours stay CSS tokens, never tweened).
  tl.push(`tl.to('#${id} .pressed',{opacity:1,duration:0.2},1.0);`);
  tl.push(`tl.to('#${id} .b1',{autoAlpha:0,y:-${Math.round(btn * 0.3)},duration:0.2},1.0);`);
  tl.push(`tl.fromTo('#${id} .b2',{autoAlpha:0,y:${Math.round(btn * 0.3)}},{autoAlpha:1,y:0,duration:0.24,ease:'${EASE.land}'},1.05);`);
  if (p.line) tl.push(fadeUp(`#${id} .line`, 1.3, { y: 10 }));
  return { html: html.trim(), timeline: tl.join('\n') };
}
