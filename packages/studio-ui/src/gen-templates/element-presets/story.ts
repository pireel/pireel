import { artElement, type ArtDirectedElementSpec } from './shared';

export const STORY_ELEMENT_PRESETS: Record<string, ArtDirectedElementSpec> = {
  'el-bullet-list': artElement(
    'tpl_bullet_list',
    'pe_list',
    `<div class="tag" data-edit="tag" data-edit-max="12">3 THINGS</div><div class="items"><div><i>01</i><b data-edit="point1" data-edit-max="24">Make it clear</b></div><div><i>02</i><b data-edit="point2" data-edit-max="24">Keep it moving</b></div><div><i>03</i><b data-edit="point3" data-edit-max="24">Land the point</b></div></div>`,
    `#tpl_bullet_list .artboard{background:#3254d7;color:#fff}
#tpl_bullet_list .tag{position:absolute;left:8px;top:7px;border-radius:2px;background:#d8ff51;color:#15203c;padding:2px 6px;font-size:6px;font-weight:900;line-height:1}
#tpl_bullet_list .items{position:absolute;left:8px;right:8px;top:22px;bottom:7px;display:grid;grid-template-rows:repeat(3,minmax(0,1fr));gap:3px;font-size:7px;font-weight:900}
#tpl_bullet_list .items>div{display:flex;min-width:0;align-items:center;border-radius:2px;background:rgba(255,255,255,.14);padding:2px 6px;line-height:1}
#tpl_bullet_list .items i{margin-right:6px;color:#ffca44;font-style:normal}#tpl_bullet_list .items b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#tpl_bullet_list .items>div:nth-child(2) i{color:#ff7d63}#tpl_bullet_list .items>div:nth-child(3) i{color:#d8ff51}`,
    `tl.from('#tpl_bullet_list .tag',{scale:.7,autoAlpha:0,duration:.24,ease:'back.out(1.7)'},0);
tl.from('#tpl_bullet_list .items>div',{x:-6,autoAlpha:0,duration:.28,stagger:.12,ease:'power3.out'},.15);`,
  ),
  'el-three-steps': artElement(
    'tpl_three_steps',
    'pe_steps',
    `<div class="label" data-edit="label" data-edit-max="18">How it works</div><div class="steps"><div><b>01</b><span data-edit="step1" data-edit-max="12">IDEA</span></div><div><b>02</b><span data-edit="step2" data-edit-max="12">BUILD</span></div><div><b>03</b><span data-edit="step3" data-edit-max="12">SHIP</span></div></div>`,
    `#tpl_three_steps .artboard{background:#f25f4b;color:#fff}
#tpl_three_steps .label{position:absolute;left:8px;top:8px;font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.16em;opacity:.75}
#tpl_three_steps .steps{position:absolute;left:8px;right:8px;top:24px;bottom:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
#tpl_three_steps .steps>div{display:flex;flex-direction:column;justify-content:space-between;border-radius:2px;background:#fff8ed;color:#2a1a17;padding:6px}
#tpl_three_steps .steps b{font-size:13px;line-height:1}#tpl_three_steps .steps span{overflow:hidden;font-size:6px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}`,
    `tl.from('#tpl_three_steps .label',{x:-2,autoAlpha:0,duration:.24},0);
tl.from('#tpl_three_steps .steps>div',{y:6,autoAlpha:0,duration:.32,stagger:.14,ease:'back.out(1.4)'},.12);`,
  ),
  'el-timeline': artElement(
    'tpl_timeline',
    'pe_tline',
    `<div class="title" data-edit="title" data-edit-max="24">ROAD TO LAUNCH</div><div class="line"></div><div class="nodes"><div><i></i><b data-edit="month1" data-edit-max="8">MAY</b></div><div><i></i><b data-edit="month2" data-edit-max="8">JUN</b></div><div><i></i><b data-edit="month3" data-edit-max="8">JUL</b></div></div>`,
    `#tpl_timeline .artboard{background:#171717;color:#fff}
#tpl_timeline .title{position:absolute;left:8px;top:8px;font-size:8px;font-weight:900}
#tpl_timeline .line{position:absolute;left:12px;right:12px;top:42px;height:1px;background:rgba(255,255,255,.35);transform-origin:left}
#tpl_timeline .nodes{position:absolute;left:12px;right:12px;top:37px;display:flex;justify-content:space-between}
#tpl_timeline .nodes>div{display:flex;flex-direction:column;align-items:center}#tpl_timeline .nodes i{width:10px;height:10px;border:2px solid #171717;border-radius:50%;background:#d9ff54}#tpl_timeline .nodes>div:nth-child(2) i{background:#ff6e58}
#tpl_timeline .nodes b{margin-top:4px;font-size:6px;color:#fff}`,
    `tl.from('#tpl_timeline .title',{y:-2,autoAlpha:0,duration:.25},0);
tl.from('#tpl_timeline .line',{scaleX:0,duration:.45,ease:'power2.out'},.12);
tl.from('#tpl_timeline .nodes>div',{y:3,autoAlpha:0,duration:.25,stagger:.13,ease:'back.out(1.5)'},.3);`,
  ),
  'el-quote': artElement(
    'tpl_quote',
    'pe_quote',
    `<div class="mark">“</div><div class="quote" data-edit="quote" data-edit-max="64">Good design makes the point feel inevitable.</div><div class="by" data-edit="attribution" data-edit-max="24">Studio notes · 04</div>`,
    `#tpl_quote .artboard{background:#ff8a73;color:#20201e}
#tpl_quote .mark{position:absolute;left:5px;top:2px;color:#ffdc5e;font-size:36px;font-weight:900;line-height:1}
#tpl_quote .quote{position:absolute;left:18px;right:10px;top:15px;max-height:34px;overflow:hidden;font-size:9px;font-weight:900;line-height:1.18;overflow-wrap:anywhere}
#tpl_quote .by{position:absolute;right:9px;bottom:6px;max-width:92px;overflow:hidden;font-size:5px;font-weight:700;line-height:1;text-overflow:ellipsis;text-transform:uppercase;letter-spacing:.14em;white-space:nowrap;opacity:.68}`,
    `tl.from('#tpl_quote .mark',{scale:.55,rotation:-18,autoAlpha:0,duration:.34,ease:'back.out(1.5)'},0);
tl.from('#tpl_quote .quote',{y:4,autoAlpha:0,duration:.34,ease:'power3.out'},.15);
tl.from('#tpl_quote .by',{x:3,autoAlpha:0,duration:.25},.45);`,
  ),
};
