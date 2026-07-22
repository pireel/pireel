/**
 * Manga — black-and-white panel dialect: 6px ink-line panels, speed lines, speech bubbles,
 * screentone, at most one red per card. Structure logic: panels are unequal in size and each
 * tilted 1-2°; energy comes from line and tilt, not color; emphasis uses an inverted panel.
 */

import { type Block, mk } from './shared';

/** Speed lines (clipped into a corner) + screentone patch. */
const tones = (id: string) => `
#${id} .spd{position:absolute;background:repeating-linear-gradient(65deg,var(--fg) 0 3px,transparent 3px 26px);clip-path:polygon(0 0,100% 0,0 100%);}
#${id} .ht{position:absolute;background-image:radial-gradient(var(--fg) 2.4px,transparent 2.4px);background-size:18px 18px;}`;

export const cover: () => Block = () =>
  mk(
    'cv_mg',
    '封面',
    (id) => `
<div class="rt">
  <div class="pn p1"></div>
  <div class="pn p2"></div>
  <div class="spd"></div>
  <div class="ht"></div>
  <div class="h">漫画</div>
  <div class="tag">第①话</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);}
${tones(id)}
#${id} .pn{position:absolute;background:var(--panel);border:6px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);}
#${id} .pn.p1{left:140px;top:120px;width:1180px;height:840px;transform:rotate(-1deg);}
#${id} .pn.p2{right:130px;top:220px;width:520px;height:620px;transform:rotate(1.6deg);background:var(--fg);}
#${id} .spd{left:146px;top:126px;width:520px;height:400px;transform:rotate(-1deg);}
#${id} .ht{right:560px;bottom:150px;width:420px;height:280px;}
#${id} .h{position:absolute;left:230px;top:50%;transform:translateY(-54%) rotate(-3deg);font-size:340px;font-weight:900;line-height:1;letter-spacing:0.05em;color:var(--paper);-webkit-text-stroke:14px var(--fg);}
#${id} .tag{position:absolute;right:250px;top:160px;border:5px solid var(--accent);color:var(--accent);background:var(--panel);font-size:52px;font-weight:900;padding:14px 34px;transform:rotate(8deg);border-radius:var(--radius);}
</style>`,
    (id) =>
      `tl.from('#${id} .pn.p1',{x:-120,autoAlpha:0,duration:0.26,ease:'power3.out'},0);\n` +
      `tl.from('#${id} .pn.p2',{x:120,autoAlpha:0,duration:0.26,ease:'power3.out'},0.08);\n` +
      `tl.from('#${id} .spd,#${id} .ht',{autoAlpha:0,duration:0.22},0.24);\n` +
      `tl.from('#${id} .h',{scale:1.6,autoAlpha:0,rotation:-10,duration:0.3,ease:'power3.in'},0.3);\n` +
      `tl.from('#${id} .tag',{scale:1.8,autoAlpha:0,rotation:22,duration:0.26,ease:'power3.in'},0.62);`,
  );

