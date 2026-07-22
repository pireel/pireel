/**
 * Sticker overlay elements: peeled die-cut sticker language — white stickers separated by soft
 * shadow only; color/black stickers get a 10px white rim; small black label capsules; a cyan
 * highlighter block swipes across keywords; a pink halftone star-burst pops last; index dots.
 * Everything tilts slightly (adjacent ones tilt opposite ways). Each element looks torn from a
 * sticker book and slapped on the frame. (The subject is already stickerized with a white outline,
 * so elements avoid the person — don't stick a white sticker on their face.)
 */

import { mk, txt, type Block } from '../dialects/shared';

const WHITE = 'background:var(--panel);border-radius:28px;box-shadow:var(--shadow);';
const CYAN = 'background:var(--accent);border:10px solid var(--panel);border-radius:26px;box-shadow:var(--shadow);';
const BLACK = 'background:var(--panel-2);border:10px solid var(--panel);border-radius:26px;box-shadow:var(--shadow);';
const CAP =
  'background:var(--panel-2);color:var(--panel);font-size:28px;font-weight:700;letter-spacing:0.14em;padding:10px 26px;border-radius:999px;box-shadow:var(--shadow);white-space:nowrap;';
const BURST =
  'display:flex;align-items:center;justify-content:center;color:var(--panel);font-weight:900;filter:drop-shadow(0 10px 18px rgb(29 29 31/0.18));' +
  'clip-path:polygon(50% 0%,59% 35%,95% 6%,66% 41%,100% 50%,66% 59%,95% 94%,59% 65%,50% 100%,41% 65%,5% 94%,34% 59%,0% 50%,34% 41%,5% 6%,41% 35%);' +
  'background-color:var(--accent-2);background-image:radial-gradient(var(--panel) 18%,transparent 19%);background-size:12px 12px;';
