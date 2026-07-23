/**
 * Cinema talking-head overlays: letterbox-subtitle language. A bottom --panel-2
 * letterbox bar slides in, a mono slate (with accent-2 red dot ●), timecode, a
 * 200x2 thin gold rule (gold is rationed: one gold accent per element), and
 * bilingual subtitles (primary line + 0.3em-tracked small English caption).
 * Motion is only slide-in and slow fade.
 */

import { mk, txt, type Block } from '../dialects/shared';

const base = (id: string) => `
#${id} .bar{position:absolute;left:0;right:0;bottom:0;height:140px;background:var(--panel-2);border-top:1px solid var(--line);}
#${id} .sl{position:absolute;font-family:var(--font-num);font-size:28px;letter-spacing:0.18em;color:var(--muted);}
#${id} .sl b{color:var(--accent-2);font-weight:400;}
#${id} .rule{width:200px;height:2px;background:var(--accent);}
#${id} .en{font-size:26px;letter-spacing:0.3em;color:var(--muted);padding-left:0.3em;}`;

const barTl = (id: string) => `tl.from('#${id} .bar',{y:140,duration:0.45,ease:'power2.out'},0);`;

export const overlays: Record<string, () => Block> = {
  'title-bar': () =>
    mk(
      'cf_ttl',
      'title-bar',
      (id) => `
<div class="w">
  <div class="bar"></div>
  <div class="tc">
    <div class="rule"></div>
    <div class="t" data-edit="title">${txt('标题一', 'Title 1')}</div>
    <div class="en" data-edit="en">A FILM OVER THE SHOULDER</div>
  </div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;inset:0;font-family:var(--font-head);color:var(--fg);}
#${id} .tc{position:absolute;left:0;right:0;bottom:180px;display:flex;flex-direction:column;align-items:center;gap:30px;}
#${id} .t{font-size:96px;font-weight:600;letter-spacing:0.08em;line-height:1;padding-left:0.08em;}
</style>`,
      (id) =>
        `${barTl(id)}\n` +
        `tl.from('#${id} .rule',{scaleX:0,duration:0.4,ease:'power2.inOut'},0.25);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,y:20,duration:0.5,ease:'power1.out'},0.4);\n` +
        `tl.from('#${id} .en',{autoAlpha:0,duration:0.4},0.7);`,
    ),
  'big-number': () =>
    mk(
      'cf_num',
      'big-number',
      (id) => `
<div class="w">
  <div class="sl l"><b>●</b> <span data-edit="tag">SC.07 · TAKE 01</span></div>
  <div class="tc">
    <div class="en" data-edit="label">${txt('数据说明', 'Data label')}</div>
    <div class="v"><b data-edit="num">38</b><span data-edit="unit">%</span></div>
    <div class="rule"></div>
  </div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;inset:0;font-family:var(--font-head);color:var(--fg);}
#${id} .sl.l{left:80px;top:90px;}
#${id} .tc{position:absolute;left:0;right:0;top:50%;transform:translateY(-52%);display:flex;flex-direction:column;align-items:center;gap:36px;}
#${id} .v{display:flex;align-items:baseline;line-height:1;color:var(--accent);}
#${id} .v b{font-size:230px;font-weight:600;letter-spacing:0.04em;}
#${id} .v span{font-size:96px;color:var(--fg);margin-left:20px;}
</style>`,
      (id) =>
        `tl.from('#${id} .sl',{autoAlpha:0,duration:0.35},0.05);\n` +
        `tl.from('#${id} .en',{autoAlpha:0,duration:0.4},0.15);\n` +
        `tl.from('#${id} .v',{autoAlpha:0,y:24,duration:0.5,ease:'power1.out'},0.3);\n` +
        `tl.from('#${id} .rule',{scaleX:0,duration:0.4,ease:'power2.inOut'},0.6);`,
    ),
  'bullet-list': () =>
    mk(
      'cf_list',
      'bullet-list',
      (id) => `
<div class="w">
  <div class="crd">
    <div class="rule"></div>
    <div class="en" data-edit="title">${txt('CAST · 列表标题', 'CAST · LIST TITLE')}</div>
    <div class="row r1"><span class="lft" data-edit="p1">${txt('要点一', 'Point 1')}</span><i class="dl"></i><span class="rgt">SC.01</span></div>
    <div class="row r2"><span class="lft" data-edit="p2">${txt('要点二', 'Point 2')}</span><i class="dl"></i><span class="rgt">SC.02</span></div>
    <div class="row r3"><span class="lft" data-edit="p3">${txt('要点三', 'Point 3')}</span><i class="dl"></i><span class="rgt">SC.03</span></div>
  </div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;inset:0;font-family:var(--font-head);color:var(--fg);}
#${id} .crd{position:absolute;left:110px;top:50%;transform:translateY(-50%);width:640px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:44px 56px 40px;display:flex;flex-direction:column;align-items:flex-start;gap:30px;}
#${id} .row{width:100%;display:flex;align-items:baseline;gap:30px;}
#${id} .lft{font-size:44px;font-weight:600;letter-spacing:0.06em;}
#${id} .rgt{font-family:var(--font-num);font-size:26px;letter-spacing:0.18em;color:var(--muted);}
#${id} .dl{flex:1;border-bottom:3px dotted var(--line);transform:translateY(-8px);}
</style>`,
      (id) =>
        `tl.from('#${id} .crd',{x:-60,autoAlpha:0,duration:0.45,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .rule',{scaleX:0,duration:0.4,ease:'power2.inOut'},0.3);\n` +
        `tl.from('#${id} .row',{autoAlpha:0,y:16,duration:0.35,ease:'power1.out',stagger:0.12},0.4);`,
    ),
  'keyword-slam': () =>
    mk(
      'cf_kw',
      'keyword-slam',
      (id) => `
<div class="w">
  <div class="tc">
    <div class="t" data-edit="word">${txt('关键词', 'Keyword')}</div>
    <div class="rule"></div>
    <div class="en" data-edit="en">THE ONE WORD THAT MATTERS</div>
  </div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;inset:0;font-family:var(--font-head);color:var(--fg);}
#${id} .tc{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:52%;display:flex;flex-direction:column;align-items:center;gap:34px;}
#${id} .t{font-size:150px;font-weight:600;letter-spacing:0.1em;line-height:1;padding-left:0.1em;white-space:nowrap;}
</style>`,
      (id) =>
        `tl.from('#${id} .t',{autoAlpha:0,y:24,duration:0.55,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .rule',{scaleX:0,duration:0.4,ease:'power2.inOut'},0.35);\n` +
        `tl.from('#${id} .en',{autoAlpha:0,duration:0.4},0.6);`,
    ),
  'callout': () =>
    mk(
      'cf_call',
      'callout',
      (id) => `
<div class="w">
  <div class="slate">
    <div class="sl"><b>●</b> <span data-edit="tag">SC.04 · NOTE</span></div>
    <div class="t" data-edit="note">${txt('标注一', 'Note 1')}</div>
    <div class="tc2" data-edit="tc">00:02:14:07</div>
  </div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;inset:0;font-family:var(--font-head);color:var(--fg);}
#${id} .slate{position:absolute;left:80px;top:96px;display:flex;flex-direction:column;align-items:flex-start;gap:20px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:30px 44px;}
#${id} .slate .sl{position:static;}
#${id} .t{font-size:52px;font-weight:600;letter-spacing:0.06em;}
#${id} .tc2{font-family:var(--font-num);font-size:26px;letter-spacing:0.18em;color:var(--muted);border-top:1px solid var(--line);padding-top:16px;align-self:stretch;}
</style>`,
      (id) =>
        `tl.from('#${id} .slate',{x:-60,autoAlpha:0,duration:0.45,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,duration:0.4},0.3);\n` +
        `tl.from('#${id} .tc2',{autoAlpha:0,duration:0.35},0.5);`,
    ),
  'follow-cta': () =>
    mk(
      'cf_cta',
      'follow-cta',
      (id) => `
<div class="w">
  <div class="bar"></div>
  <div class="tc">
    <div class="en" data-edit="kick">NEXT EPISODE</div>
    <div class="t" data-edit="cta">${txt('+ 关注', '+ Follow')}</div>
    <div class="rule"></div>
    <div class="wk" data-edit="side">${txt('说明一', 'DETAIL 1')}</div>
  </div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;inset:0;font-family:var(--font-head);color:var(--fg);}
#${id} .tc{position:absolute;left:0;right:0;bottom:190px;display:flex;flex-direction:column;align-items:center;gap:28px;}
#${id} .t{font-size:84px;font-weight:600;letter-spacing:0.08em;line-height:1;padding-left:0.08em;}
#${id} .wk{font-family:var(--font-num);font-size:28px;letter-spacing:0.18em;color:var(--muted);}
</style>`,
      (id) =>
        `${barTl(id)}\n` +
        `tl.from('#${id} .en',{autoAlpha:0,duration:0.35},0.25);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,y:20,duration:0.5,ease:'power1.out'},0.35);\n` +
        `tl.from('#${id} .rule',{scaleX:0,duration:0.4,ease:'power2.inOut'},0.55);\n` +
        `tl.from('#${id} .wk',{autoAlpha:0,duration:0.4},0.75);`,
    ),
  'quote': () =>
    mk(
      'cf_quote',
      'quote',
      (id) => `
<div class="w">
  <div class="bar"></div>
  <div class="sub">
    <div class="zh"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b data-edit="l2">${txt('下半句。', 'and line two.')}</b></div>
    <div class="en" data-edit="en">THE LINE WORTH REMEMBERING</div>
  </div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;inset:0;font-family:var(--font-head);color:var(--fg);}
#${id} .sub{position:absolute;left:0;right:0;bottom:190px;display:flex;flex-direction:column;align-items:center;gap:28px;text-align:center;}
#${id} .zh{font-size:66px;font-weight:600;letter-spacing:0.06em;}
#${id} .zh b{color:var(--accent);font-weight:600;}
</style>`,
      (id) =>
        `${barTl(id)}\n` +
        `tl.from('#${id} .zh',{autoAlpha:0,y:20,duration:0.55,ease:'power1.out'},0.3);\n` +
        `tl.from('#${id} .zh b',{autoAlpha:0,duration:0.35},0.6);\n` +
        `tl.from('#${id} .en',{autoAlpha:0,y:16,duration:0.45,ease:'power1.out'},0.7);`,
    ),
  'comparison': () =>
    mk(
      'cf_cmp',
      'comparison',
      (id) => `
<div class="w">
  <div class="cmp">
    <div class="band ba"><span class="sc">SC.A</span><b data-edit="lt">${txt('选项一', 'Option A')}</b><span class="vv" data-edit="lv">${txt('数值一', 'Value A')}</span><span class="vd">NG</span></div>
    <div class="band bb"><span class="sc">SC.B</span><b class="pick" data-edit="rt">${txt('选项二', 'Option B')}</b><span class="vv" data-edit="rv">${txt('数值二', 'Value B')}</span><span class="vd ok">OK</span></div>
  </div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;inset:0;font-family:var(--font-head);color:var(--fg);}
#${id} .cmp{position:absolute;left:50%;bottom:150px;transform:translateX(-50%);width:58%;display:flex;flex-direction:column;gap:26px;}
#${id} .band{display:flex;align-items:center;gap:44px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:30px 48px;}
#${id} .sc{font-family:var(--font-num);font-size:26px;letter-spacing:0.18em;color:var(--muted);}
#${id} .band b{flex:1;font-size:46px;font-weight:600;letter-spacing:0.04em;}
#${id} .pick{border-bottom:2px solid var(--accent);align-self:center;}
#${id} .vv{font-family:var(--font-num);font-size:34px;color:var(--muted);letter-spacing:0.08em;}
#${id} .vd{font-family:var(--font-num);font-size:28px;letter-spacing:0.18em;color:var(--muted);}
#${id} .vd.ok{color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .ba',{autoAlpha:0,y:20,duration:0.45,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .bb',{autoAlpha:0,y:20,duration:0.45,ease:'power1.out'},0.18);\n` +
        `tl.from('#${id} .vd.ok',{autoAlpha:0,duration:0.35},0.6);`,
    ),
};

export type { Block };