export const blocks: Record<string, () => Block> = {
  标题卡: () =>
    mk(
      'mg_ttl',
      '标题卡',
      (id) => `
<div class="rt">
  <div class="ht"></div>
  <div class="pn main">
    <div class="spd"></div>
    <div class="k">第 1 格 · 开场</div>
    <div class="h">谁还没被生活<br/>摆过一道</div>
  </div>
  <div class="sfx">!?</div>
  <div class="tag">吐槽注意</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${tones(id)}
#${id} .pn{position:absolute;background:var(--panel);border:6px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);}
#${id} .pn.main{left:170px;top:150px;right:260px;bottom:190px;transform:rotate(-0.8deg);padding:100px 110px;display:flex;flex-direction:column;gap:56px;overflow:hidden;}
#${id} .pn.main .spd{right:-2px;top:-2px;left:auto;width:460px;height:340px;transform:scaleX(-1);}
#${id} .k{align-self:flex-start;background:var(--fg);color:var(--paper);font-size:38px;font-weight:800;letter-spacing:0.12em;padding:14px 32px;}
#${id} .h{font-size:142px;font-weight:900;line-height:1.18;}
#${id} .ht{left:110px;bottom:130px;width:460px;height:300px;}
#${id} .sfx{position:absolute;right:150px;bottom:160px;font-size:300px;font-weight:900;line-height:1;transform:rotate(-6deg);color:var(--paper);-webkit-text-stroke:13px var(--fg);}
#${id} .tag{position:absolute;left:60%;top:104px;border:5px solid var(--accent);color:var(--accent);background:var(--panel);font-size:44px;font-weight:900;padding:12px 30px;transform:rotate(-7deg);border-radius:var(--radius);}
</style>`,
      (id) =>
        `tl.from('#${id} .pn.main',{x:-140,autoAlpha:0,duration:0.26,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .pn.main .spd',{xPercent:40,autoAlpha:0,duration:0.24,ease:'power2.out'},0.18);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,x:-40,duration:0.2},0.2);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,y:40,duration:0.26,ease:'power2.out'},0.28);\n` +
        `tl.from('#${id} .ht',{autoAlpha:0,duration:0.22},0.4);\n` +
        `tl.from('#${id} .sfx',{scale:1.7,autoAlpha:0,rotation:-16,duration:0.26,ease:'power3.in'},0.5);\n` +
        `tl.from('#${id} .tag',{scale:1.8,autoAlpha:0,rotation:-20,duration:0.24,ease:'power3.in'},0.72);`,
    ),
  金句: () =>
    mk(
      'mg_qte',
      '金句',
      (id) => `
<div class="rt">
  <div class="spd"></div>
  <div class="ht"></div>
  <div class="bub">
    <div class="t">钱没了可以再赚,<br/>快乐没了才是真没了</div>
  </div>
  <div class="tail"></div>
  <div class="sfx">!!</div>
  <div class="a">—— 内心 OS</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${tones(id)}
#${id} .spd{right:0;top:0;width:520px;height:400px;transform:scaleX(-1);}
#${id} .ht{left:120px;bottom:130px;width:440px;height:300px;}
#${id} .bub{position:absolute;left:50%;top:44%;width:1420px;height:600px;transform:translate(-50%,-50%);background:var(--panel);border:5px solid var(--fg);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow);}
#${id} .t{font-size:96px;font-weight:900;line-height:1.5;text-align:center;}
#${id} .tail{position:absolute;left:560px;top:72%;width:80px;height:80px;background:var(--panel);border-right:5px solid var(--fg);border-bottom:5px solid var(--fg);transform:rotate(35deg);}
#${id} .sfx{position:absolute;right:220px;top:130px;font-size:190px;font-weight:900;line-height:1;transform:rotate(8deg);color:var(--paper);-webkit-text-stroke:11px var(--fg);}
#${id} .a{position:absolute;left:700px;bottom:150px;font-size:38px;font-weight:700;color:var(--muted);letter-spacing:0.12em;}
</style>`,
      (id) =>
        `tl.from('#${id} .bub',{scale:0.5,autoAlpha:0,duration:0.3,ease:'back.out(1.5)'},0);\n` +
        `tl.from('#${id} .tail',{scale:0,autoAlpha:0,duration:0.18,ease:'back.out(2)'},0.22);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,y:26,duration:0.24},0.24);\n` +
        `tl.from('#${id} .spd,#${id} .ht',{autoAlpha:0,duration:0.22},0.36);\n` +
        `tl.from('#${id} .sfx',{scale:1.7,autoAlpha:0,rotation:20,duration:0.24,ease:'power3.in'},0.5);\n` +
        `tl.from('#${id} .a',{autoAlpha:0,duration:0.2},0.7);`,
    ),
  评论: () =>
    mk(
      'mg_cmt',
      '评论',
      (id) => `
<div class="rt">
  <div class="pn main">
    <div class="spd"></div>
    <div class="k">第 8 格 · 弹幕来袭</div>
    <div class="cm c1"><div class="bl">前方高能!!</div><div class="tail"></div></div>
    <div class="cm c2"><div class="bl">哈哈哈哈笑不活了</div><div class="tail"></div></div>
    <div class="cm c3"><div class="bl inv">课代表在此总结</div><div class="tail tinv"></div></div>
  </div>
  <div class="ht"></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${tones(id)}
#${id} .pn{position:absolute;background:var(--panel);border:6px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);}
#${id} .pn.main{left:170px;top:140px;right:170px;bottom:170px;transform:rotate(-1deg);overflow:hidden;}
#${id} .pn.main .spd{right:-2px;top:-2px;left:auto;width:460px;height:340px;transform:scaleX(-1);}
#${id} .k{position:absolute;left:70px;top:64px;background:var(--fg);color:var(--paper);font-size:38px;font-weight:800;letter-spacing:0.12em;padding:14px 32px;}
#${id} .cm{position:absolute;}
#${id} .cm.c1{left:100px;top:180px;transform:rotate(-2deg);}
#${id} .cm.c2{right:120px;top:300px;transform:rotate(1.5deg);}
#${id} .cm.c3{left:360px;bottom:70px;transform:rotate(-1deg);}
#${id} .bl{width:640px;height:240px;background:var(--panel);border:5px solid var(--fg);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:60px;font-weight:900;white-space:nowrap;}
#${id} .cm.c2 .bl{width:680px;height:250px;font-size:58px;}
#${id} .bl.inv{width:820px;height:280px;font-size:68px;background:var(--fg);color:var(--paper);}
#${id} .tail{position:absolute;left:120px;bottom:-24px;width:56px;height:56px;background:var(--panel);border-right:5px solid var(--fg);border-bottom:5px solid var(--fg);transform:rotate(35deg);}
#${id} .cm.c2 .tail{left:auto;right:140px;}
#${id} .tail.tinv{background:var(--fg);border:none;}
#${id} .ht{left:110px;bottom:120px;width:440px;height:300px;}
</style>`,
      (id) =>
        `tl.from('#${id} .pn.main',{x:-140,autoAlpha:0,duration:0.26,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .pn.main .spd',{xPercent:40,autoAlpha:0,duration:0.24,ease:'power2.out'},0.16);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,x:-40,duration:0.2},0.2);\n` +
        `tl.from('#${id} .cm',{scale:1.7,autoAlpha:0,rotation:-12,duration:0.22,ease:'power3.in',stagger:0.18},0.3);\n` +
        `tl.from('#${id} .ht',{autoAlpha:0,duration:0.22},0.62);`,
    ),
  对比: () =>
    mk(
      'mg_cmp',
      '对比',
      (id) => `
<div class="rt">
  <div class="pn L"><div class="ht"></div><span class="lab">改造前</span><b>乱到离谱</b></div>
  <div class="pn R"><div class="spd"></div><span class="lab">改造后</span><b>整整齐齐</b></div>
  <svg class="bolt" viewBox="0 0 160 1080" preserveAspectRatio="none">
    <polyline class="o" points="118,0 52,300 122,362 38,700 112,762 58,1080"/>
    <polyline class="i" points="118,0 52,300 122,362 38,700 112,762 58,1080"/>
  </svg>
  <div class="tag">反转</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${tones(id)}
#${id} .pn{position:absolute;top:130px;bottom:130px;width:800px;background:var(--panel);border:6px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:44px;overflow:hidden;}
#${id} .pn.L{left:100px;transform:rotate(-1.2deg);}
#${id} .pn.R{right:100px;transform:rotate(1.2deg);background:var(--fg);color:var(--paper);border-color:var(--fg);}
#${id} .pn .lab{font-size:42px;font-weight:800;letter-spacing:0.24em;}
#${id} .pn b{font-size:150px;font-weight:900;line-height:1.1;}
#${id} .pn .ht{left:-2px;bottom:-2px;width:340px;height:240px;}
#${id} .pn.R .spd{right:-2px;top:-2px;left:auto;width:360px;height:280px;transform:scaleX(-1);background:repeating-linear-gradient(65deg,var(--paper) 0 3px,transparent 3px 26px);}
#${id} .bolt{position:absolute;left:50%;top:0;width:160px;height:1080px;transform:translateX(-50%);}
#${id} .bolt .o{fill:none;stroke:var(--fg);stroke-width:26;stroke-dasharray:2400;stroke-dashoffset:2400;}
#${id} .bolt .i{fill:none;stroke:var(--paper);stroke-width:10;stroke-dasharray:2400;stroke-dashoffset:2400;}
#${id} .tag{position:absolute;left:50%;top:120px;transform:translateX(-50%) rotate(-8deg);border:5px solid var(--accent);color:var(--accent);background:var(--panel);font-size:50px;font-weight:900;padding:14px 36px;border-radius:var(--radius);}
</style>`,
      (id) =>
        `tl.from('#${id} .pn.L',{x:-200,autoAlpha:0,duration:0.26,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .pn.R',{x:200,autoAlpha:0,duration:0.26,ease:'power3.out'},0.08);\n` +
        `tl.to('#${id} .bolt .o,#${id} .bolt .i',{strokeDashoffset:0,duration:0.4,ease:'power2.in'},0.28);\n` +
        `tl.from('#${id} .ht,#${id} .spd',{autoAlpha:0,duration:0.22},0.5);\n` +
        `tl.from('#${id} .tag',{scale:1.9,autoAlpha:0,rotation:-24,duration:0.24,ease:'power3.in'},0.72);`,
    ),
  问答: () =>
    mk(
      'mg_qa',
      '问答',
      (id) => `
<div class="rt">
  <div class="pn q">
    <div class="spd"></div>
    <div class="k">Q · 读者提问</div>
    <div class="t">熬夜的快乐<br/>是真的吗?</div>
    <div class="oz">ざわ…ざわ…</div>
  </div>
  <div class="pn a">
    <div class="k ki">A · 下格揭晓</div>
    <div class="t ta">是真的,<br/>但明天会来收账</div>
  </div>
  <div class="mark">？</div>
  <div class="ht"></div>
  <div class="tag">真相!</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${tones(id)}
#${id} .pn{position:absolute;top:140px;bottom:170px;background:var(--panel);border:6px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);padding:90px 80px;display:flex;flex-direction:column;align-items:flex-start;gap:52px;overflow:hidden;}
#${id} .pn.q{left:120px;width:830px;transform:rotate(-1.2deg);}
#${id} .pn.a{right:120px;width:790px;transform:rotate(1.4deg);background:var(--fg);color:var(--paper);}
#${id} .pn.q .spd{right:-2px;top:-2px;left:auto;width:340px;height:260px;transform:scaleX(-1);}
#${id} .k{background:var(--fg);color:var(--paper);font-size:38px;font-weight:800;letter-spacing:0.12em;padding:14px 32px;}
#${id} .k.ki{background:var(--paper);color:var(--fg);}
#${id} .t{font-size:104px;font-weight:900;line-height:1.3;}
#${id} .t.ta{font-size:86px;}
#${id} .oz{margin-top:auto;font-size:38px;font-weight:700;color:var(--muted);letter-spacing:0.2em;}
#${id} .mark{position:absolute;left:800px;top:100px;font-size:300px;font-weight:900;line-height:1;transform:rotate(-6deg);color:var(--paper);-webkit-text-stroke:13px var(--fg);}
#${id} .ht{left:60px;bottom:100px;width:380px;height:260px;}
#${id} .tag{position:absolute;left:900px;bottom:190px;border:5px solid var(--accent);color:var(--accent);background:var(--panel);font-size:50px;font-weight:900;padding:14px 36px;transform:rotate(-8deg);border-radius:var(--radius);}
</style>`,
      (id) =>
        `tl.from('#${id} .pn.q',{x:-160,autoAlpha:0,duration:0.26,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .pn.q .spd',{autoAlpha:0,duration:0.22},0.16);\n` +
        `tl.from('#${id} .pn.q .k',{autoAlpha:0,x:-30,duration:0.18},0.18);\n` +
        `tl.from('#${id} .pn.q .t',{autoAlpha:0,y:36,duration:0.24,ease:'power2.out'},0.24);\n` +
        `tl.from('#${id} .mark',{scale:1.8,autoAlpha:0,rotation:-18,duration:0.26,ease:'power3.in'},0.36);\n` +
        `tl.from('#${id} .oz',{autoAlpha:0,duration:0.2},0.5);\n` +
        `tl.from('#${id} .pn.a',{rotationY:-92,autoAlpha:0,transformOrigin:'left center',transformPerspective:1400,duration:0.3,ease:'power3.out'},0.6);\n` +
        `tl.from('#${id} .ht',{autoAlpha:0,duration:0.2},0.7);\n` +
        `tl.from('#${id} .tag',{scale:1.9,autoAlpha:0,rotation:-24,duration:0.22,ease:'power3.in'},0.94);`,
    ),
  步骤: () =>
    mk(
      'mg_stp',
      '步骤',
      (id) => `
<div class="rt">
  <div class="pn p1"><div class="spd"></div><span class="k">①</span><b>先囤一筐素材</b></div>
  <div class="pn p2"><span class="k">②</span><b>三秒埋一个梗</b></div>
  <div class="pn p3"><div class="ht"></div><span class="k">③</span><b>结尾留个反转</b></div>
  <div class="pn p4"><div class="spd sp2"></div></div>
  <div class="sfx">完!</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${tones(id)}
#${id} .pn{position:absolute;background:var(--panel);border:6px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);padding:56px 64px;display:flex;flex-direction:column;align-items:flex-start;gap:36px;overflow:hidden;}
#${id} .pn.p1{left:120px;top:110px;width:830px;height:390px;transform:rotate(-1.2deg);}
#${id} .pn.p2{left:1030px;top:150px;width:760px;height:350px;transform:rotate(1.4deg);}
#${id} .pn.p3{left:150px;top:580px;width:760px;height:380px;transform:rotate(1deg);}
#${id} .pn.p4{left:990px;top:560px;width:800px;height:400px;transform:rotate(-1.6deg);}
#${id} .pn .spd{right:-2px;top:-2px;left:auto;width:280px;height:220px;transform:scaleX(-1);}
#${id} .pn.p4 .spd.sp2{width:440px;height:340px;}
#${id} .pn .ht{left:-2px;bottom:-2px;top:auto;width:280px;height:180px;}
#${id} .k{background:var(--fg);color:var(--paper);font-size:44px;font-weight:800;padding:12px 28px;}
#${id} .pn b{font-size:84px;font-weight:900;line-height:1.18;}
#${id} .sfx{position:absolute;right:170px;bottom:120px;font-size:250px;font-weight:900;line-height:1;transform:rotate(-7deg);color:var(--paper);-webkit-text-stroke:13px var(--fg);}
</style>`,
      (id) =>
        `tl.from('#${id} .pn.p1',{x:-160,autoAlpha:0,duration:0.24,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .pn.p2',{x:160,autoAlpha:0,duration:0.24,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .pn.p3',{y:140,autoAlpha:0,duration:0.24,ease:'power3.out'},0.16);\n` +
        `tl.from('#${id} .pn.p4',{x:160,autoAlpha:0,duration:0.24,ease:'power3.out'},0.24);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,x:-30,duration:0.18,stagger:0.06},0.34);\n` +
        `tl.from('#${id} .spd,#${id} .ht',{autoAlpha:0,duration:0.2},0.48);\n` +
        `tl.from('#${id} .sfx',{scale:1.7,autoAlpha:0,rotation:-18,duration:0.26,ease:'power3.in'},0.6);`,
    ),
  大数字: () =>
    mk(
      'mg_num',
      '大数字',
      (id) => `
<div class="rt">
  <div class="ht"></div>
  <div class="spd"></div>
  <div class="k">本月涨粉</div>
  <div class="v">10万</div>
  <div class="s">全靠那一条翻车视频</div>
  <div class="tag">破纪录</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${tones(id)}
#${id} .ht{left:170px;top:280px;width:780px;height:520px;}
#${id} .spd{right:0;top:0;width:520px;height:400px;transform:scaleX(-1);}
#${id} .k{position:absolute;left:170px;top:140px;background:var(--fg);color:var(--paper);font-size:42px;font-weight:800;letter-spacing:0.12em;padding:14px 32px;}
#${id} .v{position:absolute;left:230px;top:46%;transform:translateY(-50%) rotate(-4deg);font-size:420px;font-weight:900;line-height:1;color:var(--paper);-webkit-text-stroke:16px var(--fg);}
#${id} .s{position:absolute;left:190px;bottom:150px;font-size:42px;font-weight:700;color:var(--muted);letter-spacing:0.1em;}
#${id} .tag{position:absolute;right:250px;top:52%;border:5px solid var(--accent);color:var(--accent);background:var(--panel);font-size:52px;font-weight:900;padding:14px 36px;transform:rotate(8deg);border-radius:var(--radius);}
</style>`,
      (id) =>
        `tl.from('#${id} .ht,#${id} .spd',{autoAlpha:0,duration:0.22},0);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,x:-40,duration:0.2},0.12);\n` +
        `tl.from('#${id} .v',{scale:1.8,autoAlpha:0,rotation:-14,duration:0.3,ease:'power3.in'},0.24);\n` +
        `tl.from('#${id} .s',{autoAlpha:0,duration:0.2},0.6);\n` +
        `tl.from('#${id} .tag',{scale:1.9,autoAlpha:0,rotation:24,duration:0.24,ease:'power3.in'},0.72);`,
    ),
  引导: () =>
    mk(
      'mg_cta',
      '引导',
      (id) => `
<div class="rt">
  <div class="spd"></div>
  <div class="ht"></div>
  <div class="bub">
    <div class="t">关注看下回</div>
  </div>
  <div class="tail"></div>
  <div class="tsz">つづく</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${tones(id)}
#${id} .spd{right:0;top:0;width:480px;height:380px;transform:scaleX(-1);}
#${id} .ht{left:120px;bottom:140px;width:420px;height:280px;}
#${id} .bub{position:absolute;left:50%;top:44%;width:1240px;height:540px;transform:translate(-50%,-50%);background:var(--panel);border:5px solid var(--fg);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow);}
#${id} .t{font-size:132px;font-weight:900;line-height:1.2;}
#${id} .tail{position:absolute;left:600px;top:70%;width:80px;height:80px;background:var(--panel);border-right:5px solid var(--fg);border-bottom:5px solid var(--fg);transform:rotate(35deg);}
#${id} .tsz{position:absolute;right:170px;bottom:140px;background:var(--fg);color:var(--paper);font-size:54px;font-weight:900;letter-spacing:0.2em;padding:22px 52px;transform:rotate(-2deg);border-radius:var(--radius);}
</style>`,
      (id) =>
        `tl.from('#${id} .bub',{scale:0.5,autoAlpha:0,duration:0.3,ease:'back.out(1.5)'},0);\n` +
        `tl.from('#${id} .tail',{scale:0,autoAlpha:0,duration:0.18,ease:'back.out(2)'},0.22);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,y:26,duration:0.24},0.26);\n` +
        `tl.from('#${id} .spd,#${id} .ht',{autoAlpha:0,duration:0.22},0.4);\n` +
        `tl.from('#${id} .tsz',{scale:1.8,autoAlpha:0,rotation:-18,duration:0.24,ease:'power3.in'},0.6);`,
    ),
};
