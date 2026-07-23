/**
 * Kawaii talking-head overlays: peel-off sticker language. White bubble panels
 * all with a 5px deep-plum outline + soft pink shadow, tilted 2-6deg; speech
 * bubbles have a little tail; at most one accent pill per element (paper-color
 * text + glow); ✦✧ stars and blush dots as confetti; every entrance uses a
 * back.out bounce, no straight slide-in. Transparent root, stuck onto the
 * talking-head shot.
 */

import { mk, txt, type Block } from '../dialects/shared';

/** White bubble panel: thick outline + soft pink shadow */
const BUB = 'background:var(--panel);border:5px solid var(--fg);box-shadow:var(--shadow);';
/** Accent pill: paper-color text + glow */
const PILL =
  'background:var(--accent);color:var(--paper);font-weight:800;border-radius:999px;box-shadow:var(--glow);';

export const overlays: Record<string, () => Block> = {
  'title-bar': () =>
    mk(
      'kb_ttl',
      'title-bar',
      (id) => `
<div class="w">
  <div class="bub">
    <span class="t" data-edit="title">${txt('标题一', 'Title 1')}</span>
    <span class="blush"><i></i><i></i></span>
  </div>
  <span class="pill" data-edit="tag">${txt('标签', 'Label')}</span>
  <i class="star">✦</i>
</div>
<style>
#${id} .w{position:absolute;left:76px;bottom:96px;width:58%;font-family:var(--font-head);}
#${id} .bub{${BUB}border-radius:var(--radius);transform:rotate(-2deg);padding:30px 48px 34px;display:flex;align-items:center;gap:28px;color:var(--fg);}
#${id} .t{font-size:74px;font-weight:800;line-height:1.2;letter-spacing:0.01em;}
#${id} .blush{display:flex;gap:14px;flex:none;}
#${id} .blush i{width:26px;height:26px;border-radius:999px;background:var(--accent);opacity:0.5;}
#${id} .pill{position:absolute;right:34px;top:-38px;${PILL}font-size:38px;padding:14px 36px;transform:rotate(6deg);}
#${id} .star{position:absolute;left:-46px;top:-52px;font-style:normal;font-size:64px;color:var(--accent-2);transform:rotate(-12deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .bub',{scale:0.55,autoAlpha:0,rotation:-10,duration:0.36,ease:'back.out(1.7)'},0);\n` +
        `tl.from('#${id} .pill',{scale:0,autoAlpha:0,duration:0.26,ease:'back.out(2)'},0.26);\n` +
        `tl.from('#${id} .star',{scale:0,autoAlpha:0,duration:0.22,ease:'back.out(2)'},0.42);`,
    ),
  'big-number': () =>
    mk(
      'kb_num',
      'big-number',
      (id) => `
<div class="w">
  <div class="bub">
    <b data-edit="num">38</b>
    <span class="lab" data-edit="label">${txt('数据说明', 'Data label')}</span>
    <span class="blush"><i></i><i></i></span>
  </div>
  <span class="mini" data-edit="unit">%</span>
  <i class="star">✧</i>
</div>
<style>
#${id} .w{position:absolute;right:110px;top:100px;width:430px;font-family:var(--font-head);}
#${id} .bub{width:420px;height:420px;${BUB}border-radius:999px;transform:rotate(-3deg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--fg);}
#${id} .bub b{font-size:180px;font-weight:800;line-height:1;}
#${id} .lab{font-size:34px;font-weight:700;color:var(--muted);}
#${id} .blush{display:flex;gap:14px;}
#${id} .blush i{width:26px;height:26px;border-radius:999px;background:var(--accent);opacity:0.5;}
#${id} .mini{position:absolute;right:-14px;top:-20px;width:150px;height:150px;${PILL}display:flex;align-items:center;justify-content:center;font-size:64px;transform:rotate(8deg);}
#${id} .star{position:absolute;left:-52px;bottom:20px;font-style:normal;font-size:60px;color:var(--accent-2);transform:rotate(10deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .bub',{scale:0.4,autoAlpha:0,duration:0.38,ease:'back.out(1.6)'},0);\n` +
        `tl.from('#${id} .bub b',{innerText:0,snap:{innerText:1},duration:0.6,ease:'power1.out'},0.2);\n` +
        `tl.from('#${id} .mini',{scale:0,autoAlpha:0,duration:0.28,ease:'back.out(2)'},0.4);\n` +
        `tl.from('#${id} .star',{scale:0,autoAlpha:0,duration:0.22,ease:'back.out(2)'},0.6);`,
    ),
  'bullet-list': () =>
    mk(
      'kb_list',
      'bullet-list',
      (id) => `
<div class="w">
  <div class="hd" data-edit="title">${txt('列表标题', 'List title')}</div>
  <div class="r r1"><i>♥</i><span data-edit="p1">${txt('要点一', 'Point 1')}</span></div>
  <div class="r r2 on"><i>✦</i><span data-edit="p2">${txt('要点二', 'Point 2')}</span></div>
  <div class="r r3"><i>♥</i><span data-edit="p3">${txt('要点三', 'Point 3')}</span></div>
</div>
<style>
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:560px;font-family:var(--font-head);}
#${id} .hd{display:inline-block;${BUB}border-radius:999px;font-size:38px;font-weight:800;color:var(--fg);padding:16px 44px;transform:rotate(-2deg);}
#${id} .r{${BUB}border-radius:999px;margin-top:24px;padding:20px 36px;display:flex;align-items:center;gap:22px;font-size:40px;font-weight:700;color:var(--fg);}
#${id} .r1{transform:rotate(-1.5deg);}
#${id} .r2{transform:rotate(1.5deg);margin-left:26px;}
#${id} .r3{transform:rotate(-1deg);margin-left:8px;}
#${id} .r i{font-style:normal;color:var(--accent);font-size:38px;flex:none;}
#${id} .on{background:var(--accent);border-color:var(--accent);color:var(--paper);box-shadow:var(--glow);}
#${id} .on i{color:var(--paper);}
</style>`,
      (id) =>
        `tl.from('#${id} .hd',{scale:0,autoAlpha:0,duration:0.28,ease:'back.out(2)'},0);\n` +
        `tl.from('#${id} .r1',{y:60,autoAlpha:0,duration:0.3,ease:'back.out(1.7)'},0.16);\n` +
        `tl.from('#${id} .r2',{y:60,autoAlpha:0,duration:0.3,ease:'back.out(1.7)'},0.28);\n` +
        `tl.from('#${id} .r3',{y:60,autoAlpha:0,duration:0.3,ease:'back.out(1.7)'},0.4);`,
    ),
  'keyword-slam': () =>
    mk(
      'kb_kw',
      'keyword-slam',
      (id) => `
<div class="w">
  <div class="bub"><span class="t" data-edit="word">${txt('关键词', 'Keyword')}</span><span class="blush"><i></i><i></i></span></div>
  <i class="star s1">✦</i><i class="star s2">✧</i>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-family:var(--font-head);}
#${id} .bub{${BUB}border-radius:999px;transform:rotate(-2deg);padding:44px 84px 52px;display:flex;flex-direction:column;align-items:center;gap:16px;color:var(--fg);}
#${id} .t{font-size:140px;font-weight:800;line-height:1;letter-spacing:0.01em;}
#${id} .blush{display:flex;gap:16px;}
#${id} .blush i{width:30px;height:30px;border-radius:999px;background:var(--accent);opacity:0.5;}
#${id} .star{position:absolute;font-style:normal;color:var(--accent-2);}
#${id} .s1{left:-64px;top:-44px;font-size:80px;transform:rotate(-14deg);}
#${id} .s2{right:-56px;bottom:-36px;font-size:60px;transform:rotate(12deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .bub',{scale:0,autoAlpha:0,rotation:-14,duration:0.34,ease:'back.out(2)'},0);\n` +
        `tl.from('#${id} .star',{scale:0,autoAlpha:0,duration:0.22,stagger:0.1,ease:'back.out(2)'},0.3);`,
    ),
  'callout': () =>
    mk(
      'kb_call',
      'callout',
      (id) => `
<div class="w">
  <div class="qb"><span data-edit="note">${txt('标注一!', 'Note 1!')}</span><i class="tail"></i></div>
  <i class="star">✦</i>
</div>
<style>
#${id} .w{position:absolute;right:160px;top:28%;font-family:var(--font-head);}
#${id} .qb{position:relative;${PILL}font-size:44px;padding:22px 48px;transform:rotate(-3deg);}
#${id} .tail{position:absolute;bottom:-20px;left:64px;width:40px;height:40px;background:var(--accent);transform:rotate(45deg);}
#${id} .star{position:absolute;right:-52px;top:-46px;font-style:normal;font-size:56px;color:var(--accent-2);transform:rotate(12deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .qb',{scale:0,autoAlpha:0,rotation:-16,duration:0.3,ease:'back.out(2)'},0);\n` +
        `tl.from('#${id} .star',{scale:0,autoAlpha:0,duration:0.22,ease:'back.out(2)'},0.26);`,
    ),
  'follow-cta': () =>
    mk(
      'kb_cta',
      'follow-cta',
      (id) => `
<div class="w">
  <div class="bal"><span data-edit="side">${txt('说明一', 'Detail 1')}</span><i class="tail"></i></div>
  <div class="pill" data-edit="cta">${txt('+ 关注', '+ Follow')}</div>
  <i class="star">✧</i>
</div>
<style>
#${id} .w{position:absolute;right:96px;bottom:104px;width:440px;font-family:var(--font-head);text-align:center;}
#${id} .bal{position:relative;${BUB}border-radius:var(--radius);color:var(--fg);font-size:36px;font-weight:700;padding:22px 36px;transform:rotate(1.5deg);}
#${id} .bal .tail{position:absolute;bottom:-26px;left:170px;width:44px;height:44px;background:var(--panel);border-right:5px solid var(--fg);border-bottom:5px solid var(--fg);transform:rotate(45deg);}
#${id} .pill{display:inline-block;margin-top:34px;${PILL}font-size:48px;padding:20px 58px;transform:rotate(-4deg);}
#${id} .star{position:absolute;left:-48px;top:-36px;font-style:normal;font-size:56px;color:var(--accent-2);transform:rotate(-10deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .bal',{y:60,autoAlpha:0,duration:0.34,ease:'back.out(1.6)'},0);\n` +
        `tl.from('#${id} .pill',{scale:0,autoAlpha:0,duration:0.3,ease:'back.out(2)'},0.28);\n` +
        `tl.to('#${id} .pill',{y:-14,duration:0.16,yoyo:true,repeat:1,ease:'power1.inOut'},0.62);\n` +
        `tl.from('#${id} .star',{scale:0,autoAlpha:0,duration:0.22,ease:'back.out(2)'},0.6);`,
    ),
  'quote': () =>
    mk(
      'kb_quote',
      'quote',
      (id) => `
<div class="w">
  <div class="bal">
    <div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b data-edit="l2">${txt('下半句。', 'and line two.')}</b></div>
    <div class="who" data-edit="from">${txt('—— 署名', '— Attribution')}</div>
    <span class="blush"><i></i><i></i></span>
    <i class="tail"></i>
  </div>
  <i class="star">✦</i>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:130px;transform:translateX(-50%);width:58%;font-family:var(--font-head);}
#${id} .bal{position:relative;${BUB}border-radius:var(--radius);transform:rotate(-1.5deg);color:var(--fg);padding:38px 52px 32px;text-align:center;}
#${id} .t{font-size:56px;font-weight:800;line-height:1.35;}
#${id} .t b{color:var(--accent);}
#${id} .who{margin-top:14px;font-size:32px;font-weight:700;color:var(--muted);}
#${id} .blush{position:absolute;right:44px;top:30px;display:flex;gap:14px;}
#${id} .blush i{width:24px;height:24px;border-radius:999px;background:var(--accent);opacity:0.5;}
#${id} .bal .tail{position:absolute;top:-24px;left:150px;width:48px;height:48px;background:var(--panel);border-left:5px solid var(--fg);border-top:5px solid var(--fg);transform:rotate(45deg);}
#${id} .star{position:absolute;right:-54px;top:-46px;font-style:normal;font-size:64px;color:var(--accent-2);transform:rotate(12deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .bal',{y:80,autoAlpha:0,duration:0.38,ease:'back.out(1.6)'},0);\n` +
        `tl.from('#${id} .who',{autoAlpha:0,duration:0.24},0.34);\n` +
        `tl.from('#${id} .star',{scale:0,autoAlpha:0,duration:0.22,ease:'back.out(2)'},0.46);`,
    ),
  'comparison': () =>
    mk(
      'kb_cmp',
      'comparison',
      (id) => `
<div class="w">
  <div class="s a"><i data-edit="lt">${txt('选项一', 'Option A')}</i><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <div class="vs">VS</div>
  <div class="s b"><i data-edit="rt">${txt('选项二', 'Option B')}</i><b data-edit="rv">${txt('数值二', 'Value B')}</b></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);display:flex;align-items:center;gap:22px;font-family:var(--font-head);}
#${id} .s{width:340px;${BUB}border-radius:var(--radius);padding:26px 30px;text-align:center;color:var(--fg);}
#${id} .a{transform:rotate(-2deg);}
#${id} .b{transform:rotate(2deg);background:var(--accent);border-color:var(--accent);color:var(--paper);box-shadow:var(--glow);}
#${id} .s i{display:block;font-style:normal;font-size:30px;font-weight:700;opacity:0.75;}
#${id} .s b{display:block;margin-top:8px;font-size:64px;font-weight:800;line-height:1;}
#${id} .vs{width:104px;height:104px;${BUB}border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:800;color:var(--accent);transform:rotate(-6deg);flex:none;}
</style>`,
      (id) =>
        `tl.from('#${id} .a',{scale:0,autoAlpha:0,rotation:-14,duration:0.3,ease:'back.out(2)'},0);\n` +
        `tl.from('#${id} .vs',{scale:0,autoAlpha:0,duration:0.24,ease:'back.out(2)'},0.16);\n` +
        `tl.from('#${id} .b',{scale:0,autoAlpha:0,rotation:14,duration:0.3,ease:'back.out(2)'},0.28);`,
    ),
};

export type { Block };
