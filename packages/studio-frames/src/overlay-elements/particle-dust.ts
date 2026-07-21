/**
 * 星尘 Particle 的口播叠加件:虚空 pocket 语言——无边框无卡片,文字直接悬浮在一小片
 * 软边虚空上(blur 的近黑 wash + blur(80px) 的 accent 光晕),主角带 text-shadow 光晕;
 * 2-8px 星点(蓝/暖金/星白,透明度错落)逐粒写死 x/y 偏移从四方汇聚落位;
 * 星座连线用内联 SVG stroke-dasharray 自绘,节点小圆后弹出;暖金只给稀有强调。
 */

import { mk, txt, type Block } from '../dialects/shared';

const VOID =
  'position:absolute;border-radius:999px;background:var(--paper);filter:blur(50px);opacity:0.8;';
const HALO =
  'position:absolute;border-radius:999px;background:var(--accent);filter:blur(80px);opacity:0.25;';
const DOT = 'position:absolute;border-radius:999px;';

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'pd_ttl',
      '标题条',
      (id) => `
<div class="w">
  <i class="void"></i><i class="halo"></i>
  <span class="d d1"></span><span class="d d2"></span><span class="d d3"></span><span class="d d4"></span><span class="d d5"></span><span class="d d6"></span>
  <div class="k" data-edit="kick">DEEP FIELD · EP.01</div>
  <div class="h" data-edit="title">${txt('标题一', 'Title 1')}</div>
</div>
<style>
#${id} .w{position:absolute;left:96px;bottom:110px;width:56%;color:var(--fg);font-family:var(--font-head);}
#${id} .void{${VOID}left:-70px;right:-70px;top:-60px;bottom:-50px;}
#${id} .halo{${HALO}width:620px;height:620px;left:-80px;top:-240px;}
#${id} .d{${DOT}}
#${id} .d1{left:30px;top:-34px;width:7px;height:7px;background:var(--accent);opacity:0.9;}
#${id} .d2{left:340px;top:-60px;width:4px;height:4px;background:var(--fg);opacity:0.55;}
#${id} .d3{left:620px;top:-20px;width:6px;height:6px;background:var(--accent-2);opacity:0.85;}
#${id} .d4{left:180px;bottom:-36px;width:5px;height:5px;background:var(--fg);opacity:0.4;}
#${id} .d5{left:760px;bottom:-14px;width:8px;height:8px;background:var(--accent);opacity:0.7;}
#${id} .d6{left:500px;bottom:-44px;width:3px;height:3px;background:var(--accent-2);opacity:0.5;}
#${id} .k{position:relative;font-size:30px;letter-spacing:0.38em;color:var(--accent);font-family:var(--font-num);}
#${id} .h{position:relative;margin-top:18px;font-size:110px;font-weight:900;letter-spacing:-0.01em;line-height:1.1;text-shadow:var(--glow);}
</style>`,
      (id) =>
        `tl.from('#${id} .void,#${id} .halo',{autoAlpha:0,duration:0.4},0);\n` +
        `tl.from('#${id} .d1',{x:-120,y:-90,autoAlpha:0,duration:0.6,ease:'power2.out'},0.05);\n` +
        `tl.from('#${id} .d2',{x:60,y:-140,autoAlpha:0,duration:0.62,ease:'power2.out'},0.09);\n` +
        `tl.from('#${id} .d3',{x:150,y:-70,autoAlpha:0,duration:0.58,ease:'power2.out'},0.13);\n` +
        `tl.from('#${id} .d4',{x:-90,y:120,autoAlpha:0,duration:0.6,ease:'power2.out'},0.17);\n` +
        `tl.from('#${id} .d5',{x:130,y:110,autoAlpha:0,duration:0.56,ease:'power2.out'},0.21);\n` +
        `tl.from('#${id} .d6',{x:-40,y:150,autoAlpha:0,duration:0.6,ease:'power2.out'},0.25);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.35},0.2);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,y:40,duration:0.4,ease:'power2.out'},0.35);`,
    ),
  大数字: () =>
    mk(
      'pd_num',
      '大数字',
      (id) => `
<div class="w">
  <i class="void"></i><i class="halo"></i>
  <span class="d d1"></span><span class="d d2"></span><span class="d d3"></span><span class="d d4"></span>
  <div class="k" data-edit="label">LIGHT YEARS</div>
  <div class="v" data-edit="num">327</div>
  <div class="u" data-edit="unit">${txt('光年之外', 'light-years away')}</div>
</div>
<style>
#${id} .w{position:absolute;right:130px;top:120px;width:520px;text-align:center;color:var(--fg);font-family:var(--font-num);}
#${id} .void{${VOID}inset:-70px;}
#${id} .halo{${HALO}width:640px;height:640px;left:-60px;top:-120px;}
#${id} .d{${DOT}}
#${id} .d1{left:-16px;top:40px;width:6px;height:6px;background:var(--accent);opacity:0.85;}
#${id} .d2{right:-8px;top:110px;width:4px;height:4px;background:var(--fg);opacity:0.5;}
#${id} .d3{left:60px;bottom:-8px;width:7px;height:7px;background:var(--accent-2);opacity:0.8;}
#${id} .d4{right:70px;bottom:-30px;width:3px;height:3px;background:var(--fg);opacity:0.4;}
#${id} .k{position:relative;font-size:30px;letter-spacing:0.38em;color:var(--accent);}
#${id} .v{position:relative;margin-top:6px;font-size:280px;font-weight:800;line-height:1;color:var(--accent);text-shadow:var(--glow);}
#${id} .u{position:relative;margin-top:10px;font-family:var(--font-head);font-size:38px;color:var(--muted);letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .void,#${id} .halo',{autoAlpha:0,duration:0.4},0);\n` +
        `tl.from('#${id} .d1',{x:-140,y:-60,autoAlpha:0,duration:0.6,ease:'power2.out'},0.08);\n` +
        `tl.from('#${id} .d2',{x:120,y:-100,autoAlpha:0,duration:0.58,ease:'power2.out'},0.12);\n` +
        `tl.from('#${id} .d3',{x:-80,y:130,autoAlpha:0,duration:0.6,ease:'power2.out'},0.16);\n` +
        `tl.from('#${id} .d4',{x:110,y:120,autoAlpha:0,duration:0.56,ease:'power2.out'},0.2);\n` +
        `tl.from('#${id} .v',{innerText:0,snap:{innerText:1},duration:0.7,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.3},0.1);\n` +
        `tl.from('#${id} .u',{autoAlpha:0,duration:0.3},0.85);`,
    ),
  要点列表: () =>
    mk(
      'pd_list',
      '要点列表',
      (id) => `
<div class="w">
  <i class="void"></i>
  <div class="k" data-edit="title">STAR CATALOGUE</div>
  <div class="r r1"><b class="m1">✦</b><span data-edit="p1">${txt('要点一', 'Point 1')}</span></div>
  <svg class="ln l1" viewBox="0 0 520 4" preserveAspectRatio="none"><line x1="0" y1="2" x2="520" y2="2" stroke="var(--line)" stroke-width="2" stroke-dasharray="520" stroke-dashoffset="520"/></svg>
  <div class="r r2"><b class="m2">✦</b><span data-edit="p2">${txt('要点二', 'Point 2')}</span></div>
  <svg class="ln l2" viewBox="0 0 520 4" preserveAspectRatio="none"><line x1="0" y1="2" x2="520" y2="2" stroke="var(--line)" stroke-width="2" stroke-dasharray="520" stroke-dashoffset="520"/></svg>
  <div class="r r3"><b class="m3">✦</b><span data-edit="p3">${txt('要点三', 'Point 3')}</span></div>
</div>
<style>
#${id} .w{position:absolute;left:110px;top:50%;transform:translateY(-50%);width:540px;color:var(--fg);font-family:var(--font-head);}
#${id} .void{${VOID}inset:-70px -60px;}
#${id} .k{position:relative;font-family:var(--font-num);font-size:28px;letter-spacing:0.36em;color:var(--accent);margin-bottom:26px;}
#${id} .r{position:relative;display:flex;align-items:center;gap:24px;padding:20px 0;font-size:52px;font-weight:700;}
#${id} .m1{color:var(--accent);font-size:44px;text-shadow:var(--glow);}
#${id} .m2{color:var(--accent-2);font-size:36px;opacity:0.9;}
#${id} .m3{color:var(--fg);font-size:30px;opacity:0.7;}
#${id} .ln{position:relative;display:block;width:100%;height:4px;}
</style>`,
      (id) =>
        `tl.from('#${id} .void',{autoAlpha:0,duration:0.4},0);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.3},0.08);\n` +
        `tl.from('#${id} .r1',{autoAlpha:0,y:24,duration:0.3,ease:'power2.out'},0.18);\n` +
        `tl.to('#${id} .l1 line',{strokeDashoffset:0,duration:0.35,ease:'power1.inOut'},0.32);\n` +
        `tl.from('#${id} .r2',{autoAlpha:0,y:24,duration:0.3,ease:'power2.out'},0.4);\n` +
        `tl.to('#${id} .l2 line',{strokeDashoffset:0,duration:0.35,ease:'power1.inOut'},0.54);\n` +
        `tl.from('#${id} .r3',{autoAlpha:0,y:24,duration:0.3,ease:'power2.out'},0.62);`,
    ),
  关键词重击: () =>
    mk(
      'pd_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <i class="void"></i><i class="halo"></i>
  <span class="d d1"></span><span class="d d2"></span><span class="d d3"></span><span class="d d4"></span><span class="d d5"></span>
  <span class="t" data-edit="word">${txt('关键词', 'Keyword')}</span>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:52%;text-align:center;}
