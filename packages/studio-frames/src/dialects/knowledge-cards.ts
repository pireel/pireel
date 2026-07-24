/* ================================================================
   Blueprint — engineering-drawing dialect: grid ground, wireframes, dimension marks, title block
   ================================================================ */

import { type Block, mk } from './shared';

const bpRoot = (id: string) => `
#${id} .bp{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);
  background-color:var(--paper);/* 页面底:纸色垫在网格纹之下 */
  background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);
  background-size:96px 96px;}
#${id} .frame{position:absolute;inset:56px;border:2px solid var(--line);}
#${id} .dwg{position:absolute;right:80px;bottom:80px;border:2px solid var(--line);display:flex;font-family:var(--font-num);font-size:28px;color:var(--muted);}
#${id} .dwg span{padding:16px 28px;border-left:2px solid var(--line);}
#${id} .dwg span:first-child{border-left:none;color:var(--accent);}`;

export const blocks: Record<string, () => Block> = {
  'title-card': () =>
    mk(
      'bp_ttl',
      'title-card',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="body">
    <div class="k">FIG.01 — OPENING</div>
    <div class="h">把观点讲成画面</div>
    <div class="dim"><i></i><b>1920</b><i></i></div>
  </div>
  <div class="dwg"><span>DWG-01</span><span>SCALE 1:1</span><span>REV A</span></div>
</div>
<style>${bpRoot(id)}
#${id} .body{position:absolute;left:150px;top:230px;right:150px;display:flex;flex-direction:column;gap:52px;}
#${id} .k{font-family:var(--font-num);font-size:36px;letter-spacing:0.34em;color:var(--accent);}
#${id} .h{font-size:158px;font-weight:900;letter-spacing:-0.02em;}
#${id} .dim{display:flex;align-items:center;gap:20px;color:var(--muted);}
#${id} .dim i{flex:1;height:0;border-top:2px dashed var(--line);position:relative;}
#${id} .dim i::before,#${id} .dim i::after{content:'';position:absolute;top:-9px;width:2px;height:20px;background:var(--line);}
#${id} .dim i::before{left:0}#${id} .dim i::after{right:0}
#${id} .dim b{font-family:var(--font-num);font-size:34px;font-weight:500;}
</style>`,
      (id) =>
        `tl.from('#${id} .frame',{autoAlpha:0,duration:0.3},0);\n` +
        `tl.from('#${id} .k',{x:-30,autoAlpha:0,duration:0.25},0.1);\n` +
        `tl.from('#${id} .h',{y:46,autoAlpha:0,duration:0.34,ease:'power3.out'},0.18);\n` +
        `tl.from('#${id} .dim,#${id} .dwg',{autoAlpha:0,duration:0.3},0.42);`,
    ),
  'big-number': () =>
    mk(
      'bp_num',
      'big-number',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="v">38<i>%</i></div>
  <div class="lead"><span class="dot"></span><span class="ln"></span><span class="note">本月转化增长<br/>MEASURED · Q2</span></div>
  <div class="dwg"><span>DATA</span><span>±0.5</span></div>
</div>
<style>${bpRoot(id)}
#${id} .v{position:absolute;left:150px;top:50%;transform:translateY(-54%);font-family:var(--font-num);font-size:560px;font-weight:700;line-height:1;letter-spacing:-0.05em;
  color:transparent;-webkit-text-stroke:6px var(--accent);}
#${id} .v i{font-style:normal;font-size:260px;-webkit-text-stroke:4px var(--fg);}
#${id} .lead{position:absolute;right:150px;top:250px;display:flex;align-items:flex-start;gap:0;}
#${id} .dot{width:16px;height:16px;border-radius:999px;background:var(--accent);margin-top:8px;}
#${id} .ln{width:170px;height:2px;background:var(--line);margin-top:15px;}
#${id} .note{padding-left:26px;font-size:40px;line-height:1.5;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .frame',{autoAlpha:0,duration:0.3},0);\n` +
        `tl.from('#${id} .v',{autoAlpha:0,x:-60,duration:0.4,ease:'power3.out'},0.1);\n` +
        `tl.from('#${id} .ln',{scaleX:0,transformOrigin:'left center',duration:0.3},0.4);\n` +
        `tl.from('#${id} .note,#${id} .dot',{autoAlpha:0,duration:0.25},0.55);`,
    ),
  'count-up': () =>
    mk(
      'bp_cnt',
      'count-up',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="k">FIG.04 — LIVE COUNT</div>
  <div class="big"><b class="v">365</b><i class="u">天</i></div>
  <div class="dim"><i></i><b>TOL ±0</b><i></i></div>
  <div class="lead"><span class="dot"></span><span class="ln"></span><span class="note">连续日更实测<br/>NO GAPS · VERIFIED</span></div>
  <div class="dwg"><span>CNT-04</span><span>TOL ±0</span><span>REV A</span></div>
</div>
<style>${bpRoot(id)}
#${id} .k{position:absolute;left:150px;top:150px;font-family:var(--font-num);font-size:36px;letter-spacing:0.34em;color:var(--accent);}
#${id} .big{position:absolute;left:150px;top:50%;transform:translateY(-58%);display:flex;align-items:baseline;gap:36px;font-family:var(--font-num);}
#${id} .v{font-size:520px;font-weight:700;line-height:1;letter-spacing:-0.04em;color:transparent;-webkit-text-stroke:6px var(--accent);}
#${id} .u{font-style:normal;font-size:200px;font-weight:700;color:transparent;-webkit-text-stroke:4px var(--fg);}
#${id} .dim{position:absolute;left:150px;right:150px;bottom:200px;display:flex;align-items:center;gap:20px;color:var(--muted);}
#${id} .dim i{flex:1;height:0;border-top:2px dashed var(--line);position:relative;}
#${id} .dim i::before,#${id} .dim i::after{content:'';position:absolute;top:-9px;width:2px;height:20px;background:var(--line);}
#${id} .dim i::before{left:0}#${id} .dim i::after{right:0}
#${id} .dim b{font-family:var(--font-num);font-size:32px;font-weight:500;letter-spacing:0.2em;}
#${id} .lead{position:absolute;right:150px;top:250px;display:flex;align-items:flex-start;gap:0;}
#${id} .dot{width:16px;height:16px;border-radius:999px;background:var(--accent);margin-top:8px;}
#${id} .ln{width:170px;height:2px;background:var(--line);margin-top:15px;}
#${id} .note{padding-left:26px;font-size:40px;line-height:1.5;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .frame,#${id} .k',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .big',{x:-60,autoAlpha:0,duration:0.36,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .v',{innerText:0,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .dim',{scaleX:0.6,autoAlpha:0,transformOrigin:'center',duration:0.3},0.4);\n` +
        `tl.from('#${id} .ln',{scaleX:0,transformOrigin:'left center',duration:0.26},0.5);\n` +
        `tl.from('#${id} .dot,#${id} .note,#${id} .dwg',{autoAlpha:0,duration:0.25},0.6);`,
    ),
  'chart': () =>
    mk(
      'bp_bar',
      'chart',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="h">季度增速 <span>FIG.03</span></div>
  <div class="plot">
    <div class="b" style="height:170px"></div><div class="b" style="height:300px"></div><div class="b" style="height:230px"></div><div class="b hot" style="height:470px"><em>×4.2</em></div>
  </div>
</div>
<style>${bpRoot(id)}
#${id} .h{position:absolute;left:150px;top:150px;font-size:78px;font-weight:800;display:flex;align-items:baseline;gap:36px;}
#${id} .h span{font-family:var(--font-num);font-size:34px;letter-spacing:0.3em;color:var(--accent);}
#${id} .plot{position:absolute;left:150px;right:150px;bottom:170px;display:flex;align-items:flex-end;gap:110px;border-bottom:3px solid var(--fg);padding:0 70px;}
#${id} .b{position:relative;width:160px;border:3px solid var(--fg);border-bottom:none;}
#${id} .b.hot{background:repeating-linear-gradient(45deg,var(--accent) 0 10px,transparent 10px 24px);border-color:var(--accent);}
#${id} .b em{position:absolute;top:-72px;left:50%;transform:translateX(-50%);font-style:normal;font-family:var(--font-num);font-size:50px;font-weight:700;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .frame,#${id} .h',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .b',{scaleY:0,transformOrigin:'bottom',duration:0.38,stagger:0.1,ease:'power3.out'},0.15);\n` +
        `tl.from('#${id} .b em',{autoAlpha:0,duration:0.22},0.7);`,
    ),
  'trend': () =>
    mk(
      'bp_trd',
      'trend',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="h">增长轨迹 <span>PROJECTED</span></div>
  <svg viewBox="0 0 1620 560" class="tr">
    <polyline class="ln" points="30,470 420,390 810,420 1180,180"/>
    <polyline class="proj" points="1180,180 1560,60"/>
    <g class="nd"><circle cx="30" cy="470" r="10"/><circle cx="420" cy="390" r="10"/><circle cx="810" cy="420" r="10"/><circle cx="1180" cy="180" r="14"/></g>
  </svg>
</div>
<style>${bpRoot(id)}
#${id} .h{position:absolute;left:150px;top:150px;font-size:78px;font-weight:800;display:flex;align-items:baseline;gap:36px;}
#${id} .h span{font-family:var(--font-num);font-size:34px;letter-spacing:0.3em;color:var(--muted);}
#${id} .tr{position:absolute;left:150px;right:150px;bottom:130px;width:1620px;height:560px;}
#${id} .ln{fill:none;stroke:var(--accent);stroke-width:8;stroke-dasharray:2200;stroke-dashoffset:2200;}
#${id} .proj{fill:none;stroke:var(--muted);stroke-width:6;stroke-dasharray:26 22;}
#${id} .nd circle{fill:var(--paper);stroke:var(--accent);stroke-width:6;}
</style>`,
      (id) =>
        `tl.from('#${id} .frame,#${id} .h',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.to('#${id} .ln',{strokeDashoffset:0,duration:0.7,ease:'power2.inOut'},0.15);\n` +
        `tl.from('#${id} .proj',{autoAlpha:0,duration:0.4},0.8);\n` +
        `tl.from('#${id} .nd circle',{scale:0,transformOrigin:'center',duration:0.2,stagger:0.08},0.3);`,
    ),
  'list': () =>
    mk(
      'bp_lst',
      'list',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="tbl">
    <div class="cap">SPEC — 三个要点</div>
    <div class="r"><span>01</span><b>先说结论,再给理由</b><i>PASS</i></div>
    <div class="r"><span>02</span><b>每个论点配一张图</b><i>PASS</i></div>
    <div class="r"><span>03</span><b>结尾回扣开场钩子</b><i>HOLD</i></div>
  </div>
</div>
<style>${bpRoot(id)}
#${id} .tbl{position:absolute;left:150px;right:150px;top:50%;transform:translateY(-50%);border:3px solid var(--fg);}
#${id} .cap{padding:30px 44px;border-bottom:3px solid var(--fg);font-family:var(--font-num);font-size:38px;letter-spacing:0.24em;color:var(--accent);}
#${id} .r{display:flex;align-items:center;gap:48px;padding:38px 44px;border-bottom:2px solid var(--line);font-size:56px;}
#${id} .r:last-child{border-bottom:none;}
#${id} .r span{font-family:var(--font-num);font-size:42px;color:var(--muted);}
#${id} .r b{font-weight:600;flex:1;}
#${id} .r i{font-style:normal;font-family:var(--font-num);font-size:32px;letter-spacing:0.2em;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .frame',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .tbl',{y:40,autoAlpha:0,duration:0.3,ease:'power2.out'},0.1);\n` +
        `tl.from('#${id} .r',{autoAlpha:0,duration:0.22,stagger:0.1},0.3);`,
    ),
  'chapters': () =>
    mk(
      'bp_sec',
      'chapters',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="tabs">
    <div class="tab"><span>SEC.01</span><b>开场</b></div>
    <div class="tab on"><i class="fill"></i><span>SEC.02</span><b>方法</b></div>
    <div class="tab"><span>SEC.03</span><b>实操</b></div>
  </div>
  <div class="cur">
    <div class="ck">CURRENT SECTION</div>
    <div class="h">先框架,后细节</div>
    <div class="dim"><i></i><b>2 / 3</b><i></i></div>
  </div>
  <div class="dwg"><span>SEC-02</span><span>SHEET 2/3</span><span>REV A</span></div>
</div>
<style>${bpRoot(id)}
#${id} .tabs{position:absolute;left:150px;right:150px;top:150px;display:flex;gap:40px;}
#${id} .tab{position:relative;flex:1;border:2px solid var(--line);padding:34px 44px;display:flex;align-items:baseline;gap:30px;overflow:hidden;}
#${id} .tab span{position:relative;font-family:var(--font-num);font-size:32px;letter-spacing:0.2em;color:var(--muted);}
#${id} .tab b{position:relative;font-size:46px;font-weight:700;color:var(--muted);}
#${id} .tab.on{border:3px solid var(--accent);}
#${id} .tab.on span{color:var(--accent);}
#${id} .tab.on b{color:var(--fg);}
#${id} .fill{position:absolute;inset:0;background:repeating-linear-gradient(45deg,var(--accent) 0 10px,transparent 10px 24px);opacity:0.25;}
#${id} .cur{position:absolute;left:150px;right:150px;top:46%;display:flex;flex-direction:column;gap:56px;}
#${id} .ck{font-family:var(--font-num);font-size:34px;letter-spacing:0.3em;color:var(--muted);}
#${id} .h{font-size:150px;font-weight:900;letter-spacing:-0.02em;}
#${id} .dim{display:flex;align-items:center;gap:20px;color:var(--muted);}
#${id} .dim i{flex:1;height:0;border-top:2px dashed var(--line);position:relative;}
#${id} .dim i::before,#${id} .dim i::after{content:'';position:absolute;top:-9px;width:2px;height:20px;background:var(--line);}
#${id} .dim i::before{left:0}#${id} .dim i::after{right:0}
#${id} .dim b{font-family:var(--font-num);font-size:32px;font-weight:500;letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .frame',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .tab',{y:-30,autoAlpha:0,duration:0.26,stagger:0.08},0.08);\n` +
        `tl.from('#${id} .fill',{scaleX:0,transformOrigin:'left center',duration:0.34,ease:'power2.out'},0.34);\n` +
        `tl.from('#${id} .ck',{x:-30,autoAlpha:0,duration:0.24},0.4);\n` +
        `tl.from('#${id} .h',{y:46,autoAlpha:0,duration:0.34,ease:'power3.out'},0.48);\n` +
        `tl.from('#${id} .dim,#${id} .dwg',{autoAlpha:0,duration:0.28},0.72);`,
    ),
  'code': () =>
    mk(
      'bp_cod',
      'code',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="win">
    <div class="cap"><span>SRC — hook.js</span><span>UTF-8</span></div>
    <div class="r"><span>01</span><em class="cm">// 开场 3 秒,留人或劝退</em></div>
    <div class="r"><span>02</span><em><b>const</b> hook = boldClaim()</em></div>
    <div class="r hl"><i class="hf"></i><span>03</span><em>video.<b>open</b>(hook, { maxSec: 3 })</em></div>
    <div class="r"><span>04</span><em>caption.<b>set</b>('看到最后有彩蛋')</em></div>
  </div>
  <div class="lead"><span class="dot"></span><span class="lw"></span><span class="note">完播率在这一行定生死<br/>L03 · CRITICAL</span></div>
  <div class="dwg"><span>SRC-03</span><span>REV B</span></div>
</div>
<style>${bpRoot(id)}
#${id} .win{position:absolute;left:150px;top:50%;transform:translateY(-52%);width:1000px;border:3px solid var(--fg);}
#${id} .cap{display:flex;justify-content:space-between;padding:28px 40px;border-bottom:3px solid var(--fg);font-family:var(--font-num);font-size:34px;letter-spacing:0.2em;}
#${id} .cap span:first-child{color:var(--accent);}
#${id} .cap span:last-child{color:var(--muted);}
#${id} .r{position:relative;display:flex;align-items:baseline;gap:34px;padding:30px 40px;border-bottom:2px solid var(--line);font-family:var(--font-num);font-size:42px;}
#${id} .r:last-child{border-bottom:none;}
#${id} .r span{position:relative;font-size:32px;color:var(--muted);}
#${id} .r em{position:relative;font-style:normal;letter-spacing:0.02em;}
#${id} .r em b{color:var(--accent);font-weight:700;}
#${id} .cm{color:var(--muted);}
#${id} .r.hl{outline:3px solid var(--accent);outline-offset:-3px;}
#${id} .hf{position:absolute;inset:0;background:repeating-linear-gradient(45deg,var(--accent) 0 10px,transparent 10px 24px);opacity:0.18;}
#${id} .lead{position:absolute;left:1210px;top:614px;display:flex;align-items:flex-start;}
#${id} .dot{width:16px;height:16px;border-radius:999px;background:var(--accent);margin-top:8px;}
#${id} .lw{width:120px;height:2px;background:var(--line);margin-top:15px;}
#${id} .note{padding-left:26px;font-family:var(--font-num);font-size:30px;line-height:1.6;color:var(--muted);letter-spacing:0.08em;}
</style>`,
      (id) =>
        `tl.from('#${id} .frame',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .win',{y:40,autoAlpha:0,duration:0.3,ease:'power2.out'},0.08);\n` +
        `tl.from('#${id} .r',{autoAlpha:0,duration:0.2,stagger:0.08},0.24);\n` +
        `tl.from('#${id} .hf',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.out'},0.6);\n` +
        `tl.from('#${id} .lw',{scaleX:0,transformOrigin:'left center',duration:0.26},0.72);\n` +
        `tl.from('#${id} .dot,#${id} .note,#${id} .dwg',{autoAlpha:0,duration:0.25},0.85);`,
    ),
  'quote': () =>
    mk(
      'bp_qte',
      'quote',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="body">
    <div class="dim"><i></i><b>SPEC — QUOTE</b><i></i></div>
    <div class="t">结构,是给观众的礼貌</div>
    <div class="dim"><i></i><b>VERIFIED</b><i></i></div>
    <div class="lead"><span class="dot"></span><span class="ln"></span><span class="note">SOURCE: 口播 02'14"</span></div>
  </div>
  <div class="dwg"><span>QTE-05</span><span>REV A</span></div>
</div>
<style>${bpRoot(id)}
#${id} .body{position:absolute;left:150px;right:150px;top:50%;transform:translateY(-54%);display:flex;flex-direction:column;gap:56px;}
#${id} .dim{display:flex;align-items:center;gap:22px;color:var(--muted);}
#${id} .dim i{flex:1;height:0;border-top:2px dashed var(--line);position:relative;}
#${id} .dim i::before,#${id} .dim i::after{content:'';position:absolute;top:-9px;width:2px;height:20px;background:var(--line);}
#${id} .dim i::before{left:0}#${id} .dim i::after{right:0}
#${id} .dim b{font-family:var(--font-num);font-size:32px;font-weight:500;letter-spacing:0.3em;color:var(--accent);}
#${id} .t{font-size:120px;font-weight:800;letter-spacing:-0.01em;text-align:center;}
#${id} .lead{display:flex;align-items:flex-start;justify-content:flex-end;margin-top:6px;}
#${id} .dot{width:16px;height:16px;border-radius:999px;background:var(--accent);margin-top:8px;}
#${id} .ln{width:170px;height:2px;background:var(--line);margin-top:15px;}
#${id} .note{padding-left:26px;font-family:var(--font-num);font-size:34px;line-height:1.5;color:var(--muted);letter-spacing:0.12em;}
</style>`,
      (id) =>
        `tl.from('#${id} .frame',{autoAlpha:0,duration:0.3},0);\n` +
        `tl.from('#${id} .dim',{scaleX:0.6,autoAlpha:0,transformOrigin:'center',duration:0.3},0.1);\n` +
        `tl.from('#${id} .t',{y:40,autoAlpha:0,duration:0.34,ease:'power3.out'},0.22);\n` +
        `tl.from('#${id} .ln',{scaleX:0,transformOrigin:'left center',duration:0.26},0.5);\n` +
        `tl.from('#${id} .dot,#${id} .note,#${id} .dwg',{autoAlpha:0,duration:0.25},0.62);`,
    ),
  'qa': () =>
    mk(
      'bp_qa',
      'qa',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="q"><span class="dot"></span><span class="lw"></span><span class="tag">FIG.Q1</span><span class="qt">为什么你的视频没人看完?</span></div>
  <div class="ans">
    <div class="cap">ANSWER — VERIFIED</div>
    <div class="a">不是内容差,是结构乱</div>
  </div>
  <div class="dwg"><span>QA-01</span><span>FIG.Q1</span><span>REV A</span></div>
</div>
<style>${bpRoot(id)}
#${id} .q{position:absolute;left:150px;top:230px;display:flex;align-items:center;}
#${id} .dot{width:16px;height:16px;border-radius:999px;background:var(--accent);flex:none;}
#${id} .lw{width:140px;height:2px;background:var(--line);flex:none;}
#${id} .tag{font-family:var(--font-num);font-size:34px;letter-spacing:0.24em;color:var(--accent);padding:0 34px 0 26px;flex:none;}
#${id} .qt{font-size:56px;font-weight:600;}
#${id} .ans{position:absolute;left:150px;right:150px;top:42%;border:3px solid var(--fg);}
#${id} .cap{padding:28px 44px;border-bottom:3px solid var(--fg);font-family:var(--font-num);font-size:34px;letter-spacing:0.24em;color:var(--accent);}
#${id} .a{padding:96px 60px;font-size:110px;font-weight:800;letter-spacing:-0.01em;text-align:center;}
</style>`,
      (id) =>
        `tl.from('#${id} .frame',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .dot',{scale:0,duration:0.2},0.08);\n` +
        `tl.from('#${id} .lw',{scaleX:0,transformOrigin:'left center',duration:0.26},0.12);\n` +
        `tl.from('#${id} .tag,#${id} .qt',{x:-24,autoAlpha:0,duration:0.26},0.3);\n` +
        `tl.from('#${id} .ans',{autoAlpha:0,duration:0.26},0.55);\n` +
        `tl.from('#${id} .a',{y:40,autoAlpha:0,duration:0.32,ease:'power3.out'},0.68);\n` +
        `tl.from('#${id} .dwg',{autoAlpha:0,duration:0.24},0.9);`,
    ),
  'cta': () =>
    mk(
      'bp_cta',
      'cta',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="k">FIG.06 — CALL TO ACTION</div>
  <div class="wrap">
    <div class="btn"><i class="fill"></i><b>关注</b></div>
    <i class="x xtl">+</i><i class="x xbr">+</i>
    <div class="w"><i></i><b>W 640</b><i></i></div>
    <div class="hd"><i></i><b>H 220</b><i></i></div>
  </div>
  <div class="note">PRESS TO FOLLOW · NEXT EPISODE</div>
  <div class="dwg"><span>CTA-01</span><span>SCALE 1:1</span></div>
</div>
<style>${bpRoot(id)}
#${id} .k{position:absolute;left:150px;top:150px;font-family:var(--font-num);font-size:36px;letter-spacing:0.34em;color:var(--accent);}
#${id} .wrap{position:absolute;left:50%;top:50%;transform:translate(-50%,-56%);width:640px;height:220px;}
#${id} .btn{position:absolute;inset:0;border:3px solid var(--accent);display:flex;align-items:center;justify-content:center;overflow:hidden;}
#${id} .fill{position:absolute;inset:0;background:repeating-linear-gradient(45deg,var(--accent) 0 10px,transparent 10px 24px);opacity:0.3;}
#${id} .btn b{position:relative;font-size:84px;font-weight:800;letter-spacing:0.24em;padding-left:0.24em;}
#${id} .x{position:absolute;font-style:normal;font-family:var(--font-num);font-size:52px;color:var(--accent);line-height:1;}
#${id} .x.xtl{left:-72px;top:-66px;}
#${id} .x.xbr{right:-72px;bottom:-66px;}
#${id} .w{position:absolute;left:0;right:0;top:calc(100% + 44px);display:flex;align-items:center;gap:20px;color:var(--muted);}
#${id} .w i{flex:1;height:0;border-top:2px dashed var(--line);position:relative;}
#${id} .w i::before,#${id} .w i::after{content:'';position:absolute;top:-9px;width:2px;height:20px;background:var(--line);}
#${id} .w i::before{left:0}#${id} .w i::after{right:0}
#${id} .w b,#${id} .hd b{font-family:var(--font-num);font-size:30px;font-weight:500;letter-spacing:0.14em;}
#${id} .hd{position:absolute;left:calc(100% + 44px);top:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:16px;color:var(--muted);}
#${id} .hd i{width:0;flex:1;border-left:2px dashed var(--line);position:relative;}
#${id} .hd i::before,#${id} .hd i::after{content:'';position:absolute;left:-9px;width:20px;height:2px;background:var(--line);}
#${id} .hd i::before{top:0}#${id} .hd i::after{bottom:0}
#${id} .note{position:absolute;left:50%;bottom:210px;transform:translateX(-50%);font-family:var(--font-num);font-size:34px;letter-spacing:0.26em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .frame,#${id} .k',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .btn',{autoAlpha:0,duration:0.26},0.12);\n` +
        `tl.from('#${id} .fill',{scaleX:0,transformOrigin:'left center',duration:0.4,ease:'power2.out'},0.26);\n` +
        `tl.from('#${id} .x',{scale:0,autoAlpha:0,duration:0.22,stagger:0.08},0.4);\n` +
        `tl.from('#${id} .w,#${id} .hd',{autoAlpha:0,duration:0.26},0.52);\n` +
        `tl.from('#${id} .note,#${id} .dwg',{autoAlpha:0,duration:0.26},0.66);`,
    ),
};

/** Cover — list thumbnail: the theme name is the hero (see showcase-blocks.ts). */
export const cover: () => Block = () =>
    mk(
      'cv_bp',
      '封面',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="c"><div class="k">FRAME · BLUEPRINT</div><div class="h">蓝图</div><div class="dim"><i></i><b>1920 × 1080</b><i></i></div></div>
  <div class="dwg"><span>DWG-00</span><span>COVER</span></div>
</div>
<style>${bpRoot(id)}
#${id} .c{position:absolute;left:150px;right:150px;top:50%;transform:translateY(-52%);display:flex;flex-direction:column;gap:56px;}
#${id} .k{font-family:var(--font-num);font-size:40px;letter-spacing:0.4em;color:var(--accent);}
#${id} .h{font-size:300px;font-weight:900;letter-spacing:0.06em;line-height:1;}
#${id} .dim{display:flex;align-items:center;gap:22px;color:var(--muted);max-width:900px;}
#${id} .dim i{flex:1;height:0;border-top:2px dashed var(--line);}
#${id} .dim b{font-family:var(--font-num);font-size:36px;font-weight:500;}
</style>`,
      (id) => `tl.from('#${id} .c',{autoAlpha:0,y:40,duration:0.3},0);`,
    );
