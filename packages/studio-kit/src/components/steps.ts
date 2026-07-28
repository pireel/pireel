/**
 * steps — an ordered sequence, revealed at presenter rhythm.
 *
 * Variants:
 *  - list      vertical numbered list, active item accented as it lands. Default.
 *  - pipeline  horizontal nodes with connector arrows. Wide boxes.
 *  - timeline  vertical dotted spine with entries beside it.
 *
 * When the block duration is known, reveals are PACED across it (each item lands,
 * takes the accent, and settles as the next arrives) — a sequence that appears all
 * at once reads as a wall of text.
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { SURFACE_FIELDS, inkOn, surfaceCss } from '../surface';
import { defineSchema, en, rows, text, reqText, type PropsOf } from '../schema';
import { fadeUp } from '../motion';
import { isCjk, typeScale, fitDown } from '../sizing';

export const stepsSchema = defineSchema({
  variant: en(['list', 'pipeline', 'timeline'], 'list', 'Sequence staging'),
  items: rows(
    {
      text: reqText(40, '—'),
      note: text(48, '', 'Optional sub-line'),
    },
    6,
    [{ text: 'Step one', note: '' }, { text: 'Step two', note: '' }, { text: 'Step three', note: '' }],
    'Up to 6 ordered items',
  ),
  ...SURFACE_FIELDS,
});

export type StepsProps = PropsOf<typeof stepsSchema>;

export function renderSteps(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = stepsSchema.parse(raw);
  const items = p.items.length ? p.items : stepsSchema.defaults.items;
  const s = typeScale(ctx);
  const cjk = isCjk(ctx.lang);
  const n = items.length;
  const onCard = p.surface === 'card';
  const shadow = onCard ? '' : 'text-shadow:0 2px 14px rgb(0 0 0 / 0.35);';
  const panel = surfaceCss(p, s); // background / outline / corners are the component's own props

  // Presenter pacing: spread reveals across ~60% of the block life (falls back to a brisk 0.35s cadence)
  const dur = ctx.durationSec ?? 0;
  const gapT = dur > 1.5 ? Math.min(1.1, Math.max(0.3, (dur * 0.6) / n)) : 0.35;
  const at = (i: number) => Math.round((0.15 + i * gapT) * 100) / 100;

  const shared = `
#${id} .wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:${s.pad}px;${panel}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .tx{font-size:${s.label}px;font-weight:700;line-height:1.25;${shadow}}
#${id} .nt{font-size:${s.kicker}px;color:${inkOn(p, true)};${shadow}}`;

  let html: string;
  const tl: string[] = [];


  if (p.variant === 'pipeline') {
    const nodeW = Math.round((ctx.box.w - s.pad * 2 - (n - 1) * s.gap) / n);
    const npx = fitDown(s.label, Math.max(...items.map((x) => x.text.length)), cjk, nodeW * 0.85, 20);
    html = `
<div class="wrap"><div class="flow">${items
      .map(
        (x, i) => `
  <div class="node nd${i}"><span class="ix">${i + 1}</span><span class="tx">${esc(x.text)}</span></div>${i < n - 1 ? `<svg class="arr a${i}" viewBox="0 0 24 24"><path d="M4 12h14m0 0l-5-5m5 5l-5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}`,
      )
      .join('')}
</div></div>
<style>${shared}
#${id} .flow{display:flex;align-items:center;gap:${Math.round(s.gap * 0.5)}px;}
#${id} .node{flex:1;display:flex;flex-direction:column;align-items:center;gap:${Math.round(s.gap * 0.35)}px;padding:${Math.round(s.gap * 0.7)}px ${Math.round(s.gap * 0.4)}px;border-radius:${Math.round(s.gap * 0.5)}px;${onCard ? `background:${tk('--sk-panel-2')};` : `box-shadow:inset 0 0 0 ${s.rule - 1}px rgb(255 255 255 / 0.35);`}text-align:center;}
#${id} .node .tx{font-size:${npx}px;}
#${id} .ix{font-family:${tk('--sk-font-num')};font-size:${s.kicker}px;font-weight:700;color:${tk('--sk-accent')};}
#${id} .arr{flex:0 0 ${Math.round(s.gap * 1.1)}px;height:${Math.round(s.gap * 1.1)}px;color:${inkOn(p, true)};}
</style>`;
    items.forEach((_, i) => {
      tl.push(`tl.from('#${id} .nd${i}',{autoAlpha:0,x:-18,duration:0.4,ease:'power3.out'},${at(i)});`);
      if (i < n - 1) tl.push(`tl.from('#${id} .a${i}',{autoAlpha:0,x:-8,duration:0.3,ease:'power2.out'},${at(i) + 0.18});`);
    });
  } else if (p.variant === 'timeline') {
    html = `
<div class="wrap"><div class="spine">${items
      .map(
        (x, i) => `
  <div class="ent e${i}"><i class="dot"></i><div class="body"><div class="tx">${esc(x.text)}</div>${x.note ? `<div class="nt">${esc(x.note)}</div>` : ''}</div></div>`,
      )
      .join('')}
</div></div>
<style>${shared}
#${id} .spine{display:flex;flex-direction:column;gap:${Math.round(s.gap * 0.9)}px;position:relative;padding-left:${Math.round(s.gap * 1.4)}px;}
#${id} .spine::before{content:'';position:absolute;left:${Math.round(s.gap * 0.5)}px;top:${Math.round(s.gap * 0.4)}px;bottom:${Math.round(s.gap * 0.4)}px;width:${s.rule - 1}px;background:${onCard ? tk('--sk-line') : 'rgb(255 255 255 / 0.35)'};}
#${id} .ent{position:relative;display:flex;flex-direction:column;}
#${id} .dot{position:absolute;left:${-Math.round(s.gap * 1.4) + Math.round(s.gap * 0.5) - 5}px;top:${Math.round(s.label * 0.28)}px;width:12px;height:12px;border-radius:999px;background:${tk('--sk-accent')};box-shadow:0 0 0 ${s.rule}px ${onCard ? tk('--sk-panel') : 'transparent'};}
</style>`;
    items.forEach((_, i) => {
      tl.push(`tl.from('#${id} .e${i}',{autoAlpha:0,y:14,duration:0.4,ease:'power3.out'},${at(i)});`);
    });
  } else {
    html = `
<div class="wrap"><div class="list">${items
      .map(
        (x, i) => `
  <div class="it i${i}"><span class="ix">${String(i + 1).padStart(2, '0')}</span><div class="body"><div class="tx">${esc(x.text)}</div>${x.note ? `<div class="nt">${esc(x.note)}</div>` : ''}</div></div>`,
      )
      .join('')}
</div></div>
<style>${shared}
#${id} .list{display:flex;flex-direction:column;gap:${Math.round(s.gap * 0.75)}px;}
#${id} .it{display:flex;align-items:baseline;gap:${Math.round(s.gap * 0.7)}px;}
#${id} .ix{font-family:${tk('--sk-font-num')};font-size:${s.label}px;font-weight:800;color:${tk('--sk-accent')};flex:none;}
</style>`;
    items.forEach((_, i) => {
      tl.push(`tl.from('#${id} .i${i}',{autoAlpha:0,y:14,duration:0.4,ease:'power3.out'},${at(i)});`);
      // Active-item accent: lands hot, settles to ink when the next arrives (the last stays hot).
      // Sets the ONE property — a className tween caches and rewrites the whole inline style, which
      // clobbers the autoAlpha this element is mid-tween on and freezes it invisible.
      tl.push(`tl.set('#${id} .i${i} .tx',{color:'${tk('--sk-accent')}'},${at(i)});`);
      if (i < n - 1) tl.push(`tl.set('#${id} .i${i} .tx',{color:'${tk('--sk-fg')}'},${at(i + 1)});`);
    });
  }
  if (onCard) tl.unshift(fadeUp(`#${id} .wrap`, 0, { y: 12, dur: 0.25 }));
  return { html: html.trim(), timeline: tl.join('\n') };
}