const MK = 'background:var(--accent);color:var(--fg);padding:2px 18px;display:inline-block;';
const SLAP = `{scale:0.6,rotation:'-=8',autoAlpha:0,duration:0.3,ease:'back.out(1.7)'}`;
const POP = `{scale:0,autoAlpha:0,duration:0.26,ease:'back.out(2)'}`;
const SWEEP = `{scaleX:0,transformOrigin:'left center',duration:0.25,ease:'power3.out'}`;

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'sk_ttl',
      '标题条',
      (id) => `
<div class="w">
  <div class="cap" data-edit="kick">${txt('标签', 'LABEL')}</div>
  <div class="bar" data-edit="title">${txt('标题一', 'Title 1')}</div>
  <i class="burst" data-edit="burst">NEW</i>
</div>
<style>
#${id} .w{position:absolute;left:76px;bottom:96px;width:58%;font-family:var(--font-head);}
#${id} .cap{position:absolute;${CAP}left:38px;top:-28px;transform:rotate(-4deg);z-index:2;}
#${id} .bar{${WHITE}color:var(--fg);font-size:76px;font-weight:900;line-height:1.16;padding:38px 48px 34px;transform:rotate(-1.6deg);}
#${id} .burst{position:absolute;${BURST}right:-36px;top:-58px;width:150px;height:150px;font-size:40px;font-style:normal;transform:rotate(10deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .bar',${SLAP},0);\n` +
        `tl.from('#${id} .cap',${SLAP.replace('0.3', '0.26')},0.18);\n` +
        `tl.from('#${id} .burst',${POP},0.4);`,
    ),
  大数字: () =>
    mk(
      'sk_num',
      '大数字',
      (id) => `
<div class="w">
  <div class="cap" data-edit="label">${txt('数据说明', 'Data label')}</div>
  <div class="v"><b data-edit="num">38</b><i data-edit="unit">%</i></div>
</div>
<style>
#${id} .w{position:absolute;right:96px;top:110px;width:440px;${WHITE}padding:56px 40px 38px;transform:rotate(-2.5deg);color:var(--fg);font-family:var(--font-head);text-align:center;}
#${id} .cap{position:absolute;${CAP}left:26px;top:-26px;transform:rotate(-5deg);}
#${id} .v{display:flex;align-items:baseline;justify-content:center;gap:10px;line-height:1;}
#${id} .v b{font-family:var(--font-num);font-size:190px;font-weight:900;letter-spacing:-0.03em;}
#${id} .v i{font-style:normal;${MK}font-size:54px;font-weight:900;padding:4px 14px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',${SLAP},0);\n` +
        `tl.from('#${id} .v b',{innerText:0,snap:{innerText:1},duration:0.7,ease:'power1.out'},0.16);\n` +
        `tl.from('#${id} .cap',${SLAP.replace('0.3', '0.26')},0.3);\n` +
        `tl.from('#${id} .v i',${SWEEP},0.5);`,
    ),
  要点列表: () =>
    mk(
      'sk_list',
      '要点列表',
      (id) => `
<div class="w">
  <div class="cap hd" data-edit="title">${txt('列表标题 LIST', 'LIST TITLE')}</div>
  <div class="r r1"><i class="d">1</i><span data-edit="p1">${txt('要点一', 'Point 1')}</span></div>
  <div class="r r2"><i class="d dc">2</i><span data-edit="p2">${txt('要点二', 'Point 2')}</span></div>
  <div class="r r3"><i class="d dp">3</i><span data-edit="p3">${txt('要点三', 'Point 3')}</span></div>
</div>
<style>
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:600px;font-family:var(--font-head);}
#${id} .hd{position:relative;display:inline-flex;transform:rotate(-3deg);margin-left:14px;}
#${id} .r{${WHITE}display:flex;align-items:center;gap:26px;margin-top:26px;padding:22px 34px;font-size:44px;font-weight:800;color:var(--fg);}
#${id} .r1{transform:rotate(-1.5deg);}
#${id} .r2{transform:rotate(1.2deg);}
#${id} .r3{transform:rotate(-0.8deg);}
#${id} .d{font-style:normal;display:flex;align-items:center;justify-content:center;width:64px;height:64px;flex:none;background:var(--panel-2);color:var(--panel);border:6px solid var(--panel);border-radius:999px;box-shadow:var(--shadow);font-size:32px;font-weight:900;}
#${id} .dc{background:var(--accent);color:var(--fg);}
#${id} .dp{background:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .hd',${SLAP.replace('0.3', '0.26')},0);\n` +
        `tl.from('#${id} .r1',{x:-90,scale:0.85,autoAlpha:0,duration:0.28,ease:'back.out(1.6)'},0.14);\n` +
        `tl.from('#${id} .r2',{x:-90,scale:0.85,autoAlpha:0,duration:0.28,ease:'back.out(1.6)'},0.28);\n` +
        `tl.from('#${id} .r3',{x:-90,scale:0.85,autoAlpha:0,duration:0.28,ease:'back.out(1.6)'},0.42);\n` +
        `tl.from('#${id} .d',{scale:0,duration:0.22,stagger:0.12,ease:'back.out(2)'},0.4);`,
    ),
  关键词重击: () =>
    mk(
      'sk_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <b class="t mk" data-edit="word">${txt('关键词', 'Keyword')}</b>
  <i class="burst">!</i>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-2deg);${WHITE}padding:44px 56px;font-family:var(--font-head);}
