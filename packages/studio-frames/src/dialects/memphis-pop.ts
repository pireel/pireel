/**
 * Memphis — geometric pop dialect: thick-outlined confetti, hard-yellow offset shadows, asymmetric
 * composition. Structure logic: content weighted to one side, geometric confetti to the other;
 * white panels always have a 4px outline + 12px no-blur hard shadow.
 */

import { type Block, mk } from './shared';

/** Shared confetti: hollow circle / solid triangle / semicircle / polka-dot patch. */
const confetti = (id: string) => `
#${id} .circle{position:absolute;border:6px solid var(--fg);border-radius:999px;}
#${id} .tri{position:absolute;background:var(--accent);clip-path:polygon(50% 0,100% 100%,0 100%);}
#${id} .half{position:absolute;border:6px solid var(--fg);border-bottom:none;border-radius:200px 200px 0 0;background:var(--panel-2);}
#${id} .dots{position:absolute;background-image:radial-gradient(var(--fg) 3px,transparent 3px);background-size:30px 30px;}`;

const zigzag = (cls = 'zig') =>
  `<svg class="${cls}" viewBox="0 0 480 60"><polyline points="0,50 40,10 80,50 120,10 160,50 200,10 240,50 280,10 320,50 360,10 400,50 440,10 480,50"/></svg>`;

export const cover: () => Block = () =>
  mk(
    'cv_mp',
    '封面',
    (id) => `
<div class="rt">
  <div class="dots d1"></div>
  <div class="panel">
    <div class="h">孟菲斯</div>
    <div class="s">MEMPHIS · POP GEOMETRY</div>
  </div>
  <div class="circle c1"></div>
  <div class="tri t1"></div>
  <div class="half h1"></div>
  ${zigzag()}
</div>
<style>
#${id} .rt{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);}
${confetti(id)}
#${id} .panel{position:absolute;left:180px;top:50%;transform:translateY(-56%);background:var(--panel);border:4px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);padding:90px 120px;display:flex;flex-direction:column;gap:36px;}
#${id} .h{font-size:270px;font-weight:900;line-height:1;letter-spacing:0.02em;}
#${id} .s{font-size:40px;font-weight:800;color:var(--accent);letter-spacing:0.24em;}
#${id} .dots.d1{left:110px;top:120px;width:300px;height:220px;}
#${id} .circle.c1{right:220px;top:140px;width:200px;height:200px;}
#${id} .tri.t1{right:420px;bottom:150px;width:190px;height:170px;transform:rotate(14deg);}
#${id} .half.h1{right:160px;bottom:250px;width:220px;height:110px;transform:rotate(-18deg);}
#${id} .zig{position:absolute;left:220px;bottom:130px;width:480px;height:60px;}
#${id} .zig polyline{fill:none;stroke:var(--accent-2);stroke-width:12;stroke-dasharray:1400;stroke-dashoffset:1400;}
</style>`,
    (id) =>
      `tl.from('#${id} .panel',{x:-160,autoAlpha:0,duration:0.32,ease:'power3.out'},0);\n` +
      `tl.from('#${id} .circle,#${id} .tri,#${id} .half',{scale:0,autoAlpha:0,duration:0.26,stagger:0.09,ease:'back.out(1.8)'},0.2);\n` +
      `tl.from('#${id} .dots',{autoAlpha:0,duration:0.26},0.4);\n` +
      `tl.to('#${id} .zig polyline',{strokeDashoffset:0,duration:0.4,ease:'power2.out'},0.5);`,
  );

