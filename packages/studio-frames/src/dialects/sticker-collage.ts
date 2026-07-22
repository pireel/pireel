/**
 * Sticker dialect — campus sticker collage (Apple Education Store reference): mostly a light-gray
 * paper base where everything looks "stuck on" — white die-cut stickers (soft shadow + slight tilt)
 * as the main container, colored stickers (cyan/pink + white rim) and small black label pills as
 * accents, highlighter blocks over keywords, a pink halftone starburst popping last. Black stays in
 * small doses (pills/index dots/one chalkboard sticker) and never dominates. Motion family = stickers
 * slapping on with back.out.
 * (Paired frame-level personFx: matte the subject and add the same white outline; cover/title-card
 * leave room on the right for a person.)
 */

import { type Block, mk } from './shared';

const stRoot = (id: string) => `
#${id} .st{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
#${id} .stk{position:absolute;background:var(--panel);border-radius:30px;box-shadow:var(--shadow);}
#${id} .stc{position:absolute;background:var(--accent);border:10px solid var(--panel);border-radius:26px;box-shadow:var(--shadow);color:var(--fg);}
#${id} .stp{position:absolute;background:var(--accent-2);border:10px solid var(--panel);border-radius:26px;box-shadow:var(--shadow);color:var(--panel);}
#${id} .stb{position:absolute;background:var(--panel-2);border:10px solid var(--panel);border-radius:26px;box-shadow:var(--shadow);color:var(--panel);}
#${id} .cap{position:absolute;display:inline-flex;align-items:center;background:var(--panel-2);color:var(--panel);font-size:30px;font-weight:700;letter-spacing:0.14em;padding:12px 30px;border-radius:999px;box-shadow:var(--shadow);white-space:nowrap;}
#${id} .mk{background:var(--accent);color:var(--fg);padding:2px 18px;display:inline-block;}
#${id} .burst{position:absolute;display:flex;align-items:center;justify-content:center;color:var(--panel);font-weight:900;filter:drop-shadow(0 10px 18px rgb(29 29 31/0.18));
  clip-path:polygon(50% 0%,59% 35%,95% 6%,66% 41%,100% 50%,66% 59%,95% 94%,59% 65%,50% 100%,41% 65%,5% 94%,34% 59%,0% 50%,34% 41%,5% 6%,41% 35%);
  background-color:var(--accent-2);background-image:radial-gradient(var(--panel) 18%,transparent 19%);background-size:12px 12px;}
#${id} .dot{position:absolute;display:flex;align-items:center;justify-content:center;background:var(--panel-2);color:var(--panel);border:8px solid var(--panel);border-radius:999px;box-shadow:var(--shadow);font-weight:900;}
#${id} .deco{position:absolute;border-radius:999px;box-shadow:var(--shadow);border:8px solid var(--panel);}
#${id} .pair{position:absolute;font-size:52px;font-weight:800;white-space:nowrap;}
#${id} .pair span{color:var(--muted);}`;

const MK_SWEEP = `{scaleX:0,transformOrigin:'left center',duration:0.25,ease:'power3.out'}`;
const SLAP = `{scale:0.6,rotation:'-=8',autoAlpha:0,duration:0.3,ease:'back.out(1.7)'}`;
const POP = `{scale:0,autoAlpha:0,duration:0.26,ease:'back.out(2)'}`;

