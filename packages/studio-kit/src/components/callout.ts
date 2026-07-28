/**
 * callout — a spoken punchline made visible.
 *
 * Variants:
 *  - poster   typographic poster: ONE keyword set huge with an accent sweep
 *             underneath, support line small and offset. The default.
 *  - quote    an editorial pull-quote: oversized quotation mark, the line, a
 *             attribution row with a hairline.
 *  - stamp    a verdict: accent-ringed stamp with a short word, reason beneath.
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { SURFACE_FIELDS, inkOn, surfaceCss } from '../surface';
import { defineSchema, en, text, reqText, type PropsOf } from '../schema';
import { drawRule, fadeUp, heroLand, sweep } from '../motion';
import { fitDown, fitWrap, isCjk, typeScale } from '../sizing';

export const calloutSchema = defineSchema({
  variant: en(['poster', 'quote', 'stamp'], 'poster', 'Layout staging'),
  motion: en(['sweep', 'pop'], 'sweep', 'Entrance: underline sweep after the words, or the whole mark pops'),
  text: reqText(60, '…', 'The punchline, verbatim from the speech'),
  support: text(80, '', 'Attribution (quote) / reason (stamp) / secondary line (poster)'),
  ...SURFACE_FIELDS,
  surface: en(['card', 'none'], 'none', 'Callouts default to type set directly on footage'),
});

export type CalloutProps = PropsOf<typeof calloutSchema>;

export function renderCallout(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = calloutSchema.parse(raw);
  const s = typeScale(ctx);
  const cjk = isCjk(ctx.lang);

  const innerW = ctx.box.w - s.pad * 2;
  // Wrapping fit: the punchline may break into lines — size it so the WHOLE
  // wrapped block (plus support row and variant chrome) fits the box height.
  const supportH = p.support ? s.label * 1.5 + s.gap : 0;
  const chromeH = p.variant === 'quote' ? s.hero * 0.5 + s.gap : p.variant === 'stamp' ? s.gap * 2.6 : s.gap * 0.5;
  const innerH = Math.max(s.head, ctx.box.h - s.pad * 2 - supportH - chromeH);
  const head = fitWrap(Math.round(s.hero * 0.66), p.text.length, cjk, innerW, innerH, { min: Math.min(s.head, 34) });

  const onCard = p.surface === 'card';
  const shadow = onCard ? '' : 'text-shadow:0 2px 18px rgb(0 0 0 / 0.4);';
  const panel = surfaceCss(p, s); // background / outline / corners are the component's own props

  const shared = `
#${id} .wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:${s.pad}px;${panel}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .head{font-size:${head}px;font-weight:800;line-height:1.14;letter-spacing:${cjk ? '0.01em' : '-0.01em'};${shadow}}
#${id} .support{font-size:${s.label}px;font-weight:500;color:${inkOn(p, true)};${shadow}}`;

  let html: string;
  const support = p.support ? `<div class="support">${esc(p.support)}</div>` : '';

  if (p.variant === 'quote') {
    html = `
<div class="wrap">
  <div class="qmark" aria-hidden="true">“</div>
  <div class="head">${esc(p.text)}</div>
  ${p.support ? `<div class="attr"><i class="rule"></i>${support}</div>` : ''}
</div>
<style>${shared}
#${id} .wrap{gap:${Math.round(s.gap * 0.8)}px;}
#${id} .qmark{font-size:${Math.round(head * 1.6)}px;line-height:0.6;font-weight:800;color:${tk('--sk-accent')};${shadow}}
#${id} .attr{display:flex;align-items:center;gap:${Math.round(s.gap * 0.7)}px;margin-top:${Math.round(s.gap * 0.4)}px;}
#${id} .attr .rule{display:block;width:${Math.round(s.pad * 0.9)}px;height:${s.rule}px;background:${tk('--sk-line')};}
</style>`;
  } else if (p.variant === 'stamp') {
    const stampHead = fitDown(Math.round(head * 0.8), p.text.length, cjk, innerW * 0.8, s.head);
    html = `
<div class="wrap">
  <div class="stamp"><span class="head">${esc(p.text)}</span></div>
  ${support}
</div>
<style>${shared}
#${id} .wrap{align-items:center;text-align:center;gap:${s.gap}px;}
#${id} .stamp{padding:${Math.round(s.gap * 0.9)}px ${Math.round(s.gap * 1.8)}px;border:${s.rule + 2}px solid ${tk('--sk-accent')};border-radius:${Math.round(s.gap * 0.9)}px;transform:rotate(-2deg);${onCard ? `background:${tk('--sk-panel-2')};` : ''}}
#${id} .stamp .head{font-size:${stampHead}px;color:${tk('--sk-accent')};letter-spacing:0.04em;}
</style>`;
  } else {
    html = `
<div class="wrap">
  <div class="head"><span class="kw">${esc(p.text)}<i class="sweep" aria-hidden="true"></i></span></div>
  ${support}
</div>
<style>${shared}
#${id} .wrap{gap:${Math.round(s.gap * 0.9)}px;}
#${id} .kw{position:relative;display:inline;}
#${id} .sweep{position:absolute;left:-0.06em;right:-0.06em;bottom:0.02em;height:0.22em;background:${tk('--sk-accent')};opacity:0.55;z-index:-1;border-radius:0.06em;}
</style>`;
  }

  const tl: string[] = [];
  if (onCard) tl.push(fadeUp(`#${id} .wrap`, 0, { y: 12, dur: 0.25 }));
  if (p.variant === 'stamp' || p.motion === 'pop') {
    tl.push(heroLand(`#${id} ${p.variant === 'stamp' ? '.stamp' : '.head'}`, 0.12, { from: 0.8 }));
  } else {
    tl.push(fadeUp(`#${id} .head`, 0.1, { y: 16, dur: 0.34 }));
  }
  if (p.variant === 'poster') tl.push(sweep(`#${id} .sweep`, 0.4));
  if (p.variant === 'quote') tl.push(drawRule(`#${id} .attr .rule`, 0.42));
  tl.push(fadeUp(`#${id} .support`, 0.5, { y: 10, dur: 0.28 }));

  return { html: html.trim(), timeline: tl.join('\n') };
}