export const blocks: Record<string, () => Block> = {
  'title-card': () =>
    mk(
      'mp_ttl',
      'title-card',
      (id) => `
<div class="rt">
  <div class="dots d1"></div>
  <div class="panel">
    <div class="chip">本周开箱</div>
    <div class="h">开箱这颗<br/>快乐星球</div>
  </div>
  <div class="circle c1"></div>
  <div class="tri t1"></div>
  <div class="half h1"></div>
  ${zigzag()}
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${confetti(id)}
#${id} .panel{position:absolute;left:170px;top:150px;background:var(--panel);border:4px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);padding:80px 110px 90px;display:flex;flex-direction:column;align-items:flex-start;gap:44px;}
#${id} .chip{background:var(--accent);color:var(--paper);border:4px solid var(--fg);border-radius:999px;padding:20px 52px;font-size:42px;font-weight:800;letter-spacing:0.08em;}
#${id} .h{font-size:150px;font-weight:900;line-height:1.15;}
#${id} .dots.d1{left:120px;top:110px;width:280px;height:200px;}
#${id} .circle.c1{right:250px;top:190px;width:230px;height:230px;}
#${id} .tri.t1{right:480px;bottom:180px;width:200px;height:180px;transform:rotate(-10deg);}
#${id} .half.h1{right:170px;bottom:320px;width:230px;height:115px;transform:rotate(16deg);}
#${id} .zig{position:absolute;left:210px;bottom:130px;width:480px;height:60px;}
#${id} .zig polyline{fill:none;stroke:var(--accent-2);stroke-width:12;stroke-dasharray:1400;stroke-dashoffset:1400;}
</style>`,
      (id) =>
        `tl.from('#${id} .panel',{x:-180,autoAlpha:0,duration:0.32,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .chip',{scale:0,duration:0.24,ease:'back.out(2)'},0.22);\n` +
        `tl.from('#${id} .circle,#${id} .tri,#${id} .half',{scale:0,autoAlpha:0,duration:0.26,stagger:0.09,ease:'back.out(1.8)'},0.26);\n` +
        `tl.from('#${id} .dots',{autoAlpha:0,duration:0.24},0.44);\n` +
        `tl.to('#${id} .zig polyline',{strokeDashoffset:0,duration:0.4,ease:'power2.out'},0.54);`,
    ),
  'big-number': () =>
    mk(
      'mp_num',
      'big-number',
      (id) => `
<div class="rt">
  <div class="dots d1"></div>
  <div class="circle c1"></div>
  <div class="tri t1"></div>
  <div class="v">100</div>
  <div class="panel"><b>第 100 期</b><span>谢谢你们的每一次点开</span></div>
  <div class="half h1"></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${confetti(id)}
#${id} .v{position:absolute;right:190px;top:44%;transform:translateY(-50%);font-family:var(--font-num);font-size:500px;font-weight:800;letter-spacing:-0.04em;line-height:1;}
#${id} .circle.c1{right:120px;top:70px;width:560px;height:560px;}
#${id} .tri.t1{right:820px;bottom:230px;width:210px;height:190px;transform:rotate(22deg);}
#${id} .dots.d1{left:150px;top:130px;width:320px;height:240px;}
#${id} .half.h1{left:560px;top:190px;width:220px;height:110px;transform:rotate(-14deg);}
#${id} .panel{position:absolute;left:170px;bottom:170px;background:var(--panel);border:4px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);padding:56px 80px;display:flex;flex-direction:column;gap:22px;}
#${id} .panel b{font-size:88px;font-weight:900;}
#${id} .panel span{font-size:42px;font-weight:600;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .v',{scale:0.5,autoAlpha:0,duration:0.36,ease:'back.out(1.5)'},0);\n` +
        `tl.from('#${id} .circle',{scale:0,duration:0.32,ease:'back.out(1.4)'},0.08);\n` +
        `tl.from('#${id} .tri,#${id} .half',{scale:0,autoAlpha:0,duration:0.26,stagger:0.1,ease:'back.out(1.8)'},0.3);\n` +
        `tl.from('#${id} .panel',{x:-140,autoAlpha:0,duration:0.3,ease:'power3.out'},0.42);\n` +
        `tl.from('#${id} .dots',{autoAlpha:0,duration:0.24},0.6);`,
    ),
  'count-up': () =>
    mk(
      'mp_cnt',
      'count-up',
      (id) => `
<div class="rt">
  <div class="dots d1"></div>
  <div class="circle c1"></div>
  <div class="num"><b class="v">50000</b><i>+</i></div>
  <div class="tri t1"></div>
  <div class="half h1"></div>
  <div class="panel"><b>五万个拆箱搭子</b><span>评论区抽三位寄盲盒</span></div>
  ${zigzag()}
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${confetti(id)}
#${id} .num{position:absolute;left:170px;top:200px;display:flex;align-items:flex-start;gap:24px;}
#${id} .num .v{font-family:var(--font-num);font-size:430px;font-weight:800;letter-spacing:-0.04em;line-height:1;}
#${id} .num i{font-style:normal;font-family:var(--font-num);font-size:170px;font-weight:800;line-height:1.15;}
#${id} .circle.c1{left:90px;top:100px;width:430px;height:430px;}
#${id} .tri.t1{left:1180px;top:600px;width:210px;height:190px;transform:rotate(18deg);}
#${id} .half.h1{right:200px;top:170px;width:230px;height:115px;transform:rotate(-15deg);}
#${id} .dots.d1{right:170px;top:420px;width:320px;height:260px;}
#${id} .panel{position:absolute;right:170px;bottom:160px;background:var(--panel);border:4px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);padding:52px 76px;display:flex;flex-direction:column;gap:22px;}
#${id} .panel b{font-size:84px;font-weight:900;}
#${id} .panel span{font-size:42px;font-weight:600;color:var(--muted);}
#${id} .zig{position:absolute;left:190px;bottom:150px;width:480px;height:60px;}
#${id} .zig polyline{fill:none;stroke:var(--accent-2);stroke-width:12;stroke-dasharray:1400;stroke-dashoffset:1400;}
</style>`,
      (id) =>
        `tl.from('#${id} .num',{y:-110,autoAlpha:0,duration:0.3,ease:'back.out(1.6)'},0);\n` +
        `tl.from('#${id} .v',{innerText:0,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .circle',{scale:0,duration:0.3,ease:'back.out(1.4)'},0.1);\n` +
        `tl.from('#${id} .tri,#${id} .half',{scale:0,autoAlpha:0,duration:0.26,stagger:0.12,ease:'back.out(2.2)'},0.32);\n` +
        `tl.from('#${id} .panel',{x:150,autoAlpha:0,duration:0.3,ease:'power3.out'},0.5);\n` +
        `tl.from('#${id} .dots',{autoAlpha:0,duration:0.24},0.66);\n` +
        `tl.to('#${id} .zig polyline',{strokeDashoffset:0,duration:0.4,ease:'power2.out'},0.74);`,
    ),
  'list': () =>
    mk(
      'mp_lst',
      'list',
      (id) => `
<div class="rt">
  <div class="head">今日清单${zigzag('zig')}</div>
  <div class="dots d1"></div>
  <div class="r r1"><i class="b b1"></i><span>先拆最丑的快递盒</span></div>
  <div class="r r2"><i class="b b2"></i><span>惊喜留到第二件</span></div>
  <div class="r r3"><i class="b b3"></i><span>翻车也要剪进片子</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${confetti(id)}
#${id} .head{position:absolute;left:170px;top:120px;font-size:88px;font-weight:900;}
#${id} .head .zig{position:absolute;left:6px;bottom:-46px;width:420px;height:52px;}
#${id} .zig polyline{fill:none;stroke:var(--accent-2);stroke-width:11;stroke-dasharray:1400;stroke-dashoffset:1400;}
#${id} .dots.d1{right:170px;top:110px;width:340px;height:230px;}
#${id} .r{position:absolute;background:var(--panel);border:4px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);padding:40px 76px;display:flex;align-items:center;gap:50px;font-size:60px;font-weight:700;}
#${id} .r.r1{left:170px;top:360px;transform:rotate(-0.5deg);}
#${id} .r.r2{left:290px;top:560px;transform:rotate(0.6deg);}
#${id} .r.r3{left:230px;top:760px;transform:rotate(-0.4deg);}
#${id} .b{flex:none;font-style:normal;}
#${id} .b.b1{width:64px;height:64px;border-radius:999px;background:var(--accent);}
#${id} .b.b2{width:70px;height:62px;background:var(--accent-2);clip-path:polygon(50% 0,100% 100%,0 100%);}
#${id} .b.b3{width:58px;height:58px;background:var(--panel-2);border:5px solid var(--fg);transform:rotate(12deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .head',{y:-40,autoAlpha:0,duration:0.26,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .r',{x:-160,autoAlpha:0,duration:0.28,stagger:0.12,ease:'power3.out'},0.14);\n` +
        `tl.from('#${id} .b',{scale:0,duration:0.22,stagger:0.12,ease:'back.out(2)'},0.26);\n` +
        `tl.to('#${id} .zig polyline',{strokeDashoffset:0,duration:0.4,ease:'power2.out'},0.5);\n` +
        `tl.from('#${id} .dots',{autoAlpha:0,duration:0.24},0.6);`,
    ),
  'quote': () =>
    mk(
      'mp_qte',
      'quote',
      (id) => `
<div class="rt">
  <div class="dots d1"></div>
  <div class="panel">
    <div class="t">把普通的日子<br/>拆出<b class="w">惊喜<i class="rg"></i></b>来</div>
    <div class="a">—— 开箱手记 · 第 42 页</div>
  </div>
  <div class="circle c1"></div>
  <div class="tri t1"></div>
  <div class="half h1"></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${confetti(id)}
#${id} .panel{position:absolute;left:180px;top:50%;transform:translateY(-52%);background:var(--panel);border:4px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);padding:96px 120px;display:flex;flex-direction:column;gap:52px;}
#${id} .t{font-size:104px;font-weight:900;line-height:1.5;}
#${id} .w{position:relative;display:inline-block;}
#${id} .w .rg{position:absolute;left:50%;top:50%;width:280px;height:280px;transform:translate(-50%,-50%);border:6px solid var(--fg);border-radius:999px;}
#${id} .a{font-size:40px;font-weight:600;color:var(--muted);}
#${id} .dots.d1{left:130px;top:120px;width:300px;height:210px;}
#${id} .circle.c1{right:210px;top:150px;width:220px;height:220px;}
#${id} .tri.t1{right:190px;bottom:200px;width:200px;height:180px;transform:rotate(18deg);}
#${id} .half.h1{right:430px;bottom:330px;width:220px;height:110px;transform:rotate(-16deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .panel',{x:-160,autoAlpha:0,duration:0.3,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,y:30,duration:0.26,ease:'power2.out'},0.16);\n` +
        `tl.from('#${id} .w .rg',{scale:0,autoAlpha:0,duration:0.26,ease:'back.out(1.8)'},0.36);\n` +
        `tl.from('#${id} .circle,#${id} .tri,#${id} .half',{scale:0,autoAlpha:0,duration:0.26,stagger:0.1,ease:'back.out(1.8)'},0.42);\n` +
        `tl.from('#${id} .a',{autoAlpha:0,duration:0.22},0.6);\n` +
        `tl.from('#${id} .dots',{autoAlpha:0,duration:0.24},0.68);`,
    ),
  'comments': () =>
    mk(
      'mp_cmt',
      'comments',
      (id) => `
<div class="rt">
  <div class="head">评论区精选</div>
  <div class="dots d1"></div>
  <div class="circle c1"></div>
  <div class="half h1"></div>
  <div class="cmt m1"><i class="av a1"></i><div class="tx"><b>@波普星人</b><span>蹲了一周,就等你按下裁纸刀</span></div></div>
  <div class="cmt m2"><i class="av a2"></i><div class="tx"><b>@圆圈上头</b><span>翻车名场面直接笑醒我</span></div></div>
  <div class="cmt m3"><i class="av a3"></i><div class="tx"><b>@锯齿线本线</b><span>求盒子同款贴纸链接!</span></div></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${confetti(id)}
#${id} .head{position:absolute;left:170px;top:120px;font-size:88px;font-weight:900;}
#${id} .dots.d1{right:170px;top:110px;width:320px;height:220px;}
#${id} .circle.c1{right:210px;top:430px;width:210px;height:210px;}
#${id} .half.h1{right:420px;bottom:170px;width:230px;height:115px;transform:rotate(16deg);}
#${id} .cmt{position:absolute;background:var(--panel);border:4px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);padding:38px 60px;display:flex;align-items:center;gap:44px;}
#${id} .cmt .tx{display:flex;flex-direction:column;gap:12px;}
#${id} .cmt b{font-size:34px;font-weight:800;color:var(--muted);letter-spacing:0.04em;}
#${id} .cmt span{font-size:54px;font-weight:700;white-space:nowrap;}
#${id} .m1{left:170px;top:300px;transform:rotate(-0.8deg);}
#${id} .m2{left:330px;top:545px;transform:rotate(0.7deg);}
#${id} .m3{left:230px;top:790px;transform:rotate(-0.5deg);}
#${id} .av{flex:none;font-style:normal;}
#${id} .av.a1{width:84px;height:84px;border-radius:999px;background:var(--accent);}
#${id} .av.a2{width:90px;height:80px;background:var(--accent-2);clip-path:polygon(50% 0,100% 100%,0 100%);}
#${id} .av.a3{width:74px;height:74px;background:var(--panel-2);border:6px solid var(--fg);transform:rotate(10deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .head',{y:-40,autoAlpha:0,duration:0.26,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cmt',{scale:1.5,autoAlpha:0,duration:0.26,stagger:0.16,ease:'power3.out'},0.14);\n` +
        `tl.from('#${id} .av',{scale:0,duration:0.22,stagger:0.16,ease:'back.out(2)'},0.32);\n` +
        `tl.from('#${id} .circle,#${id} .half',{scale:0,autoAlpha:0,duration:0.26,stagger:0.1,ease:'back.out(1.8)'},0.62);\n` +
        `tl.from('#${id} .dots',{autoAlpha:0,duration:0.24},0.8);`,
    ),
  'steps': () =>
    mk(
      'mp_stp',
      'steps',
      (id) => `
<div class="rt">
  <div class="head">三步开箱法</div>
  <div class="dots d1"></div>
  <svg class="sq" viewBox="0 0 1400 420"><path d="M80,140 C280,340 480,360 700,280 C920,200 1120,90 1320,120" fill="none"/></svg>
  <div class="st s1"><div class="fig f1"><b>1</b></div><div class="lab">先拍完整全景</div></div>
  <div class="st s2"><div class="fig f2"><i class="tri"></i><b class="on">2</b></div><div class="lab">拆最丑的那层</div></div>
  <div class="st s3"><div class="fig f3"><i class="half"></i><b>3</b></div><div class="lab">留住第一反应</div></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${confetti(id)}
#${id} .head{position:absolute;left:170px;top:120px;font-size:88px;font-weight:900;}
#${id} .dots.d1{right:170px;top:110px;width:320px;height:220px;}
#${id} .sq{position:absolute;left:260px;top:340px;width:1400px;height:420px;}
#${id} .sq path{fill:none;stroke:var(--accent-2);stroke-width:12;stroke-dasharray:1800;stroke-dashoffset:1800;}
#${id} .st{position:absolute;display:flex;flex-direction:column;align-items:center;gap:40px;}
#${id} .st.s1{left:190px;top:400px;}
#${id} .st.s2{left:790px;top:520px;}
#${id} .st.s3{left:1380px;top:340px;}
#${id} .fig{position:relative;width:220px;height:220px;}
#${id} .fig b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--font-num);font-size:96px;font-weight:800;}
#${id} .fig.f1{border:6px solid var(--fg);border-radius:999px;}
#${id} .fig.f2 .tri{position:absolute;inset:0;background:var(--accent);clip-path:polygon(50% 0,100% 100%,0 100%);}
#${id} .fig.f2 b.on{color:var(--paper);padding-top:70px;}
#${id} .fig.f3 .half{position:absolute;left:0;right:0;top:0;height:110px;border:6px solid var(--fg);border-bottom:none;border-radius:200px 200px 0 0;background:var(--panel-2);}
#${id} .fig.f3 b{padding-top:96px;}
#${id} .lab{background:var(--panel);border:4px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);padding:24px 44px;font-size:44px;font-weight:700;white-space:nowrap;}
</style>`,
      (id) =>
        `tl.from('#${id} .head',{y:-40,autoAlpha:0,duration:0.26,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .fig',{scale:0,autoAlpha:0,duration:0.26,stagger:0.12,ease:'back.out(1.8)'},0.12);\n` +
        `tl.from('#${id} .lab',{x:-120,autoAlpha:0,duration:0.26,stagger:0.12,ease:'power3.out'},0.24);\n` +
        `tl.from('#${id} .dots',{autoAlpha:0,duration:0.24},0.56);\n` +
        `tl.to('#${id} .sq path',{strokeDashoffset:0,duration:0.5,ease:'power2.out'},0.62);`,
    ),
  'cta': () =>
    mk(
      'mp_cta',
      'cta',
      (id) => `
<div class="rt">
  <div class="dots d1"></div>
  <div class="panel">
    <div class="h">下期拆什么<br/>你说了算</div>
    <div class="pill">＋ 关注</div>
  </div>
  <div class="circle c1"></div>
  <div class="tri t1"></div>
  <div class="half h1"></div>
  ${zigzag()}
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${confetti(id)}
#${id} .panel{position:absolute;left:180px;top:50%;transform:translateY(-54%);background:var(--panel);border:4px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);padding:90px 120px;display:flex;flex-direction:column;align-items:flex-start;gap:56px;}
#${id} .h{font-size:136px;font-weight:900;line-height:1.2;}
#${id} .pill{background:var(--accent);color:var(--paper);border:4px solid var(--fg);border-radius:999px;padding:28px 92px;font-size:66px;font-weight:900;letter-spacing:0.04em;}
#${id} .dots.d1{left:120px;top:110px;width:280px;height:200px;}
#${id} .circle.c1{right:220px;top:150px;width:240px;height:240px;}
#${id} .tri.t1{right:470px;bottom:210px;width:200px;height:180px;transform:rotate(-12deg);}
#${id} .half.h1{right:170px;bottom:340px;width:230px;height:115px;transform:rotate(15deg);}
#${id} .zig{position:absolute;left:220px;bottom:120px;width:480px;height:60px;}
#${id} .zig polyline{fill:none;stroke:var(--accent-2);stroke-width:12;stroke-dasharray:1400;stroke-dashoffset:1400;}
</style>`,
      (id) =>
        `tl.from('#${id} .panel',{x:-170,autoAlpha:0,duration:0.3,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,y:28,duration:0.24,ease:'power2.out'},0.14);\n` +
        `tl.from('#${id} .pill',{scale:0,duration:0.28,ease:'back.out(2)'},0.32);\n` +
        `tl.from('#${id} .circle,#${id} .tri,#${id} .half',{scale:0,autoAlpha:0,duration:0.24,stagger:0.09,ease:'back.out(2)'},0.44);\n` +
        `tl.from('#${id} .dots',{autoAlpha:0,duration:0.22},0.62);\n` +
        `tl.to('#${id} .zig polyline',{strokeDashoffset:0,duration:0.4,ease:'power2.out'},0.7);`,
    ),
};
