/**
 * 手帐 Scrapbook 的口播叠加件:贴在画面上的实物语言——白底拍立得卡(厚下边距当白框、
 * 真实投影、旋转 2-4°)、半透明绿 washi 胶带压角(opacity 0.75,±30-45°)、米黄便签、
 * 歪 1° 的橙色手写粗下划线(scaleX 画出)、手绘 SVG 圈/箭头 dash 自绘、✓ 勾选。
 * 动效是贴上去的:back.out 落纸带旋转过冲,胶带后贴,墨迹最后画,元素必须叠压。
 */

import { mk, txt, type Block } from '../dialects/shared';

const CARD =
  'background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);';
const TAPE =
  'position:absolute;width:210px;height:56px;background:var(--accent-2);opacity:0.75;border-radius:var(--radius);';
const NOTE =
  'background:var(--panel-2);box-shadow:var(--shadow);border-radius:var(--radius);';

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'sc_ttl',
      '标题条',
      (id) => `
<div class="w">
  <div class="card">
    <div class="h" data-edit="title">${txt('标题一', 'Title 1')}</div>
    <u class="ul"></u>
    <div class="cap" data-edit="cap">JULY · WEEKLY PAGE</div>
  </div>
  <i class="tp t1"></i><i class="tp t2"></i>
  <div class="note" data-edit="kick">DAY 07</div>
</div>
<style>
#${id} .w{position:absolute;left:80px;bottom:96px;width:56%;font-family:var(--font-head);}
#${id} .card{${CARD}transform:rotate(-2deg);padding:40px 48px 96px;color:var(--fg);position:relative;}
#${id} .h{font-size:82px;font-weight:900;letter-spacing:-0.01em;line-height:1.15;}
#${id} .ul{display:block;width:46%;height:6px;margin-top:16px;background:var(--accent);transform:rotate(-1deg);}
#${id} .cap{position:absolute;left:0;right:0;bottom:26px;text-align:center;font-size:30px;letter-spacing:0.18em;color:var(--muted);}
#${id} .tp{${TAPE}}
#${id} .t1{left:-52px;top:-30px;transform:rotate(-38deg);}
#${id} .t2{right:-46px;top:-24px;transform:rotate(34deg);}
#${id} .note{position:absolute;right:-30px;bottom:-38px;${NOTE}transform:rotate(4deg);color:var(--fg);font-size:40px;font-weight:800;padding:22px 30px;}
</style>`,
      (id) =>
        `tl.from('#${id} .card',{y:-90,rotation:4,autoAlpha:0,duration:0.32,ease:'back.out(1.4)'},0);\n` +
        `tl.from('#${id} .t1,#${id} .t2',{scale:0,autoAlpha:0,duration:0.2,ease:'back.out(2)',stagger:0.08},0.3);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.26,ease:'power2.out'},0.5);\n` +
        `tl.from('#${id} .note',{y:60,rotation:-6,autoAlpha:0,duration:0.28,ease:'back.out(1.5)'},0.6);`,
    ),
  大数字: () =>
    mk(
      'sc_num',
      '大数字',
      (id) => `
<div class="w">
  <div class="card">
    <div class="row"><span class="d" data-edit="label">DAY</span><b class="v" data-edit="num">07</b></div>
    <u class="ul"></u>
    <div class="cap" data-edit="cap">${txt('说明一', 'Detail 1')}</div>
  </div>
  <i class="tp t1"></i><i class="tp t2"></i>
</div>
<style>
#${id} .w{position:absolute;right:110px;top:110px;width:440px;font-family:var(--font-head);}
#${id} .card{${CARD}transform:rotate(2.5deg);padding:36px 40px 100px;color:var(--fg);position:relative;text-align:center;}
#${id} .row{display:flex;align-items:baseline;justify-content:center;gap:20px;}
#${id} .d{font-size:56px;font-weight:800;color:var(--muted);}
#${id} .v{font-size:230px;font-weight:900;line-height:1;letter-spacing:-0.02em;}
#${id} .ul{display:block;width:64%;height:6px;margin:14px auto 0;background:var(--accent);transform:rotate(-1deg);}
#${id} .cap{position:absolute;left:0;right:0;bottom:28px;font-size:28px;letter-spacing:0.16em;color:var(--muted);}
#${id} .tp{${TAPE}}
#${id} .t1{left:-40px;top:-26px;transform:rotate(-40deg);}
#${id} .t2{right:-36px;top:-22px;transform:rotate(40deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .card',{y:-80,rotation:-4,autoAlpha:0,duration:0.32,ease:'back.out(1.4)'},0);\n` +
        `tl.from('#${id} .tp',{scale:0,autoAlpha:0,duration:0.2,ease:'back.out(2)',stagger:0.08},0.3);\n` +
        `tl.from('#${id} .v',{autoAlpha:0,y:24,duration:0.24,ease:'power2.out'},0.4);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.24,ease:'power2.out'},0.62);`,
    ),
  要点列表: () =>
    mk(
      'sc_list',
      '要点列表',
      (id) => `
<div class="w">
  <i class="tp top"></i>
  <div class="hd" data-edit="title">${txt('列表标题', 'List title')}</div>
  <div class="r r1 done"><i class="bx"><b>✓</b></i><span data-edit="p1">${txt('要点一', 'Point 1')}</span></div>
  <div class="r r2 done"><i class="bx"><b>✓</b></i><span data-edit="p2">${txt('要点二', 'Point 2')}</span></div>
  <div class="r r3"><i class="bx"></i><span data-edit="p3">${txt('要点三', 'Point 3')}</span></div>
</div>
<style>
#${id} .w{position:absolute;left:96px;top:50%;transform:translateY(-50%) rotate(-1.5deg);width:520px;${NOTE}padding:52px 44px 40px;color:var(--fg);font-family:var(--font-head);}
#${id} .tp.top{${TAPE}left:50%;top:-26px;transform:translateX(-50%) rotate(-3deg);}
#${id} .hd{font-size:52px;font-weight:900;}
#${id} .r{display:flex;align-items:center;gap:24px;margin-top:30px;font-size:44px;font-weight:600;}
#${id} .bx{width:48px;height:48px;border:4px solid var(--fg);border-radius:var(--radius);flex:none;display:flex;align-items:center;justify-content:center;}
#${id} .bx b{color:var(--accent);font-size:38px;font-weight:900;}
#${id} .done span{color:var(--muted);text-decoration:line-through;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:-70,rotation:3,autoAlpha:0,duration:0.3,ease:'back.out(1.4)'},0);\n` +
        `tl.from('#${id} .tp.top',{scale:0,autoAlpha:0,duration:0.2,ease:'back.out(2)'},0.26);\n` +
        `tl.from('#${id} .r1',{x:-50,autoAlpha:0,duration:0.22},0.34);\n` +
        `tl.from('#${id} .r2',{x:-50,autoAlpha:0,duration:0.22},0.46);\n` +
        `tl.from('#${id} .r3',{x:-50,autoAlpha:0,duration:0.22},0.58);\n` +
        `tl.from('#${id} .bx b',{scale:0,duration:0.2,ease:'back.out(2)',stagger:0.1},0.7);`,
    ),
  关键词重击: () =>
    mk(
      'sc_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <span class="t" data-edit="word">${txt('关键词', 'Keyword')}</span>
  <u class="ul"></u>
  <i class="tp t1"></i>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-1.5deg);max-width:50%;${CARD}padding:44px 64px 52px;text-align:center;}