export const cover: () => Block = () =>
  mk(
    'cv_st',
    '封面',
    (id) => `
<div class="st">
  <div class="stk hero" style="transform:rotate(-2.5deg);">
    <div class="h">贴纸</div>
    <div class="sub">STICKER · 把重点贴出来</div>
  </div>
  <div class="cap" style="left:150px;top:130px;transform:rotate(-4deg);">白边裁切 DIE-CUT</div>
  <div class="stc" style="left:920px;top:150px;padding:18px 40px;font-size:44px;font-weight:900;transform:rotate(5deg);">新学期</div>
  <div class="burst" style="left:1030px;top:640px;width:200px;height:200px;font-size:52px;transform:rotate(-12deg);">NEW</div>
  <div class="deco" style="left:80px;top:640px;width:84px;height:84px;background:var(--accent);transform:rotate(8deg);"></div>
  <div class="dot" style="left:1180px;top:360px;width:92px;height:92px;font-size:44px;transform:rotate(6deg);">✂</div>
  <div class="pair" style="left:150px;bottom:120px;"><b class="mk">好物。</b><span>贴出来才记得住。</span></div>
</div>
<style>${stRoot(id)}
#${id} .hero{left:120px;top:250px;width:780px;height:520px;}
#${id} .h{position:absolute;left:90px;top:70px;font-size:250px;font-weight:900;line-height:1;letter-spacing:0.04em;}
#${id} .sub{position:absolute;left:96px;bottom:64px;font-size:34px;font-weight:700;letter-spacing:0.22em;color:var(--muted);}
</style>`,
    (id) =>
      `tl.from('#${id} .hero',${SLAP},0);\n` +
      `tl.from('#${id} .cap',${SLAP.replace('0.3', '0.26')},0.18);\n` +
      `tl.from('#${id} .stc',${SLAP.replace('0.3', '0.26')},0.3);\n` +
      `tl.from('#${id} .dot',${POP},0.42);\n` +
      `tl.from('#${id} .deco',${POP},0.5);\n` +
      `tl.from('#${id} .pair',{autoAlpha:0,y:24,duration:0.24,ease:'power3.out'},0.56);\n` +
      `tl.from('#${id} .mk',${MK_SWEEP},0.68);\n` +
      `tl.from('#${id} .burst',${POP},0.84);`,
  );

