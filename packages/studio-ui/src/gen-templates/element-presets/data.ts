import { artElement, type ArtDirectedElementSpec } from './shared';

export const DATA_ELEMENT_PRESETS: Record<string, ArtDirectedElementSpec> = {
  'el-big-number': artElement(
    'tpl_big_number',
    'pe_num',
    `<div class="label" data-edit="label" data-edit-max="18">Weekly pulse</div><div class="orb"></div><div class="metric"><div class="number" data-edit="number" data-edit-max="8">+38%</div><div class="note"><i></i><b data-edit="note" data-edit-max="18">MOM GROWTH</b></div></div>`,
    `#tpl_big_number .artboard{background:#ffd64a;color:#1d1d1b}
#tpl_big_number .label{position:absolute;left:8px;top:8px;font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.16em}
#tpl_big_number .orb{position:absolute;right:4px;top:4px;width:42px;height:42px;border:7px solid rgba(255,122,89,.55);border-radius:50%}
#tpl_big_number .metric{position:absolute;left:8px;bottom:8px}
#tpl_big_number .number{font-size:26px;font-weight:900;line-height:1;letter-spacing:-.08em}
#tpl_big_number .note{display:flex;align-items:center;gap:4px;margin-top:4px;font-size:7px;font-weight:700}
#tpl_big_number .note i{width:20px;height:6px;border-radius:999px;background:#1d1d1b}
#tpl_big_number .note b{font-weight:700}`,
    `tl.from('#tpl_big_number .label',{y:-2,autoAlpha:0,duration:.24,ease:'power3.out'},0);
tl.from('#tpl_big_number .orb',{scale:.6,autoAlpha:0,duration:.4,ease:'back.out(1.5)'},.05);
tl.from('#tpl_big_number .metric',{y:6,autoAlpha:0,duration:.32,ease:'power3.out'},.14);`,
  ),
  'el-comparison': artElement(
    'tpl_comparison',
    'pe_cmp',
    `<div class="cards"><div class="card a"><b data-edit="leftTitle" data-edit-max="12">PLAN A</b><strong data-edit="leftValue" data-edit-max="8">42</strong><span data-edit="leftNote" data-edit-max="18">QUICK START</span></div><i class="vs">VS</i><div class="card b"><b data-edit="rightTitle" data-edit-max="12">PLAN B</b><strong data-edit="rightValue" data-edit-max="8">68</strong><span data-edit="rightNote" data-edit-max="18">BEST VALUE</span></div></div>`,
    `#tpl_comparison .artboard{background:#f5efe6}
#tpl_comparison .cards{position:absolute;inset:8px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:stretch;gap:6px}
#tpl_comparison .card{display:flex;min-width:0;flex-direction:column;justify-content:space-between;border-radius:6px;padding:8px;color:#fff}
#tpl_comparison .a{background:#ff6b57}#tpl_comparison .b{background:#2f5eff}
#tpl_comparison .card b{overflow:hidden;font-size:8px;font-weight:700;line-height:1.1;text-overflow:ellipsis;white-space:nowrap}#tpl_comparison .card strong{font-size:21px;line-height:1;white-space:nowrap}#tpl_comparison .card span{overflow:hidden;font-size:5px;line-height:1.1;opacity:.8;text-overflow:ellipsis;white-space:nowrap}
#tpl_comparison .vs{position:absolute;z-index:2;left:calc(50% - 10px);top:calc(50% - 10px);display:flex;width:20px;height:20px;align-items:center;justify-content:center;transform-origin:center;border-radius:50%;background:#171717;color:#fff;font-size:6px;font-style:normal;font-weight:900}`,
    `tl.from('#tpl_comparison .a',{x:-7,autoAlpha:0,duration:.3,ease:'power3.out'},0);
tl.from('#tpl_comparison .vs',{scale:0,autoAlpha:0,duration:.22,ease:'back.out(2)'},.2);
tl.from('#tpl_comparison .b',{x:7,autoAlpha:0,duration:.3,ease:'power3.out'},.3);`,
  ),
  'el-progress-ring': artElement(
    'tpl_progress_ring',
    'pe_ring',
    `<div class="label" data-edit="label" data-edit-max="16">Completion</div><div class="ring"><div data-edit="value" data-edit-max="3">73</div></div><div class="status" data-edit="status" data-edit-max="16">ON<br>TRACK</div>`,
    `#tpl_progress_ring .artboard{background:#17243d;color:#fff}
#tpl_progress_ring .label{position:absolute;left:12px;top:12px;color:#aebbd3;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.18em}
#tpl_progress_ring .ring{position:absolute;right:12px;top:50%;width:48px;height:48px;padding:4px;transform:translateY(-50%);border-radius:50%;background:conic-gradient(#c9ff55 0 73%,#34435f 73% 100%)}
#tpl_progress_ring .ring>div{display:flex;width:100%;height:100%;align-items:center;justify-content:center;border-radius:50%;background:#17243d;color:#fff;font-size:12px;font-weight:900}
#tpl_progress_ring .status{position:absolute;left:12px;bottom:12px;max-width:48px;max-height:27px;overflow:hidden;font-size:13px;font-weight:900;line-height:.94;word-break:keep-all}`,
    `tl.from('#tpl_progress_ring .label',{x:-3,autoAlpha:0,duration:.25},0);
tl.from('#tpl_progress_ring .status',{y:5,autoAlpha:0,duration:.3,ease:'power3.out'},.12);
tl.from('#tpl_progress_ring .ring',{scale:.6,rotation:-80,autoAlpha:0,duration:.45,ease:'back.out(1.5)'},.2);`,
  ),
  'el-bar-chart': artElement(
    'tpl_bar_chart',
    'pe_bars',
    `<div class="title" data-edit="title" data-edit-max="24">Audience mix</div><div class="chart"><i style="--h:38%;--c:#ffd44d"></i><i style="--h:68%;--c:#7057ff"></i><i style="--h:50%;--c:#ffd44d"></i><i style="--h:85%;--c:#ff5c4d"></i><i style="--h:58%;--c:#ffd44d"></i></div>`,
    `#tpl_bar_chart .artboard{background:#f2eadf;color:#25231f}
#tpl_bar_chart .title{position:absolute;left:10px;top:8px;font-size:8px;font-weight:900}
#tpl_bar_chart .chart{position:absolute;left:10px;right:10px;top:24px;bottom:8px;display:flex;align-items:flex-end;gap:6px;border-radius:6px;background:rgba(255,255,255,.75);padding:8px 8px 6px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
#tpl_bar_chart .chart i{height:var(--h);flex:1;border-radius:2px 2px 0 0;background:var(--c);transform-origin:bottom}`,
    `tl.from('#tpl_bar_chart .title',{x:-2,autoAlpha:0,duration:.25},0);
tl.from('#tpl_bar_chart .chart',{y:4,autoAlpha:0,duration:.3,ease:'power3.out'},.1);
tl.from('#tpl_bar_chart .chart i',{scaleY:0,duration:.42,stagger:.08,ease:'power3.out'},.25);`,
  ),
};
