/**
 * Chalkboard — classroom-blackboard dialect: wood-framed board, dashed chalk boxes, hand-drawn
 * underlines, ①②③ numbering, dashed word circles, chalk dust. Layout logic: slightly tilted
 * handwritten scatter, no straight orthogonal alignment.
 */

import { type Block, mk } from './shared';

const ckRoot = (id: string) => `
#${id} .board{position:absolute;inset:0;border:14px solid var(--panel-2);color:var(--fg);font-family:var(--font-head);}
#${id} .ul{position:absolute;left:-14px;right:-26px;bottom:-12px;height:5px;background:var(--accent);transform:rotate(-0.8deg);}
#${id} .tag{position:absolute;right:84px;top:74px;transform:rotate(3deg);border:3px dashed var(--accent-2);color:var(--accent-2);font-size:38px;font-weight:700;padding:14px 30px;letter-spacing:0.1em;}
#${id} .dust i{position:absolute;border-radius:999px;background:var(--fg);opacity:0.38;}`;

const dust = `<div class="dust">
  <i style="left:200px;top:190px;width:4px;height:4px"></i>
  <i style="left:250px;top:230px;width:3px;height:3px"></i>
  <i style="right:260px;bottom:180px;width:4px;height:4px"></i>
  <i style="right:210px;bottom:230px;width:3px;height:3px"></i>
  <i style="left:320px;bottom:150px;width:3px;height:3px"></i>
</div>`;

export const cover: () => Block = () =>
  mk(
    'cv_ck',
    '封面',
    (id) => `
<div class="board">
  <div class="box">
    <div class="h"><span class="hw">黑板<i class="ul"></i></span></div>
    <div class="s">CHALKBOARD · 板书风</div>
  </div>
  <div class="tag">新课</div>
  <div class="n1">①</div><div class="n2">②</div><div class="n3">③</div>
  ${dust}
</div>
<style>${ckRoot(id)}
#${id} .box{position:absolute;left:340px;right:340px;top:50%;transform:translateY(-52%) rotate(-0.6deg);border:3px dashed var(--line);padding:110px 80px;display:flex;flex-direction:column;align-items:center;gap:54px;}
#${id} .h{font-size:290px;font-weight:800;line-height:1;}
#${id} .hw{position:relative;display:inline-block;}
#${id} .s{font-family:var(--font-num);font-size:38px;letter-spacing:0.3em;color:var(--muted);}
#${id} .n1,#${id} .n2,#${id} .n3{position:absolute;font-size:66px;color:var(--accent);}
#${id} .n1{left:150px;top:140px;transform:rotate(-8deg);}
#${id} .n2{left:190px;bottom:130px;transform:rotate(5deg);}
#${id} .n3{right:170px;bottom:300px;transform:rotate(-5deg);}
</style>`,
    (id) =>
      `tl.from('#${id} .box',{autoAlpha:0,rotation:-3,duration:0.3,ease:'power2.out'},0);\n` +
      `tl.from('#${id} .h',{autoAlpha:0,duration:0.28},0.14);\n` +
      `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.26,ease:'power2.out'},0.4);\n` +
      `tl.from('#${id} .s,#${id} .n1,#${id} .n2,#${id} .n3',{autoAlpha:0,duration:0.24,stagger:0.06},0.5);\n` +
      `tl.from('#${id} .tag',{scale:1.5,autoAlpha:0,rotation:14,duration:0.24,ease:'power3.in'},0.8);`,
  );

