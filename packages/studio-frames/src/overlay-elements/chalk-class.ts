/**
 * Chalkboard talking-head overlays: handheld-slate language. A small dark-green
 * board surface (--paper) in a wood frame (thick --panel-2 border), chalk type,
 * dashed chalk frames, hand-drawn underlines, ①②③, slight tilt, and chalk-dust
 * specks. Each element reads like a small slate the teacher holds up, stuck onto
 * the shot.
 */

import { mk, txt, type Block } from '../dialects/shared';

const SLATE = 'background:var(--paper);border:12px solid var(--panel-2);box-shadow:var(--shadow);';

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'co_ttl',
      '标题条',
      (id) => `
<div class="w">
  <div class="t" data-edit="title">${txt('标题一', 'Title 1')}</div>
  <u class="ul"></u>
  <span class="dust d1"></span><span class="dust d2"></span>
</div>
<style>
#${id} .w{position:absolute;left:76px;bottom:100px;width:52%;${SLATE}padding:28px 40px 34px;transform:rotate(-0.8deg);color:var(--fg);font-family:var(--font-head);}
#${id} .t{font-size:78px;font-weight:800;line-height:1.2;}
#${id} .ul{display:block;width:62%;height:8px;margin-top:14px;background:var(--accent);border-radius:6px;transform:rotate(-0.5deg);}
#${id} .dust{position:absolute;border-radius:999px;background:var(--fg);opacity:0.35;}
#${id} .d1{width:10px;height:10px;right:26px;top:22px;}
#${id} .d2{width:6px;height:6px;right:52px;top:44px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:90,rotation:-4,autoAlpha:0,duration:0.35,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left',duration:0.3,ease:'power2.out'},0.3);`,
    ),
  大数字: () =>
    mk(
      'co_num',
      '大数字',
      (id) => `
<div class="w">
  <div class="tag" data-edit="label">${txt('数据说明', 'Data label')}</div>
  <div class="v"><b data-edit="num">38</b><i data-edit="unit">%</i></div>
</div>
<style>
#${id} .w{position:absolute;right:100px;top:120px;width:400px;${SLATE}padding:26px 30px 30px;transform:rotate(1deg);color:var(--fg);font-family:var(--font-head);text-align:center;}
#${id} .tag{display:inline-block;border:3px dashed var(--accent-2);color:var(--accent-2);font-size:30px;font-weight:700;padding:8px 20px;letter-spacing:0.1em;transform:rotate(-1.5deg);}
#${id} .v{margin-top:10px;line-height:1;}
#${id} .v b{font-family:var(--font-num);font-size:170px;font-weight:800;}
#${id} .v i{font-style:normal;font-size:64px;font-weight:800;color:var(--accent);margin-left:8px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:-80,rotation:5,autoAlpha:0,duration:0.35,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .v b',{innerText:0,snap:{innerText:1},duration:0.7,ease:'power1.out'},0.2);`,
    ),
  要点列表: () =>
    mk(
      'co_list',
      '要点列表',
      (id) => `
<div class="w">
  <div class="hd" data-edit="title">${txt('列表标题', 'List title')}</div>
  <div class="r r1"><i>①</i><span data-edit="p1">${txt('要点一', 'Point 1')}</span></div>
  <div class="r r2"><i>②</i><span data-edit="p2">${txt('要点二', 'Point 2')}</span></div>
  <div class="r r3"><i>③</i><span data-edit="p3">${txt('要点三', 'Point 3')}</span></div>
</div>
<style>
#${id} .w{position:absolute;left:88px;top:50%;transform:translateY(-50%) rotate(-0.6deg);width:540px;${SLATE}padding:26px 34px 30px;color:var(--fg);font-family:var(--font-head);}
#${id} .hd{font-size:34px;font-weight:800;color:var(--accent);letter-spacing:0.08em;border-bottom:3px dashed var(--line);padding-bottom:12px;}
#${id} .r{display:flex;align-items:center;gap:18px;padding:16px 2px;font-size:40px;font-weight:700;border-bottom:3px dashed var(--line);}
#${id} .r:last-child{border-bottom:none;}
#${id} .r i{font-style:normal;color:var(--accent);font-size:44px;flex:none;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{x:-120,rotation:-4,autoAlpha:0,duration:0.35,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .r1',{x:-40,autoAlpha:0,duration:0.25},0.2);\n` +
        `tl.from('#${id} .r2',{x:-40,autoAlpha:0,duration:0.25},0.34);\n` +
        `tl.from('#${id} .r3',{x:-40,autoAlpha:0,duration:0.25},0.48);`,
    ),
  关键词重击: () =>
    mk(
      'co_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <span class="t" data-edit="word">${txt('关键词', 'Keyword')}</span>
  <i class="hl"></i>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-1deg);${SLATE}padding:40px 64px 48px;}