export const blocks: Record<string, () => Block> = {
  标题卡: () =>
    mk(
      'st_ttl',
      '标题卡',
      (id) => `
<div class="st">
  <div class="stk hero" style="transform:rotate(-2deg);">
    <div class="h">三件开学好物</div>
    <div class="sub">都是自费买的 · 无广</div>
  </div>
  <div class="cap" style="left:170px;top:150px;transform:rotate(-4deg);">开箱 UNBOX</div>
  <div class="stp" style="left:1150px;top:200px;padding:16px 36px;font-size:40px;font-weight:900;transform:rotate(6deg);">第一期</div>
  <div class="burst" style="left:1230px;top:660px;width:190px;height:190px;font-size:50px;transform:rotate(-10deg);">真香</div>
  <div class="deco" style="left:96px;bottom:260px;width:72px;height:72px;background:var(--accent-2);transform:rotate(-6deg);"></div>
  <div class="pair" style="left:170px;bottom:130px;"><b class="mk">第一件。</b><span>就把预算打醒。</span></div>
</div>
<style>${stRoot(id)}
#${id} .hero{left:140px;top:270px;width:1000px;height:460px;}
#${id} .h{position:absolute;left:80px;top:110px;font-size:130px;font-weight:900;line-height:1.15;}
#${id} .sub{position:absolute;left:84px;bottom:60px;font-size:32px;font-weight:700;letter-spacing:0.2em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .hero',${SLAP},0);\n` +
        `tl.from('#${id} .cap',${SLAP.replace('0.3', '0.26')},0.18);\n` +
        `tl.from('#${id} .stp',${SLAP.replace('0.3', '0.26')},0.3);\n` +
        `tl.from('#${id} .pair',{autoAlpha:0,y:24,duration:0.24,ease:'power3.out'},0.46);\n` +
        `tl.from('#${id} .mk',${MK_SWEEP},0.58);\n` +
        `tl.from('#${id} .deco',${POP},0.7);\n` +
        `tl.from('#${id} .burst',${POP},0.84);`,
    ),
  大数字: () =>
    mk(
      'st_num',
      '大数字',
      (id) => `
<div class="st">
  <div class="stk big" style="transform:rotate(-2.5deg);">
    <div class="v"><b class="n">4799</b><i>元</i></div>
  </div>
  <div class="stc" style="left:330px;top:170px;padding:16px 38px;font-size:38px;font-weight:900;transform:rotate(-5deg);">教育价 EDU</div>
  <div class="burst" style="right:300px;top:180px;width:210px;height:210px;font-size:50px;transform:rotate(12deg);">省 500</div>
  <div class="deco" style="right:250px;bottom:230px;width:80px;height:80px;background:var(--accent);transform:rotate(10deg);"></div>
  <div class="pair" style="left:0;right:0;bottom:110px;text-align:center;"><b class="mk">比官网省 500。</b><span>白捡。</span></div>
</div>
<style>${stRoot(id)}
#${id} .big{left:430px;right:430px;top:250px;height:520px;display:flex;align-items:center;justify-content:center;}
#${id} .v{display:flex;align-items:baseline;gap:26px;}
#${id} .n{font-size:340px;font-weight:900;letter-spacing:-0.02em;line-height:1;}
#${id} .v i{font-style:normal;font-size:66px;font-weight:800;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .big',${SLAP},0);\n` +
        `tl.to({v:0},{v:4799,duration:0.7,ease:'power2.out',onUpdate:function(){document.querySelector('#${id} .n').textContent=String(Math.round(this.targets()[0].v))}},0.16);\n` +
        `tl.from('#${id} .stc',${SLAP.replace('0.3', '0.26')},0.3);\n` +
        `tl.from('#${id} .pair',{autoAlpha:0,y:24,duration:0.24,ease:'power3.out'},0.52);\n` +
        `tl.from('#${id} .mk',${MK_SWEEP},0.64);\n` +
        `tl.from('#${id} .deco',${POP},0.78);\n` +
        `tl.from('#${id} .burst',${POP},0.9);`,
    ),
  列表: () =>
    mk(
      'st_lst',
      '列表',
      (id) => `
<div class="st">
  <div class="cap" style="left:170px;top:100px;transform:rotate(-3deg);">开学清单 LIST</div>
  <div class="deco" style="right:170px;top:110px;width:70px;height:70px;background:var(--accent-2);transform:rotate(8deg);"></div>
  <div class="stk row r1"><span class="dot d" style="background:var(--panel-2);">1</span><b>降噪耳机</b><i class="mk">上课别戴。</i></div>
  <div class="stk row r2"><span class="dot d" style="background:var(--accent);color:var(--fg);">2</span><b>便携支架</b></div>
  <div class="stk row r3"><span class="dot d" style="background:var(--accent-2);">3</span><b>氮化镓充电头</b></div>
</div>
<style>${stRoot(id)}
#${id} .row{left:220px;right:220px;height:176px;display:flex;align-items:center;gap:44px;padding:0 66px;font-size:62px;font-weight:800;}
#${id} .row i{font-style:normal;font-size:36px;font-weight:800;margin-left:auto;}
#${id} .row .d{position:static;width:86px;height:86px;font-size:44px;flex:none;}
#${id} .r1{top:230px;transform:rotate(-1.6deg);}
#${id} .r2{top:460px;transform:rotate(1.2deg);}
#${id} .r3{top:690px;transform:rotate(-0.8deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',${SLAP.replace('0.3', '0.26')},0);\n` +
        `tl.from('#${id} .r1',{x:-90,scale:0.85,autoAlpha:0,duration:0.28,ease:'back.out(1.6)'},0.14);\n` +
        `tl.from('#${id} .r2',{x:90,scale:0.85,autoAlpha:0,duration:0.28,ease:'back.out(1.6)'},0.28);\n` +
        `tl.from('#${id} .r3',{x:-90,scale:0.85,autoAlpha:0,duration:0.28,ease:'back.out(1.6)'},0.42);\n` +
        `tl.from('#${id} .d',{scale:0,duration:0.22,stagger:0.12,ease:'back.out(2)'},0.32);\n` +
        `tl.from('#${id} .mk',${MK_SWEEP},0.66);\n` +
        `tl.from('#${id} .deco',${POP},0.8);`,
    ),
  步骤: () =>
    mk(
      'st_stp',
      '步骤',
      (id) => `
<div class="st">
  <div class="cap" style="left:50%;top:110px;transform:translateX(-50%) rotate(-2deg);">领取路线 HOW-TO</div>
  <div class="stk sq s1"><em>STEP 1</em><b>领教育优惠</b></div>
  <svg class="ar a1" viewBox="0 0 120 60"><path d="M8,46 Q60,6 112,34"/></svg>
  <div class="stc sq s2"><em>STEP 2</em><b>叠以旧换新</b></div>
  <svg class="ar a2" viewBox="0 0 120 60"><path d="M8,20 Q60,54 112,28"/></svg>
  <div class="stk sq s3"><em>STEP 3</em><b>分期免息</b><i class="mk um"></i></div>
</div>
<style>${stRoot(id)}
#${id} .sq{top:50%;transform:translateY(-50%) rotate(-2deg);width:470px;height:420px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;}
#${id} .sq em{font-style:normal;font-size:30px;font-weight:700;letter-spacing:0.2em;color:var(--muted);}
#${id} .stc.sq em{color:var(--fg);opacity:0.72;}
#${id} .sq b{font-size:56px;font-weight:900;}
#${id} .s1{left:110px;}
#${id} .s2{left:725px;transform:translateY(-50%) rotate(2.2deg);}
#${id} .s3{right:110px;transform:translateY(-50%) rotate(-1.4deg);}
#${id} .um{position:absolute;left:88px;right:88px;bottom:60px;height:16px;padding:0;}
#${id} .ar{position:absolute;top:40%;width:130px;height:66px;}
#${id} .ar path{fill:none;stroke:var(--fg);stroke-width:7;stroke-linecap:round;stroke-dasharray:2 16;}
#${id} .a1{left:592px;}
#${id} .a2{right:592px;}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',${SLAP.replace('0.3', '0.26')},0);\n` +
        `tl.from('#${id} .s1',${SLAP},0.12);\n` +
        `tl.from('#${id} .a1 path',{strokeDashoffset:220,duration:0.3,ease:'power2.out'},0.32);\n` +
        `tl.from('#${id} .s2',{scale:0.5,rotation:'-=10',autoAlpha:0,duration:0.32,ease:'back.out(1.7)'},0.46);\n` +
        `tl.from('#${id} .a2 path',{strokeDashoffset:220,duration:0.3,ease:'power2.out'},0.66);\n` +
        `tl.from('#${id} .s3',${SLAP},0.8);\n` +
        `tl.from('#${id} .um',${MK_SWEEP},1.04);`,
    ),
  对比: () =>
    mk(
      'st_cmp',
      '对比',
      (id) => `
<div class="st">
  <div class="stk side sl"><em>普通价</em><b>¥ 9999</b><span class="no">原价入手</span></div>
  <div class="stc side sr"><em>教育价</em><b>¥ 9249</b><span class="yes"><i class="mk">直接省 750。</i></span></div>
  <div class="burst" style="right:210px;top:150px;width:220px;height:220px;font-size:54px;transform:rotate(12deg);">省 750</div>
  <div class="deco" style="left:160px;bottom:160px;width:76px;height:76px;background:var(--accent-2);transform:rotate(-8deg);"></div>
</div>
<style>${stRoot(id)}
#${id} .side{top:50%;width:640px;height:540px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:42px;}
#${id} .side em{font-style:normal;font-size:34px;font-weight:700;letter-spacing:0.16em;color:var(--muted);}
#${id} .stc.side em{color:var(--fg);opacity:0.72;}
#${id} .side b{font-size:110px;font-weight:900;letter-spacing:-0.01em;}
#${id} .no{font-size:36px;color:var(--muted);text-decoration:line-through;}
#${id} .yes{font-size:42px;font-weight:800;}
#${id} .sl{left:180px;transform:translateY(-50%) rotate(-2.5deg);}
#${id} .sr{right:180px;transform:translateY(-50%) rotate(2deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .sl',${SLAP},0);\n` +
        `tl.from('#${id} .sr',{scale:0.5,rotation:'-=10',autoAlpha:0,duration:0.34,ease:'back.out(1.7)'},0.2);\n` +
        `tl.from('#${id} .mk',${MK_SWEEP},0.6);\n` +
        `tl.from('#${id} .deco',${POP},0.72);\n` +
        `tl.from('#${id} .burst',${POP},0.86);`,
    ),
  金句: () =>
    mk(
      'st_qte',
      '金句',
      (id) => `
<div class="st">
  <div class="cap" style="left:190px;top:130px;transform:rotate(-3deg);">学姐的忠告</div>
  <div class="stb board" style="transform:rotate(-1.5deg);">
    <div class="ln">预算有限,</div>
    <div class="ln"><b class="mk">花在刀刃上。</b></div>
  </div>
  <div class="stc qm" style="transform:rotate(-8deg);">“</div>
  <div class="burst" style="right:230px;bottom:170px;width:170px;height:170px;font-size:44px;transform:rotate(10deg);">记住</div>
  <div class="deco" style="right:190px;top:180px;width:72px;height:72px;background:var(--accent);transform:rotate(6deg);"></div>
</div>
<style>${stRoot(id)}
#${id} .board{left:270px;right:270px;top:300px;height:480px;display:flex;flex-direction:column;justify-content:center;gap:26px;padding:0 130px;}
#${id} .ln{font-size:104px;font-weight:900;line-height:1.2;}
#${id} .qm{left:190px;top:250px;width:150px;height:150px;display:flex;align-items:flex-end;justify-content:center;font-size:150px;font-weight:900;line-height:0.4;}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',${SLAP.replace('0.3', '0.26')},0);\n` +
        `tl.from('#${id} .board',${SLAP},0.14);\n` +
        `tl.from('#${id} .ln',{autoAlpha:0,y:30,duration:0.24,stagger:0.14,ease:'power3.out'},0.38);\n` +
        `tl.from('#${id} .mk',${MK_SWEEP},0.66);\n` +
        `tl.from('#${id} .qm',{scale:0,rotation:-30,autoAlpha:0,duration:0.3,ease:'back.out(1.8)'},0.8);\n` +
        `tl.from('#${id} .deco',${POP},0.9);\n` +
        `tl.from('#${id} .burst',${POP},1.0);`,
    ),
  评论: () =>
    mk(
      'st_cmt',
      '评论',
      (id) => `
<div class="st">
  <div class="stk bub b1"><span class="hd cap" style="position:static;">@开学搭子</span><b>蹲一个链接!</b></div>
  <div class="stk bub b2"><span class="hd cap" style="position:static;background:var(--accent);color:var(--fg);">@大一新生</span><b>学生认证怎么弄?</b></div>
  <div class="stc bub b3"><span class="hd cap" style="position:static;">UP 回复</span><b>置顶评论区见。</b></div>
  <div class="burst" style="right:430px;top:200px;width:150px;height:150px;font-size:44px;transform:rotate(14deg);">+1</div>
</div>
<style>${stRoot(id)}
#${id} .bub{display:flex;flex-direction:column;gap:20px;padding:42px 58px;font-size:54px;font-weight:800;border-radius:36px;}
#${id} .b1{left:190px;top:150px;transform:rotate(-2deg);border-bottom-left-radius:10px;}
#${id} .b2{right:520px;top:390px;transform:rotate(1.5deg);border-bottom-right-radius:10px;}
#${id} .b3{left:250px;top:660px;transform:rotate(-1deg);border-top-left-radius:10px;}
#${id} .hd{font-size:24px;padding:8px 20px;align-self:flex-start;letter-spacing:0.1em;box-shadow:none;}
</style>`,
      (id) =>
        `tl.from('#${id} .b1',{x:-90,scale:0.85,autoAlpha:0,duration:0.28,ease:'back.out(1.6)'},0);\n` +
        `tl.from('#${id} .b2',{x:90,scale:0.85,autoAlpha:0,duration:0.28,ease:'back.out(1.6)'},0.18);\n` +
        `tl.from('#${id} .burst',${POP.replace('0.26', '0.24')},0.44);\n` +
        `tl.from('#${id} .b3',{y:70,scale:0.85,autoAlpha:0,duration:0.3,ease:'back.out(1.6)'},0.56);`,
    ),
  引导: () =>
    mk(
      'st_cta',
      '引导',
      (id) => `
<div class="st">
  <div class="stk pill" style="transform:translate(-50%,-50%) rotate(-2deg);"><b class="mk">关注</b><span>,不迷路。</span></div>
  <div class="stc" style="left:58%;top:250px;padding:14px 34px;font-size:36px;font-weight:900;transform:rotate(4deg);">每周三更新</div>
  <div class="burst" style="left:330px;bottom:210px;width:200px;height:200px;font-size:54px;transform:rotate(-12deg);">GO!</div>
  <div class="deco" style="left:270px;top:220px;width:78px;height:78px;background:var(--accent-2);transform:rotate(-8deg);"></div>
  <div class="dot" style="right:300px;bottom:280px;width:88px;height:88px;font-size:42px;transform:rotate(8deg);">✓</div>
</div>
<style>${stRoot(id)}
#${id} .pill{left:50%;top:50%;border-radius:999px;padding:66px 116px;font-size:106px;font-weight:900;white-space:nowrap;}
#${id} .pill span{color:var(--muted);}
#${id} .pill .mk{padding:2px 26px;}
</style>`,
      (id) =>
        `tl.from('#${id} .pill',{scale:0.5,rotation:'-=10',autoAlpha:0,duration:0.34,ease:'back.out(1.7)'},0);\n` +
        `tl.from('#${id} .mk',${MK_SWEEP},0.3);\n` +
        `tl.from('#${id} .stc',${SLAP.replace('0.3', '0.26')},0.46);\n` +
        `tl.from('#${id} .deco',${POP},0.6);\n` +
        `tl.from('#${id} .dot',${POP},0.7);\n` +
        `tl.from('#${id} .burst',${POP},0.84);`,
    ),
};