export const blocks: Record<string, () => Block> = {
  'title-card': () =>
    mk(
      'ck_ttl',
      'title-card',
      (id) => `
<div class="board">
  <div class="date">第 4 课 · 理财入门</div>
  <div class="box">
    <div class="h">三步讲透<span class="key">复利<i class="ul"></i></span></div>
    <div class="sub">利息自己会 <b class="warn">再生利息</b></div>
  </div>
  <div class="tag">划重点</div>
  ${dust}
</div>
<style>${ckRoot(id)}
#${id} .board{background-color:var(--paper);}
#${id} .date{position:absolute;left:110px;top:88px;font-size:38px;color:var(--muted);transform:rotate(-1deg);letter-spacing:0.08em;}
#${id} .box{position:absolute;left:220px;right:220px;top:50%;transform:translateY(-52%) rotate(-0.6deg);border:3px dashed var(--line);padding:104px 90px;display:flex;flex-direction:column;align-items:center;gap:52px;}
#${id} .h{font-size:132px;font-weight:800;line-height:1.15;}
#${id} .key{position:relative;display:inline-block;color:var(--accent);padding:0 12px;}
#${id} .sub{font-size:52px;color:var(--muted);}
#${id} .sub .warn{color:var(--accent-2);font-weight:700;}
</style>`,
      (id) =>
        `tl.from('#${id} .date',{autoAlpha:0,duration:0.22},0);\n` +
        `tl.from('#${id} .box',{autoAlpha:0,rotation:-3,duration:0.3,ease:'power2.out'},0.08);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,duration:0.28},0.22);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.26,ease:'power2.out'},0.46);\n` +
        `tl.from('#${id} .sub',{autoAlpha:0,y:16,duration:0.24},0.58);\n` +
        `tl.from('#${id} .tag',{scale:1.5,autoAlpha:0,rotation:14,duration:0.24,ease:'power3.in'},0.8);`,
    ),
  'chapters': () =>
    mk(
      'ck_chp',
      'chapters',
      (id) => `
<div class="board">
  <div class="cap"><span class="hw">今日课表<i class="ul"></i></span></div>
  <div class="row">
    <div class="it i1"><i>①</i><b>先记账</b></div>
    <div class="it i2 cur"><span class="hl"></span><i>②</i><b>再分桶</b></div>
    <div class="it i3"><i>③</i><b>后自动</b></div>
  </div>
  <div class="now">正讲到 · <b class="key">再分桶</b></div>
  <div class="sub">工资到账先分三份</div>
  <div class="tag">别走神</div>
  ${dust}
</div>
<style>${ckRoot(id)}
#${id} .board{background-color:var(--paper);}
#${id} .cap{position:absolute;left:170px;top:128px;font-size:52px;font-weight:700;transform:rotate(-0.8deg);}
#${id} .hw{position:relative;display:inline-block;}
#${id} .row{position:absolute;left:0;right:0;top:300px;display:flex;justify-content:center;gap:130px;}
#${id} .it{position:relative;display:flex;align-items:baseline;gap:26px;padding:30px 44px;}
#${id} .it i{font-style:normal;font-size:54px;color:var(--accent);}
#${id} .it b{font-size:58px;font-weight:700;color:var(--muted);}
#${id} .it.cur b{color:var(--fg);}
#${id} .i1{transform:rotate(-0.5deg);}
#${id} .i2{transform:rotate(0.4deg);}
#${id} .i3{transform:rotate(-0.3deg);}
#${id} .hl{position:absolute;inset:0;border:3px dashed var(--accent);transform:rotate(-0.6deg);}
#${id} .now{position:absolute;left:0;right:0;top:568px;text-align:center;font-size:110px;font-weight:800;transform:rotate(-0.6deg);}
#${id} .now .key{color:var(--accent);}
#${id} .sub{position:absolute;left:0;right:0;top:770px;text-align:center;font-size:46px;color:var(--muted);transform:rotate(-0.4deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.24,ease:'power2.out'},0.18);\n` +
        `tl.from('#${id} .it',{x:-40,autoAlpha:0,duration:0.26,stagger:0.12,ease:'power2.out'},0.3);\n` +
        `tl.from('#${id} .hl',{scale:0.6,autoAlpha:0,rotation:6,duration:0.26,ease:'power2.out'},0.7);\n` +
        `tl.from('#${id} .now',{autoAlpha:0,y:20,duration:0.26},0.82);\n` +
        `tl.from('#${id} .sub',{autoAlpha:0,duration:0.24},0.92);\n` +
        `tl.from('#${id} .tag',{scale:1.5,autoAlpha:0,rotation:14,duration:0.24,ease:'power3.in'},0.94);`,
    ),
  'list': () =>
    mk(
      'ck_lst',
      'list',
      (id) => `
<div class="board">
  <div class="cap"><span class="hw">今日板书 · 攒钱三步<i class="ul"></i></span></div>
  <div class="ls">
    <div class="r r1"><i>①</i><b class="key">先记账</b><span>摸清钱到底去了哪</span></div>
    <div class="r r2"><i>②</i><b>再分桶</b><span>工资到账先分三份</span></div>
    <div class="r r3"><i>③</i><b>后自动</b><span class="warn">别靠意志力,靠扣款日</span></div>
  </div>
  <div class="tag">要考</div>
  ${dust}
</div>
<style>${ckRoot(id)}
#${id} .board{background-color:var(--paper);}
#${id} .cap{position:absolute;left:170px;top:130px;font-size:52px;font-weight:700;transform:rotate(-0.8deg);}
#${id} .hw{position:relative;display:inline-block;}
#${id} .ls{position:absolute;left:170px;right:170px;top:320px;display:flex;flex-direction:column;}
#${id} .r{display:flex;align-items:baseline;gap:44px;padding:46px 10px;border-bottom:3px dashed var(--line);}
#${id} .r:last-child{border-bottom:none;}
#${id} .r i{font-style:normal;font-size:64px;color:var(--accent);}
#${id} .r b{font-size:62px;font-weight:700;}
#${id} .r b.key{color:var(--accent);}
#${id} .r span{font-size:42px;color:var(--muted);margin-left:26px;}
#${id} .r span.warn{color:var(--accent-2);}
#${id} .r1{transform:rotate(-0.4deg);}
#${id} .r2{transform:rotate(0.3deg);}
#${id} .r3{transform:rotate(-0.3deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.24,ease:'power2.out'},0.18);\n` +
        `tl.from('#${id} .r',{x:-40,autoAlpha:0,duration:0.26,stagger:0.13,ease:'power2.out'},0.3);\n` +
        `tl.from('#${id} .tag',{scale:1.5,autoAlpha:0,rotation:14,duration:0.24,ease:'power3.in'},0.84);`,
    ),
  'quote': () =>
    mk(
      'ck_qte',
      'quote',
      (id) => `
<div class="board">
  <div class="qm">“</div>
  <div class="q">钱不是省出来的<br/>是<span class="em">安排<i class="circ"></i></span>出来的</div>
  <div class="a">—— 下课前最后一句</div>
  <div class="tag">背下来</div>
  ${dust}
</div>
<style>${ckRoot(id)}
#${id} .board{background-color:var(--paper);}
#${id} .board{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:44px;}
#${id} .qm{font-size:190px;line-height:0.4;height:80px;color:var(--accent);transform:rotate(-2deg);}
#${id} .q{font-size:108px;font-weight:700;line-height:1.55;text-align:center;transform:rotate(-0.5deg);}
#${id} .em{position:relative;display:inline-block;color:var(--accent);padding:0 16px;}
#${id} .circ{position:absolute;inset:-14px -30px;border:4px dashed var(--accent);border-radius:50%;transform:rotate(-4deg);}
#${id} .a{font-size:38px;color:var(--muted);transform:rotate(-0.6deg);letter-spacing:0.08em;}
</style>`,
      (id) =>
        `tl.from('#${id} .qm',{y:-30,autoAlpha:0,duration:0.26,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .q',{autoAlpha:0,duration:0.32},0.14);\n` +
        `tl.from('#${id} .circ',{scale:0.5,autoAlpha:0,rotation:8,duration:0.28,ease:'power2.out'},0.52);\n` +
        `tl.from('#${id} .a',{autoAlpha:0,duration:0.24},0.66);\n` +
        `tl.from('#${id} .tag',{scale:1.5,autoAlpha:0,rotation:14,duration:0.24,ease:'power3.in'},0.84);`,
    ),
  'qa': () =>
    mk(
      'ck_qa',
      'qa',
      (id) => `
<div class="board">
  <div class="cap">课堂提问 · 想好再举手</div>
  <div class="qrow"><span class="qm">Q<i class="circ"></i></span><div class="qt">同样年化 5%,单利和复利,<br/>三十年差多少?</div></div>
  <div class="arow"><span class="am">A</span><div class="at">差出一套<b class="key">首付<i class="ul"></i></b></div></div>
  <div class="tag">送分题</div>
  ${dust}
</div>
<style>${ckRoot(id)}
#${id} .board{background-color:var(--paper);}
#${id} .cap{position:absolute;left:170px;top:128px;font-size:48px;color:var(--muted);letter-spacing:0.06em;transform:rotate(-0.8deg);}
#${id} .qrow{position:absolute;left:200px;right:150px;top:296px;display:flex;align-items:flex-start;gap:70px;transform:rotate(-0.4deg);}
#${id} .qm{position:relative;display:inline-block;font-size:110px;font-weight:800;line-height:1;color:var(--accent);}
#${id} .circ{position:absolute;inset:-18px -30px;border:4px dashed var(--accent);border-radius:50%;transform:rotate(-6deg);}
#${id} .qt{font-size:80px;font-weight:700;line-height:1.5;}
#${id} .arow{position:absolute;left:200px;right:150px;top:680px;display:flex;align-items:flex-start;gap:70px;transform:rotate(0.3deg);}
#${id} .am{font-size:110px;font-weight:800;line-height:1;}
#${id} .at{font-size:84px;font-weight:700;line-height:1.3;padding-top:8px;}
#${id} .key{position:relative;display:inline-block;color:var(--accent);padding:0 12px;}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .qm',{autoAlpha:0,duration:0.24},0.12);\n` +
        `tl.from('#${id} .qt',{autoAlpha:0,duration:0.28},0.2);\n` +
        `tl.from('#${id} .circ',{scale:0.5,autoAlpha:0,rotation:8,duration:0.26,ease:'power2.out'},0.42);\n` +
        `tl.from('#${id} .arow',{autoAlpha:0,y:24,duration:0.28,ease:'power2.out'},0.62);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.24,ease:'power2.out'},0.84);\n` +
        `tl.from('#${id} .tag',{scale:1.5,autoAlpha:0,rotation:14,duration:0.24,ease:'power3.in'},0.94);`,
    ),
  'big-number': () =>
    mk(
      'ck_num',
      'big-number',
      (id) => `
<div class="board">
  <div class="cap">复利里最狠的变量,是时间</div>
  <div class="nw"><span class="v">30<i>年</i></span><i class="circ"></i></div>
  <div class="sub">本金悄悄翻 <b class="key">17 倍</b></div>
  <div class="tag">必考</div>
  ${dust}
</div>
<style>${ckRoot(id)}
#${id} .board{background-color:var(--paper);}
#${id} .cap{position:absolute;left:0;right:0;top:150px;text-align:center;font-size:50px;color:var(--muted);transform:rotate(-0.8deg);}
#${id} .nw{position:absolute;left:50%;top:47%;transform:translate(-50%,-50%) rotate(-1deg);}
#${id} .v{position:relative;display:inline-block;font-size:330px;font-weight:800;line-height:1;}
#${id} .v i{font-style:normal;font-size:130px;margin-left:14px;}
#${id} .circ{position:absolute;inset:-34px -76px;border:4px dashed var(--accent);border-radius:50%;transform:rotate(-4deg);}
#${id} .sub{position:absolute;left:0;right:0;bottom:150px;text-align:center;font-size:54px;color:var(--muted);transform:rotate(-0.5deg);}
#${id} .sub .key{color:var(--accent);font-weight:700;}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .v',{autoAlpha:0,duration:0.3},0.12);\n` +
        `tl.from('#${id} .circ',{scale:0.5,autoAlpha:0,rotation:8,duration:0.28,ease:'power2.out'},0.44);\n` +
        `tl.from('#${id} .sub',{autoAlpha:0,y:16,duration:0.24},0.6);\n` +
        `tl.from('#${id} .tag',{scale:1.5,autoAlpha:0,rotation:14,duration:0.24,ease:'power3.in'},0.8);`,
    ),
  'steps': () =>
    mk(
      'ck_stp',
      'steps',
      (id) => `
<div class="board">
  <div class="cap">解题三步 · 抄在笔记本上</div>
  <div class="row">
    <div class="bx b1"><i class="cno">①</i><b>审题</b><span>圈出已知条件</span></div>
    <svg class="ar a1" viewBox="0 0 120 60"><path d="M8 40 C40 18 76 20 106 32"/><path d="M90 18 L108 32 L86 44"/></svg>
    <div class="bx b2"><i class="cno">②</i><b>列式</b><span>套公式再变形</span></div>
    <svg class="ar a2" viewBox="0 0 120 60"><path d="M8 40 C40 18 76 20 106 32"/><path d="M90 18 L108 32 L86 44"/></svg>
    <div class="bx b3"><i class="cno">③</i><b class="ans">得解<i class="ul"></i></b><span>代回验算一遍</span></div>
  </div>
  <div class="tag">别跳步</div>
  ${dust}
</div>
<style>${ckRoot(id)}
#${id} .board{background-color:var(--paper);}
#${id} .cap{position:absolute;left:170px;top:140px;font-size:52px;font-weight:700;transform:rotate(-0.8deg);}
#${id} .row{position:absolute;left:130px;right:130px;top:380px;display:flex;align-items:center;justify-content:space-between;}
#${id} .bx{width:400px;border:3px dashed var(--line);padding:52px 0;display:flex;flex-direction:column;align-items:center;gap:26px;}
#${id} .b1{transform:rotate(-0.6deg);}
#${id} .b2{transform:rotate(0.5deg);}
#${id} .b3{transform:rotate(-0.4deg);}
#${id} .cno{font-style:normal;font-size:64px;color:var(--accent);}
#${id} .bx b{font-size:60px;font-weight:700;}
#${id} .ans{position:relative;display:inline-block;}
#${id} .bx span{font-size:36px;color:var(--muted);}
#${id} .ar{width:120px;height:60px;transform:rotate(-2deg);}
#${id} .ar path{fill:none;stroke:var(--fg);stroke-width:5;stroke-linecap:round;stroke-linejoin:round;opacity:0.8;}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .b1',{autoAlpha:0,rotation:-3,duration:0.26,ease:'power2.out'},0.1);\n` +
        `tl.from('#${id} .a1',{autoAlpha:0,x:-20,duration:0.2},0.32);\n` +
        `tl.from('#${id} .b2',{autoAlpha:0,rotation:2,duration:0.26,ease:'power2.out'},0.42);\n` +
        `tl.from('#${id} .a2',{autoAlpha:0,x:-20,duration:0.2},0.62);\n` +
        `tl.from('#${id} .b3',{autoAlpha:0,rotation:-3,duration:0.26,ease:'power2.out'},0.7);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.24,ease:'power2.out'},0.92);\n` +
        `tl.from('#${id} .tag',{scale:1.5,autoAlpha:0,rotation:14,duration:0.24,ease:'power3.in'},0.94);`,
    ),
  'code': () =>
    mk(
      'ck_cod',
      'code',
      (id) => `
<div class="board">
  <div class="cap"><span class="hw">板书代码 · 复利一行<i class="ul"></i></span></div>
  <div class="code">
    <div class="ln l1"><i>1</i><code>p = 10000</code><em class="cm"># 本金,先站住</em></div>
    <div class="ln l2"><i>2</i><code>r, n = 0.05, 30</code><em class="cm"># 利率别贪,年头要长</em></div>
    <div class="ln l3"><span class="hl"></span><i>3</i><code>total = p * (1 + r) ** n</code><em class="cm key"># 就这行,钱生钱</em></div>
    <div class="ln l4"><i>4</i><code>&gt;&gt;&gt; 43219.42</code><em class="cm"># 本金翻 4.3 倍</em></div>
  </div>
  <div class="tag">抄这行</div>
  ${dust}
</div>
<style>${ckRoot(id)}
#${id} .board{background-color:var(--paper);}
#${id} .cap{position:absolute;left:170px;top:128px;font-size:52px;font-weight:700;transform:rotate(-0.8deg);}
#${id} .hw{position:relative;display:inline-block;}
#${id} .code{position:absolute;left:190px;right:190px;top:312px;display:flex;flex-direction:column;gap:56px;}
#${id} .ln{position:relative;display:flex;align-items:baseline;gap:44px;}
#${id} .ln i{font-style:normal;font-family:var(--font-num);font-size:34px;color:var(--muted);width:44px;text-align:right;flex:none;}
#${id} .ln code{font-family:var(--font-num);font-size:50px;letter-spacing:0.02em;}
#${id} .cm{font-style:normal;font-size:36px;color:var(--muted);margin-left:auto;transform:rotate(-1.2deg);}
#${id} .cm.key{color:var(--accent);}
#${id} .hl{position:absolute;inset:-22px -34px;border:3px dashed var(--accent);transform:rotate(-0.5deg);}
#${id} .l1{transform:rotate(-0.3deg);}
#${id} .l2{transform:rotate(0.25deg);}
#${id} .l3{transform:rotate(-0.25deg);}
#${id} .l4{transform:rotate(0.2deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.24,ease:'power2.out'},0.18);\n` +
        `tl.from('#${id} .l1,#${id} .l2,#${id} .l3',{x:-40,autoAlpha:0,duration:0.24,stagger:0.12,ease:'power2.out'},0.28);\n` +
        `tl.from('#${id} .cm',{autoAlpha:0,duration:0.22,stagger:0.07},0.48);\n` +
        `tl.from('#${id} .hl',{scale:0.6,autoAlpha:0,rotation:5,duration:0.24,ease:'power2.out'},0.72);\n` +
        `tl.from('#${id} .l4',{x:-40,autoAlpha:0,duration:0.24,ease:'power2.out'},0.86);\n` +
        `tl.from('#${id} .tag',{scale:1.5,autoAlpha:0,rotation:14,duration:0.24,ease:'power3.in'},0.94);`,
    ),
  'cta': () =>
    mk(
      'ck_cta',
      'cta',
      (id) => `
<div class="board">
  <div class="box">
    <div class="h">下课别走</div>
    <div class="c2">点个<span class="em">关注<i class="ul"></i><i class="circ"></i></span>再交作业</div>
    <div class="s">每周三晚 · 更新下一课</div>
  </div>
  <div class="tag">回家作业</div>
  ${dust}
</div>
<style>${ckRoot(id)}
#${id} .board{background-color:var(--paper);}
#${id} .box{position:absolute;left:300px;right:300px;top:50%;transform:translateY(-52%) rotate(-0.6deg);border:3px dashed var(--line);padding:100px 80px;display:flex;flex-direction:column;align-items:center;gap:54px;}
#${id} .h{font-size:150px;font-weight:800;line-height:1;}
#${id} .c2{font-size:78px;}
#${id} .em{position:relative;display:inline-block;color:var(--accent);padding:0 18px;}
#${id} .circ{position:absolute;inset:-16px -30px;border:4px dashed var(--accent);border-radius:50%;transform:rotate(-4deg);}
#${id} .s{font-size:38px;color:var(--muted);letter-spacing:0.08em;transform:rotate(-0.5deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .box',{autoAlpha:0,rotation:-3,duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,duration:0.26},0.14);\n` +
        `tl.from('#${id} .c2',{autoAlpha:0,y:16,duration:0.24},0.3);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.24,ease:'power2.out'},0.5);\n` +
        `tl.from('#${id} .circ',{scale:0.5,autoAlpha:0,rotation:8,duration:0.26,ease:'power2.out'},0.62);\n` +
        `tl.from('#${id} .s',{autoAlpha:0,duration:0.24},0.74);\n` +
        `tl.from('#${id} .tag',{scale:1.5,autoAlpha:0,rotation:14,duration:0.24,ease:'power3.in'},0.86);`,
    ),
};
