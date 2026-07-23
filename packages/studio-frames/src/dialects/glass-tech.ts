/**
 * Glass — frosted-glass tech dialect: dark base with two glow orbs lighting first,
 * glass panes floating over them offset. Main card off-axis + mini card in the corner,
 * top-edge highlight reads as a lit bevel; mono data glows ice-blue.
 */

import { type Block, mk } from './shared';

/* Shared base for orbs + glass panes: orbs always sit at the bottom, glass floats on the light */
const glassRoot = (id: string) => `
#${id} .rt{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);overflow:hidden;}
#${id} .orb{position:absolute;border-radius:999px;filter:blur(90px);opacity:0.5;}
#${id} .o1{width:820px;height:820px;left:-180px;top:-240px;background:var(--accent);}
#${id} .o2{width:720px;height:720px;right:-160px;bottom:-280px;background:var(--accent-2);}
#${id} .gc{position:absolute;background:var(--panel);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);border:1px solid var(--line);border-top-color:var(--muted);border-radius:var(--radius);box-shadow:var(--shadow);}
#${id} .chip{display:inline-flex;align-items:center;gap:18px;padding:16px 36px;border-radius:999px;background:var(--panel-2);border:1px solid var(--line);font-size:32px;color:var(--muted);letter-spacing:0.1em;}
#${id} .chip i{width:14px;height:14px;border-radius:999px;background:var(--accent);box-shadow:var(--glow);}`;

export const cover: () => Block = () =>
  mk(
    'cv_gl',
    '封面',
    (id) => `
<div class="rt">
  <div class="orb o1"></div><div class="orb o2"></div>
  <div class="gc main">
    <div class="chip"><i></i>GLASS · FROSTED TECH</div>
    <div class="h">玻璃</div>
  </div>
  <div class="gc mini"><b>BLUR 30</b><span>panes over light</span></div>
</div>
<style>${glassRoot(id)}
#${id} .main{left:250px;top:210px;width:1180px;padding:90px 110px;display:flex;flex-direction:column;gap:56px;}
#${id} .h{font-size:300px;font-weight:900;line-height:1;letter-spacing:0.02em;}
#${id} .mini{right:270px;bottom:190px;padding:52px 70px;display:flex;flex-direction:column;gap:18px;z-index:2;}
#${id} .mini b{font-family:var(--font-num);font-size:64px;font-weight:700;color:var(--accent);text-shadow:var(--glow);}
#${id} .mini span{font-size:30px;color:var(--muted);letter-spacing:0.22em;text-transform:uppercase;}
</style>`,
    (id) =>
      `tl.from('#${id} .orb',{autoAlpha:0,scale:0.7,duration:0.5,stagger:0.1},0);\n` +
      `tl.from('#${id} .main',{y:60,autoAlpha:0,duration:0.45,ease:'power2.out'},0.2);\n` +
      `tl.from('#${id} .chip i',{scale:0,duration:0.25,ease:'back.out(2)'},0.5);\n` +
      `tl.from('#${id} .mini',{y:80,autoAlpha:0,duration:0.4,ease:'power2.out'},0.45);`,
  );

