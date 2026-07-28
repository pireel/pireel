/**
 * Scrapbook stagings — kraft collage, tape-pinned memories.
 *
 * The signature is physical: every piece is rotated a degree or three, overlaps its neighbour, and
 * carries one real drop shadow, as if glued onto the page. Nothing aligns to a grid on purpose —
 * which is exactly what a general-purpose component will never do, since its whole job is to align.
 *
 * Tape is the frame's one rule about colour: the green accent is tape and nothing else, always
 * translucent, always crossing a corner or a note's top edge.
 */

import type { Blueprint } from '@pireel/studio-kit';

const PAPER = 'background:var(--sk-panel);border-radius:var(--sk-radius);box-shadow:var(--sk-shadow);';
const TAPE = 'background:var(--sk-accent-2);opacity:0.75;border-radius:var(--sk-radius);';

export const SCRAPBOOK_BLUEPRINTS: Blueprint[] = [
  {
    id: 'scrapbook-tape/metric-polaroid',
    component: 'metric',
    name: 'Polaroid with a caption margin',
    // The thick bottom padding IS the polaroid frame; the label lives in it, the way a caption is
    // written on the white strip under a photo.
    html: `<div class="bp-root">
  <div class="card">
    <i class="tape"></i>
    <div class="win">
      <div class="num">{{value}}</div>
      {{?note}}<div class="note">{{note}}</div>{{/}}
    </div>
    {{?label}}<div class="cap">{{label}}</div>{{/}}
  </div>
</div>`,
    css: `.bp-root{display:flex;align-items:center;justify-content:center;padding:{{pad}}px;overflow:hidden;}
.card{position:relative;${PAPER}padding:{{pad}}px {{pad}}px calc({{pad}}px * 2.2);transform:rotate(-2.5deg);max-width:92%;}
.tape{position:absolute;left:-6%;top:-4%;width:250px;height:60px;${TAPE}transform:rotate(-38deg);}
.win{display:flex;flex-direction:column;gap:{{gap}}px;align-items:center;}
.num{font-family:var(--sk-font-num);font-size:{{hero}}px;font-weight:800;line-height:1;letter-spacing:-0.01em;color:var(--sk-fg);}
.note{font-size:{{labelPx}}px;font-weight:600;color:var(--sk-fg);text-align:center;}
.cap{position:absolute;left:0;right:0;bottom:calc({{pad}}px * 0.6);text-align:center;font-size:{{kickerPx}}px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:var(--sk-muted);}`,
    motion: [
      { sel: '.card', preset: 'heroLand', at: 0 },
      { sel: '.tape', preset: 'fadeUp', at: 0.18 },
      { sel: '.num', preset: 'countUp', at: 0.24, field: 'value' },
      { sel: '.cap', preset: 'fadeUp', at: 0.5 },
    ],
  },
  {
    id: 'scrapbook-tape/callout-note',
    component: 'callout',
    name: 'Sticky note, taped at the top',
    html: `<div class="bp-root">
  <div class="note">
    <i class="tape"></i>
    <div class="text">{{text}}</div>
    <i class="ul"></i>
    {{?support}}<div class="by">{{support}}</div>{{/}}
  </div>
</div>`,
    css: `.bp-root{display:flex;align-items:center;justify-content:center;padding:{{pad}}px;overflow:hidden;}
.note{position:relative;background:var(--sk-panel-2);border-radius:var(--sk-radius);box-shadow:var(--sk-shadow);padding:{{pad}}px;transform:rotate(3deg);max-width:90%;display:flex;flex-direction:column;gap:{{gap}}px;}
.tape{position:absolute;left:50%;top:-22px;margin-left:-125px;width:250px;height:56px;${TAPE}transform:rotate(-2deg);}
.text{font-size:{{head}}px;font-weight:800;line-height:1.12;color:var(--sk-fg);}
.ul{display:block;width:52%;height:6px;background:var(--sk-accent);transform:rotate(-1deg);}
.by{font-size:{{labelPx}}px;font-weight:600;color:var(--sk-muted);}`,
    motion: [
      { sel: '.note', preset: 'heroLand', at: 0 },
      { sel: '.tape', preset: 'fadeUp', at: 0.16 },
      { sel: '.text', preset: 'fadeUp', at: 0.26 },
      { sel: '.ul', preset: 'drawRule', at: 0.5 },
      { sel: '.by', preset: 'fadeUp', at: 0.62 },
    ],
  },
  {
    id: 'scrapbook-tape/steps-checklist',
    component: 'steps',
    name: 'Hand checklist on a note',
    html: `<div class="bp-root">
  <div class="pad">
    <i class="tape"></i>
    {{#items}}<div class="row"><i class="box"></i><div class="body"><b class="t">{{text}}</b>{{?note}}<i class="nt">{{note}}</i>{{/}}</div></div>{{/}}
  </div>
</div>`,
    css: `.bp-root{display:flex;align-items:center;justify-content:center;padding:{{pad}}px;overflow:hidden;}
.pad{position:relative;${PAPER}padding:{{pad}}px;transform:rotate(-1.5deg);width:84%;display:flex;flex-direction:column;gap:{{gap}}px;}
.tape{position:absolute;right:-4%;top:-3%;width:220px;height:58px;${TAPE}transform:rotate(34deg);}
.row{display:flex;align-items:center;gap:{{gap}}px;min-width:0;}
.box{flex:0 0 auto;width:{{labelPx}}px;height:{{labelPx}}px;border:4px solid var(--sk-fg);border-radius:var(--sk-radius);}
.body{display:flex;flex-direction:column;gap:2px;min-width:0;}
.t{font-size:{{labelPx}}px;font-weight:700;color:var(--sk-fg);}
.nt{font-size:{{kickerPx}}px;font-weight:600;font-style:normal;color:var(--sk-muted);}`,
    motion: [
      { sel: '.pad', preset: 'heroLand', at: 0 },
      { sel: '.tape', preset: 'fadeUp', at: 0.16 },
      { sel: '.row', preset: 'staggerUp', at: 0.24 },
    ],
  },
];
