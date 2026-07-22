/**
 * Y2K — retro-millennium dialect: orbital ellipses around the hero, ✦ sparkles, double-outlined pills,
 * bubble highlight dots. Structure logic: one "glowing focal object" per card (title/bubble/button)
 * + ring + sparkle; wide italic is the signature type.
 */

import { type Block, mk } from './shared';

/** Shared styles for sparkles + bubbles (with highlight dots). */
const orbits = (id: string) => `
#${id} .sp{position:absolute;font-style:normal;color:var(--accent-2);line-height:1;}
#${id} .bb{position:absolute;border-radius:999px;background:var(--panel-2);}
#${id} .bb .hl{position:absolute;width:22%;height:22%;background:var(--panel);border-radius:999px;top:16%;left:18%;}`;

export const cover: () => Block = () =>
  mk(
    'cv_yk',
    '封面',
    (id) => `
<div class="rt">
  <div class="bb b1"><i class="hl"></i></div>
  <div class="bb b2"><i class="hl"></i></div>
  <div class="hero">
    <div class="ring2"></div>
    <div class="orb"></div>
    <span class="h">千禧</span>
  </div>
  <div class="chip">Y2K · CHROME</div>
  <i class="sp s1">✦</i><i class="sp s2">✦</i><i class="sp s3">✦</i>
</div>
<style>
#${id} .rt{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);}
${orbits(id)}
#${id} .hero{position:absolute;left:50%;top:50%;transform:translate(-50%,-54%);}
#${id} .h{display:inline-block;font-size:320px;font-weight:900;font-style:italic;line-height:1.1;transform:scaleX(1.15);}
#${id} .orb{position:absolute;left:50%;top:50%;width:1240px;height:480px;transform:translate(-50%,-50%) rotate(-12deg);border:4px solid var(--accent);border-radius:50%;box-shadow:var(--glow);}
#${id} .ring2{position:absolute;left:50%;top:50%;width:1330px;height:540px;transform:translate(-50%,-50%) rotate(8deg);border:3px solid var(--accent-2);border-radius:50%;}
#${id} .chip{position:absolute;left:50%;bottom:150px;transform:translateX(-50%);background:var(--panel);border:3px solid var(--accent);border-radius:999px;color:var(--accent);font-size:38px;font-weight:800;letter-spacing:0.22em;padding:22px 60px;}
#${id} .bb.b1{width:190px;height:190px;right:230px;top:150px;}
#${id} .bb.b2{width:110px;height:110px;left:210px;bottom:220px;}
#${id} .sp.s1{font-size:96px;left:250px;top:180px;}
#${id} .sp.s2{font-size:56px;right:420px;bottom:260px;}
#${id} .sp.s3{font-size:42px;right:180px;top:430px;color:var(--accent);}
</style>`,
    (id) =>
      `tl.from('#${id} .h',{x:-120,autoAlpha:0,duration:0.32,ease:'power3.out'},0);\n` +
      `tl.from('#${id} .orb,#${id} .ring2',{scale:1.18,autoAlpha:0,duration:0.34,ease:'power2.out'},0.14);\n` +
      `tl.from('#${id} .bb,#${id} .chip',{scale:0,autoAlpha:0,duration:0.26,stagger:0.08,ease:'back.out(1.6)'},0.3);\n` +
      `tl.from('#${id} .sp',{scale:0,autoAlpha:0,duration:0.22,stagger:0.08,ease:'back.out(2)'},0.44);\n` +
      `tl.to('#${id} .sp.s1',{autoAlpha:0.25,duration:0.12,yoyo:true,repeat:3},0.7);`,
  );

