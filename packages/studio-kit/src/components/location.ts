/**
 * location — where we are.
 *
 * Variants:
 *  - pin    a map pin drops and bounces beside the place name, detail under a rule. The default.
 *  - label  a compact tag: small pin + place · detail on one line (corner placement).
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { SURFACE_FIELDS, inkOn, surfaceCss } from '../surface';
import { defineSchema, en, text, reqText, type PropsOf } from '../schema';
import { EASE, drawRule, fadeUp } from '../motion';
import { fitDown, isCjk, typeScale } from '../sizing';

export const locationSchema = defineSchema({
  variant: en(['pin', 'label'], 'pin', 'pin = dropped map pin with a big place name; label = compact one-line tag'),
  place: reqText(24, 'Somewhere', 'The place name, verbatim'),
  detail: text(40, '', 'Street, venue or context'),
  ...SURFACE_FIELDS,
  surface: en(['card', 'none'], 'none', 'Location tags sit on the footage by default'),
});

export type LocationProps = PropsOf<typeof locationSchema>;

const PIN = '<svg viewBox="0 0 24 32" aria-hidden="true"><path d="M12 31s10-11.3 10-19A10 10 0 0 0 2 12c0 7.7 10 19 10 19z"/><circle cx="12" cy="12" r="4"/></svg>';

export function renderLocation(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = locationSchema.parse(raw);
  const s = typeScale(ctx);
  const cjk = isCjk(ctx.lang);
  const shadow = p.surface === 'card' ? '' : 'text-shadow:var(--sk-ink-shadow, 0 3px 20px rgb(0 0 0 / 0.45));';
  const tl: string[] = [];
  if (p.variant === 'label') {
    const size = fitDown(s.label, p.place.length + p.detail.length + 3, cjk, ctx.box.w - s.pad * 2 - s.label * 1.4, Math.min(s.label, 18));
    const html = `
<div class="wrap"><span class="pin">${PIN}</span><span class="pl">${esc(p.place)}</span>${p.detail ? `<span class="dt">· ${esc(p.detail)}</span>` : ''}</div>
<style>
#${id} .wrap{position:absolute;inset:0;display:flex;align-items:center;gap:${Math.round(size * 0.4)}px;padding:${s.pad}px;${surfaceCss(p, s)}color:${inkOn(p)};font-family:${tk('--sk-font-head')};font-size:${size}px;}
#${id} .pin{flex:none;width:${Math.round(size * 1.1)}px;height:${Math.round(size * 1.45)}px;}
#${id} .pin svg{width:100%;height:100%;fill:${tk('--sk-accent')};}
#${id} .pin circle{fill:${tk('--sk-panel')};}
#${id} .pl{font-weight:var(--sk-head-weight, 800);text-transform:var(--sk-head-case, none);${shadow}}
#${id} .dt{font-weight:500;color:${inkOn(p, true)};${shadow}}
</style>`;
    tl.push(`tl.from('#${id} .pin',{autoAlpha:0,y:-${Math.round(size)},duration:0.4,ease:'bounce.out'},0);`);
    tl.push(fadeUp(`#${id} .pl`, 0.2, { y: 8 }));
    if (p.detail) tl.push(fadeUp(`#${id} .dt`, 0.35, { y: 8 }));
    return { html: html.trim(), timeline: tl.join('\n') };
  }
  const pinW = Math.round(Math.min(s.hero * 0.7, ctx.box.h * 0.5, ctx.box.w * 0.22));
  const innerW = ctx.box.w - s.pad * 2 - pinW * 1.25;
  const place = fitDown(s.hero, p.place.length, cjk, innerW, Math.min(s.head, 28));
  const detail = fitDown(s.label, p.detail.length, cjk, innerW, Math.min(s.label, 18));
  const html = `
<div class="wrap">
  <div class="pin">${PIN}<i class="sh" aria-hidden="true"></i></div>
  <div class="txt"><div class="pl">${esc(p.place)}</div>${p.detail ? `<i class="rule" aria-hidden="true"></i><div class="dt">${esc(p.detail)}</div>` : ''}</div>
</div>
<style>
#${id} .wrap{position:absolute;inset:0;display:flex;align-items:center;gap:${Math.round(pinW * 0.25)}px;padding:${s.pad}px;${surfaceCss(p, s)}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .pin{position:relative;flex:none;width:${pinW}px;height:${Math.round(pinW * 1.33)}px;}
#${id} .pin svg{width:100%;height:100%;fill:${tk('--sk-accent')};filter:drop-shadow(0 8px 18px rgb(0 0 0 / 0.4));}
#${id} .pin circle{fill:${tk('--sk-panel')};}
#${id} .sh{position:absolute;left:25%;right:25%;bottom:-${Math.round(pinW * 0.08)}px;height:${Math.round(pinW * 0.1)}px;border-radius:50%;background:rgb(0 0 0 / 0.45);}
#${id} .pl{font-size:${place}px;font-weight:var(--sk-head-weight, 900);text-transform:var(--sk-head-case, none);line-height:1;letter-spacing:0.04em;${shadow}}
#${id} .rule{display:block;height:${Math.max(3, s.rule + 2)}px;margin:${Math.round(s.gap * 0.5)}px 0;background:${tk('--sk-accent')};}
#${id} .dt{font-size:${detail}px;font-weight:700;${shadow}}
</style>`;
  tl.push(`tl.from('#${id} .pin svg',{autoAlpha:0,y:-${Math.round(pinW * 1.4)},duration:0.5,ease:'bounce.out'},0);`);
  tl.push(`tl.from('#${id} .sh',{autoAlpha:0,scale:0.3,duration:0.5,ease:'${EASE.out}'},0);`);
  tl.push(fadeUp(`#${id} .pl`, 0.35, { y: 16, dur: 0.36 }));
  if (p.detail) { tl.push(drawRule(`#${id} .rule`, 0.6)); tl.push(fadeUp(`#${id} .dt`, 0.72, { y: 10 })); }
  return { html: html.trim(), timeline: tl.join('\n') };
}
