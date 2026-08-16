/**
 * title — the opener / section / closer card.
 *
 * Variants:
 *  - hero     the opening statement: big centered type, accent underline sweep.
 *  - section  a chapter marker: index numeral + left-aligned title over a rule.
 *  - outro    the sign-off: centered title + call-to-action sub in an accent chip.
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { defineSchema, en, text, reqText, type PropsOf } from '../schema';
import { drawRule, fadeUp, heroLand, sweep } from '../motion';
import { fitWrap, isCjk, typeScale } from '../sizing';

export const titleSchema = defineSchema({
  variant: en(['hero', 'section', 'outro'], 'hero', 'Card role'),
  title: reqText(30, '—', 'The line itself'),
  sub: text(40, '', 'Support line (handle, chapter name, CTA)'),
  index: text(4, '', 'section variant: the chapter numeral ("02")'),
});

export type TitleProps = PropsOf<typeof titleSchema>;

export function renderTitle(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = titleSchema.parse(raw);
  const s = typeScale(ctx);
  const cjk = isCjk(ctx.lang);
  const innerW = ctx.box.w - s.pad * 2;
  const innerH = Math.max(s.head, ctx.box.h - s.pad * 2 - (p.sub ? s.label * 2 : 0) - s.gap);
  const head = fitWrap(Math.round(s.hero * 0.72), p.title.length, cjk, innerW, innerH, { min: s.head });

  const shared = `
#${id} .wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:${s.pad}px;color:${tk('--sk-fg')};font-family:${tk('--sk-font-head')};}
#${id} .t{font-size:${head}px;font-weight:800;line-height:1.12;letter-spacing:${cjk ? '0.01em' : '-0.015em'};text-shadow:0 2px 20px rgb(0 0 0 / 0.35);}
#${id} .sub{font-size:${s.label}px;font-weight:600;text-shadow:0 2px 14px rgb(0 0 0 / 0.4);}`;

  let html: string;
  const tl: string[] = [];

  if (p.variant === 'section') {
    html = `
<div class="wrap">
  <div class="row">${p.index ? `<span class="ix">${esc(p.index)}</span>` : ''}<div class="col"><div class="t">${esc(p.title)}</div>${p.sub ? `<div class="sub">${esc(p.sub)}</div>` : ''}</div></div>
  <i class="rule"></i>
</div>
<style>${shared}
#${id} .row{display:flex;align-items:baseline;gap:${s.gap}px;}
#${id} .ix{font-family:${tk('--sk-font-num')};font-size:${Math.round(head * 0.8)}px;font-weight:800;color:${tk('--sk-accent')};text-shadow:0 2px 16px rgb(0 0 0 / 0.35);}
#${id} .col{display:flex;flex-direction:column;gap:${Math.round(s.gap * 0.4)}px;}
#${id} .sub{color:${tk('--sk-fg')};opacity:0.8;}
#${id} .rule{display:block;height:${s.rule}px;background:${tk('--sk-line')};margin-top:${s.gap}px;opacity:0.7;}
</style>`;
    tl.push(fadeUp(`#${id} .ix`, 0.05, { y: 18, dur: 0.4 }));
    tl.push(fadeUp(`#${id} .col`, 0.18, { y: 16, dur: 0.4 }));
    tl.push(drawRule(`#${id} .rule`, 0.4));
  } else if (p.variant === 'outro') {
    html = `
<div class="wrap">
  <div class="t">${esc(p.title)}</div>
  ${p.sub ? `<div class="cta"><span class="sub">${esc(p.sub)}</span></div>` : ''}
</div>
<style>${shared}
#${id} .wrap{align-items:center;text-align:center;gap:${s.gap}px;}
#${id} .cta{background:${tk('--sk-accent')};border-radius:999px;padding:${Math.round(s.gap * 0.45)}px ${Math.round(s.gap * 1.4)}px;}
#${id} .cta .sub{color:${tk('--sk-panel')};text-shadow:none;}
</style>`;
    tl.push(heroLand(`#${id} .t`, 0.08, { from: 0.92 }));
    if (p.sub) tl.push(heroLand(`#${id} .cta`, 0.42, { from: 0.8, dur: 0.45 }));
  } else {
    html = `
<div class="wrap">
  <div class="t"><span class="kw">${esc(p.title)}<i class="sweep"></i></span></div>
  ${p.sub ? `<div class="sub">${esc(p.sub)}</div>` : ''}
</div>
<style>${shared}
#${id} .wrap{align-items:center;text-align:center;gap:${Math.round(s.gap * 0.8)}px;}
#${id} .kw{position:relative;display:inline;}
#${id} .sweep{position:absolute;left:-0.04em;right:-0.04em;bottom:0.03em;height:0.18em;background:${tk('--sk-accent')};opacity:0.6;z-index:-1;border-radius:0.05em;}
#${id} .sub{color:${tk('--sk-fg')};opacity:0.85;}
</style>`;
    tl.push(fadeUp(`#${id} .t`, 0.05, { y: 20, dur: 0.45 }));
    tl.push(sweep(`#${id} .sweep`, 0.38));
    if (p.sub) tl.push(fadeUp(`#${id} .sub`, 0.5, { y: 12, dur: 0.35 }));
  }
  return { html: html.trim(), timeline: tl.join('\n') };
}