export const blocks: Record<string, () => Block> = {
  标题卡: () =>
    mk(
      'yk_ttl',
      '标题卡',
      (id) => `
<div class="rt">
  <div class="chip">本周穿搭企划</div>
  <div class="bb b1"><i class="hl"></i></div>
  <div class="bb b2"><i class="hl"></i></div>
  <div class="hero">
    <div class="ring2"></div>
    <div class="orb"></div>
    <span class="h">蓝色系少女</span>
  </div>
  <div class="sub">FIT CHECK · VOL.07 · 每周三上新</div>
  <i class="sp s1">✦</i><i class="sp s2">✦</i><i class="sp s3">✦</i>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${orbits(id)}
#${id} .chip{position:absolute;left:190px;top:150px;background:var(--panel);border:3px solid var(--accent);border-radius:999px;color:var(--accent);font-size:38px;font-weight:800;letter-spacing:0.1em;padding:20px 54px;}
#${id} .hero{position:absolute;left:170px;top:50%;transform:translateY(-46%);}
#${id} .h{display:inline-block;font-size:158px;font-weight:900;font-style:italic;line-height:1.1;transform:scaleX(1.15);transform-origin:left center;white-space:nowrap;}
#${id} .orb{position:absolute;left:46%;top:50%;width:1210px;height:360px;transform:translate(-50%,-50%) rotate(-9deg);border:4px solid var(--accent);border-radius:50%;box-shadow:var(--glow);}
#${id} .ring2{position:absolute;left:47%;top:50%;width:1300px;height:420px;transform:translate(-50%,-50%) rotate(6deg);border:3px solid var(--accent-2);border-radius:50%;}
#${id} .sub{position:absolute;left:200px;bottom:170px;font-size:42px;font-weight:600;color:var(--muted);letter-spacing:0.14em;}
#${id} .bb.b1{width:230px;height:230px;right:210px;top:170px;}
#${id} .bb.b2{width:130px;height:130px;right:430px;bottom:200px;}
#${id} .sp.s1{font-size:88px;right:340px;top:120px;}
#${id} .sp.s2{font-size:52px;left:1180px;bottom:280px;}
#${id} .sp.s3{font-size:44px;left:250px;bottom:320px;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{y:-40,autoAlpha:0,duration:0.24,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .h',{x:-140,autoAlpha:0,duration:0.32,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .orb,#${id} .ring2',{scale:1.16,autoAlpha:0,duration:0.32,ease:'power2.out'},0.22);\n` +
        `tl.from('#${id} .bb',{scale:0,autoAlpha:0,duration:0.26,stagger:0.1,ease:'back.out(1.6)'},0.34);\n` +
        `tl.from('#${id} .sp',{scale:0,autoAlpha:0,duration:0.22,stagger:0.08,ease:'back.out(2)'},0.46);\n` +
        `tl.from('#${id} .sub',{autoAlpha:0,duration:0.24},0.6);\n` +
        `tl.to('#${id} .sp.s1',{autoAlpha:0.25,duration:0.12,yoyo:true,repeat:3},0.7);`,
    ),
  金句: () =>
    mk(
      'yk_qte',
      '金句',
      (id) => `
<div class="rt">
  <div class="ring2"></div>
  <div class="bub">
    <i class="hl"></i>
    <div class="t">好心情,<br/>是最好的单品</div>
  </div>
  <div class="chip">@千禧衣橱</div>
  <i class="sp s1">✦</i><i class="sp s2">✦</i><i class="sp s3">✦</i>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${orbits(id)}
#${id} .bub{position:absolute;left:50%;top:47%;width:1380px;height:620px;transform:translate(-50%,-50%);background:var(--panel);border-radius:50%;box-shadow:var(--shadow);display:flex;align-items:center;justify-content:center;}
#${id} .bub .hl{position:absolute;width:150px;height:90px;background:var(--panel-2);border-radius:999px;top:70px;left:230px;transform:rotate(-24deg);}
#${id} .t{font-size:102px;font-weight:900;font-style:italic;line-height:1.42;text-align:center;transform:scaleX(1.08);}
#${id} .ring2{position:absolute;left:50%;top:47%;width:1520px;height:730px;transform:translate(-50%,-50%) rotate(7deg);border:3px solid var(--accent-2);border-radius:50%;}
#${id} .chip{position:absolute;left:50%;bottom:140px;transform:translateX(-50%);background:var(--panel);border:3px solid var(--accent);border-radius:999px;color:var(--accent);font-size:36px;font-weight:800;letter-spacing:0.14em;padding:20px 56px;}
#${id} .sp.s1{font-size:92px;left:250px;top:170px;}
#${id} .sp.s2{font-size:54px;right:270px;bottom:260px;}
#${id} .sp.s3{font-size:40px;right:340px;top:180px;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .bub',{scale:0.55,autoAlpha:0,duration:0.36,ease:'back.out(1.4)'},0);\n` +
        `tl.from('#${id} .ring2',{scale:1.15,autoAlpha:0,duration:0.3,ease:'power2.out'},0.16);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,y:30,duration:0.28},0.26);\n` +
        `tl.from('#${id} .chip',{scale:0,autoAlpha:0,duration:0.24,ease:'back.out(1.8)'},0.46);\n` +
        `tl.from('#${id} .sp',{scale:0,autoAlpha:0,duration:0.22,stagger:0.08,ease:'back.out(2)'},0.5);\n` +
        `tl.to('#${id} .sp.s2',{autoAlpha:0.25,duration:0.12,yoyo:true,repeat:3},0.7);`,
    ),
  引导: () =>
    mk(
      'yk_cta',
      '引导',
      (id) => `
<div class="rt">
  <div class="bb b1"><i class="hl"></i></div>
  <div class="hero">
    <div class="orb"></div>
    <div class="cta">＋ 关注</div>
  </div>
  <div class="sub">每周三晚 8 点 · 一起穿得像千禧年</div>
  <i class="sp s1">✦</i><i class="sp s2">✦</i><i class="sp s3">✦</i><i class="sp s4">✦</i>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${orbits(id)}
#${id} .hero{position:absolute;left:44%;top:47%;transform:translate(-50%,-50%);}
#${id} .cta{background:var(--accent);color:var(--paper);border:6px solid var(--panel);box-shadow:0 0 0 4px var(--accent),var(--glow);border-radius:999px;font-size:92px;font-weight:900;padding:52px 140px;white-space:nowrap;}
#${id} .orb{position:absolute;left:50%;top:50%;width:1060px;height:420px;transform:translate(-50%,-50%) rotate(-10deg);border:4px solid var(--accent);border-radius:50%;box-shadow:var(--glow);}
#${id} .sub{position:absolute;left:50%;bottom:160px;transform:translateX(-50%);font-size:44px;font-weight:600;color:var(--muted);letter-spacing:0.1em;}
#${id} .bb.b1{width:200px;height:200px;right:200px;top:160px;}
#${id} .sp.s1{font-size:96px;left:280px;top:200px;}
#${id} .sp.s2{font-size:60px;right:420px;bottom:300px;}
#${id} .sp.s3{font-size:44px;left:420px;bottom:300px;color:var(--accent);}
#${id} .sp.s4{font-size:52px;right:280px;top:420px;}
</style>`,
      (id) =>
        `tl.from('#${id} .cta',{scale:0.4,autoAlpha:0,duration:0.34,ease:'back.out(1.7)'},0);\n` +
        `tl.from('#${id} .orb',{scale:1.2,autoAlpha:0,duration:0.32,ease:'power2.out'},0.16);\n` +
        `tl.from('#${id} .bb',{scale:0,autoAlpha:0,duration:0.26,ease:'back.out(1.6)'},0.3);\n` +
        `tl.from('#${id} .sp',{scale:0,autoAlpha:0,duration:0.22,stagger:0.07,ease:'back.out(2)'},0.38);\n` +
        `tl.from('#${id} .sub',{autoAlpha:0,y:24,duration:0.24},0.56);\n` +
        `tl.to('#${id} .sp.s1,#${id} .sp.s4',{autoAlpha:0.25,duration:0.12,yoyo:true,repeat:3},0.7);`,
    ),
  大数字: () =>
    mk(
      'yk_num',
      '大数字',
      (id) => `
<div class="rt">
  <div class="chip">播放量突破</div>
  <div class="bb b1"><i class="hl"></i></div>
  <div class="hero">
    <div class="ring2"></div>
    <div class="orb"></div>
    <span class="h">1000万</span>
  </div>
  <div class="sub">PLAY COUNT · 谢谢每一次循环</div>
  <i class="sp s1">✦</i><i class="sp s2">✦</i><i class="sp s3">✦</i>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${orbits(id)}
#${id} .chip{position:absolute;left:50%;top:150px;transform:translateX(-50%);background:var(--panel);border:3px solid var(--accent);border-radius:999px;color:var(--accent);font-size:38px;font-weight:800;letter-spacing:0.12em;padding:20px 54px;}
#${id} .hero{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);}
#${id} .h{display:inline-block;font-size:290px;font-weight:900;font-style:italic;line-height:1.1;transform:scaleX(1.15);white-space:nowrap;}
#${id} .orb{position:absolute;left:50%;top:50%;width:1520px;height:520px;transform:translate(-50%,-50%) rotate(-10deg);border:4px solid var(--accent);border-radius:50%;box-shadow:var(--glow);}
#${id} .ring2{position:absolute;left:50%;top:50%;width:1630px;height:590px;transform:translate(-50%,-50%) rotate(7deg);border:3px solid var(--accent-2);border-radius:50%;}
#${id} .sub{position:absolute;left:50%;bottom:150px;transform:translateX(-50%);font-size:42px;font-weight:600;color:var(--muted);letter-spacing:0.12em;}
#${id} .bb.b1{width:170px;height:170px;right:220px;top:170px;}
#${id} .sp.s1{font-size:90px;left:260px;top:190px;}
#${id} .sp.s2{font-size:54px;right:340px;bottom:260px;}
#${id} .sp.s3{font-size:42px;left:380px;bottom:300px;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{y:-40,autoAlpha:0,duration:0.24,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .h',{scale:0.5,autoAlpha:0,duration:0.34,ease:'back.out(1.5)'},0.08);\n` +
        `tl.from('#${id} .orb,#${id} .ring2',{scale:1.15,autoAlpha:0,duration:0.32,ease:'power2.out'},0.24);\n` +
        `tl.from('#${id} .bb',{scale:0,autoAlpha:0,duration:0.26,ease:'back.out(1.6)'},0.36);\n` +
        `tl.from('#${id} .sp',{scale:0,autoAlpha:0,duration:0.22,stagger:0.08,ease:'back.out(2)'},0.44);\n` +
        `tl.from('#${id} .sub',{autoAlpha:0,duration:0.24},0.58);\n` +
        `tl.to('#${id} .sp.s2',{autoAlpha:0.25,duration:0.12,yoyo:true,repeat:3},0.7);`,
    ),
  倒计时: () =>
    mk(
      'yk_cnt',
      '倒计时',
      (id) => `
<div class="rt">
  <div class="chip">距千年虫还剩</div>
  <div class="bb b1"><i class="hl"></i></div>
  <div class="hero">
    <div class="ring2"></div>
    <div class="orb"></div>
    <span class="h"><b class="seg">00</b><i class="cl">:</i><b class="seg">00</b><i class="cl">:</i><b class="v">59</b></span>
  </div>
  <div class="sub">MILLENNIUM BUG · 系统重启前最后一舞</div>
  <i class="sp s1">✦</i><i class="sp s2">✦</i><i class="sp s3">✦</i>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${orbits(id)}
#${id} .chip{position:absolute;left:50%;top:150px;transform:translateX(-50%);background:var(--panel);border:3px solid var(--accent);border-radius:999px;color:var(--accent);font-size:38px;font-weight:800;letter-spacing:0.12em;padding:20px 54px;}
#${id} .hero{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);}
#${id} .h{display:inline-block;font-size:240px;font-weight:900;font-style:italic;line-height:1.1;transform:scaleX(1.15);white-space:nowrap;}
#${id} .cl{font-style:italic;color:var(--accent);padding:0 14px;}
#${id} .orb{position:absolute;left:50%;top:50%;width:1530px;height:500px;transform:translate(-50%,-50%) rotate(-10deg);border:4px solid var(--accent);border-radius:50%;box-shadow:var(--glow);}
#${id} .ring2{position:absolute;left:50%;top:50%;width:1640px;height:570px;transform:translate(-50%,-50%) rotate(7deg);border:3px solid var(--accent-2);border-radius:50%;}
#${id} .sub{position:absolute;left:50%;bottom:150px;transform:translateX(-50%);font-size:42px;font-weight:600;color:var(--muted);letter-spacing:0.12em;white-space:nowrap;}
#${id} .bb.b1{width:170px;height:170px;right:220px;top:170px;}
#${id} .sp.s1{font-size:90px;left:260px;top:190px;}
#${id} .sp.s2{font-size:54px;right:340px;bottom:260px;}
#${id} .sp.s3{font-size:42px;left:380px;bottom:300px;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{y:-40,autoAlpha:0,duration:0.24,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .h',{scale:0.5,autoAlpha:0,duration:0.32,ease:'back.out(1.5)'},0.08);\n` +
        `tl.from('#${id} .v',{innerText:0,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .orb,#${id} .ring2',{scale:1.15,autoAlpha:0,duration:0.32,ease:'power2.out'},0.22);\n` +
        `tl.from('#${id} .bb',{scale:0,autoAlpha:0,duration:0.26,ease:'back.out(1.6)'},0.34);\n` +
        `tl.from('#${id} .sp',{scale:0,autoAlpha:0,duration:0.22,stagger:0.08,ease:'back.out(2)'},0.42);\n` +
        `tl.from('#${id} .sub',{autoAlpha:0,duration:0.24},0.56);\n` +
        `tl.to('#${id} .sp.s2',{autoAlpha:0.25,duration:0.12,yoyo:true,repeat:3},0.62);\n` +
        `tl.to('#${id} .h',{x:-16,skewX:6,autoAlpha:0.55,duration:0.06,yoyo:true,repeat:3},0.9);`,
    ),
  列表: () =>
    mk(
      'yk_lst',
      '列表',
      (id) => `
<div class="rt">
  <div class="chip">今日歌单</div>
  <div class="bb b1"><i class="hl"></i></div>
  <div class="r r1">循环到包浆的那首</div>
  <div class="r r2 hot"><i class="hl"></i>藏了三年的宝藏 B 面</div>
  <div class="r r3">评论区指定安可曲</div>
  <i class="sp s1">✦</i><i class="sp s2">✦</i><i class="sp s3">✦</i>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${orbits(id)}
#${id} .chip{position:absolute;left:190px;top:140px;background:var(--panel);border:3px solid var(--accent);border-radius:999px;color:var(--accent);font-size:38px;font-weight:800;letter-spacing:0.1em;padding:20px 54px;}
#${id} .r{position:absolute;background:var(--panel);border:3px solid var(--accent);border-radius:999px;padding:34px 82px;font-size:56px;font-weight:800;white-space:nowrap;box-shadow:var(--shadow);}
#${id} .r.r1{left:190px;top:330px;}
#${id} .r.r2{left:300px;top:540px;}
#${id} .r.r3{left:230px;top:750px;}
#${id} .r.hot{background:var(--accent);color:var(--paper);border:6px solid var(--panel);box-shadow:0 0 0 4px var(--accent),var(--glow);}
#${id} .r.hot .hl{position:absolute;width:52px;height:26px;background:var(--panel);border-radius:999px;top:16px;left:60px;transform:rotate(-18deg);}
#${id} .bb.b1{width:210px;height:210px;right:230px;top:200px;}
#${id} .sp.s1{font-size:88px;right:520px;top:420px;}
#${id} .sp.s2{font-size:56px;right:260px;bottom:240px;}
#${id} .sp.s3{font-size:42px;left:1080px;top:260px;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{y:-40,autoAlpha:0,duration:0.24,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .r',{scale:0.5,autoAlpha:0,duration:0.3,stagger:0.13,ease:'back.out(1.6)'},0.1);\n` +
        `tl.from('#${id} .r.hot .hl',{scale:0,autoAlpha:0,duration:0.2,ease:'back.out(2)'},0.5);\n` +
        `tl.from('#${id} .bb',{scale:0,autoAlpha:0,duration:0.26,ease:'back.out(1.6)'},0.4);\n` +
        `tl.from('#${id} .sp',{scale:0,autoAlpha:0,duration:0.22,stagger:0.08,ease:'back.out(2)'},0.48);\n` +
        `tl.to('#${id} .sp.s1',{autoAlpha:0.25,duration:0.12,yoyo:true,repeat:3},0.72);`,
    ),
  评论: () =>
    mk(
      'yk_cmt',
      '评论',
      (id) => `
<div class="rt">
  <div class="win">
    <div class="bar"><span class="tt">MSN · 千禧留言板</span><span class="wb"><i></i><i></i><b>✕</b></span></div>
    <div class="msg m1">这条链子哪里买的!</div>
    <div class="msg m2">评论区第 1 楼自取</div>
    <div class="msg m3 hot"><i class="hl"></i>蹲一个全身链接</div>
    <div class="toast">+3 条新消息</div>
  </div>
  <div class="bb b1"><i class="hl"></i></div>
  <i class="sp s1">✦</i><i class="sp s2">✦</i><i class="sp s3">✦</i>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${orbits(id)}
#${id} .win{position:absolute;left:230px;top:170px;width:1120px;bottom:190px;background:var(--panel);border:3px solid var(--accent);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
#${id} .bar{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid var(--accent);padding:26px 44px;}
#${id} .tt{font-size:36px;font-weight:800;color:var(--accent);letter-spacing:0.08em;}
#${id} .wb{display:flex;align-items:center;gap:18px;}
#${id} .wb i{width:34px;height:34px;border-radius:999px;background:var(--panel);border:3px solid var(--accent);}
#${id} .wb b{width:40px;height:40px;border-radius:999px;border:3px solid var(--accent);color:var(--accent);font-size:28px;font-weight:800;display:flex;align-items:center;justify-content:center;}
#${id} .msg{position:absolute;background:var(--panel);border:3px solid var(--accent);border-radius:999px;font-size:46px;font-weight:700;padding:24px 52px;white-space:nowrap;box-shadow:var(--shadow);}
#${id} .msg.m1{left:60px;top:170px;}
#${id} .msg.m2{right:60px;top:330px;}
#${id} .msg.m3{left:60px;top:490px;}
#${id} .msg.hot{background:var(--accent);color:var(--paper);border:6px solid var(--panel);box-shadow:0 0 0 4px var(--accent),var(--glow);}
#${id} .msg.hot .hl{position:absolute;width:46px;height:22px;background:var(--panel);border-radius:999px;top:14px;left:52px;transform:rotate(-18deg);}
#${id} .toast{position:absolute;right:50px;bottom:44px;background:var(--panel);border:3px solid var(--accent);border-radius:999px;color:var(--accent);font-size:32px;font-weight:800;letter-spacing:0.08em;padding:16px 40px;}
#${id} .bb.b1{width:210px;height:210px;right:180px;top:200px;}
#${id} .sp.s1{font-size:88px;right:420px;top:160px;}
#${id} .sp.s2{font-size:54px;right:250px;bottom:250px;}
#${id} .sp.s3{font-size:42px;right:520px;bottom:420px;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .win',{y:70,scale:0.7,autoAlpha:0,duration:0.32,ease:'back.out(1.4)'},0);\n` +
        `tl.from('#${id} .msg',{scale:0,autoAlpha:0,duration:0.26,stagger:0.14,ease:'back.out(1.7)'},0.24);\n` +
        `tl.from('#${id} .msg.hot .hl',{scale:0,autoAlpha:0,duration:0.18,ease:'back.out(2)'},0.68);\n` +
        `tl.from('#${id} .bb,#${id} .sp',{scale:0,autoAlpha:0,duration:0.22,stagger:0.08,ease:'back.out(2)'},0.4);\n` +
        `tl.from('#${id} .toast',{scale:0,autoAlpha:0,duration:0.22,ease:'back.out(2)'},0.48);\n` +
        `tl.to('#${id} .toast',{autoAlpha:0.3,duration:0.12,yoyo:true,repeat:3},0.72);`,
    ),
  代码: () =>
    mk(
      'yk_cod',
      '代码',
      (id) => `
<div class="rt">
  <div class="chip">主页皮肤源码</div>
  <div class="win">
    <div class="bar"><span class="tt">记事本 · y2k_style.js</span><span class="wb"><i></i><i></i><b>✕</b></span></div>
    <div class="code">
      <div class="ln"><i>1</i><em><b class="kw">function</b> fitCheck() {</em></div>
      <div class="ln"><i>2</i><em><b class="kw">const</b> vibe = <span class="st">'Y2K'</span>; <span class="cm">// 千禧滤镜</span></em></div>
      <div class="ln hi"><i>3</i><em>sparkle(vibe, <span class="st">999</span>); <span class="cm">// 星芒拉满</span></em><b class="cur"></b></div>
      <div class="ln"><i>4</i><em>}</em></div>
    </div>
  </div>
  <div class="bb b1"><i class="hl"></i></div>
  <i class="sp s1">✦</i><i class="sp s2">✦</i><i class="sp s3">✦</i>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${orbits(id)}
#${id} .chip{position:absolute;left:260px;top:120px;background:var(--panel);border:3px solid var(--accent);border-radius:999px;color:var(--accent);font-size:38px;font-weight:800;letter-spacing:0.1em;padding:20px 54px;}
#${id} .win{position:absolute;left:260px;right:260px;top:250px;bottom:170px;background:var(--panel);border:3px solid var(--accent);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
#${id} .bar{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid var(--accent);padding:24px 44px;}
#${id} .tt{font-size:36px;font-weight:800;color:var(--accent);letter-spacing:0.06em;}
#${id} .wb{display:flex;align-items:center;gap:18px;}
#${id} .wb i{width:34px;height:34px;border-radius:999px;background:var(--panel);border:3px solid var(--accent);}
#${id} .wb b{width:40px;height:40px;border-radius:999px;border:3px solid var(--accent);color:var(--accent);font-size:28px;font-weight:800;display:flex;align-items:center;justify-content:center;}
#${id} .code{padding:52px 64px;display:flex;flex-direction:column;gap:30px;font-family:var(--font-num);font-size:44px;font-weight:600;}
#${id} .ln{display:flex;align-items:center;gap:44px;padding:12px 30px;border-radius:999px;}
#${id} .ln i{font-style:normal;width:56px;text-align:right;color:var(--muted);font-size:34px;flex:none;}
#${id} .ln em{font-style:normal;white-space:nowrap;}
#${id} .kw{color:var(--accent);font-weight:800;}
#${id} .st{font-weight:800;}
#${id} .cm{color:var(--muted);}
#${id} .ln.hi{background:var(--accent);color:var(--paper);border:6px solid var(--panel);box-shadow:0 0 0 4px var(--accent),var(--glow);}
#${id} .ln.hi i,#${id} .ln.hi .cm{color:var(--paper);}
#${id} .cur{width:20px;height:50px;border-radius:10px;background:var(--paper);margin-left:20px;flex:none;}
#${id} .bb.b1{width:150px;height:150px;left:60px;top:300px;}
#${id} .sp.s1{font-size:80px;right:120px;top:160px;}
#${id} .sp.s2{font-size:50px;left:110px;bottom:210px;}
#${id} .sp.s3{font-size:40px;right:150px;bottom:520px;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{y:-40,autoAlpha:0,duration:0.24,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .win',{scale:0.7,autoAlpha:0,duration:0.32,ease:'back.out(1.4)'},0.08);\n` +
        `tl.from('#${id} .ln',{x:-60,autoAlpha:0,duration:0.24,stagger:0.11,ease:'power2.out'},0.3);\n` +
        `tl.from('#${id} .bb,#${id} .sp',{scale:0,autoAlpha:0,duration:0.22,stagger:0.08,ease:'back.out(2)'},0.5);\n` +
        `tl.to('#${id} .cur',{autoAlpha:0,duration:0.12,yoyo:true,repeat:3},0.72);`,
    ),
  步骤: () =>
    mk(
      'yk_stp',
      '步骤',
      (id) => `
<div class="rt">
  <div class="chip">出片三步曲</div>
  <svg class="arc" viewBox="0 0 1920 1080"><path d="M290,620 Q880,60 1470,540" fill="none"/></svg>
  <div class="st s1"><div class="bb"><i class="hl"></i><b>1</b></div><span class="lb">选好 BGM</span></div>
  <div class="st s2"><div class="bb"><i class="hl"></i><b>2</b></div><span class="lb">卡点剪辑</span></div>
  <div class="st s3"><div class="bb"><i class="hl"></i><b>3</b></div><span class="lb">封面加星芒</span></div>
  <i class="sp p1">✦</i><i class="sp p2">✦</i><i class="sp p3">✦</i>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
${orbits(id)}
#${id} .chip{position:absolute;left:190px;top:140px;background:var(--panel);border:3px solid var(--accent);border-radius:999px;color:var(--accent);font-size:38px;font-weight:800;letter-spacing:0.1em;padding:20px 54px;}
#${id} .arc{position:absolute;inset:0;width:1920px;height:1080px;}
#${id} .arc path{fill:none;stroke:var(--accent);stroke-width:10;stroke-dasharray:0 48;stroke-linecap:round;opacity:0.65;}
#${id} .st{position:absolute;display:flex;flex-direction:column;align-items:center;gap:30px;}
#${id} .st.s1{left:170px;top:480px;}
#${id} .st.s2{left:760px;top:150px;}
#${id} .st.s3{left:1350px;top:400px;}
#${id} .st .bb{position:relative;width:240px;height:240px;}
#${id} .st .bb b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:104px;font-weight:900;font-style:italic;}
#${id} .lb{background:var(--panel);border:3px solid var(--accent);border-radius:999px;color:var(--accent);font-size:36px;font-weight:800;letter-spacing:0.08em;padding:16px 44px;white-space:nowrap;}
#${id} .sp.p1{font-size:84px;right:250px;top:200px;}
#${id} .sp.p2{font-size:52px;left:560px;bottom:220px;}
#${id} .sp.p3{font-size:42px;right:420px;bottom:340px;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{y:-40,autoAlpha:0,duration:0.24,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .arc',{autoAlpha:0,duration:0.3},0.08);\n` +
        `tl.from('#${id} .st .bb',{scale:0.4,autoAlpha:0,duration:0.3,stagger:0.14,ease:'back.out(1.6)'},0.14);\n` +
        `tl.from('#${id} .st .bb b',{scale:0,autoAlpha:0,duration:0.22,stagger:0.14,ease:'back.out(2)'},0.28);\n` +
        `tl.from('#${id} .lb',{y:30,autoAlpha:0,duration:0.24,stagger:0.12,ease:'power2.out'},0.44);\n` +
        `tl.from('#${id} .sp',{scale:0,autoAlpha:0,duration:0.22,stagger:0.08,ease:'back.out(2)'},0.56);\n` +
        `tl.to('#${id} .sp.p1',{autoAlpha:0.25,duration:0.12,yoyo:true,repeat:3},0.72);`,
    ),
};
