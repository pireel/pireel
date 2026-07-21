/**
 * 手帐 Scrapbook —— 牛皮纸拼贴方言:胶带、拍立得白框卡、便签、手写歪线。
 * 结构逻辑:万物皆"贴上去的实物"——必带投影 + 1-6° 旋转 + 叠压,禁止对齐网格。
 */

import { type Block, mk } from './shared';

/** 胶带:accent-2 实色 + 0.75 透明度,压角或压便签顶边。 */
const tape = (id: string) =>
  `#${id} .tp{position:absolute;width:250px;height:66px;background:var(--accent-2);opacity:0.75;border-radius:var(--radius);}`;

export const cover: () => Block = () =>
  mk(
    'cv_st',
    '封面',
    (id) => `
<div class="rt">
  <div class="card back"><div class="ph"></div></div>
  <div class="card main">
    <div class="h">手帐</div>
    <div class="ul"></div>
    <div class="cap">SCRAPBOOK · 把日子贴起来</div>
  </div>
  <div class="tp t1"></div><div class="tp t2"></div>
  <div class="note">DAY<br/>01</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);}
#${id} .card{position:absolute;background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);}
#${id} .card.back{left:1120px;top:170px;width:560px;height:520px;padding:34px 34px 96px;transform:rotate(4deg);}
#${id} .card.back .ph{width:100%;height:100%;background:var(--paper);}
#${id} .card.main{left:50%;top:50%;width:1060px;transform:translate(-56%,-52%) rotate(-2deg);padding:100px 90px 140px;display:flex;flex-direction:column;align-items:center;gap:34px;}
#${id} .h{font-size:300px;font-weight:900;line-height:1;letter-spacing:0.04em;}
#${id} .ul{width:520px;height:8px;background:var(--accent);transform:rotate(-1deg);}
#${id} .cap{position:absolute;bottom:44px;font-size:36px;letter-spacing:0.2em;color:var(--muted);}
${tape(id)}
#${id} .tp.t1{left:330px;top:104px;transform:rotate(-38deg);}
#${id} .tp.t2{right:600px;top:120px;transform:rotate(35deg);}
#${id} .note{position:absolute;left:190px;bottom:150px;width:230px;height:230px;background:var(--panel-2);box-shadow:var(--shadow);transform:rotate(-6deg);display:flex;align-items:center;justify-content:center;text-align:center;font-size:52px;font-weight:800;line-height:1.2;}
</style>`,
    (id) =>
      `tl.from('#${id} .card.back',{y:80,rotation:12,autoAlpha:0,duration:0.32,ease:'back.out(1.4)'},0);\n` +
      `tl.from('#${id} .card.main',{y:90,rotation:-8,autoAlpha:0,duration:0.36,ease:'back.out(1.4)'},0.1);\n` +
      `tl.from('#${id} .tp',{scale:0,autoAlpha:0,duration:0.24,stagger:0.08,ease:'back.out(2)'},0.42);\n` +
      `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.26},0.56);\n` +
      `tl.from('#${id} .note',{y:60,rotation:-14,autoAlpha:0,duration:0.3,ease:'back.out(1.6)'},0.5);`,
  );

