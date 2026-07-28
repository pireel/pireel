/**
 * Memphis stagings — geometric confetti, hard candy shadows.
 *
 * The frame's signature is a combination, not a colour: a white plate with a 4px ink outline AND
 * a hard offset shadow with zero blur, message pushed off to one side, confetti clustered opposite.
 * A generic component can carry the palette but not that, which is the whole reason stagings exist.
 *
 * Rules the format enforces, restated because they shape how these are written:
 *  - selectors are bare; the renderer scopes each one to the block
 *  - no raw px for type — sizes come from the scale, so a plate works at any box size
 *  - motion is declared, never written
 * Structural px (outline width, shadow offset, confetti geometry) are deliberate: they are the
 * frame's ink weight, not type, and must not scale with the box.
 */

import type { Blueprint } from '@pireel/studio-kit';

const PLATE = 'background:var(--sk-panel);border:4px solid var(--sk-fg);border-radius:var(--sk-radius);box-shadow:var(--sk-shadow);';

export const MEMPHIS_BLUEPRINTS: Blueprint[] = [
  {
    id: 'memphis-pop/metric-raw',
    component: 'metric',
    name: 'Raw numeral on paper',
    // The number sits RAW on the paper with geometry stacked behind it — no plate. Memphis puts
    // its numbers on the page itself; a plate here would make it a widget.
    html: `<div class="bp-root">
  <i class="circ"></i>
  <i class="tri"></i>
  <div class="stack">
    {{?label}}<span class="chip">{{label}}</span>{{/}}
    <div class="num">{{value}}</div>
    {{?note}}<div class="note">{{note}}</div>{{/}}
  </div>
</div>`,
    css: `.bp-root{display:flex;align-items:center;padding:{{pad}}px;overflow:hidden;}
.stack{display:flex;flex-direction:column;align-items:flex-start;gap:{{gap}}px;position:relative;z-index:2;}
.chip{display:inline-block;background:var(--sk-accent);color:var(--sk-panel);border:4px solid var(--sk-fg);border-radius:999px;padding:{{kickerPx}}px {{gap}}px;font-size:{{kickerPx}}px;font-weight:800;letter-spacing:0.02em;text-transform:uppercase;}
.num{font-family:var(--sk-font-num);font-size:{{hero}}px;font-weight:800;line-height:0.92;letter-spacing:-0.04em;color:var(--sk-fg);}
.note{font-size:{{labelPx}}px;font-weight:700;color:var(--sk-fg);max-width:88%;}
.circ{position:absolute;right:-4%;top:-8%;width:{{hero}}px;height:{{hero}}px;border:6px solid var(--sk-fg);border-radius:999px;z-index:1;}
.tri{position:absolute;right:14%;bottom:-6%;width:{{head}}px;height:{{head}}px;background:var(--sk-accent);clip-path:polygon(50% 0,100% 100%,0 100%);transform:rotate(18deg);z-index:1;}`,
    motion: [
      { sel: '.circ', preset: 'fadeUp', at: 0 },
      { sel: '.tri', preset: 'heroLand', at: 0.1 },
      { sel: '.chip', preset: 'fadeUp', at: 0.16 },
      { sel: '.num', preset: 'countUp', at: 0.3, field: 'value' },
      { sel: '.note', preset: 'fadeUp', at: 0.6 },
    ],
  },
  {
    id: 'memphis-pop/callout-plate',
    component: 'callout',
    name: 'Outlined plate + squiggle',
    html: `<div class="bp-root">
  <i class="dots"></i>
  <div class="plate">
    <div class="text">{{text}}</div>
    {{?support}}<div class="sup">{{support}}</div>{{/}}
    <svg class="sq" viewBox="0 0 200 40" preserveAspectRatio="none"><polyline points="0,30 33,10 66,30 100,10 133,30 166,10 200,30"/></svg>
  </div>
</div>`,
    css: `.bp-root{display:flex;align-items:center;padding:{{pad}}px;overflow:hidden;}
.plate{position:relative;z-index:2;${PLATE}padding:{{pad}}px;display:flex;flex-direction:column;gap:{{gap}}px;max-width:86%;}
.text{font-size:{{head}}px;font-weight:900;line-height:1.08;color:var(--sk-fg);text-align:left;}
.sup{font-size:{{labelPx}}px;font-weight:700;color:var(--sk-muted);}
.sq{display:block;width:60%;height:{{rule}}px;}
.sq polyline{fill:none;stroke:var(--sk-accent-2);stroke-width:12;vector-effect:non-scaling-stroke;}
.dots{position:absolute;left:-3%;bottom:-4%;width:38%;height:44%;background-image:radial-gradient(var(--sk-fg) 3px,transparent 3px);background-size:30px 30px;z-index:1;}`,
    motion: [
      { sel: '.dots', preset: 'fadeUp', at: 0 },
      { sel: '.plate', preset: 'heroLand', at: 0.08 },
      { sel: '.text', preset: 'fadeUp', at: 0.24 },
      { sel: '.sup', preset: 'fadeUp', at: 0.36 },
      { sel: '.sq', preset: 'drawRule', at: 0.5 },
    ],
  },
  {
    id: 'memphis-pop/steps-chips',
    component: 'steps',
    name: 'Numbered chips down the page',
    html: `<div class="bp-root">
  <i class="half"></i>
  <div class="rows">
    {{#items}}<div class="row"><span class="n">{{n}}</span><div class="body"><b class="t">{{text}}</b>{{?note}}<i class="nt">{{note}}</i>{{/}}</div></div>{{/}}
  </div>
</div>`,
    css: `.bp-root{display:flex;align-items:center;padding:{{pad}}px;overflow:hidden;}
.rows{position:relative;z-index:2;display:flex;flex-direction:column;gap:{{gap}}px;width:86%;}
.row{display:flex;align-items:center;gap:{{gap}}px;${PLATE}padding:{{gap}}px {{pad}}px;}
.n{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:{{head}}px;height:{{head}}px;background:var(--sk-accent);color:var(--sk-panel);border:4px solid var(--sk-fg);border-radius:999px;font-family:var(--sk-font-num);font-size:{{labelPx}}px;font-weight:800;}
.body{display:flex;flex-direction:column;gap:4px;min-width:0;}
.t{font-size:{{labelPx}}px;font-weight:800;color:var(--sk-fg);}
.nt{font-size:{{kickerPx}}px;font-weight:600;font-style:normal;color:var(--sk-muted);}
.half{position:absolute;right:-6%;top:6%;width:{{hero}}px;height:calc({{hero}}px / 2);background:var(--sk-panel-2);border:6px solid var(--sk-fg);border-bottom:none;border-radius:999px 999px 0 0;transform:rotate(-16deg);z-index:1;}`,
    motion: [
      { sel: '.half', preset: 'fadeUp', at: 0 },
      { sel: '.row', preset: 'staggerUp', at: 0.12 },
    ],
  },
];