#${id} .t{${MK}font-size:140px;font-weight:900;line-height:1;padding:10px 30px;}
#${id} .burst{position:absolute;${BURST}right:-64px;top:-64px;width:140px;height:140px;font-size:56px;font-style:normal;transform:rotate(12deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',${SLAP.replace('0.6', '0.5')},0);\n` +
        `tl.from('#${id} .t',${SWEEP},0.26);\n` +
        `tl.from('#${id} .burst',${POP},0.52);`,
    ),
  标注: () =>
    mk(
      'sk_call',
      '标注',
      (id) => `
<div class="w">
  <div class="cap" data-edit="note">${txt('标注一', 'Note 1')}</div>
  <svg class="ar" viewBox="0 0 60 100"><path d="M30 6 C 20 40 38 60 30 92 M17 74 L30 94 L44 76"/></svg>
</div>
<style>
#${id} .w{position:absolute;right:150px;top:26%;font-family:var(--font-head);text-align:center;}
#${id} .cap{position:relative;display:inline-flex;${CAP}font-size:38px;padding:14px 34px;transform:rotate(3deg);}
#${id} .ar{width:60px;height:100px;margin-top:10px;}
#${id} .ar path{fill:none;stroke:var(--fg);stroke-width:7;stroke-linecap:round;stroke-dasharray:2 16;}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',${SLAP.replace('0.3', '0.26')},0);\n` +
        `tl.from('#${id} .ar path',{strokeDashoffset:240,duration:0.32,ease:'power2.out'},0.22);`,
    ),
  关注引导: () =>
    mk(
      'sk_cta',
      '关注引导',
      (id) => `
<div class="w">
  <div class="pill"><b class="mk" data-edit="cta">${txt('+ 关注', '+ Follow')}</b><span data-edit="tail">${txt(',说明一。', ', Detail 1.')}</span></div>
  <div class="cap" data-edit="side">${txt('说明二', 'Detail 2')}</div>
</div>
<style>
#${id} .w{position:absolute;right:96px;bottom:104px;font-family:var(--font-head);}
#${id} .pill{${WHITE}border-radius:999px;padding:28px 52px;font-size:56px;font-weight:900;color:var(--fg);transform:rotate(-2deg);white-space:nowrap;}
#${id} .pill .mk{${MK}padding:2px 20px;}
#${id} .pill span{color:var(--muted);}
#${id} .cap{position:absolute;${CAP}right:22px;top:-30px;transform:rotate(4deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .pill',${SLAP},0);\n` +
        `tl.from('#${id} .mk',${SWEEP},0.26);\n` +
        `tl.from('#${id} .cap',${POP},0.48);`,
    ),
  金句: () =>
    mk(
      'sk_quote',
      '金句',
      (id) => `
<div class="w">
  <div class="board">
    <div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b class="mk" data-edit="l2">${txt('下半句。', 'and line two.')}</b></div>
  </div>
  <div class="qm">“</div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);width:60%;font-family:var(--font-head);}
#${id} .board{${BLACK}color:var(--panel);font-size:56px;font-weight:900;line-height:1.4;padding:44px 56px 44px 96px;transform:rotate(-1deg);}
#${id} .board .mk{${MK}font-weight:900;}
#${id} .qm{position:absolute;${CYAN}left:-34px;top:-44px;width:110px;height:110px;display:flex;align-items:flex-end;justify-content:center;color:var(--fg);font-size:110px;font-weight:900;line-height:0.4;transform:rotate(-8deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .board',{y:90,scale:0.85,autoAlpha:0,duration:0.32,ease:'back.out(1.5)'},0);\n` +
        `tl.from('#${id} .mk',${SWEEP},0.3);\n` +
        `tl.from('#${id} .qm',{scale:0,rotation:-30,autoAlpha:0,duration:0.3,ease:'back.out(1.8)'},0.5);`,
    ),
  左右对比: () =>
    mk(
      'sk_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="s a"><i data-edit="lt">${txt('选项一', 'Option A')}</i><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <div class="s b"><i data-edit="rt">${txt('选项二', 'Option B')}</i><b data-edit="rv">${txt('数值二', 'Value B')}</b></div>
  <i class="burst">${txt('赢', 'WIN')}</i>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:104px;transform:translateX(-50%);display:flex;align-items:center;gap:28px;font-family:var(--font-head);}
#${id} .s{width:360px;padding:30px 28px;text-align:center;}
#${id} .s i{display:block;font-style:normal;font-size:28px;font-weight:800;letter-spacing:0.14em;}
#${id} .s b{display:block;margin-top:12px;font-family:var(--font-num);font-size:70px;font-weight:900;line-height:1;}
#${id} .a{${WHITE}color:var(--fg);transform:rotate(-2deg);}
#${id} .a i{color:var(--muted);}
#${id} .b{${CYAN}color:var(--fg);transform:rotate(1.6deg);}
#${id} .b i{opacity:0.72;}
#${id} .burst{position:absolute;${BURST}right:-52px;top:-64px;width:130px;height:130px;font-size:50px;font-style:normal;transform:rotate(12deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .a',${SLAP},0);\n` +
        `tl.from('#${id} .b',{scale:0.5,rotation:'-=10',autoAlpha:0,duration:0.32,ease:'back.out(1.7)'},0.18);\n` +
        `tl.from('#${id} .burst',${POP},0.56);`,
    ),
};

export type { Block };