#${id} .t{position:relative;z-index:1;color:var(--fg);font-family:var(--font-head);font-size:140px;font-weight:900;line-height:1;}
#${id} .hl{position:absolute;left:44px;right:44px;bottom:40px;height:26px;background:var(--accent);opacity:0.55;transform:rotate(-0.8deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{scale:0.7,rotation:4,autoAlpha:0,duration:0.3,ease:'back.out(1.6)'},0);\n` +
        `tl.from('#${id} .hl',{scaleX:0,transformOrigin:'left',duration:0.3,ease:'power2.out'},0.28);`,
    ),
  标注: () =>
    mk(
      'co_call',
      '标注',
      (id) => `
<div class="w">
  <div class="chip" data-edit="note">${txt('标注一', 'Note 1')}</div>
  <svg class="ar" viewBox="0 0 60 90"><path d="M30 4 C 22 40 34 58 30 84 M18 66 L30 86 L44 68" fill="none" stroke="var(--accent-2)" stroke-width="7" stroke-linecap="round"/></svg>
</div>
<style>
#${id} .w{position:absolute;right:170px;top:28%;font-family:var(--font-head);text-align:center;}
#${id} .chip{display:inline-block;border:3px dashed var(--accent-2);color:var(--accent-2);background:var(--paper);font-size:42px;font-weight:800;padding:14px 28px;transform:rotate(2deg);box-shadow:var(--shadow);}
#${id} .ar{width:60px;height:90px;margin-top:6px;}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{y:-60,rotation:8,autoAlpha:0,duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .ar',{autoAlpha:0,y:-20,duration:0.25},0.24);`,
    ),
  关注引导: () =>
    mk(
      'co_cta',
      '关注引导',
      (id) => `
<div class="w">
  <span class="p" data-edit="cta">${txt('+ 关注', '+ Follow')}</span>
  <span class="s" data-edit="side">${txt('说明一', 'Detail 1')}</span>
</div>
<style>
#${id} .w{position:absolute;right:96px;bottom:110px;${SLATE}padding:18px 26px;transform:rotate(-1deg);display:flex;align-items:center;gap:20px;font-family:var(--font-head);}
#${id} .p{background:var(--accent);color:var(--paper);font-size:44px;font-weight:900;padding:10px 22px;border-radius:10px;}
#${id} .s{color:var(--fg);font-size:30px;font-weight:700;border-bottom:3px dashed var(--line);padding-bottom:4px;}
</style>`,
      (id) => `tl.from('#${id} .w',{x:110,rotation:3,autoAlpha:0,duration:0.32,ease:'power2.out'},0);`,
    ),
  金句: () =>
    mk(
      'co_quote',
      '金句',
      (id) => `
<div class="w">
  <div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b data-edit="l2">${txt('下半句。', 'and line two.')}</b></div>
  <div class="sig" data-edit="sig">${txt('—— 署名', '— Attribution')}</div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:120px;transform:translateX(-50%) rotate(-0.5deg);width:58%;${SLATE}padding:32px 44px;color:var(--fg);font-family:var(--font-head);}
#${id} .t{font-size:54px;font-weight:800;line-height:1.4;}
#${id} .t b{color:var(--accent);border-bottom:6px solid var(--accent);}
#${id} .sig{margin-top:14px;text-align:right;font-size:30px;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:100,autoAlpha:0,duration:0.35,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .t b',{autoAlpha:0,duration:0.25},0.34);`,
    ),
  左右对比: () =>
    mk(
      'co_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="s a"><i data-edit="lt">${txt('选项一', 'Option A')}</i><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <div class="vs">vs</div>
  <div class="s b"><i data-edit="rt">${txt('选项二', 'Option B')}</i><b data-edit="rv">${txt('数值二', 'Value B')}</b></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);display:flex;align-items:center;gap:24px;font-family:var(--font-head);}
#${id} .s{width:340px;${SLATE}padding:22px 26px;text-align:center;color:var(--fg);}
#${id} .a{transform:rotate(-1.2deg);}
#${id} .b{transform:rotate(1deg);}
#${id} .s i{display:block;font-style:normal;font-size:30px;font-weight:700;color:var(--muted);}
#${id} .s b{display:block;margin-top:8px;font-family:var(--font-num);font-size:64px;font-weight:800;}
#${id} .b b{color:var(--accent);}
#${id} .vs{color:var(--accent-2);font-size:46px;font-weight:900;transform:rotate(-4deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .a',{x:-100,rotation:-6,autoAlpha:0,duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .vs',{scale:0,duration:0.22,ease:'back.out(2)'},0.18);\n` +
        `tl.from('#${id} .b',{x:100,rotation:6,autoAlpha:0,duration:0.3,ease:'power2.out'},0.26);`,
    ),
};

export type { Block };
