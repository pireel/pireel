/* ================================================================
   Biennale — constructivist-poster dialect: giant bleeding type, vertical text, reversed panels
   ================================================================ */

import { type Block, mk } from './shared';

export const blocks: Record<string, () => Block> = {
  'title-card': () =>
    mk(
      'bi_ttl',
      'title-card',
      (id) => `
<div class="rt">
  <div class="l1">把观点</div>
  <div class="l2">讲成画面</div>
  <div class="side">PIREEL BIENNALE — 2026</div>
  <div class="ft"><span>№01</span><span>OPENING</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);overflow:hidden;}
#${id} .l1{position:absolute;left:110px;top:70px;font-size:330px;font-weight:900;letter-spacing:-0.04em;line-height:1;}
#${id} .l2{position:absolute;left:110px;top:470px;font-size:330px;font-weight:900;letter-spacing:-0.04em;line-height:1.06;background:var(--fg);color:var(--paper);padding:0 40px 20px;}
#${id} .side{position:absolute;right:80px;top:70px;writing-mode:vertical-rl;font-family:var(--font-num);font-size:36px;letter-spacing:0.5em;color:var(--fg);}
#${id} .ft{position:absolute;left:110px;bottom:70px;right:110px;display:flex;justify-content:space-between;border-top:6px solid var(--fg);padding-top:26px;font-family:var(--font-num);font-size:40px;font-weight:700;letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .l1',{x:-140,autoAlpha:0,duration:0.3,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .l2',{x:140,autoAlpha:0,duration:0.3,ease:'power3.out'},0.12);\n` +
        `tl.from('#${id} .side,#${id} .ft',{autoAlpha:0,duration:0.26},0.34);`,
    ),
  'big-number': () =>
    mk(
      'bi_num',
      'big-number',
      (id) => `
<div class="rt">
  <div class="v">38</div>
  <div class="pct">%</div>
  <div class="lab">本月增长<br/>GROWTH INDEX</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-num);overflow:hidden;}
#${id} .v{position:absolute;left:60px;top:50%;transform:translateY(-50%);font-size:1050px;font-weight:800;line-height:1;letter-spacing:-0.08em;}
#${id} .pct{position:absolute;right:210px;top:120px;width:300px;height:300px;background:var(--fg);color:var(--paper);display:flex;align-items:center;justify-content:center;font-size:180px;font-weight:800;}
#${id} .lab{position:absolute;right:210px;bottom:130px;text-align:right;font-family:var(--font-head);font-size:52px;font-weight:800;line-height:1.5;border-right:14px solid var(--fg);padding-right:40px;}
</style>`,
      (id) =>
        `tl.from('#${id} .v',{y:180,autoAlpha:0,duration:0.36,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .pct',{scale:0,duration:0.28,ease:'power3.out'},0.2);\n` +
        `tl.from('#${id} .lab',{autoAlpha:0,duration:0.24},0.4);`,
    ),
  'count-up': () =>
    mk(
      'bi_cnt',
      'count-up',
      (id) => `
<div class="rt">
  <div class="cap">LIVE COUNT — EVIDENCE</div>
  <div class="big"><b class="v">3650</b><span class="u">条</span></div>
  <div class="claim">规律是拆出来的</div>
  <div class="side">DATA OVER TASTE — 2026</div>
  <div class="ft"><span>№04</span><span>COUNT</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);overflow:hidden;}
#${id} .cap{position:absolute;left:110px;top:80px;font-family:var(--font-num);font-size:40px;font-weight:700;letter-spacing:0.4em;}
#${id} .big{position:absolute;left:110px;top:44%;transform:translateY(-50%);display:flex;align-items:flex-end;gap:50px;}
#${id} .v{font-family:var(--font-num);font-size:460px;font-weight:800;line-height:1;letter-spacing:-0.05em;}
#${id} .u{background:var(--fg);color:var(--paper);font-size:120px;font-weight:900;line-height:1;padding:24px 44px;margin-bottom:44px;}
#${id} .claim{position:absolute;left:110px;bottom:250px;font-size:84px;font-weight:900;letter-spacing:-0.02em;}
#${id} .side{position:absolute;right:80px;top:80px;writing-mode:vertical-rl;font-family:var(--font-num);font-size:34px;letter-spacing:0.4em;}
#${id} .ft{position:absolute;left:110px;right:110px;bottom:70px;display:flex;justify-content:space-between;border-top:6px solid var(--fg);padding-top:26px;font-family:var(--font-num);font-size:40px;font-weight:700;letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.22},0);\n` +
        `tl.from('#${id} .big',{x:-140,autoAlpha:0,duration:0.32,ease:'power3.out'},0.06);\n` +
        `tl.from('#${id} .v',{innerText:0,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .u',{scale:0,duration:0.26,ease:'power3.out'},0.3);\n` +
        `tl.from('#${id} .claim',{x:-120,autoAlpha:0,duration:0.28,ease:'power3.out'},0.5);\n` +
        `tl.from('#${id} .side,#${id} .ft',{autoAlpha:0,duration:0.26},0.7);`,
    ),
  'compare': () =>
    mk(
      'bi_cmp',
      'compare',
      (id) => `
<div class="rt">
  <div class="half a"><span>老办法</span><b>3天</b></div>
  <div class="half b"><span>新办法</span><b>3小时</b></div>
  <div class="seam">VS</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);display:flex;font-family:var(--font-head);overflow:hidden;}
#${id} .half{flex:1;display:flex;flex-direction:column;justify-content:center;gap:30px;padding:0 110px;}
#${id} .half span{font-size:56px;font-weight:700;letter-spacing:0.2em;}
#${id} .half b{font-size:300px;font-weight:900;letter-spacing:-0.05em;line-height:1;}
#${id} .half.a{color:var(--fg);}
#${id} .half.b{background:var(--fg);color:var(--paper);align-items:flex-end;text-align:right;}
#${id} .seam{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-8deg);font-family:var(--font-num);font-size:110px;font-weight:800;background:var(--paper);border:10px solid var(--fg);padding:10px 44px;}
</style>`,
      (id) =>
        `tl.from('#${id} .half.a',{x:-160,autoAlpha:0,duration:0.3,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .half.b',{x:160,autoAlpha:0,duration:0.3,ease:'power3.out'},0.1);\n` +
        `tl.from('#${id} .seam',{scale:0,rotation:20,duration:0.3,ease:'back.out(1.8)'},0.32);`,
    ),
  'cta': () =>
    mk(
      'bi_cta',
      'cta',
      (id) => `
<div class="rt">
  <div class="plate"><span>关注</span><i>↗</i></div>
  <div class="strip">FOLLOW — NEXT EPISODE — FOLLOW — NEXT EPISODE —</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);font-family:var(--font-head);overflow:hidden;}
#${id} .plate{position:absolute;inset:110px 110px 250px;background:var(--fg);color:var(--paper);display:flex;align-items:center;justify-content:center;gap:60px;}
#${id} .plate span{font-size:340px;font-weight:900;letter-spacing:0.04em;}
#${id} .plate i{font-style:normal;font-size:300px;font-weight:900;color:var(--accent-2);-webkit-text-stroke:8px var(--paper);}
#${id} .strip{position:absolute;left:0;right:0;bottom:100px;white-space:nowrap;font-family:var(--font-num);font-size:44px;font-weight:700;letter-spacing:0.32em;color:var(--fg);border-top:6px solid var(--fg);border-bottom:6px solid var(--fg);padding:22px 40px;}
</style>`,
      (id) =>
        `tl.from('#${id} .plate',{y:-120,autoAlpha:0,duration:0.32,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .plate i',{x:60,y:60,autoAlpha:0,duration:0.3,ease:'power2.out'},0.24);\n` +
        `tl.from('#${id} .strip',{x:200,autoAlpha:0,duration:0.4,ease:'power2.out'},0.3);`,
    ),
  'list': () =>
    mk(
      'bi_lst',
      'list',
      (id) => `
<div class="rt">
  <div class="cap">MANIFESTO</div>
  <div class="r"><span>01</span><b>先说结论</b></div>
  <div class="r inv"><span>02</span><b>一图一论点</b></div>
  <div class="r"><span>03</span><b>回扣钩子</b></div>
  <div class="ft"><span>№03</span><span>INDEX</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:80px 110px;color:var(--fg);font-family:var(--font-head);overflow:hidden;display:flex;flex-direction:column;}
#${id} .cap{font-family:var(--font-num);font-size:40px;font-weight:700;letter-spacing:0.4em;padding-bottom:26px;}
#${id} .r{flex:1;display:flex;align-items:center;gap:70px;border-top:6px solid var(--fg);}
#${id} .r span{font-family:var(--font-num);font-size:60px;font-weight:700;}
#${id} .r b{font-size:168px;font-weight:900;letter-spacing:-0.04em;line-height:1;white-space:nowrap;}
#${id} .r.inv{background:var(--fg);color:var(--paper);margin:0 -110px;padding:0 110px;}
#${id} .ft{display:flex;justify-content:space-between;border-top:6px solid var(--fg);padding-top:24px;font-family:var(--font-num);font-size:40px;font-weight:700;letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.22},0);\n` +
        `tl.from('#${id} .r:not(.inv)',{x:-200,autoAlpha:0,duration:0.28,stagger:0.16,ease:'power3.out'},0.06);\n` +
        `tl.from('#${id} .r.inv',{x:200,autoAlpha:0,duration:0.28,ease:'power3.out'},0.2);\n` +
        `tl.from('#${id} .ft',{autoAlpha:0,duration:0.24},0.44);`,
    ),
  'chapters': () =>
    mk(
      'bi_sec',
      'chapters',
      (id) => `
<div class="rt">
  <div class="tabs">
    <div class="tab">第Ⅰ幕</div>
    <div class="tab on">第Ⅱ幕</div>
    <div class="tab">第Ⅲ幕</div>
  </div>
  <div class="h">亮出判断</div>
  <div class="side">BIENNALE — ACT Ⅱ</div>
  <div class="ft"><span>№02</span><span>ACT Ⅱ / Ⅲ</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);overflow:hidden;}
#${id} .tabs{position:absolute;left:110px;right:110px;top:70px;display:flex;border:6px solid var(--fg);}
#${id} .tab{flex:1;text-align:center;padding:34px 0;font-size:64px;font-weight:900;letter-spacing:0.06em;border-left:6px solid var(--fg);}
#${id} .tab:first-child{border-left:none;}
#${id} .tab.on{background:var(--fg);color:var(--paper);}
#${id} .h{position:absolute;left:110px;top:400px;font-size:330px;font-weight:900;letter-spacing:-0.04em;line-height:1;}
#${id} .side{position:absolute;right:80px;top:290px;writing-mode:vertical-rl;font-family:var(--font-num);font-size:34px;letter-spacing:0.4em;}
#${id} .ft{position:absolute;left:110px;right:110px;bottom:70px;display:flex;justify-content:space-between;border-top:6px solid var(--fg);padding-top:26px;font-family:var(--font-num);font-size:40px;font-weight:700;letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .tabs',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .tab',{y:-90,autoAlpha:0,duration:0.26,stagger:0.08,ease:'power3.out'},0.06);\n` +
        `tl.from('#${id} .h',{x:-160,autoAlpha:0,duration:0.3,ease:'power3.out'},0.32);\n` +
        `tl.from('#${id} .side,#${id} .ft',{autoAlpha:0,duration:0.26},0.56);`,
    ),
  'quote': () =>
    mk(
      'bi_qte',
      'quote',
      (id) => `
<div class="rt">
  <div class="l1">别追热点</div>
  <div class="l2"><em>做</em>热点</div>
  <div class="side">QUOTE · 摘自口播 02'14"</div>
  <div class="ft"><span>№05</span><span>QUOTE</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);overflow:hidden;}
#${id} .l1{position:absolute;left:110px;top:100px;font-size:290px;font-weight:900;letter-spacing:-0.05em;line-height:1;white-space:nowrap;}
#${id} .l2{position:absolute;left:110px;top:460px;font-size:330px;font-weight:900;letter-spacing:-0.05em;line-height:1;white-space:nowrap;display:flex;align-items:center;gap:30px;}
#${id} .l2 em{font-style:normal;background:var(--fg);color:var(--paper);padding:0 36px 20px;}
#${id} .side{position:absolute;right:80px;top:80px;writing-mode:vertical-rl;font-family:var(--font-num);font-size:34px;letter-spacing:0.4em;}
#${id} .ft{position:absolute;left:110px;right:110px;bottom:70px;display:flex;justify-content:space-between;border-top:6px solid var(--fg);padding-top:26px;font-family:var(--font-num);font-size:40px;font-weight:700;letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .l1',{x:-160,autoAlpha:0,duration:0.28,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .l2',{x:160,autoAlpha:0,duration:0.28,ease:'power3.out'},0.12);\n` +
        `tl.from('#${id} .l2 em',{scale:1.5,autoAlpha:0,duration:0.24,ease:'power3.in'},0.4);\n` +
        `tl.from('#${id} .side,#${id} .ft',{autoAlpha:0,duration:0.26},0.6);`,
    ),
};

