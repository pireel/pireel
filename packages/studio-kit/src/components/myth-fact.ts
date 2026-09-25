/**
 * mythFact — a common belief corrected.
 *
 * Variants:
 *  - strike  the myth appears, gets struck through and sinks; the fact rises into the main slot.
 *            The default.
 *  - split   myth and fact side by side under their tags, the myth dimmed.
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { SURFACE_FIELDS, inkOn, surfaceCss } from '../surface';
import { defineSchema, en, text, reqText, type PropsOf } from '../schema';
import { EASE, drawRule, fadeUp, heroLand } from '../motion';
import { fitDown, fitWrap, isCjk, typeScale } from '../sizing';

export const mythFactSchema = defineSchema({
  variant: en(['strike', 'split'], 'strike', 'strike = the myth is crossed out then the fact rises; split = side by side'),
  myth: reqText(40, 'What people think', 'The belief being corrected, verbatim'),
  fact: reqText(48, 'What is actually true', 'The correction, verbatim'),
  mythTag: text(10, 'Myth', 'Tag over the belief'),
  factTag: text(10, 'Fact', 'Tag over the correction'),
  ...SURFACE_FIELDS,
  surface: en(['card', 'none'], 'none', 'Sits on the footage by default'),
});

export type MythFactProps = PropsOf<typeof mythFactSchema>;

export function renderMythFact(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = mythFactSchema.parse(raw);
  const s = typeScale(ctx);
  const cjk = isCjk(ctx.lang);
  const shadow = p.surface === 'card' ? '' : 'text-shadow:0 3px 20px rgb(0 0 0 / 0.45);';
  const split = p.variant === 'split';
  const colW = split ? (ctx.box.w - s.pad * 2 - s.gap) / 2 : ctx.box.w - s.pad * 2;
  const mythSize = fitWrap(Math.round(s.head * (split ? 0.8 : 0.75)), p.myth.length, cjk, colW, ctx.box.h * 0.28, { min: Math.min(s.label, 20) });
  const factSize = fitWrap(Math.round(s.head * (split ? 0.9 : 1.15)), p.fact.length, cjk, colW, ctx.box.h * (split ? 0.5 : 0.42), { min: Math.min(s.label, 22) });
  const tag = (label: string, cls: string) => (label ? `<span class="tag ${cls}">${esc(label)}</span>` : '');
  const html = `
<div class="wrap">
  <div class="side myth">${tag(p.mythTag, 'mt')}<div class="tx"><span>${esc(p.myth)}</span><i class="cut" aria-hidden="true"></i></div></div>
  <div class="side fact">${tag(p.factTag, 'ft')}<div class="tx">${esc(p.fact)}</div></div>
</div>
<style>
#${id} .wrap{position:absolute;inset:0;display:flex;${split ? 'flex-direction:row;align-items:center;' : 'flex-direction:column;justify-content:center;'}gap:${Math.round(s.gap * (split ? 1 : 1.3))}px;padding:${s.pad}px;${surfaceCss(p, s)}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .side{display:flex;flex-direction:column;align-items:flex-start;gap:${Math.round(s.gap * 0.4)}px;${split ? 'flex:1;' : ''}}
#${id} .tag{font-size:${s.kicker}px;font-weight:var(--sk-head-weight, 800);text-transform:var(--sk-head-case, none);letter-spacing:0.06em;padding:${Math.round(s.kicker * 0.2)}px ${Math.round(s.kicker * 0.5)}px;border-radius:min(${Math.round(s.kicker * 0.25)}px, ${tk('--sk-radius')});}
#${id} .mt{border:2px solid ${inkOn(p, true)};color:${inkOn(p, true)};}
#${id} .ft{background:${tk('--sk-accent')};color:${tk('--sk-panel')};}
#${id} .myth .tx{position:relative;font-size:${mythSize}px;font-weight:700;line-height:1.2;color:${inkOn(p, true)};${shadow}}
#${id} .cut{position:absolute;left:-2%;right:-2%;top:52%;height:${Math.max(3, Math.round(mythSize * 0.09))}px;border-radius:4px;background:${tk('--sk-accent')};${split ? 'display:none;' : ''}}
#${id} .fact .tx{font-size:${factSize}px;font-weight:var(--sk-head-weight, 900);text-transform:var(--sk-head-case, none);line-height:1.12;${shadow}}
</style>`;
  const tl: string[] = [fadeUp(`#${id} .myth`, 0, { y: 12 })];
  const factAt = Math.max(1.2, Math.min(2, (ctx.durationSec ?? 4) * 0.35));
  if (!split) {
    tl.push(drawRule(`#${id} .cut`, factAt - 0.55, { dur: 0.3 }));
    tl.push(`tl.to('#${id} .myth',{opacity:0.5,y:${Math.round(s.gap * 0.2)},duration:0.3,ease:'${EASE.out}'},${(factAt - 0.2).toFixed(2)});`);
  }
  tl.push(heroLand(`#${id} .fact`, factAt, { from: 0.85 }));
  return { html: html.trim(), timeline: tl.join('\n') };
}
