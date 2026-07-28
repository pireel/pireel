/**
 * comparison — A vs B, with a stance.
 *
 * Variants:
 *  - columns  two panels split by a center rule and a VS chip; the winner carries
 *             the accent. The default.
 *  - versus   typographic showdown: the two values huge, a slash between, labels
 *             small underneath. For punchy single-number matchups.
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { SURFACE_FIELDS, inkOn, surfaceCss } from '../surface';
import { defineSchema, en, text, reqText, type PropsOf } from '../schema';
import { drawRule, fadeUp, heroLand } from '../motion';
import { fitDown, isCjk, typeScale } from '../sizing';

export const comparisonSchema = defineSchema({
  variant: en(['columns', 'versus'], 'columns', 'Staging'),
  aLabel: reqText(20, 'A', 'Left side name'),
  aValue: text(16, '', 'Left side number/verdict'),
  bLabel: reqText(20, 'B', 'Right side name'),
  bValue: text(16, '', 'Right side number/verdict'),
  winner: en(['a', 'b', 'none'], 'none', 'Which side carries the accent'),
  note: text(60, '', 'One-line takeaway under the comparison'),
  ...SURFACE_FIELDS,
});

export type ComparisonProps = PropsOf<typeof comparisonSchema>;

export function renderComparison(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = comparisonSchema.parse(raw);
  const s = typeScale(ctx);
  const cjk = isCjk(ctx.lang);
  const onCard = p.surface === 'card';
  const shadow = onCard ? '' : 'text-shadow:0 2px 16px rgb(0 0 0 / 0.35);';
  const panel = surfaceCss(p, s); // background / outline / corners are the component's own props
  const halfW = (ctx.box.w - s.pad * 2) / 2;
  const maxValLen = Math.max(p.aValue.length, p.bValue.length, 1);
  const vpx = fitDown(Math.round(s.hero * 0.5), maxValLen, cjk, halfW * 0.85, s.label);

  const side = (key: 'a' | 'b', label: string, value: string) => `
  <div class="side ${key} ${p.winner === key ? 'win' : ''}">
    <div class="lbl">${esc(label)}</div>
    ${value ? `<div class="val">${esc(value)}</div>` : ''}
  </div>`;

  const shared = `
#${id} .wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:${s.pad}px;gap:${Math.round(s.gap * 0.7)}px;${panel}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .lbl{font-size:${s.label}px;font-weight:700;${shadow}}
#${id} .val{font-family:${tk('--sk-font-num')};font-variant-numeric:tabular-nums;font-feature-settings:"tnum";font-weight:800;font-size:${vpx}px;line-height:1.05;white-space:nowrap;${shadow}}
#${id} .note{font-size:${s.kicker}px;color:${inkOn(p, true)};text-align:center;${shadow}}`;

  let html: string;
  const tl: string[] = [];

  if (p.variant === 'versus') {
    html = `
<div class="wrap">
  <div class="duel">
    <div class="side a ${p.winner === 'a' ? 'win' : ''}"><div class="val">${esc(p.aValue || p.aLabel)}</div><div class="lbl">${esc(p.aLabel)}</div></div>
    <div class="slash"></div>
    <div class="side b ${p.winner === 'b' ? 'win' : ''}"><div class="val">${esc(p.bValue || p.bLabel)}</div><div class="lbl">${esc(p.bLabel)}</div></div>
  </div>
  ${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}
</div>
<style>${shared}
#${id} .duel{display:flex;align-items:center;justify-content:center;gap:${s.gap}px;}
#${id} .side{display:flex;flex-direction:column;align-items:center;gap:${Math.round(s.gap * 0.3)}px;opacity:0.82;}
#${id} .side.win{opacity:1;}
#${id} .side.win .val{color:${tk('--sk-accent')};}
#${id} .side .lbl{font-size:${s.kicker}px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${inkOn(p, true)};}
#${id} .slash{width:${s.rule + 1}px;height:${Math.round(vpx * 1.2)}px;background:${tk('--sk-line')};transform:rotate(18deg);border-radius:2px;}
</style>`;
    tl.push(fadeUp(`#${id} .side.a`, 0.05, { y: 16, dur: 0.4 }));
    tl.push(drawRule(`#${id} .slash`, 0.22, { origin: 'center' }));
    tl.push(fadeUp(`#${id} .side.b`, 0.3, { y: 16, dur: 0.4 }));
    if (p.winner !== 'none') tl.push(heroLand(`#${id} .side.win .val`, 0.62, { from: 0.92, dur: 0.35 }));
    if (p.note) tl.push(fadeUp(`#${id} .note`, 0.75, { y: 10, dur: 0.3 }));
  } else {
    html = `
<div class="wrap">
  <div class="cols">
    ${side('a', p.aLabel, p.aValue)}
    <div class="mid"><i class="rule"></i><span class="vs">VS</span><i class="rule"></i></div>
    ${side('b', p.bLabel, p.bValue)}
  </div>
  ${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}
</div>
<style>${shared}
#${id} .cols{display:flex;align-items:stretch;gap:${Math.round(s.gap * 0.8)}px;}
#${id} .side{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(s.gap * 0.4)}px;padding:${Math.round(s.gap * 0.8)}px;border-radius:${Math.round(s.gap * 0.5)}px;${onCard ? `background:${tk('--sk-panel-2')};` : ''}}
#${id} .side.win{box-shadow:inset 0 0 0 ${s.rule}px ${tk('--sk-accent')};}
#${id} .side.win .val{color:${tk('--sk-accent')};}
#${id} .mid{display:flex;flex-direction:column;align-items:center;gap:${Math.round(s.gap * 0.3)}px;justify-content:center;}
#${id} .mid .rule{display:block;width:${s.rule - 1}px;flex:1;background:${tk('--sk-line')};}
#${id} .mid .vs{font-size:${s.kicker}px;font-weight:800;letter-spacing:0.08em;color:${inkOn(p, true)};${shadow}}
</style>`;
    tl.push(fadeUp(`#${id} .side.a`, 0.05, { y: 14, dur: 0.35 }));
    tl.push(fadeUp(`#${id} .mid`, 0.2, { y: 0, dur: 0.3 }));
    tl.push(fadeUp(`#${id} .side.b`, 0.28, { y: 14, dur: 0.35 }));
    // Winner emphasis: scale pulse only — a second from() on the same element would re-capture
    // its mid-entrance hidden state as the end value and freeze it invisible (classic double-from)
    if (p.winner !== 'none') tl.push(`tl.to('#${id} .side.win',{scale:1.04,duration:0.18,yoyo:true,repeat:1,ease:'power2.inOut'},0.62);`);
    if (p.note) tl.push(fadeUp(`#${id} .note`, 0.72, { y: 10, dur: 0.3 }));
  }
  if (onCard) tl.unshift(fadeUp(`#${id} .wrap`, 0, { y: 12, dur: 0.25 }));
  return { html: html.trim(), timeline: tl.join('\n') };
}