/** Cover — list thumbnail: the theme name is the hero (see showcase-blocks.ts). */
export const cover: () => Block = () =>
    mk(
      'cv_bi',
      '封面',
      (id) => `
<div class="rt">
  <div class="h">双年展</div>
  <div class="bar">BIENNALE — PIREEL FRAME — 2026</div>
  <div class="side">POSTER SYSTEM</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;font-family:var(--font-head);color:var(--fg);overflow:hidden;}
#${id} .h{position:absolute;left:60px;top:40px;font-size:520px;font-weight:900;letter-spacing:-0.06em;line-height:1;white-space:nowrap;}
#${id} .bar{position:absolute;left:0;right:0;bottom:150px;background:var(--fg);color:var(--paper);font-family:var(--font-num);font-size:52px;font-weight:700;letter-spacing:0.24em;padding:34px 110px;white-space:nowrap;}
#${id} .side{position:absolute;right:70px;top:80px;writing-mode:vertical-rl;font-family:var(--font-num);font-size:34px;letter-spacing:0.5em;}
</style>`,
      (id) => `tl.from('#${id} .h',{x:-200,autoAlpha:0,duration:0.32,ease:'power3.out'},0);\ntl.from('#${id} .bar',{x:300,autoAlpha:0,duration:0.3,ease:'power3.out'},0.16);\ntl.from('#${id} .side',{autoAlpha:0,duration:0.24},0.36);`,
    );
