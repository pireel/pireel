/**
 * 竞技 Varsity 方言 —— 体育播报包装:一切 skewX(-8deg) 前倾;镂空球衣巨号贴边裁切;
 * 对角危险条纹带;比分对阵板(胜者橙 + 一次脉冲);0.2s power3 对向硬撞入。
 */

import { type Block, mk } from './shared';

const vbRoot = (id: string) => `
#${id} .vb{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);overflow:hidden;}
#${id} .hz{position:absolute;left:-60px;right:-60px;height:56px;background:repeating-linear-gradient(45deg,var(--accent) 0 28px,transparent 28px 56px);}
#${id} .chip{position:absolute;transform:skewX(-8deg);background:var(--accent);color:var(--paper);font-family:var(--font-num);font-size:38px;font-weight:700;letter-spacing:0.2em;padding:20px 48px;}
#${id} .ghost{position:absolute;font-family:var(--font-num);font-weight:900;line-height:0.8;color:var(--paper);-webkit-text-stroke:6px var(--accent-2);transform:skewX(-8deg);z-index:0;}
#${id} .ghost.hot{-webkit-text-stroke:8px var(--accent);}`;

export const cover: () => Block = () =>
  mk(
    'cv_vb',
    '封面',
    (id) => `
<div class="vb">
  <div class="ghost hot" style="right:-90px;bottom:-80px;font-size:720px;">26</div>
  <div class="chip" style="left:170px;top:250px;">VARSITY — FRAME 26</div>
  <div class="slab"><div class="h">竞技</div></div>
  <div class="hz" style="bottom:150px;"></div>
</div>
<style>${vbRoot(id)}
#${id} .slab{position:absolute;left:150px;top:370px;transform:skewX(-8deg);background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);padding:50px 120px;z-index:1;}
#${id} .h{font-size:300px;font-weight:900;letter-spacing:0.04em;line-height:1.1;}
</style>`,
    (id) =>
      `tl.from('#${id} .slab',{x:-220,autoAlpha:0,duration:0.22,ease:'power3.out'},0);\n` +
      `tl.from('#${id} .chip',{x:-90,autoAlpha:0,duration:0.2,ease:'power3.out'},0.16);\n` +
      `tl.from('#${id} .hz',{scaleX:0,transformOrigin:'left center',duration:0.28,ease:'power3.out'},0.24);\n` +
      `tl.from('#${id} .ghost',{autoAlpha:0,x:120,duration:0.28,ease:'power3.out'},0.34);`,
  );