#${id} .void{${VOID}inset:-90px -110px;}
#${id} .halo{${HALO}width:760px;height:760px;left:50%;top:50%;transform:translate(-50%,-50%);}
#${id} .d{${DOT}}
#${id} .d1{left:-40px;top:-30px;width:7px;height:7px;background:var(--accent);opacity:0.9;}
#${id} .d2{right:-30px;top:-50px;width:4px;height:4px;background:var(--fg);opacity:0.55;}
#${id} .d3{left:40%;top:-70px;width:5px;height:5px;background:var(--accent-2);opacity:0.85;}
#${id} .d4{left:-60px;bottom:-40px;width:5px;height:5px;background:var(--fg);opacity:0.45;}
#${id} .d5{right:-50px;bottom:-24px;width:8px;height:8px;background:var(--accent);opacity:0.75;}
#${id} .t{position:relative;color:var(--fg);font-family:var(--font-head);font-size:160px;font-weight:900;letter-spacing:-0.01em;line-height:1;white-space:nowrap;text-shadow:var(--glow);}
</style>`,
      (id) =>
        `tl.from('#${id} .void,#${id} .halo',{autoAlpha:0,duration:0.35},0);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,scale:1.4,duration:0.3,ease:'power3.in'},0.05);\n` +
        `tl.from('#${id} .d1',{x:-150,y:-100,autoAlpha:0,duration:0.55,ease:'power2.out'},0.3);\n` +
        `tl.from('#${id} .d2',{x:140,y:-120,autoAlpha:0,duration:0.55,ease:'power2.out'},0.34);\n` +
        `tl.from('#${id} .d3',{x:30,y:-150,autoAlpha:0,duration:0.55,ease:'power2.out'},0.38);\n` +
        `tl.from('#${id} .d4',{x:-120,y:130,autoAlpha:0,duration:0.55,ease:'power2.out'},0.42);\n` +
        `tl.from('#${id} .d5',{x:150,y:100,autoAlpha:0,duration:0.55,ease:'power2.out'},0.46);`,
    ),
  标注: () =>
    mk(
      'pd_call',
      '标注',
      (id) => `
