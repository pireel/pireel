/**
 * checklist — items that tick off as the speaker names them.
 *
 * Variants:
 *  - ticks   boxes that fill with a drawn check, one item at a time. The default.
 *  - strike  items that get crossed out once done (to-do lists, "stop doing" lists).
 *
 * Ticks are paced across the block's life when known.
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { SURFACE_FIELDS, inkOn, surfaceCss } from '../surface';
import { defineSchema, en, rows, reqText, text, type PropsOf } from '../schema';
import { EASE, fadeUp, staggerUp } from '../motion';
import { fitDown, isCjk, typeScale } from '../sizing';

export const checklistSchema = defineSchema({
  variant: en(['ticks', 'strike'], 'ticks', 'ticks = check marks fill in; strike = items get crossed out'),
  title: text(40, '', 'Line above the list'),
  items: rows({ text: reqText(40, '—') }, 6, [{ text: 'First thing' }, { text: 'Second thing' }, { text: 'Third thing' }], 'Up to 6 items'),
  ...SURFACE_FIELDS,
});

export type ChecklistProps = PropsOf<typeof checklistSchema>;

export function renderChecklist(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = checklistSchema.parse(raw);
  const items = p.items.length ? p.items : checklistSchema.defaults.items;
  const s = typeScale(ctx);
  const cjk = isCjk(ctx.lang);
  const n = items.length;
  const shadow = p.surface === 'card' ? '' : 'text-shadow:0 2px 14px rgb(0 0 0 / 0.4);';
  const innerW = ctx.box.w - s.pad * 2;
  const titleH = p.title ? s.kicker * 2 : 0;
  const rowH = Math.max(28, (ctx.box.h - s.pad * 2 - titleH) / n);
  const longest = Math.max(...items.map((item) => item.text.length));
  const box = Math.round(Math.min(rowH * 0.62, s.head));
  // Long items wrap rather than shrink below the reading size.
  const size = Math.max(s.label, fitDown(Math.min(s.head, Math.round(rowH * 0.5)), longest, cjk, innerW - box * 1.5, Math.min(s.label, 18)));
  const dur = ctx.durationSec ?? 0;
  const step = dur > 1.5 ? Math.min(1.2, Math.max(0.3, (dur * 0.65) / n)) : 0.35;
  const at = (i: number) => Math.round((0.5 + i * step) * 100) / 100;
  const strike = p.variant === 'strike';

  const html = `
<div class="wrap">
  ${p.title ? `<div class="k">${esc(p.title)}</div>` : ''}
  <ul class="rows">
    ${items.map((item, i) => `<li class="r r${i}"><span class="box"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span class="t">${esc(item.text)}<i class="x" aria-hidden="true"></i></span></li>`).join('')}
  </ul>
</div>
<style>
#${id} .wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:${Math.round(s.gap * 0.6)}px;padding:${s.pad}px;${surfaceCss(p, s)}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .k{font-size:${s.kicker}px;font-weight:700;letter-spacing:0.06em;color:${tk('--sk-accent')};${shadow}}
#${id} .rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:${Math.round(rowH * 0.22)}px;}
#${id} .r{display:flex;align-items:center;gap:${Math.round(box * 0.45)}px;}
#${id} .box{flex:none;width:${box}px;height:${box}px;border-radius:min(${Math.round(box * 0.22)}px, ${tk('--sk-radius')});border:${Math.max(2, Math.round(box * 0.07))}px solid ${inkOn(p, true)};display:grid;place-items:center;}
#${id} .box svg{width:72%;height:72%;fill:none;stroke:${tk('--sk-accent')};stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round;}
#${id} .t{position:relative;font-size:${size}px;font-weight:700;line-height:1.2;${shadow}}
#${id} .x{position:absolute;left:0;right:0;top:55%;height:${Math.max(2, Math.round(size * 0.1))}px;background:${tk('--sk-accent')};transform:scaleX(0);transform-origin:left center;${strike ? '' : 'display:none;'}}
</style>`;
  const tl: string[] = [];
  if (p.title) tl.push(fadeUp(`#${id} .k`, 0, { y: 10 }));
  tl.push(staggerUp(`#${id} .r`, 0.1, { each: 0.08 }));
  items.forEach((_, i) => {
    tl.push(`tl.from('#${id} .r${i} svg',{autoAlpha:0,scale:0.4,duration:0.22,ease:'back.out(2.5)'},${at(i)});`);
    if (strike) {
      tl.push(`tl.to('#${id} .r${i} .x',{scaleX:1,duration:0.24,ease:'${EASE.inOut}'},${at(i) + 0.1});`);
      tl.push(`tl.to('#${id} .r${i} .t',{opacity:0.55,duration:0.2},${at(i) + 0.2});`);
    }
  });
  return { html: html.trim(), timeline: tl.join('\n') };
}