export const blocks: Record<string, () => Block> = {
  标题卡: () =>
    mk(
      'vb_ttl',
      '标题卡',
      (id) => `
<div class="vb">
  <div class="ghost" style="right:-70px;top:-60px;font-size:640px;">01</div>
  <div class="chip" style="left:160px;top:290px;">TRAINING DAY — ROUND 01</div>
  <div class="slab"><div class="h">把配速拉爆</div></div>
  <div class="hz" style="bottom:140px;"></div>
</div>
<style>${vbRoot(id)}
#${id} .vb{background-color:var(--paper);}
#${id} .slab{position:absolute;left:150px;top:420px;transform:skewX(-8deg);background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);padding:60px 110px;z-index:1;}
#${id} .h{font-size:150px;font-weight:900;letter-spacing:-0.02em;line-height:1.1;}
</style>`,
      (id) =>
        `tl.from('#${id} .slab',{x:-220,autoAlpha:0,duration:0.2,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .chip',{x:-90,autoAlpha:0,duration:0.18,ease:'power3.out'},0.14);\n` +
        `tl.from('#${id} .hz',{scaleX:0,transformOrigin:'left center',duration:0.26,ease:'power3.out'},0.22);\n` +
        `tl.from('#${id} .ghost',{autoAlpha:0,x:140,duration:0.26,ease:'power3.out'},0.34);`,
    ),
  大数字: () =>
    mk(
      'vb_num',
      '大数字',
      (id) => `
<div class="vb">
  <div class="hz" style="top:110px;height:32px;"></div>
  <div class="n">98</div>
  <div class="chip" style="left:220px;top:760px;">最大摄氧量 VO₂MAX</div>
  <div class="tile"><b>+12</b><span>THIS WEEK</span></div>
</div>
<style>${vbRoot(id)}
#${id} .vb{background-color:var(--paper);}
#${id} .n{position:absolute;left:130px;top:50%;transform:translateY(-54%) skewX(-8deg);font-family:var(--font-num);font-size:620px;font-weight:900;line-height:1;color:var(--paper);-webkit-text-stroke:8px var(--accent);}
#${id} .tile{position:absolute;right:150px;bottom:150px;transform:skewX(-8deg);background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);padding:44px 80px;display:flex;flex-direction:column;align-items:center;gap:16px;}
#${id} .tile b{font-family:var(--font-num);font-size:140px;font-weight:800;line-height:1;}
#${id} .tile span{font-family:var(--font-num);font-size:36px;font-weight:700;letter-spacing:0.22em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .hz',{scaleX:0,transformOrigin:'left center',duration:0.24,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .n',{x:220,autoAlpha:0,duration:0.22,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .chip',{x:-90,autoAlpha:0,duration:0.2,ease:'power3.out'},0.28);\n` +
        `tl.from('#${id} .tile',{scale:0.6,autoAlpha:0,duration:0.22,ease:'power3.out'},0.4);`,
    ),
  数字变化: () =>
    mk(
      'vb_scr',
      '数字变化',
      (id) => `
<div class="vb">
  <div class="hz" style="top:110px;height:32px;"></div>
  <div class="ghost" style="right:-80px;top:-60px;font-size:600px;">07</div>
  <div class="chip" style="left:160px;top:250px;">NEW PERSONAL BEST</div>
  <div class="fl"><b class="v">145</b><i class="seam2"></i><span>卧推 1RM · KG</span></div>
  <div class="tile"><b>138</b><span>OLD PR</span></div>
</div>
<style>${vbRoot(id)}
#${id} .vb{background-color:var(--paper);}
#${id} .fl{position:absolute;left:150px;top:400px;transform:skewX(-8deg);background:var(--accent);color:var(--paper);border-radius:var(--radius);box-shadow:var(--glow);padding:56px 110px 48px;display:flex;flex-direction:column;align-items:center;gap:26px;z-index:1;}
#${id} .fl b{font-family:var(--font-num);font-size:320px;font-weight:900;line-height:1;}
#${id} .seam2{position:absolute;left:0;right:0;top:216px;height:6px;background:var(--paper);opacity:0.4;}
#${id} .fl span{font-family:var(--font-num);font-size:44px;font-weight:700;letter-spacing:0.22em;}
#${id} .tile{position:absolute;right:150px;bottom:160px;transform:skewX(-8deg);background:var(--panel-2);border-radius:var(--radius);box-shadow:var(--shadow);padding:44px 80px;display:flex;flex-direction:column;align-items:center;gap:16px;color:var(--muted);}
#${id} .tile b{font-family:var(--font-num);font-size:140px;font-weight:800;line-height:1;}
#${id} .tile span{font-family:var(--font-num);font-size:36px;font-weight:700;letter-spacing:0.22em;}
</style>`,
      (id) =>
        `tl.from('#${id} .hz',{scaleX:0,transformOrigin:'left center',duration:0.24,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .fl',{x:-260,autoAlpha:0,duration:0.2,ease:'power3.out'},0.06);\n` +
        `tl.from('#${id} .v',{innerText:138,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .chip',{x:-90,autoAlpha:0,duration:0.18,ease:'power3.out'},0.2);\n` +
        `tl.from('#${id} .tile',{x:260,autoAlpha:0,duration:0.2,ease:'power3.out'},0.3);\n` +
        `tl.from('#${id} .ghost',{autoAlpha:0,x:140,duration:0.26,ease:'power3.out'},0.44);\n` +
        `tl.to('#${id} .fl',{scale:1.04,duration:0.1,yoyo:true,repeat:1},0.98);`,
    ),
  对比: () =>
    mk(
      'vb_cmp',
      '对比',
      (id) => `
<div class="vb">
  <div class="board">
    <div class="sl lose"><span>上月 PACE</span><b>4'58"</b></div>
    <div class="sl win"><span>本月 PACE</span><b>4'32"</b></div>
  </div>
  <div class="seam">VS</div>
  <div class="hz" style="bottom:140px;"></div>
</div>
<style>${vbRoot(id)}
#${id} .vb{background-color:var(--paper);}
#${id} .board{position:absolute;left:140px;right:140px;top:46%;transform:translateY(-50%);display:flex;gap:44px;}
#${id} .sl{flex:1;transform:skewX(-8deg);border-radius:var(--radius);box-shadow:var(--shadow);padding:70px 80px;display:flex;flex-direction:column;align-items:center;gap:34px;}
#${id} .sl span{font-family:var(--font-num);font-size:44px;font-weight:700;letter-spacing:0.22em;}
#${id} .sl b{font-family:var(--font-num);font-size:220px;font-weight:800;line-height:1;}
#${id} .sl.lose{background:var(--panel-2);color:var(--muted);}
#${id} .sl.win{background:var(--accent);color:var(--paper);box-shadow:var(--glow);}
#${id} .seam{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%) skewX(-8deg);background:var(--paper);border:4px solid var(--fg);font-family:var(--font-num);font-size:84px;font-weight:800;padding:18px 40px;z-index:2;}
</style>`,
      (id) =>
        `tl.from('#${id} .lose',{x:-260,autoAlpha:0,duration:0.2,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .win',{x:260,autoAlpha:0,duration:0.2,ease:'power3.out'},0.06);\n` +
        `tl.from('#${id} .seam',{scale:0,duration:0.26,ease:'back.out(1.8)'},0.28);\n` +
        `tl.to('#${id} .win',{scale:1.04,duration:0.1,yoyo:true,repeat:1},0.6);\n` +
        `tl.from('#${id} .hz',{scaleX:0,transformOrigin:'left center',duration:0.24,ease:'power3.out'},0.4);`,
    ),
  走势: () =>
    mk(
      'vb_trd',
      '走势',
      (id) => `
<div class="vb">
  <div class="chip" style="left:160px;top:180px;">PACE TREND — 8 WEEKS</div>
  <div class="board">
    <div class="hz in"></div>
    <svg class="tr" viewBox="0 0 1400 500"><polyline points="40,430 380,370 720,400 1060,220 1360,80"/></svg>
    <div class="jn">98</div>
  </div>
</div>
<style>${vbRoot(id)}
#${id} .vb{background-color:var(--paper);}
#${id} .board{position:absolute;left:160px;right:160px;top:330px;height:560px;transform:skewX(-8deg);background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
#${id} .hz.in{left:0;right:0;bottom:0;}
#${id} .tr{position:absolute;left:60px;top:20px;width:1400px;height:500px;}
#${id} .tr polyline{fill:none;stroke:var(--accent-2);stroke-width:10;stroke-dasharray:1500;stroke-dashoffset:1500;}
#${id} .jn{position:absolute;right:80px;top:40px;font-family:var(--font-num);font-size:220px;font-weight:900;line-height:0.8;color:var(--paper);-webkit-text-stroke:8px var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .board',{x:-220,autoAlpha:0,duration:0.2,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .chip',{x:-90,autoAlpha:0,duration:0.18,ease:'power3.out'},0.12);\n` +
        `tl.from('#${id} .hz',{scaleX:0,transformOrigin:'left center',duration:0.26,ease:'power3.out'},0.2);\n` +
        `tl.to('#${id} .tr polyline',{strokeDashoffset:0,duration:0.3,ease:'power3.out'},0.34);\n` +
        `tl.from('#${id} .jn',{x:120,autoAlpha:0,duration:0.22,ease:'power3.out'},0.6);`,
    ),
  时间线: () =>
    mk(
      'vb_tml',
      '时间线',
      (id) => `
<div class="vb">
  <div class="chip" style="left:160px;top:190px;">SEASON — WK 1-4</div>
  <div class="ghost" style="right:-80px;bottom:-90px;font-size:600px;">03</div>
  <div class="lane">
    <div class="hz sp"></div>
    <div class="wks">
      <div class="wk"><i></i><span>WK 1</span><b>揭幕战</b><em>主场 HOME</em></div>
      <div class="wk"><i></i><span>WK 2</span><b>连客之旅</b><em>客场 AWAY</em></div>
      <div class="wk now"><i></i><span>WK 3</span><b>德比大战</b><em>主场 HOME</em></div>
      <div class="wk"><i></i><span>WK 4</span><b>收官战</b><em>客场 AWAY</em></div>
    </div>
  </div>
</div>
<style>${vbRoot(id)}
#${id} .vb{background-color:var(--paper);}
#${id} .lane{position:absolute;left:150px;right:150px;top:360px;}
#${id} .hz.sp{left:0;right:0;top:0;height:32px;}
#${id} .wks{display:flex;gap:44px;margin-top:96px;}
#${id} .wk{flex:1;position:relative;transform:skewX(-8deg);background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);padding:48px 30px;display:flex;flex-direction:column;align-items:center;gap:22px;}
#${id} .wk i{position:absolute;left:50%;top:-95px;width:30px;height:30px;margin-left:-15px;background:var(--accent-2);}
#${id} .wk span{font-family:var(--font-num);font-size:38px;font-weight:700;letter-spacing:0.22em;color:var(--accent-2);}
#${id} .wk b{font-size:56px;font-weight:900;}
#${id} .wk em{font-style:normal;font-family:var(--font-num);font-size:36px;font-weight:700;letter-spacing:0.18em;color:var(--muted);}
#${id} .wk.now{background:var(--accent);color:var(--paper);box-shadow:var(--glow);}
#${id} .wk.now i{background:var(--accent);}
#${id} .wk.now span,#${id} .wk.now em{color:var(--paper);}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{x:-90,autoAlpha:0,duration:0.18,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .hz',{scaleX:0,transformOrigin:'left center',duration:0.26,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .wk',{x:-220,autoAlpha:0,duration:0.2,stagger:0.1,ease:'power3.out'},0.16);\n` +
        `tl.from('#${id} .wk i',{y:-40,autoAlpha:0,duration:0.16,stagger:0.08,ease:'power3.out'},0.5);\n` +
        `tl.from('#${id} .ghost',{autoAlpha:0,x:140,duration:0.26,ease:'power3.out'},0.7);\n` +
        `tl.to('#${id} .now',{scale:1.04,duration:0.1,yoyo:true,repeat:1},0.95);`,
    ),
  步骤: () =>
    mk(
      'vb_stp',
      '步骤',
      (id) => `
<div class="vb">
  <div class="chip" style="left:160px;top:200px;">TRAINING PLAN — LEG DAY</div>
  <div class="row">
    <div class="sl win"><span>SET 1</span><b>深蹲</b><em>12 REPS</em></div>
    <div class="sl"><span>SET 2</span><b>箭步蹲</b><em>10 REPS</em></div>
    <div class="sl"><span>SET 3</span><b>硬拉</b><em>8 REPS</em></div>
  </div>
  <div class="hz" style="bottom:150px;"></div>
</div>
<style>${vbRoot(id)}
#${id} .vb{background-color:var(--paper);}
#${id} .row{position:absolute;left:150px;right:150px;top:52%;transform:translateY(-50%);display:flex;gap:48px;}
#${id} .sl{flex:1;transform:skewX(-8deg);background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);padding:64px 40px;display:flex;flex-direction:column;align-items:center;gap:28px;}
#${id} .sl span{font-family:var(--font-num);font-size:40px;font-weight:700;letter-spacing:0.22em;color:var(--accent-2);}
#${id} .sl b{font-size:96px;font-weight:900;}
#${id} .sl em{font-style:normal;font-family:var(--font-num);font-size:44px;font-weight:700;letter-spacing:0.18em;color:var(--muted);}
#${id} .sl.win{background:var(--accent);color:var(--paper);box-shadow:var(--glow);}
#${id} .sl.win span,#${id} .sl.win em{color:var(--paper);}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{x:-90,autoAlpha:0,duration:0.18,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .sl',{x:-220,autoAlpha:0,duration:0.2,stagger:0.1,ease:'power3.out'},0.1);\n` +
        `tl.to('#${id} .win',{scale:1.04,duration:0.1,yoyo:true,repeat:1},0.56);\n` +
        `tl.from('#${id} .hz',{scaleX:0,transformOrigin:'left center',duration:0.24,ease:'power3.out'},0.5);`,
    ),
  引导: () =>
    mk(
      'vb_cta',
      '引导',
      (id) => `
<div class="vb">
  <div class="ghost" style="right:-90px;bottom:-90px;font-size:640px;">10</div>
  <div class="chip" style="left:160px;top:270px;">JOIN THE SQUAD</div>
  <div class="fol">+ FOLLOW</div>
  <div class="hz" style="bottom:150px;"></div>
</div>
<style>${vbRoot(id)}
#${id} .vb{background-color:var(--paper);}
#${id} .fol{position:absolute;left:150px;top:410px;transform:skewX(-8deg);background:var(--accent);color:var(--paper);font-family:var(--font-num);font-size:180px;font-weight:900;letter-spacing:0.04em;padding:60px 110px;border-radius:var(--radius);box-shadow:var(--glow);z-index:1;}
</style>`,
      (id) =>
        `tl.from('#${id} .fol',{x:-260,autoAlpha:0,duration:0.2,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .chip',{x:-90,autoAlpha:0,duration:0.18,ease:'power3.out'},0.14);\n` +
        `tl.to('#${id} .fol',{scale:1.04,duration:0.1,yoyo:true,repeat:1},0.4);\n` +
        `tl.from('#${id} .hz',{scaleX:0,transformOrigin:'left center',duration:0.26,ease:'power3.out'},0.3);\n` +
        `tl.from('#${id} .ghost',{autoAlpha:0,x:140,duration:0.26,ease:'power3.out'},0.42);`,
    ),
};