<div class="w">
  <div class="note" data-edit="note">${txt('标注一', 'Note 1')}</div>
  <svg class="cst" viewBox="0 0 260 200">
    <polyline points="10,10 120,60 90,150 230,180" fill="none" stroke="var(--accent)" stroke-width="3" opacity="0.55" stroke-dasharray="420" stroke-dashoffset="420"/>
    <circle class="n n1" cx="10" cy="10" r="6" fill="var(--fg)"/>
    <circle class="n n2" cx="120" cy="60" r="5" fill="var(--fg)"/>
    <circle class="n n3" cx="90" cy="150" r="5" fill="var(--fg)"/>
    <circle class="n n4" cx="230" cy="180" r="9" fill="var(--accent-2)"/>
  </svg>
</div>
<style>
#${id} .w{position:absolute;right:170px;top:20%;text-align:center;}
#${id} .note{color:var(--fg);font-family:var(--font-head);font-size:44px;font-weight:800;text-shadow:var(--glow);}
#${id} .cst{display:block;width:260px;height:200px;margin:16px auto 0;filter:drop-shadow(0 0 10px var(--accent));}
</style>`,
      (id) =>
        `tl.from('#${id} .note',{autoAlpha:0,y:-24,duration:0.3,ease:'power2.out'},0);\n` +
        `tl.to('#${id} .cst polyline',{strokeDashoffset:0,duration:0.5,ease:'power1.inOut'},0.2);\n` +
        `tl.from('#${id} .n1,#${id} .n2,#${id} .n3',{scale:0,transformOrigin:'center',duration:0.18,stagger:0.1,ease:'power2.out'},0.3);\n` +
        `tl.from('#${id} .n4',{scale:0,transformOrigin:'center',duration:0.25,ease:'power2.out'},0.75);`,
    ),
  关注引导: () =>
    mk(
      'pd_cta',
      '关注引导',
      (id) => `
