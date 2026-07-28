/**
 * lowerThird — broadcast-style identity/topic strip: a TITLE, a SUBTITLE, and one
 * accent device. Anchored to the bottom-left of its box, single-line, with a
 * hand-tuned entrance AND (when the block duration is known) a settle-out exit.
 *
 * Variants (each is its own choreography — the variant IS the motion):
 *  - clean-bar        white card + accent side tab, clip-path reveal. The default.
 *  - accent-underline bare type over footage, accent rule draws under the title.
 *  - kicker           small uppercase accent chip above the title, playful lands.
 *  - soft-pill        rounded pill with an accent dot, springs in.
 *  - color-block      solid accent slab behind the title, slides in.
 *  - stack-bars       two stacked bars (title/subtitle) wiping in separately.
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { defineSchema, en, text, reqText, type PropsOf } from '../schema';
import { fitDown, isCjk, typeScale } from '../sizing';

export const lowerThirdSchema = defineSchema({
  variant: en(
    ['clean-bar', 'accent-underline', 'kicker', 'soft-pill', 'color-block', 'stack-bars'],
    'clean-bar',
    'Display style — each carries its own entrance/exit choreography',
  ),
  title: reqText(24, '—', 'The main line (a name, a topic, a claim)'),
  subtitle: text(40, '', 'The support line (a role, a handle, context)'),
  kicker: text(16, '', 'kicker variant only: the small uppercase chip text (falls back to the subtitle)'),
});

export type LowerThirdProps = PropsOf<typeof lowerThirdSchema>;

export function renderLowerThird(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = lowerThirdSchema.parse(raw);
  const s = typeScale(ctx);
  const cjk = isCjk(ctx.lang);

  const pad = Math.round(s.pad * 0.5);
  const innerW = ctx.box.w - pad * 2;
  const title = fitDown(Math.round(s.head * 1.05), p.title.length, cjk, innerW * 0.92, 28);
  const sub = Math.max(22, Math.round(title * 0.44));
  const kickerText = p.variant === 'kicker' ? p.kicker || p.subtitle : '';

  const base = `
#${id} .wrap{position:absolute;inset:0;font-family:${tk('--sk-font-head')};color:${tk('--sk-fg')};}
#${id} .lt{position:absolute;left:${pad}px;bottom:${pad}px;max-width:${innerW}px;}
#${id} .title{font-size:${title}px;font-weight:700;line-height:1.08;letter-spacing:-0.015em;white-space:nowrap;}
#${id} .sub{font-size:${sub}px;font-weight:500;line-height:1.2;white-space:nowrap;color:${tk('--sk-muted')};}`;

  const subHtml = p.subtitle ? `<div class="sub">${esc(p.subtitle)}</div>` : '';
  let html: string;
  const tl: string[] = [];
  const at = (n: number) => Math.round(n * 100) / 100;

  // Exit: settle out before the block ends (skipped for very short blocks — an
  // in-and-out flash reads worse than a hold-then-cut).
  const dur = ctx.durationSec ?? 0;
  const outAt = dur >= 2.4 ? at(dur - 0.6) : null;

  switch (p.variant) {
    case 'accent-underline': {
      html = `
<div class="wrap"><div class="lt">
  <div class="title">${esc(p.title)}</div>
  <i class="rule"></i>
  ${subHtml}
</div></div>
<style>${base}
#${id} .title{text-shadow:0 2px 16px rgb(0 0 0 / 0.35);}
#${id} .sub{color:${tk('--sk-fg')};text-shadow:0 2px 14px rgb(0 0 0 / 0.4);opacity:0.85;}
#${id} .rule{display:block;height:${Math.max(4, Math.round(title * 0.08))}px;background:${tk('--sk-accent')};margin:${Math.round(sub * 0.35)}px 0;border-radius:3px;}
</style>`;
      tl.push(`tl.from('#${id} .title',{y:22,autoAlpha:0,duration:0.5,ease:'power3.out'},0.05);`);
      tl.push(`tl.from('#${id} .rule',{scaleX:0,transformOrigin:'left center',duration:0.45,ease:'power4.out'},0.25);`);
      tl.push(`tl.from('#${id} .sub',{y:14,autoAlpha:0,duration:0.45,ease:'power3.out'},0.4);`);
      if (outAt) {
        tl.push(`tl.to('#${id} .sub',{autoAlpha:0,duration:0.28,ease:'power2.in'},${outAt});`);
        tl.push(`tl.to('#${id} .rule',{scaleX:0,transformOrigin:'left center',duration:0.28,ease:'power2.in'},${at(outAt + 0.05)});`);
        tl.push(`tl.to('#${id} .title',{y:-14,autoAlpha:0,duration:0.3,ease:'power2.in'},${at(outAt + 0.08)});`);
      }
      break;
    }
    case 'kicker': {
      html = `
<div class="wrap"><div class="lt">
  ${kickerText ? `<div class="kick">${esc(kickerText)}</div>` : ''}
  <div class="title">${esc(p.title)}</div>
  <i class="rule"></i>
</div></div>
<style>${base}
#${id} .kick{display:inline-block;background:${tk('--sk-accent')};color:#fff;font-size:${Math.max(18, Math.round(sub * 0.85))}px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;padding:${Math.round(sub * 0.25)}px ${Math.round(sub * 0.6)}px;border-radius:${Math.round(sub * 0.25)}px;margin-bottom:${Math.round(sub * 0.4)}px;}
#${id} .title{text-shadow:0 2px 16px rgb(0 0 0 / 0.35);}
#${id} .rule{display:block;height:3px;background:${tk('--sk-line')};margin-top:${Math.round(sub * 0.4)}px;opacity:0.6;}
</style>`;
      tl.push(`tl.from('#${id} .kick',{y:-30,autoAlpha:0,duration:0.4,ease:'back.out(2)'},0.05);`);
      tl.push(`tl.from('#${id} .title',{y:18,autoAlpha:0,duration:0.45,ease:'back.out(1.5)'},0.25);`);
      tl.push(`tl.from('#${id} .rule',{scaleX:0,transformOrigin:'left center',duration:0.45,ease:'power4.out'},0.42);`);
      if (outAt) {
        tl.push(`tl.to('#${id} .rule',{scaleX:0,transformOrigin:'left center',duration:0.26,ease:'power2.in'},${outAt});`);
        tl.push(`tl.to('#${id} .title',{y:-14,autoAlpha:0,duration:0.3,ease:'power2.in'},${at(outAt + 0.04)});`);
        tl.push(`tl.to('#${id} .kick',{y:-28,autoAlpha:0,duration:0.26,ease:'power2.in'},${at(outAt + 0.06)});`);
      }
      break;
    }
    case 'soft-pill': {
      html = `
<div class="wrap"><div class="lt">
  <div class="pill"><i class="dot"></i><div class="tx"><div class="title">${esc(p.title)}</div>${subHtml}</div></div>
</div></div>
<style>${base}
#${id} .pill{display:flex;align-items:center;gap:${Math.round(sub * 0.7)}px;background:${tk('--sk-panel')};border-radius:999px;padding:${Math.round(sub * 0.55)}px ${Math.round(sub * 1.2)}px;box-shadow:${tk('--sk-shadow')};}
#${id} .dot{width:${Math.round(sub * 0.55)}px;height:${Math.round(sub * 0.55)}px;border-radius:999px;background:${tk('--sk-accent')};flex:none;}
#${id} .tx{display:flex;flex-direction:column;gap:2px;}
</style>`;
      tl.push(`tl.from('#${id} .pill',{scale:0.85,y:16,autoAlpha:0,duration:0.5,ease:'back.out(1.7)'},0.05);`);
      tl.push(`tl.from('#${id} .dot',{scale:0,duration:0.35,ease:'back.out(3)'},0.35);`);
      tl.push(`tl.from('#${id} .title, #${id} .sub',{x:-10,autoAlpha:0,duration:0.4,ease:'power3.out',stagger:0.08},0.35);`);
      if (outAt) tl.push(`tl.to('#${id} .pill',{scale:0.94,y:14,autoAlpha:0,duration:0.32,ease:'power2.in'},${outAt});`);
      break;
    }
    case 'color-block': {
      html = `
<div class="wrap"><div class="lt">
  <div class="block"><div class="title">${esc(p.title)}</div></div>
  ${subHtml}
</div></div>
<style>${base}
#${id} .block{display:inline-block;background:${tk('--sk-accent')};color:#fff;padding:${Math.round(sub * 0.4)}px ${Math.round(sub * 0.9)}px;border-radius:${Math.round(sub * 0.2)}px;}
#${id} .block .title{color:#fff;}
#${id} .sub{margin-top:${Math.round(sub * 0.4)}px;color:${tk('--sk-fg')};text-shadow:0 2px 14px rgb(0 0 0 / 0.4);opacity:0.9;}
</style>`;
      tl.push(`tl.from('#${id} .block',{x:-56,autoAlpha:0,duration:0.48,ease:'back.out(1.4)'},0.05);`);
      tl.push(`tl.from('#${id} .sub',{y:12,autoAlpha:0,duration:0.4,ease:'power3.out'},0.32);`);
      if (outAt) {
        tl.push(`tl.to('#${id} .sub',{autoAlpha:0,duration:0.26,ease:'power2.in'},${outAt});`);
        tl.push(`tl.to('#${id} .block',{x:-56,autoAlpha:0,duration:0.32,ease:'power2.in'},${at(outAt + 0.04)});`);
      }
      break;
    }
    case 'stack-bars': {
      html = `
<div class="wrap"><div class="lt">
  <div class="bar b1"><div class="title">${esc(p.title)}</div></div>
  ${p.subtitle ? `<div class="bar b2"><div class="sub">${esc(p.subtitle)}</div></div>` : ''}
</div></div>
<style>${base}
#${id} .bar{display:inline-block;clip-path:inset(0 0% 0 0);}
#${id} .b1{background:${tk('--sk-panel')};padding:${Math.round(sub * 0.4)}px ${Math.round(sub * 0.9)}px;}
#${id} .b2{background:${tk('--sk-accent')};padding:${Math.round(sub * 0.3)}px ${Math.round(sub * 0.9)}px;margin-top:0;display:block;width:fit-content;}
#${id} .b2 .sub{color:#fff;}
</style>`;
      tl.push(`tl.from('#${id} .b1',{clipPath:'inset(0 100% 0 0)',duration:0.5,ease:'power4.out'},0.05);`);
      tl.push(`tl.from('#${id} .b2',{clipPath:'inset(0 100% 0 0)',duration:0.5,ease:'power4.out'},0.28);`);
      if (outAt) {
        tl.push(`tl.to('#${id} .b2',{clipPath:'inset(0 0 0 100%)',duration:0.3,ease:'power3.in'},${outAt});`);
        tl.push(`tl.to('#${id} .b1',{clipPath:'inset(0 100% 0 0)',duration:0.34,ease:'power3.in'},${at(outAt + 0.06)});`);
      }
      break;
    }
    default: {
      // clean-bar
      html = `
<div class="wrap"><div class="lt">
  <div class="card"><i class="tab"></i><div class="body"><div class="title">${esc(p.title)}</div>${subHtml}</div></div>
</div></div>
<style>${base}
#${id} .card{display:flex;align-items:stretch;border-radius:${Math.round(sub * 0.5)}px;overflow:hidden;box-shadow:${tk('--sk-shadow')};clip-path:inset(0 0% 0 0);}
#${id} .tab{width:${Math.max(8, Math.round(sub * 0.4))}px;background:${tk('--sk-accent')};flex:none;}
#${id} .body{background:${tk('--sk-panel')};padding:${Math.round(sub * 0.7)}px ${Math.round(sub * 1.3)}px ${Math.round(sub * 0.75)}px ${Math.round(sub * 1)}px;display:flex;flex-direction:column;gap:${Math.round(sub * 0.22)}px;}
</style>`;
      tl.push(`tl.from('#${id} .card',{clipPath:'inset(0 100% 0 0)',duration:0.55,ease:'power3.out'},0.05);`);
      tl.push(`tl.from('#${id} .tab',{scaleY:0,transformOrigin:'center bottom',duration:0.4,ease:'power2.out'},0.25);`);
      tl.push(`tl.from('#${id} .title',{y:14,autoAlpha:0,duration:0.45,ease:'power3.out'},0.3);`);
      tl.push(`tl.from('#${id} .sub',{y:12,autoAlpha:0,duration:0.45,ease:'power3.out'},0.4);`);
      if (outAt) tl.push(`tl.to('#${id} .card',{y:18,autoAlpha:0,duration:0.34,ease:'power2.in'},${outAt});`);
    }
  }

  return { html: html.trim(), timeline: tl.join('\n') };
}