export const blocks: Record<string, () => Block> = {
  标题卡: () =>
    mk(
      'st_ttl',
      '标题卡',
      (id) => `
<div class="rt">
  <div class="card back"><div class="ph"></div></div>
  <div class="note">旅行手记<br/>DAY 03</div>
  <div class="card main">
    <div class="h">今天也要<em>好好记录<i class="ul"></i></em></div>
    <div class="cap">2026 · 夏 · 胶带与纸</div>
  </div>
  <div class="tp t1"></div><div class="tp t2"></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);}
#${id} .card{position:absolute;background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);}
#${id} .card.back{right:170px;top:130px;width:460px;height:430px;padding:28px 28px 84px;transform:rotate(4deg);}
#${id} .card.back .ph{width:100%;height:100%;background:var(--paper);}
#${id} .card.main{left:200px;top:50%;width:1240px;transform:translateY(-52%) rotate(-2deg);padding:110px 100px 150px;display:flex;flex-direction:column;gap:44px;}
#${id} .h{font-size:126px;font-weight:900;line-height:1.28;letter-spacing:-0.01em;}
#${id} .h em{font-style:normal;position:relative;white-space:nowrap;}
#${id} .ul{position:absolute;left:-8px;right:-8px;bottom:-16px;height:6px;background:var(--accent);transform:rotate(-1deg);}
#${id} .cap{position:absolute;bottom:48px;left:100px;font-size:34px;letter-spacing:0.18em;color:var(--muted);}
${tape(id)}
#${id} .tp.t1{left:150px;top:190px;transform:rotate(-40deg);}
#${id} .tp.t2{left:1300px;top:220px;transform:rotate(33deg);}
#${id} .note{position:absolute;right:300px;bottom:140px;width:300px;height:270px;background:var(--panel-2);box-shadow:var(--shadow);transform:rotate(5deg);display:flex;align-items:center;justify-content:center;text-align:center;font-size:46px;font-weight:800;line-height:1.4;}
</style>`,
      (id) =>
        `tl.from('#${id} .card.back',{y:70,rotation:12,autoAlpha:0,duration:0.3,ease:'back.out(1.4)'},0);\n` +
        `tl.from('#${id} .card.main',{y:90,rotation:-8,autoAlpha:0,duration:0.36,ease:'back.out(1.4)'},0.08);\n` +
        `tl.from('#${id} .tp',{scale:0,autoAlpha:0,duration:0.24,stagger:0.09,ease:'back.out(2)'},0.4);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.26},0.56);\n` +
        `tl.from('#${id} .note',{y:60,rotation:14,autoAlpha:0,duration:0.3,ease:'back.out(1.6)'},0.5);`,
    ),
  列表: () =>
    mk(
      'st_lst',
      '列表',
      (id) => `
<div class="rt">
  <div class="sticky">
    <div class="tp top"></div>
    <div class="t">出发前清单</div>
    <div class="r done"><i>✓</i><span>相机充好电</span></div>
    <div class="r done"><i>✓</i><span>胶带 &amp; 贴纸包</span></div>
    <div class="r"><i></i><span>空白手帐本</span></div>
  </div>
  <div class="card mini"><div class="ph"></div><div class="cap">上次的路口</div></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);}
#${id} .sticky{position:absolute;left:220px;top:50%;width:1010px;transform:translateY(-50%) rotate(-1.5deg);background:var(--panel-2);box-shadow:var(--shadow);padding:120px 100px 90px;display:flex;flex-direction:column;gap:46px;}
${tape(id)}
#${id} .tp.top{top:-30px;left:50%;width:320px;transform:translateX(-50%) rotate(-3deg);}
#${id} .t{font-size:78px;font-weight:900;}
#${id} .r{display:flex;align-items:center;gap:44px;font-size:58px;font-weight:600;}
#${id} .r i{width:54px;height:54px;border:4px solid var(--fg);border-radius:var(--radius);font-style:normal;display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:900;color:var(--accent);}
#${id} .r.done span{text-decoration:line-through;color:var(--muted);}
#${id} .card{position:absolute;background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);}
#${id} .card.mini{right:210px;top:230px;width:470px;padding:30px 30px 110px;transform:rotate(3.5deg);}
#${id} .card.mini .ph{height:360px;background:var(--paper);}
#${id} .card.mini .cap{position:absolute;bottom:34px;left:0;right:0;text-align:center;font-size:32px;letter-spacing:0.16em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .sticky',{y:80,rotation:-7,autoAlpha:0,duration:0.34,ease:'back.out(1.4)'},0);\n` +
        `tl.from('#${id} .tp.top',{scale:0,autoAlpha:0,duration:0.22,ease:'back.out(2)'},0.26);\n` +
        `tl.from('#${id} .r',{x:-60,autoAlpha:0,duration:0.24,stagger:0.1},0.3);\n` +
        `tl.from('#${id} .r i',{scale:0,duration:0.2,stagger:0.1,ease:'back.out(2)'},0.44);\n` +
        `tl.from('#${id} .card.mini',{y:70,rotation:12,autoAlpha:0,duration:0.3,ease:'back.out(1.5)'},0.5);`,
    ),
  金句: () =>
    mk(
      'st_qte',
      '金句',
      (id) => `
<div class="rt">
  <div class="card q">
    <div class="mark">“</div>
    <div class="t">慢一点,<br/><em>日子才有胶水味<i class="ul"></i></em></div>
    <div class="cap">— 手帐第 42 页</div>
  </div>
  <div class="tp t1"></div><div class="tp t2"></div>
  <div class="note">收藏<br/>这句</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);}
#${id} .card{position:absolute;background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);}
#${id} .card.q{left:50%;top:50%;width:1300px;transform:translate(-50%,-52%) rotate(1.5deg);padding:110px 130px 160px;display:flex;flex-direction:column;gap:36px;}
#${id} .mark{font-size:180px;line-height:0.5;height:80px;color:var(--accent);font-weight:900;}
#${id} .t{font-size:106px;font-weight:800;line-height:1.4;}
#${id} .t em{font-style:normal;position:relative;white-space:nowrap;}
#${id} .ul{position:absolute;left:-6px;right:-6px;bottom:-14px;height:6px;background:var(--accent);transform:rotate(-1deg);}
#${id} .cap{position:absolute;bottom:52px;left:0;right:0;text-align:center;font-size:34px;letter-spacing:0.2em;color:var(--muted);}
${tape(id)}
#${id} .tp.t1{left:240px;top:130px;transform:rotate(-42deg);}
#${id} .tp.t2{right:250px;top:150px;transform:rotate(40deg);}
#${id} .note{position:absolute;right:150px;bottom:110px;width:210px;height:210px;background:var(--panel-2);box-shadow:var(--shadow);transform:rotate(-5deg);display:flex;align-items:center;justify-content:center;text-align:center;font-size:44px;font-weight:800;line-height:1.3;}
</style>`,
      (id) =>
        `tl.from('#${id} .card.q',{y:90,rotation:7,autoAlpha:0,duration:0.36,ease:'back.out(1.4)'},0);\n` +
        `tl.from('#${id} .tp',{scale:0,autoAlpha:0,duration:0.24,stagger:0.08,ease:'back.out(2)'},0.3);\n` +
        `tl.from('#${id} .mark,#${id} .t',{autoAlpha:0,y:24,duration:0.28,stagger:0.08},0.36);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.26},0.62);\n` +
        `tl.from('#${id} .note',{y:50,rotation:-12,autoAlpha:0,duration:0.28,ease:'back.out(1.6)'},0.6);`,
    ),
  评论: () =>
    mk(
      'st_cmt',
      '评论',
      (id) => `
<div class="rt">
  <div class="tag"><div class="tp top"></div>读者留言墙</div>
  <div class="note n1"><div class="tp top"></div><b>@邻座的猫</b><span>胶带配色也太治愈了,收进灵感夹!</span></div>
  <div class="note n2"><div class="tp top"></div><b>@慢递员小林</b><span>跟着你把日子一页页贴了下去</span></div>
  <div class="note n3"><div class="tp top"></div><b>@纸胶带星球</b><span>求出一期<em>贴纸整理<i class="ul"></i></em>!</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);}
#${id} .tag{position:absolute;left:190px;top:120px;background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);transform:rotate(-2deg);padding:34px 60px;font-size:60px;font-weight:900;}
#${id} .note{position:absolute;width:600px;background:var(--panel-2);box-shadow:var(--shadow);padding:52px 56px;display:flex;flex-direction:column;gap:26px;}
#${id} .note b{font-size:36px;font-weight:800;letter-spacing:0.06em;color:var(--muted);}
#${id} .note span{font-size:48px;font-weight:600;line-height:1.5;}
#${id} .note em{font-style:normal;position:relative;white-space:nowrap;}
#${id} .ul{position:absolute;left:-6px;right:-6px;bottom:-12px;height:6px;background:var(--accent);transform:rotate(-1deg);}
#${id} .n1{left:210px;top:360px;transform:rotate(-3deg);}
#${id} .n2{left:930px;top:250px;transform:rotate(2.5deg);}
#${id} .n3{left:760px;top:560px;transform:rotate(-1.5deg);}
${tape(id)}
#${id} .tag .tp,#${id} .note .tp{top:-30px;left:50%;width:230px;margin-left:-115px;transform:rotate(-3deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .tag',{y:-50,rotation:-6,autoAlpha:0,duration:0.28,ease:'back.out(1.5)'},0);\n` +
        `tl.from('#${id} .note',{y:80,rotation:8,autoAlpha:0,duration:0.3,stagger:0.14,ease:'back.out(1.5)'},0.1);\n` +
        `tl.from('#${id} .tp',{scale:0,autoAlpha:0,duration:0.22,stagger:0.07,ease:'back.out(2)'},0.46);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.24},0.82);`,
    ),
  步骤: () =>
    mk(
      'st_stp',
      '步骤',
      (id) => `
<div class="rt">
  <div class="note n1"><div class="tp top"></div><b>STEP 1</b><span>拍下来</span></div>
  <div class="note n2"><div class="tp top"></div><b>STEP 2</b><span>贴上去</span></div>
  <div class="note n3"><div class="tp top"></div><b>STEP 3</b><span>写两句</span></div>
  <svg class="ar a1" viewBox="0 0 220 120"><path d="M12 84 Q110 8 196 60"/><path d="M196 60 L156 44 M196 60 L172 96"/></svg>
  <svg class="ar a2" viewBox="0 0 220 120"><path d="M12 40 Q110 112 196 56"/><path d="M196 56 L158 76 M196 56 L166 24"/></svg>
</div>
<style>
#${id} .rt{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);}
#${id} .note{position:absolute;width:390px;height:370px;background:var(--panel-2);box-shadow:var(--shadow);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;}
#${id} .note b{font-size:38px;font-weight:800;letter-spacing:0.18em;color:var(--muted);}
#${id} .note span{font-size:68px;font-weight:800;}
#${id} .n1{left:210px;top:400px;transform:rotate(-3deg);}
#${id} .n2{left:770px;top:340px;transform:rotate(2.5deg);}
#${id} .n3{left:1330px;top:420px;transform:rotate(-2deg);}
${tape(id)}
#${id} .note .tp{top:-28px;left:50%;width:230px;margin-left:-115px;transform:rotate(-3deg);}
#${id} .ar{position:absolute;width:240px;height:130px;}
#${id} .a1{left:560px;top:270px;transform:rotate(-4deg);}
#${id} .a2{left:1130px;top:640px;transform:rotate(3deg);}
#${id} .ar path{fill:none;stroke:var(--accent);stroke-width:9;stroke-linecap:round;stroke-dasharray:400;stroke-dashoffset:400;}
</style>`,
      (id) =>
        `tl.from('#${id} .note',{y:70,rotation:8,autoAlpha:0,duration:0.3,stagger:0.12,ease:'back.out(1.5)'},0);\n` +
        `tl.from('#${id} .tp',{scale:0,autoAlpha:0,duration:0.22,stagger:0.08,ease:'back.out(2)'},0.34);\n` +
        `tl.to('#${id} .ar path',{strokeDashoffset:0,duration:0.3,stagger:0.08,ease:'power2.out'},0.6);`,
    ),
  时间线: () =>
    mk(
      'st_tml',
      '时间线',
      (id) => `
<div class="rt">
  <div class="tag"><div class="tp top"></div>三天小环线</div>
  <svg class="route" viewBox="0 0 1560 560"><path d="M60 430 Q470 120 940 300 Q1410 480 1500 180"/></svg>
  <div class="stop s1"><i class="pin"></i><div class="lb l1"><div class="tp top"></div><b>DAY 1</b><span>老城巷口集合</span></div></div>
  <div class="stop s2"><i class="pin"></i><div class="lb l2"><div class="tp top"></div><b>DAY 2</b><span>海边旧货市集</span></div></div>
  <div class="stop s3"><i class="pin"></i><div class="lb l3"><div class="tp top"></div><b>DAY 3</b><span>山顶看日出</span></div></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);}
#${id} .tag{position:absolute;left:190px;top:130px;background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);transform:rotate(-2deg);padding:34px 60px;font-size:60px;font-weight:900;}
#${id} .route{position:absolute;left:180px;top:300px;width:1560px;height:560px;overflow:visible;}
#${id} .route path{fill:none;stroke:var(--accent);stroke-width:10;stroke-linecap:round;stroke-dasharray:16 30;}
#${id} .stop{position:absolute;}
#${id} .s1{left:240px;top:730px;}
#${id} .s2{left:1120px;top:600px;}
#${id} .s3{left:1680px;top:480px;}
#${id} .pin{position:absolute;left:-26px;top:-26px;width:52px;height:52px;border-radius:999px;background:var(--fg);border:8px solid var(--panel);box-shadow:var(--shadow);}
#${id} .lb{position:absolute;background:var(--panel-2);box-shadow:var(--shadow);padding:34px 44px;display:flex;flex-direction:column;gap:14px;white-space:nowrap;}
#${id} .lb b{font-size:34px;font-weight:800;letter-spacing:0.14em;color:var(--muted);}
#${id} .lb span{font-size:46px;font-weight:700;}
#${id} .l1{left:-80px;top:60px;transform:rotate(-3deg);}
#${id} .l2{left:-110px;top:64px;transform:rotate(2.5deg);}
#${id} .l3{left:-420px;top:70px;transform:rotate(-2deg);}
${tape(id)}
#${id} .tag .tp{top:-30px;left:50%;width:230px;margin-left:-115px;transform:rotate(-3deg);}
#${id} .lb .tp{top:-26px;left:50%;width:170px;margin-left:-85px;transform:rotate(-3deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .tag',{y:-50,rotation:-6,autoAlpha:0,duration:0.28,ease:'back.out(1.5)'},0);\n` +
        `tl.fromTo('#${id} .route',{clipPath:'inset(-30px 100% -30px 0)'},{clipPath:'inset(-30px 0% -30px 0)',duration:0.46,ease:'power1.inOut'},0.14);\n` +
        `tl.from('#${id} .pin',{y:-80,autoAlpha:0,duration:0.26,stagger:0.14,ease:'back.out(2.2)'},0.26);\n` +
        `tl.from('#${id} .lb',{y:44,rotation:6,autoAlpha:0,duration:0.26,stagger:0.14,ease:'back.out(1.5)'},0.4);\n` +
        `tl.from('#${id} .tp',{scale:0,autoAlpha:0,duration:0.2,stagger:0.07,ease:'back.out(2)'},0.72);`,
    ),
  大数字: () =>
    mk(
      'st_num',
      '大数字',
      (id) => `
<div class="rt">
  <div class="card main">
    <div class="d"><span>DAY</span><b>07</b><i class="ul"></i></div>
    <div class="cap">连着写手帐的第七天</div>
  </div>
  <div class="tp t1"></div><div class="tp t2"></div>
  <div class="note">七月<br/>周记</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);}
#${id} .card{position:absolute;background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);}
#${id} .card.main{left:50%;top:50%;width:900px;transform:translate(-50%,-52%) rotate(-2deg);padding:90px 90px 150px;display:flex;flex-direction:column;align-items:center;}
#${id} .d{position:relative;display:flex;align-items:baseline;gap:40px;}
#${id} .d span{font-size:80px;font-weight:800;letter-spacing:0.14em;color:var(--muted);}
#${id} .d b{font-size:360px;font-weight:900;line-height:1;letter-spacing:-0.01em;}
#${id} .ul{position:absolute;left:-10px;right:-10px;bottom:-26px;height:8px;background:var(--accent);transform:rotate(-1.2deg);}
#${id} .cap{position:absolute;bottom:52px;left:0;right:0;text-align:center;font-size:34px;letter-spacing:0.2em;color:var(--muted);}
${tape(id)}
#${id} .tp.t1{left:420px;top:190px;transform:rotate(-40deg);}
#${id} .tp.t2{left:1270px;top:200px;transform:rotate(38deg);}
#${id} .note{position:absolute;left:230px;bottom:170px;width:240px;height:240px;background:var(--panel-2);box-shadow:var(--shadow);transform:rotate(-5deg);display:flex;align-items:center;justify-content:center;text-align:center;font-size:46px;font-weight:800;line-height:1.4;}
</style>`,
      (id) =>
        `tl.from('#${id} .card.main',{y:90,rotation:-8,autoAlpha:0,duration:0.36,ease:'back.out(1.4)'},0);\n` +
        `tl.from('#${id} .tp',{scale:0,autoAlpha:0,duration:0.24,stagger:0.08,ease:'back.out(2)'},0.3);\n` +
        `tl.from('#${id} .d',{autoAlpha:0,y:24,duration:0.28},0.4);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.26},0.66);\n` +
        `tl.from('#${id} .note',{y:60,rotation:-12,autoAlpha:0,duration:0.28,ease:'back.out(1.6)'},0.6);`,
    ),
  引导: () =>
    mk(
      'st_cta',
      '引导',
      (id) => `
<div class="rt">
  <div class="card main">
    <div class="t"><em>关注<svg class="cir" viewBox="0 0 380 220"><ellipse cx="190" cy="110" rx="170" ry="88"/></svg></em>不迷路</div>
    <div class="cap">每周三 · 新一页手帐灵感</div>
  </div>
  <div class="tp t1"></div><div class="tp t2"></div>
  <div class="note"><i>✓</i><span>记得回来</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);}
#${id} .card{position:absolute;background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);}
#${id} .card.main{left:50%;top:50%;width:1200px;transform:translate(-50%,-52%) rotate(1.5deg);padding:120px 100px 150px;display:flex;flex-direction:column;align-items:center;gap:40px;}
#${id} .t{font-size:130px;font-weight:900;line-height:1.2;}
#${id} .t em{font-style:normal;position:relative;display:inline-block;}
#${id} .cir{position:absolute;left:50%;top:50%;width:380px;height:220px;transform:translate(-50%,-52%) rotate(-3deg);overflow:visible;}
#${id} .cir ellipse{fill:none;stroke:var(--accent);stroke-width:9;stroke-linecap:round;stroke-dasharray:830;stroke-dashoffset:830;}
#${id} .cap{position:absolute;bottom:52px;left:0;right:0;text-align:center;font-size:34px;letter-spacing:0.2em;color:var(--muted);}
${tape(id)}
#${id} .tp.t1{left:280px;top:280px;transform:rotate(-40deg);}
#${id} .tp.t2{left:1430px;top:290px;transform:rotate(40deg);}
#${id} .note{position:absolute;right:200px;bottom:150px;width:280px;height:230px;background:var(--panel-2);box-shadow:var(--shadow);transform:rotate(-5deg);display:flex;align-items:center;justify-content:center;gap:18px;font-size:44px;font-weight:800;}
#${id} .note i{font-style:normal;font-size:56px;font-weight:900;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .card.main',{y:90,rotation:7,autoAlpha:0,duration:0.36,ease:'back.out(1.4)'},0);\n` +
        `tl.from('#${id} .tp',{scale:0,autoAlpha:0,duration:0.24,stagger:0.08,ease:'back.out(2)'},0.3);\n` +
        `tl.to('#${id} .cir ellipse',{strokeDashoffset:0,duration:0.34,ease:'power2.out'},0.5);\n` +
        `tl.from('#${id} .note',{y:60,rotation:-12,autoAlpha:0,duration:0.28,ease:'back.out(1.6)'},0.72);`,
    ),
};
