/**
 * offer — a price drop the viewer should remember.
 *
 * Variants:
 *  - stamp  the old price is struck and sinks, the new price lands huge, the perk is stamped on.
 *           The default.
 *  - strip  one horizontal strip: tag · old price struck · new price, perk beneath.
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { SURFACE_FIELDS, inkOn, surfaceCss } from '../surface';
import { defineSchema, en, text, reqText, type PropsOf } from '../schema';
import { EASE, drawRule, fadeUp, heroLand } from '../motion';
import { fitDown, isCjk, typeScale } from '../sizing';

export const offerSchema = defineSchema({
  variant: en(['stamp', 'strip'], 'stamp', 'stamp = new price lands with a perk stamp; strip = one line'),
  was: text(16, '', 'Original price, verbatim (struck through)'),
  now: reqText(16, '¥99', 'The offer price, verbatim'),
  tag: text(12, '', 'Short label before the price (e.g. "Today")'),
  perk: text(20, '', 'Extra that comes with it'),
  ...SURFACE_FIELDS,
  surface: en(['card', 'none'], 'none', 'Offers sit on the footage by default'),
});

export type OfferProps = PropsOf<typeof offerSchema>;

export function renderOffer(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = offerSchema.parse(raw);
  const s = typeScale(ctx);
  const cjk = isCjk(ctx.lang);
  const shadow = p.surface === 'card' ? '' : 'text-shadow:0 4px 22px rgb(0 0 0 / 0.45);';
  const innerW = ctx.box.w - s.pad * 2;
  const tl: string[] = [];
  const strip = p.variant === 'strip';
  const hero = fitDown(strip ? s.head * 1.4 : s.hero, p.now.length, false, innerW * (strip ? 0.5 : 0.85), Math.min(s.head, 32));
  const tag = p.tag ? `<span class="tag">${esc(p.tag)}</span>` : '';
  const was = p.was ? `<span class="was"><span>${esc(p.was)}</span><i class="cut" aria-hidden="true"></i></span>` : '';
  const perkSize = fitDown(s.label, p.perk.length, cjk, strip ? innerW : Math.max(80, hero * 1.4), Math.min(s.label, 18));

  const shared = `
#${id} .wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:${Math.round(s.gap * 0.5)}px;padding:${s.pad}px;${surfaceCss(p, s)}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .tag{font-size:${s.kicker}px;font-weight:var(--sk-head-weight, 800);text-transform:var(--sk-head-case, none);padding:${Math.round(s.kicker * 0.2)}px ${Math.round(s.kicker * 0.5)}px;border-radius:min(${Math.round(s.kicker * 0.3)}px, ${tk('--sk-radius')});background:${tk('--sk-accent')};color:${tk('--sk-panel')};align-self:center;}
#${id} .was{position:relative;font-family:${tk('--sk-font-num')};font-size:${Math.max(16, Math.round(hero * 0.34))}px;font-weight:700;opacity:0.7;${shadow}}
#${id} .cut{position:absolute;left:-4%;right:-4%;top:52%;height:${Math.max(3, Math.round(hero * 0.035))}px;border-radius:4px;background:${inkOn(p)};transform:rotate(-8deg);}
#${id} .now{font-family:${tk('--sk-font-num')};font-size:${hero}px;font-weight:var(--sk-head-weight, 900);text-transform:var(--sk-head-case, none);line-height:0.95;letter-spacing:-0.02em;color:${tk('--sk-accent')};${shadow}}`;
  let html: string;
  if (strip) {
    html = `
<div class="wrap">
  <div class="row">${tag}${was}<span class="now">${esc(p.now)}</span></div>
  ${p.perk ? `<div class="perk">${esc(p.perk)}</div>` : ''}
</div>
<style>${shared}
#${id} .row{display:flex;align-items:baseline;flex-wrap:wrap;gap:${Math.round(s.gap * 0.7)}px;}
#${id} .perk{font-size:${perkSize}px;font-weight:700;${shadow}}
</style>`;
    if (p.tag) tl.push(fadeUp(`#${id} .tag`, 0, { y: 10 }));
    if (p.was) { tl.push(fadeUp(`#${id} .was`, 0.1, { y: 10 })); tl.push(drawRule(`#${id} .cut`, 0.45)); }
    tl.push(heroLand(`#${id} .now`, 0.7, { from: 0.7 }));
    if (p.perk) tl.push(fadeUp(`#${id} .perk`, 1.1, { y: 10 }));
    return { html: html.trim(), timeline: tl.join('\n') };
  }
  const stamp = Math.round(Math.min(hero * 0.9, ctx.box.h * 0.4));
  html = `
<div class="wrap">
  ${was ? `<div class="top">${was}</div>` : ''}
  <div class="row">${tag}<span class="now">${esc(p.now)}</span></div>
  ${p.perk ? `<div class="stamp"><span>${esc(p.perk)}</span></div>` : ''}
</div>
<style>${shared}
#${id} .top{display:flex;}
#${id} .row{display:flex;align-items:center;gap:${Math.round(s.gap * 0.6)}px;}
#${id} .stamp{position:absolute;right:${s.pad}px;top:${s.pad}px;width:${stamp}px;height:${stamp}px;border-radius:50%;border:${Math.max(3, Math.round(stamp * 0.03))}px solid ${inkOn(p)};display:grid;place-items:center;transform:rotate(12deg);}
#${id} .stamp span{width:72%;text-align:center;font-size:${Math.max(12, Math.min(perkSize, Math.round(stamp * 0.2)))}px;font-weight:var(--sk-head-weight, 900);text-transform:var(--sk-head-case, none);line-height:1.15;${shadow}}
</style>`;
  if (p.was) { tl.push(fadeUp(`#${id} .top`, 0, { y: -12 })); tl.push(drawRule(`#${id} .cut`, 0.45)); tl.push(`tl.to('#${id} .was',{opacity:0.45,y:${Math.round(hero * 0.05)},duration:0.3,ease:'${EASE.out}'},0.75);`); }
  if (p.tag) tl.push(fadeUp(`#${id} .tag`, 0.8, { y: 10 }));
  tl.push(heroLand(`#${id} .now`, 0.9, { from: 0.55 }));
  if (p.perk) tl.push(`tl.from('#${id} .stamp',{autoAlpha:0,scale:2.2,rotation:-20,duration:0.3,ease:'power4.in'},1.5);`);
  return { html: html.trim(), timeline: tl.join('\n') };
}