<div class="w">
  <i class="halo"></i>
  <span class="d d1"></span><span class="d d2"></span><span class="d d3"></span><span class="d d4"></span>
  <div class="orb" data-edit="cta">${txt('+ 关注', '+ Follow')}</div>
  <div class="f" data-edit="side">${txt('说明一', 'Detail 1')}</div>
</div>
<style>
#${id} .w{position:absolute;right:130px;bottom:110px;text-align:center;}
#${id} .halo{${HALO}width:520px;height:520px;left:50%;top:40%;transform:translate(-50%,-50%);opacity:0.3;}
#${id} .d{${DOT}}
#${id} .d1{left:-30px;top:20px;width:7px;height:7px;background:var(--accent);opacity:0.9;}
#${id} .d2{right:-20px;top:60px;width:5px;height:5px;background:var(--accent-2);opacity:0.8;}
#${id} .d3{left:40px;bottom:60px;width:4px;height:4px;background:var(--fg);opacity:0.6;}
#${id} .d4{right:40px;bottom:90px;width:6px;height:6px;background:var(--accent);opacity:0.7;}
#${id} .orb{position:relative;width:280px;height:280px;margin:0 auto;border-radius:999px;background:var(--accent);box-shadow:var(--glow);color:var(--paper);font-family:var(--font-head);font-size:56px;font-weight:900;display:flex;align-items:center;justify-content:center;}
#${id} .f{position:relative;margin-top:22px;color:var(--muted);font-family:var(--font-head);font-size:30px;letter-spacing:0.14em;}
</style>`,
      (id) =>
        `tl.from('#${id} .halo',{autoAlpha:0,duration:0.4},0);\n` +
        `tl.from('#${id} .orb',{scale:0.6,autoAlpha:0,duration:0.35,ease:'power2.out'},0.08);\n` +
        `tl.to('#${id} .d1',{x:130,y:100,autoAlpha:0,duration:0.45,ease:'power2.in'},0.4);\n` +
        `tl.to('#${id} .d2',{x:-120,y:80,autoAlpha:0,duration:0.45,ease:'power2.in'},0.46);\n` +
        `tl.to('#${id} .d3',{x:90,y:-90,autoAlpha:0,duration:0.45,ease:'power2.in'},0.52);\n` +
        `tl.to('#${id} .d4',{x:-100,y:-110,autoAlpha:0,duration:0.45,ease:'power2.in'},0.58);\n` +
        `tl.from('#${id} .f',{autoAlpha:0,duration:0.3},0.6);`,
    ),
  金句: () =>
    mk(
      'pd_quote',
      '金句',
      (id) => `
<div class="w">
  <i class="void"></i>
  <span class="d d1"></span><span class="d d2"></span><span class="d d3"></span>
  <div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b data-edit="l2">${txt('下半句。', 'and line two.')}</b></div>
  <svg class="ul" viewBox="0 0 420 30" preserveAspectRatio="none">
    <polyline points="4,22 140,10 300,20 416,8" fill="none" stroke="var(--accent)" stroke-width="3" opacity="0.6" stroke-dasharray="440" stroke-dashoffset="440"/>
    <circle class="n n1" cx="140" cy="10" r="5" fill="var(--fg)"/>
    <circle class="n n2" cx="416" cy="8" r="6" fill="var(--fg)"/>
  </svg>
  <div class="a" data-edit="sig">${txt('—— 署名', '— Attribution')}</div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);width:58%;text-align:center;color:var(--fg);font-family:var(--font-head);}
