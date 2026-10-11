/**
 * qa — a question answered on screen.
 *
 * Variants:
 *  - tags   "Q" / "A" tag blocks: the question, then a short answer landing big with its reason.
 *           The default.
 *  - flip   the question sits small above; the answer takes the whole block.
 */

import { esc, tk, type RenderCtx, type RenderResult } from '../contract';
import { SURFACE_FIELDS, inkOn, surfaceCss } from '../surface';
import { defineSchema, en, text, reqText, type PropsOf } from '../schema';
import { EASE, fadeUp, heroLand } from '../motion';
import { fitDown, fitWrap, isCjk, typeScale } from '../sizing';

export const qaSchema = defineSchema({
  variant: en(['tags', 'flip'], 'tags', 'tags = Q/A tag blocks; flip = question small, answer takes the block'),
  question: reqText(60, 'Question?', 'The question, verbatim'),
  answer: reqText(24, 'Answer.', 'The short answer, verbatim'),
  reason: text(60, '', 'Why — one line under the answer'),
  ...SURFACE_FIELDS,
  surface: en(['card', 'none'], 'none', 'Q&A sits on the footage by default'),
});

export type QaProps = PropsOf<typeof qaSchema>;

export function renderQa(id: string, raw: unknown, ctx: RenderCtx): RenderResult {
  const p = qaSchema.parse(raw);
  const s = typeScale(ctx);
  const cjk = isCjk(ctx.lang);
  const shadow = p.surface === 'card' ? '' : 'text-shadow:var(--sk-ink-shadow, 0 3px 20px rgb(0 0 0 / 0.45));';
  const flip = p.variant === 'flip';
  const tag = Math.round(Math.min(s.head * 1.2, ctx.box.h * 0.16));
  const innerW = ctx.box.w - s.pad * 2 - (flip ? 0 : tag * 1.3);
  const qSize = flip
    ? fitDown(s.label, p.question.length, cjk, innerW, Math.min(s.label, 18))
    : fitWrap(Math.round(s.head * 0.9), p.question.length, cjk, innerW, ctx.box.h * 0.3, { min: Math.min(s.label, 20) });
  const aSize = fitDown(flip ? s.hero : Math.round(s.hero * 0.8), p.answer.length, cjk, innerW, Math.min(s.head, 30));
  const rSize = fitDown(s.label, p.reason.length, cjk, innerW, Math.min(s.label, 18));
  const reason = p.reason ? `<div class="why">${esc(p.reason)}</div>` : '';
  const html = flip
    ? `
<div class="wrap">
  <div class="q">${esc(p.question)}</div>
  <div class="ans">${esc(p.answer)}</div>
  ${reason}
</div>
<style>
#${id} .wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:${Math.round(s.gap * 0.5)}px;padding:${s.pad}px;${surfaceCss(p, s)}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .q{font-size:${qSize}px;font-weight:600;color:${inkOn(p, true)};${shadow}}
#${id} .ans{font-size:${aSize}px;font-weight:var(--sk-head-weight, 900);text-transform:var(--sk-head-case, none);line-height:1;color:${tk('--sk-accent')};${shadow}}
#${id} .why{font-size:${rSize}px;font-weight:600;${shadow}}
</style>`
    : `
<div class="wrap">
  <div class="row q"><span class="tag">Q</span><span class="qt">${esc(p.question)}</span></div>
  <div class="row a"><span class="tag at">A</span><div><div class="ans">${esc(p.answer)}</div>${reason}</div></div>
</div>
<style>
#${id} .wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:${Math.round(s.gap * 1.2)}px;padding:${s.pad}px;${surfaceCss(p, s)}color:${inkOn(p)};font-family:${tk('--sk-font-head')};}
#${id} .row{display:flex;align-items:flex-start;gap:${Math.round(tag * 0.3)}px;}
#${id} .tag{flex:none;width:${tag}px;height:${tag}px;border-radius:min(${Math.round(tag * 0.22)}px, ${tk('--sk-radius')});display:grid;place-items:center;font-family:${tk('--sk-font-num')};font-size:${Math.round(tag * 0.6)}px;font-weight:var(--sk-head-weight, 900);text-transform:var(--sk-head-case, none);border:${Math.max(2, Math.round(tag * 0.04))}px solid ${inkOn(p, true)};}
#${id} .at{background:${tk('--sk-accent')};border-color:${tk('--sk-accent')};color:${tk('--sk-panel')};}
#${id} .qt{font-size:${qSize}px;font-weight:var(--sk-head-weight, 800);text-transform:var(--sk-head-case, none);line-height:1.18;${shadow}}
#${id} .ans{font-size:${aSize}px;font-weight:var(--sk-head-weight, 900);text-transform:var(--sk-head-case, none);line-height:0.95;color:${tk('--sk-accent')};${shadow}}
#${id} .why{margin-top:${Math.round(s.gap * 0.4)}px;font-size:${rSize}px;font-weight:600;${shadow}}
</style>`;
  const answerAt = Math.max(0.9, Math.min(1.6, (ctx.durationSec ?? 4) * 0.3));
  const tl: string[] = flip
    ? [fadeUp(`#${id} .q`, 0, { y: 10 }), heroLand(`#${id} .ans`, answerAt, { from: 0.6 })]
    : [
      `tl.from('#${id} .q .tag',{autoAlpha:0,scale:0.5,duration:0.28,ease:'${EASE.land}'},0);`,
      fadeUp(`#${id} .qt`, 0.12, { y: 12 }),
      `tl.from('#${id} .at',{autoAlpha:0,scale:0.5,duration:0.28,ease:'${EASE.land}'},${answerAt - 0.1});`,
      heroLand(`#${id} .ans`, answerAt, { from: 0.6 }),
    ];
  if (p.reason) tl.push(fadeUp(`#${id} .why`, answerAt + 0.45, { y: 10 }));
  return { html: html.trim(), timeline: tl.join('\n') };
}