#${id} .t{color:var(--fg);font-family:var(--font-head);font-size:140px;font-weight:900;line-height:1;white-space:nowrap;}
#${id} .ul{display:block;height:10px;margin:18px 8px 0;background:var(--accent);transform:rotate(-1deg);}
#${id} .tp{${TAPE}}
#${id} .t1{right:-54px;top:-26px;transform:rotate(38deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:-60,rotation:3,scale:0.85,autoAlpha:0,duration:0.3,ease:'back.out(1.6)'},0);\n` +
        `tl.from('#${id} .t1',{scale:0,autoAlpha:0,duration:0.2,ease:'back.out(2)'},0.28);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.28,ease:'power2.out'},0.42);`,
    ),
  标注: () =>
    mk(
      'sc_call',
      '标注',
      (id) => `
<div class="w">
  <div class="note"><i class="tp top"></i><span data-edit="note">${txt('标注一!', 'Note 1!')}</span></div>
  <svg class="ar" viewBox="0 0 120 150"><path d="M96 10 C 40 40 60 90 34 128 M20 104 L32 132 L60 122" fill="none" stroke="var(--accent)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="260" stroke-dashoffset="260"/></svg>
</div>
<style>
#${id} .w{position:absolute;right:170px;top:24%;font-family:var(--font-head);}
#${id} .note{position:relative;${NOTE}transform:rotate(3deg);color:var(--fg);font-size:44px;font-weight:800;padding:30px 36px;}
#${id} .tp.top{${TAPE}width:150px;height:44px;left:50%;top:-20px;transform:translateX(-50%) rotate(-4deg);}
#${id} .ar{display:block;width:120px;height:150px;margin:10px 0 0 24px;}
</style>`,
      (id) =>
        `tl.from('#${id} .note',{y:-60,rotation:-5,autoAlpha:0,duration:0.28,ease:'back.out(1.5)'},0);\n` +
        `tl.from('#${id} .tp.top',{scale:0,autoAlpha:0,duration:0.18,ease:'back.out(2)'},0.24);\n` +
        `tl.to('#${id} .ar path',{strokeDashoffset:0,duration:0.4,ease:'power1.inOut'},0.38);`,
    ),
  关注引导: () =>
    mk(
      'sc_cta',
      '关注引导',
      (id) => `
<div class="w">
  <div class="card">
    <span class="t"><em data-edit="cta">${txt('+ 关注', '+ Follow')}</em><span data-edit="rest">${txt('说明一', 'DETAIL 1')}</span></span>
    <svg class="cir" viewBox="0 0 300 150"><path d="M150 18 C 60 10 18 42 20 76 C 22 116 92 138 158 134 C 236 130 284 100 280 66 C 276 30 210 12 138 20" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" stroke-dasharray="760" stroke-dashoffset="760"/></svg>
    <div class="cap" data-edit="side">${txt('说明二', 'Detail 2')}</div>
  </div>
  <i class="tp t1"></i>
  <div class="note" data-edit="tick">${txt('✓ 已收藏', '✓ Saved')}</div>
</div>
<style>
#${id} .w{position:absolute;right:100px;bottom:100px;width:520px;font-family:var(--font-head);}
#${id} .card{${CARD}transform:rotate(1.5deg);padding:40px 44px 92px;color:var(--fg);position:relative;text-align:center;}
#${id} .t{position:relative;font-size:74px;font-weight:900;}
#${id} .t em{font-style:normal;}
#${id} .cir{position:absolute;left:8px;top:-14px;width:270px;height:135px;}
#${id} .cap{position:absolute;left:0;right:0;bottom:26px;font-size:28px;letter-spacing:0.14em;color:var(--muted);}
#${id} .tp{${TAPE}}
#${id} .t1{left:-40px;top:-24px;transform:rotate(-40deg);}
#${id} .note{position:absolute;right:-26px;bottom:-34px;${NOTE}transform:rotate(-3deg);color:var(--accent);font-size:34px;font-weight:800;padding:18px 26px;}
</style>`,
      (id) =>
        `tl.from('#${id} .card',{y:-70,rotation:-4,autoAlpha:0,duration:0.3,ease:'back.out(1.4)'},0);\n` +
        `tl.from('#${id} .t1',{scale:0,autoAlpha:0,duration:0.18,ease:'back.out(2)'},0.26);\n` +
        `tl.to('#${id} .cir path',{strokeDashoffset:0,duration:0.34,ease:'power1.inOut'},0.4);\n` +
        `tl.from('#${id} .note',{y:50,rotation:5,autoAlpha:0,duration:0.26,ease:'back.out(1.5)'},0.74);`,
    ),
  金句: () =>
    mk(
      'sc_quote',
      '金句',
      (id) => `
<div class="w">
  <div class="card">
    <i class="q">“</i>
    <div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b data-edit="l2">${txt('下半句。', 'and line two.')}</b></div>
    <u class="ul"></u>
    <div class="cap" data-edit="sig">${txt('P.07 · 署名', 'P.07 · Attribution')}</div>
  </div>
  <i class="tp t1"></i><i class="tp t2"></i>
  <div class="note" data-edit="tag">${txt('标注一', 'Note 1')}</div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);width:58%;font-family:var(--font-head);}
#${id} .card{${CARD}transform:rotate(1.5deg);padding:36px 52px 92px;color:var(--fg);position:relative;}
#${id} .q{position:absolute;left:26px;top:-30px;font-style:normal;color:var(--accent);font-size:130px;font-weight:900;line-height:1;}
#${id} .t{font-size:58px;font-weight:800;line-height:1.4;padding-left:70px;}
#${id} .t b{color:var(--fg);}
#${id} .ul{display:block;width:38%;height:6px;margin:14px 0 0 70px;background:var(--accent);transform:rotate(-1deg);}
#${id} .cap{position:absolute;left:0;right:0;bottom:24px;text-align:center;font-size:28px;letter-spacing:0.18em;color:var(--muted);}
#${id} .tp{${TAPE}}
#${id} .t1{left:-48px;top:-26px;transform:rotate(-40deg);}
#${id} .t2{right:-44px;top:-24px;transform:rotate(40deg);}
#${id} .note{position:absolute;right:24px;bottom:-40px;${NOTE}transform:rotate(-4deg);color:var(--fg);font-size:32px;font-weight:800;padding:16px 24px;}
</style>`,
      (id) =>
        `tl.from('#${id} .card',{y:-80,rotation:-3,autoAlpha:0,duration:0.32,ease:'back.out(1.4)'},0);\n` +
        `tl.from('#${id} .tp',{scale:0,autoAlpha:0,duration:0.2,ease:'back.out(2)',stagger:0.08},0.3);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,y:20,duration:0.24},0.42);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.24,ease:'power2.out'},0.6);\n` +
        `tl.from('#${id} .note',{y:40,rotation:6,autoAlpha:0,duration:0.24,ease:'back.out(1.5)'},0.72);`,
    ),
  左右对比: () =>
    mk(
      'sc_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="s a"><i class="tp top"></i><i data-edit="lt">${txt('选项一', 'Option A')}</i><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <div class="vs" data-edit="vs">vs</div>
  <div class="s b"><i class="tp top2"></i><i data-edit="rt">${txt('选项二', 'Option B')}</i><b data-edit="rv">${txt('数值二', 'Value B')}</b><em>✓</em></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:104px;transform:translateX(-50%);display:flex;align-items:center;font-family:var(--font-head);}