#${id} .void{${VOID}inset:-70px -80px;}
#${id} .d{${DOT}}
#${id} .d1{left:-30px;top:-20px;width:6px;height:6px;background:var(--accent);opacity:0.85;}
#${id} .d2{right:-20px;top:10px;width:4px;height:4px;background:var(--fg);opacity:0.5;}
#${id} .d3{left:50%;bottom:-30px;width:5px;height:5px;background:var(--accent-2);opacity:0.7;}
#${id} .t{position:relative;font-size:64px;font-weight:700;line-height:1.4;}
#${id} .t b{color:var(--accent-2);}
#${id} .ul{position:relative;display:block;width:420px;height:30px;margin:10px auto 0;filter:drop-shadow(0 0 8px var(--accent));}
#${id} .a{position:relative;margin-top:12px;font-size:32px;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .void',{autoAlpha:0,duration:0.4},0);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,duration:0.45},0.1);\n` +
        `tl.from('#${id} .d1',{x:-110,y:-80,autoAlpha:0,duration:0.55,ease:'power2.out'},0.15);\n` +
        `tl.from('#${id} .d2',{x:120,y:-60,autoAlpha:0,duration:0.55,ease:'power2.out'},0.2);\n` +
        `tl.from('#${id} .d3',{x:40,y:110,autoAlpha:0,duration:0.55,ease:'power2.out'},0.25);\n` +
        `tl.to('#${id} .ul polyline',{strokeDashoffset:0,duration:0.4,ease:'power1.inOut'},0.5);\n` +
        `tl.from('#${id} .ul .n1,#${id} .ul .n2',{scale:0,transformOrigin:'center',duration:0.18,stagger:0.1},0.85);\n` +
        `tl.from('#${id} .a',{autoAlpha:0,duration:0.3},0.8);`,
    ),
  左右对比: () =>
    mk(
      'pd_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <i class="void"></i><i class="halo"></i>
  <div class="s a"><i data-edit="lt">${txt('选项一', 'Option A')}</i><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <svg class="mid" viewBox="0 0 8 160"><line x1="4" y1="0" x2="4" y2="160" stroke="var(--line)" stroke-width="2" stroke-dasharray="160" stroke-dashoffset="160"/></svg>
  <div class="s b"><em>✦</em><i data-edit="rt">${txt('选项二', 'Option B')}</i><b data-edit="rv">${txt('数值二', 'Value B')}</b></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);display:flex;align-items:center;gap:50px;text-align:center;font-family:var(--font-num);color:var(--fg);}
#${id} .void{${VOID}inset:-70px -90px;}
#${id} .halo{${HALO}width:520px;height:520px;right:-120px;top:50%;transform:translateY(-50%);left:auto;}
#${id} .s{position:relative;width:330px;}
#${id} .s i{display:block;font-style:normal;font-family:var(--font-head);font-size:30px;letter-spacing:0.2em;color:var(--muted);}
#${id} .s b{display:block;margin-top:14px;font-size:88px;font-weight:800;line-height:1;}
#${id} .a b{opacity:0.55;}
#${id} .b b{color:var(--accent);text-shadow:var(--glow);}
#${id} .b em{position:absolute;left:50%;top:-52px;transform:translateX(-50%);font-style:normal;color:var(--accent-2);font-size:36px;filter:drop-shadow(0 0 10px var(--accent-2));}
#${id} .mid{width:8px;height:160px;flex:none;}
</style>`,
      (id) =>
        `tl.from('#${id} .void,#${id} .halo',{autoAlpha:0,duration:0.4},0);\n` +
        `tl.from('#${id} .a',{autoAlpha:0,x:-60,duration:0.35,ease:'power2.out'},0.08);\n` +
        `tl.to('#${id} .mid line',{strokeDashoffset:0,duration:0.35,ease:'power1.inOut'},0.24);\n` +
        `tl.from('#${id} .b',{autoAlpha:0,x:60,duration:0.35,ease:'power2.out'},0.34);\n` +
        `tl.from('#${id} .b em',{scale:0,autoAlpha:0,duration:0.3,ease:'power2.out'},0.75);`,
    ),
};

export type { Block };