export const blocks: Record<string, () => Block> = {
  'title-card': () =>
    mk(
      'gl_ttl',
      'title-card',
      (id) => `
<div class="rt">
  <div class="orb o1"></div><div class="orb o2"></div>
  <div class="gc main">
    <div class="chip"><i></i>新品实测 · HANDS-ON</div>
    <div class="h">这块芯片,<br/>凭什么贵一倍</div>
    <div class="s">三项极限测试,一次讲清</div>
  </div>
  <div class="gc mini"><b>3nm</b><span>128GB UNIFIED</span></div>
</div>
<style>${glassRoot(id)}
#${id} .rt{background-color:var(--paper);}
#${id} .main{left:170px;top:170px;width:1220px;padding:80px 100px;display:flex;flex-direction:column;gap:50px;}
#${id} .h{font-size:128px;font-weight:900;line-height:1.16;letter-spacing:-0.01em;}
#${id} .s{font-size:40px;color:var(--muted);}
#${id} .mini{right:180px;bottom:170px;padding:48px 66px;display:flex;flex-direction:column;gap:16px;z-index:2;}
#${id} .mini b{font-family:var(--font-num);font-size:96px;font-weight:700;color:var(--accent);text-shadow:var(--glow);line-height:1;}
#${id} .mini span{font-size:30px;color:var(--muted);letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .orb',{autoAlpha:0,scale:0.7,duration:0.5,stagger:0.1},0);\n` +
        `tl.from('#${id} .main',{y:60,autoAlpha:0,duration:0.45,ease:'power2.out'},0.18);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,y:24,duration:0.35},0.4);\n` +
        `tl.from('#${id} .chip i',{scale:0,duration:0.25,ease:'back.out(2)'},0.5);\n` +
        `tl.from('#${id} .mini',{y:80,autoAlpha:0,duration:0.4,ease:'power2.out'},0.5);`,
    ),
  'big-number': () =>
    mk(
      'gl_num',
      'big-number',
      (id) => `
<div class="rt">
  <div class="orb o1"></div><div class="orb o2"></div>
  <div class="gc main">
    <div class="v">89<i>%</i></div>
    <div class="s">重度使用一整天,电量仍剩近九成</div>
  </div>
  <div class="gc mini"><div class="chip"><i></i>BENCHMARK · REAL WORLD</div></div>
</div>
<style>${glassRoot(id)}
#${id} .rt{background-color:var(--paper);}
#${id} .main{left:190px;top:250px;width:1240px;padding:90px 110px 100px;display:flex;flex-direction:column;gap:40px;}
#${id} .v{font-family:var(--font-num);font-size:330px;font-weight:800;line-height:1;letter-spacing:-0.04em;color:var(--accent);text-shadow:var(--glow);}
#${id} .v i{font-style:normal;font-size:160px;color:var(--fg);text-shadow:none;}
#${id} .s{font-size:42px;color:var(--muted);}
#${id} .mini{right:170px;top:180px;padding:36px 44px;z-index:2;}
</style>`,
      (id) =>
        `tl.from('#${id} .orb',{autoAlpha:0,scale:0.7,duration:0.5,stagger:0.1},0);\n` +
        `tl.from('#${id} .main',{y:60,autoAlpha:0,duration:0.45,ease:'power2.out'},0.18);\n` +
        `tl.from('#${id} .v',{autoAlpha:0,y:30,duration:0.4,ease:'power2.out'},0.42);\n` +
        `tl.from('#${id} .s',{autoAlpha:0,duration:0.3},0.65);\n` +
        `tl.from('#${id} .mini',{y:-60,autoAlpha:0,duration:0.4,ease:'power2.out'},0.5);`,
    ),
  'count-up': () =>
    mk(
      'gl_cnt',
      'count-up',
      (id) => `
<div class="rt">
  <div class="orb o1"></div><div class="orb o2"></div>
  <div class="gc main">
    <div class="chip"><i></i>跑分实录 · ANTUTU V11</div>
    <div class="v">128560</div>
    <div class="s">跑完机身 41°C,没碰温度墙</div>
  </div>
  <div class="gc mini"><b>96420</b><span>上代旗舰跑分</span></div>
</div>
<style>${glassRoot(id)}
#${id} .rt{background-color:var(--paper);}
#${id} .main{left:190px;top:220px;width:1260px;padding:84px 100px 90px;display:flex;flex-direction:column;gap:44px;}
#${id} .v{font-family:var(--font-num);font-size:270px;font-weight:800;line-height:1;letter-spacing:-0.03em;color:var(--accent);text-shadow:var(--glow);}
#${id} .s{font-size:40px;color:var(--muted);}
#${id} .mini{right:170px;bottom:170px;padding:44px 60px;display:flex;flex-direction:column;gap:14px;z-index:2;}
#${id} .mini b{font-family:var(--font-num);font-size:76px;font-weight:700;color:var(--fg);opacity:0.9;line-height:1;}
#${id} .mini span{font-size:30px;color:var(--muted);letter-spacing:0.14em;}
</style>`,
      (id) =>
        `tl.from('#${id} .orb',{autoAlpha:0,scale:0.7,duration:0.5,stagger:0.1},0);\n` +
        `tl.from('#${id} .main',{y:60,autoAlpha:0,duration:0.4,ease:'power2.out'},0.1);\n` +
        `tl.from('#${id} .v',{autoAlpha:0,duration:0.25},0.15);\n` +
        `tl.from('#${id} .v',{innerText:96420,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .chip i',{scale:0,duration:0.25,ease:'back.out(2)'},0.5);\n` +
        `tl.from('#${id} .s',{autoAlpha:0,duration:0.3},0.7);\n` +
        `tl.from('#${id} .mini',{y:70,autoAlpha:0,duration:0.4,ease:'power2.out'},0.6);`,
    ),
  'chart': () =>
    mk(
      'gl_bar',
      'chart',
      (id) => `
<div class="rt">
  <div class="orb o1"></div><div class="orb o2"></div>
  <div class="gc main">
    <div class="hd"><div class="chip"><i></i>续航横评 · HOURS</div><span class="t">四机对比,差距在这</span></div>
    <div class="plot">
      <div class="col"><em>11.2</em><div class="b" style="height:220px"></div><span>机型 A</span></div>
      <div class="col"><em>13.5</em><div class="b" style="height:280px"></div><span>机型 B</span></div>
      <div class="col"><em>12.1</em><div class="b" style="height:240px"></div><span>机型 C</span></div>
      <div class="col win"><em>19.8</em><div class="b" style="height:420px"></div><span>本机</span></div>
    </div>
  </div>
</div>
<style>${glassRoot(id)}
#${id} .rt{background-color:var(--paper);}
#${id} .main{left:170px;right:170px;top:130px;bottom:130px;padding:70px 100px;display:flex;flex-direction:column;gap:40px;}
#${id} .hd{display:flex;align-items:center;justify-content:space-between;}
#${id} .t{font-size:56px;font-weight:800;}
#${id} .plot{flex:1;display:flex;align-items:flex-end;gap:120px;border-bottom:1px solid var(--line);padding:0 60px;}
#${id} .col{display:flex;flex-direction:column;align-items:center;gap:22px;}
#${id} .col em{font-style:normal;font-family:var(--font-num);font-size:40px;color:var(--muted);}
#${id} .col .b{width:170px;background:var(--panel);border:1px solid var(--line);border-top-color:var(--muted);border-radius:14px 14px 0 0;}
#${id} .col span{font-size:34px;color:var(--muted);margin-bottom:-62px;padding-top:16px;}
#${id} .col.win em{color:var(--accent);font-weight:700;font-size:48px;}
#${id} .col.win .b{background:var(--accent);border-color:var(--accent);box-shadow:var(--glow);}
#${id} .col.win span{color:var(--fg);font-weight:700;}
</style>`,
      (id) =>
        `tl.from('#${id} .orb',{autoAlpha:0,scale:0.7,duration:0.5,stagger:0.1},0);\n` +
        `tl.from('#${id} .main',{y:60,autoAlpha:0,duration:0.4,ease:'power2.out'},0.15);\n` +
        `tl.from('#${id} .b',{scaleY:0,transformOrigin:'bottom',duration:0.4,stagger:0.09,ease:'power3.out'},0.4);\n` +
        `tl.from('#${id} .col em',{autoAlpha:0,y:16,duration:0.25,stagger:0.07},0.6);\n` +
        `tl.from('#${id} .col span',{autoAlpha:0,duration:0.25},0.8);`,
    ),
  'code': () =>
    mk(
      'gl_cde',
      'code',
      (id) => `
<div class="rt">
  <div class="orb o1"></div><div class="orb o2"></div>
  <div class="gc main">
    <div class="bar"><i class="w"></i><i class="w"></i><i class="w"></i><em>bench.ts</em></div>
    <div class="code">
      <div class="row"><u>1</u><span><b class="kw">import</b> { bench } <b class="kw">from</b> <b class="st">"hyperlab"</b></span></div>
      <div class="row"><u>2</u><span><b class="kw">const</b> run = <b class="kw">await</b> bench(<b class="st">"cine-r24"</b>)</span></div>
      <div class="row"><u>3</u><span>run.load({ minutes: 30 })</span></div>
      <div class="row rh"><i class="hl"></i><u>4</u><span><b class="kw">const</b> drop = run.throttle()</span></div>
      <div class="row"><u>5</u><span><b class="kw">if</b> (drop &lt; 0.05) mark(<b class="st">"满血"</b>) <b class="cm">// 降频不到 5%,过</b></span></div>
    </div>
  </div>
  <div class="gc mini"><b>BUILD PASSED</b><span>2.4s · 0 WARNINGS</span></div>
</div>
<style>${glassRoot(id)}
#${id} .rt{background-color:var(--paper);}
#${id} .main{left:170px;top:170px;width:1360px;padding:0;overflow:hidden;}
#${id} .bar{display:flex;align-items:center;gap:20px;padding:34px 56px;border-bottom:1px solid var(--line);}
#${id} .w{width:20px;height:20px;border-radius:999px;background:var(--panel-2);border:1px solid var(--line);}
#${id} .bar em{font-style:normal;font-family:var(--font-num);font-size:30px;color:var(--muted);letter-spacing:0.08em;margin-left:16px;}
#${id} .code{display:flex;flex-direction:column;gap:34px;padding:60px 70px 70px;font-family:var(--font-num);font-size:36px;line-height:1.2;}
#${id} .row{position:relative;display:flex;gap:44px;align-items:baseline;}
#${id} .row u{text-decoration:none;flex:none;width:44px;text-align:right;font-size:30px;color:var(--muted);opacity:0.7;}
#${id} .kw{font-weight:700;color:var(--accent);}
#${id} .st{font-weight:400;color:var(--accent-2);}
#${id} .cm{font-weight:400;color:var(--muted);}
#${id} .hl{position:absolute;left:-28px;right:-28px;top:-14px;bottom:-14px;background:var(--panel);border:1px solid var(--line);border-radius:14px;}
#${id} .rh u,#${id} .rh span{position:relative;}
#${id} .mini{right:190px;bottom:130px;padding:44px 60px;display:flex;flex-direction:column;gap:14px;z-index:2;}
#${id} .mini b{font-family:var(--font-num);font-size:46px;font-weight:700;color:var(--accent);text-shadow:var(--glow);line-height:1;}
#${id} .mini span{font-size:30px;color:var(--muted);letter-spacing:0.18em;}
</style>`,
      (id) =>
        `tl.from('#${id} .orb',{autoAlpha:0,scale:0.7,duration:0.5,stagger:0.1},0);\n` +
        `tl.from('#${id} .main',{y:60,autoAlpha:0,duration:0.4,ease:'power2.out'},0.12);\n` +
        `tl.from('#${id} .w',{scale:0,duration:0.2,stagger:0.07,ease:'back.out(2)'},0.35);\n` +
        `tl.from('#${id} .row',{autoAlpha:0,y:16,duration:0.28,stagger:0.08,ease:'power2.out'},0.4);\n` +
        `tl.from('#${id} .hl',{scaleX:0,transformOrigin:'left center',duration:0.32,ease:'power2.out'},0.82);\n` +
        `tl.from('#${id} .mini',{y:70,autoAlpha:0,duration:0.35,ease:'power2.out'},0.85);`,
    ),
  'quote': () =>
    mk(
      'gl_qte',
      'quote',
      (id) => `
<div class="rt">
  <div class="orb o1"></div><div class="orb o2"></div>
  <div class="gc main">
    <div class="chip"><i></i>QUOTE · 实测有感</div>
    <div class="t">性能不是跑分,<br/>是<b>全程不掉帧</b>的底气</div>
  </div>
  <div class="gc mini"><span>—— 主编 · 30 天深度体验</span></div>
</div>
<style>${glassRoot(id)}
#${id} .rt{background-color:var(--paper);}
#${id} .main{left:190px;top:230px;width:1330px;padding:84px 100px;display:flex;flex-direction:column;gap:52px;}
#${id} .t{font-size:100px;font-weight:800;line-height:1.5;}
#${id} .t b{color:var(--accent);font-weight:900;text-shadow:var(--glow);}
#${id} .mini{right:210px;bottom:170px;padding:40px 60px;z-index:2;}
#${id} .mini span{font-size:34px;color:var(--muted);letter-spacing:0.1em;}
</style>`,
      (id) =>
        `tl.from('#${id} .orb',{autoAlpha:0,scale:0.7,duration:0.5,stagger:0.1},0);\n` +
        `tl.from('#${id} .main',{y:60,autoAlpha:0,duration:0.45,ease:'power2.out'},0.18);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,y:26,duration:0.35},0.4);\n` +
        `tl.from('#${id} .t b',{autoAlpha:0,duration:0.3},0.6);\n` +
        `tl.from('#${id} .chip i',{scale:0,duration:0.25,ease:'back.out(2)'},0.55);\n` +
        `tl.from('#${id} .mini',{y:70,autoAlpha:0,duration:0.4,ease:'power2.out'},0.55);`,
    ),
  'steps': () =>
    mk(
      'gl_stp',
      'steps',
      (id) => `
<div class="rt">
  <div class="orb o1"></div><div class="orb o2"></div>
  <div class="gc st s1"><b class="n a">01</b><div class="tx"><span>开箱先跑基准</span><em>别信纸面参数,先测再说</em></div></div>
  <div class="gc st s2"><b class="n">02</b><div class="tx"><span>满载烤机半小时</span><em>看降频曲线,不看峰值</em></div></div>
  <div class="gc st s3"><b class="n">03</b><div class="tx"><span>回到真实工作流</span><em>剪一条 4K,数字才算数</em></div></div>
</div>
<style>${glassRoot(id)}
#${id} .rt{background-color:var(--paper);}
#${id} .st{padding:52px 70px;width:1180px;display:flex;align-items:center;gap:56px;}
#${id} .st.s1{left:210px;top:190px;z-index:3;}
#${id} .st.s2{left:320px;top:440px;z-index:2;}
#${id} .st.s3{left:430px;top:690px;z-index:1;}
#${id} .n{font-family:var(--font-num);font-size:56px;font-weight:700;color:var(--muted);background:var(--panel-2);border:1px solid var(--line);border-radius:18px;padding:22px 34px;}
#${id} .n.a{color:var(--paper);background:var(--accent);border-color:var(--accent);box-shadow:var(--glow);}
#${id} .tx{display:flex;flex-direction:column;gap:14px;}
#${id} .tx span{font-size:54px;font-weight:800;}
#${id} .tx em{font-style:normal;font-size:34px;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .orb',{autoAlpha:0,scale:0.7,duration:0.5,stagger:0.1},0);\n` +
        `tl.from('#${id} .st',{y:60,autoAlpha:0,duration:0.4,stagger:0.13,ease:'power2.out'},0.16);\n` +
        `tl.from('#${id} .n',{autoAlpha:0,y:20,duration:0.25,stagger:0.13},0.4);\n` +
        `tl.from('#${id} .n.a',{scale:0.6,duration:0.25,ease:'back.out(2)'},0.7);\n` +
        `tl.from('#${id} .tx em',{autoAlpha:0,duration:0.25},0.8);`,
    ),
  'chapters': () =>
    mk(
      'gl_chp',
      'chapters',
      (id) => `
<div class="rt">
  <div class="orb o1"></div><div class="orb o2"></div>
  <div class="caps">
    <div class="cap"><b>01</b><span>开箱</span></div>
    <div class="cap on"><b>02</b><span>实测</span></div>
    <div class="cap"><b>03</b><span>结论</span></div>
  </div>
  <div class="gc main">
    <div class="h">实测</div>
    <div class="s">满载半小时,看它掉不掉链子</div>
  </div>
  <div class="gc mini"><b>02/03</b><span>CHAPTER</span></div>
</div>
<style>${glassRoot(id)}
#${id} .rt{background-color:var(--paper);}
#${id} .caps{position:absolute;left:230px;top:240px;display:flex;gap:36px;z-index:3;}
#${id} .cap{display:flex;align-items:center;gap:22px;padding:26px 54px;border-radius:999px;background:var(--panel-2);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);border:1px solid var(--line);border-top-color:var(--muted);font-size:40px;color:var(--muted);}
#${id} .cap b{font-family:var(--font-num);font-weight:700;}
#${id} .cap.on{background:var(--accent);border-color:var(--accent);color:var(--paper);box-shadow:var(--glow);font-weight:800;}
#${id} .main{left:190px;top:300px;width:1280px;padding:130px 100px 90px;display:flex;flex-direction:column;gap:40px;}
#${id} .h{font-size:200px;font-weight:900;line-height:1;}
#${id} .s{font-size:40px;color:var(--muted);}
#${id} .mini{right:200px;bottom:180px;padding:44px 62px;display:flex;flex-direction:column;gap:14px;z-index:2;}
#${id} .mini b{font-family:var(--font-num);font-size:64px;font-weight:700;color:var(--accent);text-shadow:var(--glow);line-height:1;}
#${id} .mini span{font-size:30px;color:var(--muted);letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .orb',{autoAlpha:0,scale:0.7,duration:0.5,stagger:0.1},0);\n` +
        `tl.from('#${id} .cap',{y:40,autoAlpha:0,duration:0.35,stagger:0.12,ease:'power2.out'},0.15);\n` +
        `tl.from('#${id} .main',{y:60,autoAlpha:0,duration:0.45,ease:'power2.out'},0.25);\n` +
        `tl.from('#${id} .cap.on',{scale:0.7,duration:0.3,ease:'back.out(2)'},0.62);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,y:24,duration:0.35},0.5);\n` +
        `tl.from('#${id} .s',{autoAlpha:0,duration:0.3},0.75);\n` +
        `tl.from('#${id} .mini',{y:70,autoAlpha:0,duration:0.4,ease:'power2.out'},0.7);`,
    ),
  'cta': () =>
    mk(
      'gl_cta',
      'cta',
      (id) => `
<div class="rt">
  <div class="orb o1"></div><div class="orb o2"></div>
  <div class="gc main">
    <div class="chip"><i></i>NEXT DROP · 每周四晚 8 点</div>
    <div class="h">下期,拆它的散热</div>
    <div class="pill">＋ 关注</div>
  </div>
  <div class="gc mini"><b>EP.13</b><span>THERMAL DEEP DIVE</span></div>
</div>
<style>${glassRoot(id)}
#${id} .rt{background-color:var(--paper);}
#${id} .main{left:210px;top:210px;width:1240px;padding:84px 100px;display:flex;flex-direction:column;align-items:flex-start;gap:52px;}
#${id} .h{font-size:112px;font-weight:900;line-height:1.16;}
#${id} .pill{background:var(--accent);color:var(--paper);border-radius:999px;box-shadow:var(--glow);font-size:64px;font-weight:900;padding:32px 110px;}
#${id} .mini{right:200px;bottom:190px;padding:48px 66px;display:flex;flex-direction:column;gap:16px;z-index:2;}
#${id} .mini b{font-family:var(--font-num);font-size:64px;font-weight:700;color:var(--accent);text-shadow:var(--glow);line-height:1;}
#${id} .mini span{font-size:30px;color:var(--muted);letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .orb',{autoAlpha:0,scale:0.7,duration:0.5,stagger:0.1},0);\n` +
        `tl.to('#${id} .o1',{x:60,y:40,duration:0.9,ease:'power1.out'},0.1);\n` +
        `tl.to('#${id} .o2',{x:-50,y:-40,duration:0.9,ease:'power1.out'},0.1);\n` +
        `tl.from('#${id} .main',{y:60,autoAlpha:0,duration:0.45,ease:'power2.out'},0.18);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,y:24,duration:0.3},0.4);\n` +
        `tl.from('#${id} .pill',{scale:0.6,autoAlpha:0,duration:0.3,ease:'back.out(1.6)'},0.55);\n` +
        `tl.from('#${id} .chip i',{scale:0,duration:0.25,ease:'back.out(2)'},0.6);\n` +
        `tl.from('#${id} .mini',{y:70,autoAlpha:0,duration:0.4,ease:'power2.out'},0.6);`,
    ),
};