#${id} .s{position:relative;width:340px;padding:60px 30px 40px;text-align:center;color:var(--fg);}
#${id} .a{${NOTE}transform:rotate(-3deg);}
#${id} .b{${CARD}transform:rotate(2.5deg);margin-left:-26px;}
#${id} .s i{display:block;font-style:normal;font-size:32px;font-weight:700;color:var(--muted);}
#${id} .s b{display:block;margin-top:10px;font-size:64px;font-weight:900;line-height:1;}
#${id} .tp{${TAPE}width:160px;height:44px;}
#${id} .top{left:50%;top:-20px;transform:translateX(-50%) rotate(-4deg);}
#${id} .top2{left:50%;top:-20px;transform:translateX(-50%) rotate(4deg);}
#${id} .b em{position:absolute;right:16px;top:14px;font-style:normal;color:var(--accent);font-size:52px;font-weight:900;transform:rotate(8deg);}
#${id} .vs{position:relative;z-index:1;color:var(--accent);font-size:54px;font-weight:900;transform:rotate(-6deg);margin:0 -8px;}
</style>`,
      (id) =>
        `tl.from('#${id} .a',{y:-70,rotation:-8,autoAlpha:0,duration:0.28,ease:'back.out(1.5)'},0);\n` +
        `tl.from('#${id} .b',{y:-70,rotation:8,autoAlpha:0,duration:0.28,ease:'back.out(1.5)'},0.14);\n` +
        `tl.from('#${id} .tp',{scale:0,autoAlpha:0,duration:0.18,ease:'back.out(2)',stagger:0.08},0.38);\n` +
        `tl.from('#${id} .vs',{scale:0,duration:0.2,ease:'back.out(2)'},0.52);\n` +
        `tl.from('#${id} .b em',{scale:0,rotation:-30,duration:0.22,ease:'back.out(2)'},0.66);`,
    ),
};

export type { Block };
