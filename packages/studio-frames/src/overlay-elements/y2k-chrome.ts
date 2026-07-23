/**
 * Y2K talking-head overlays: skinned-widget language. White capsule chips (3px
 * electric-blue outline), stretched italic scaleX(1.15) glyphs, an electric-blue
 * orbit ellipse around the focal point (one of the only glows), a pink secondary
 * ring counter-rotated behind it, ✦ sparkles that blink a finite number of
 * times, double-outlined capsule buttons, and bubbles that always carry a
 * top-left highlight dot; min 36px corner radius, no right angles, no gradients.
 * Each element reads like an MP3-skin widget stuck onto the shot.
 */

import { mk, txt, type Block } from '../dialects/shared';

const CHIP =
  'background:var(--panel);border:3px solid var(--accent);border-radius:999px;color:var(--accent);font-size:32px;font-weight:800;letter-spacing:0.12em;padding:14px 38px;white-space:nowrap;';
const ORB = 'border:4px solid var(--accent);border-radius:50%;box-shadow:var(--glow);';
const RING2 = 'border:3px solid var(--accent-2);border-radius:50%;';
const DBL =
  'background:var(--accent);color:var(--paper);border:6px solid var(--panel);box-shadow:0 0 0 4px var(--accent),var(--glow);border-radius:999px;';
const ITAL = 'display:inline-block;font-style:italic;font-weight:900;transform:scaleX(1.15);';
const SETTLE = `{scale:1.15,autoAlpha:0,duration:0.3,ease:'power2.out'}`;
const INFLATE = `{scale:0.5,autoAlpha:0,duration:0.32,ease:'back.out(1.5)'}`;
const SPOP = `{scale:0,autoAlpha:0,duration:0.22,stagger:0.08,ease:'back.out(2)'}`;
const BLINK = `{autoAlpha:0.25,duration:0.12,yoyo:true,repeat:3}`;

export const overlays: Record<string, () => Block> = {
  'title-bar': () =>
    mk(
      'yo_ttl',
      'title-bar',
      (id) => `
<div class="w">
  <div class="chip" data-edit="kick">${txt('标签', 'Label')}</div>
  <div class="pane"><b class="t" data-edit="title">${txt('标题一', 'Title 1')}</b></div>
  <div class="orb"></div>
  <i class="sp s1">✦</i><i class="sp s2">✦</i>
</div>
<style>
#${id} .w{position:absolute;left:90px;bottom:110px;width:56%;font-family:var(--font-head);color:var(--fg);}
#${id} .pane{background:var(--panel);border-radius:60px;box-shadow:var(--shadow);padding:30px 60px;display:inline-block;}
#${id} .t{${ITAL}transform-origin:left center;font-size:72px;line-height:1.2;white-space:nowrap;}
#${id} .orb{position:absolute;left:46%;top:56%;width:112%;height:150%;transform:translate(-50%,-50%) rotate(-5deg);${ORB}}
#${id} .chip{position:absolute;${CHIP}left:26px;top:-52px;z-index:2;}
#${id} .sp{position:absolute;font-style:normal;color:var(--accent-2);line-height:1;}
#${id} .s1{font-size:64px;right:-26px;top:-64px;}
#${id} .s2{font-size:40px;left:-48px;bottom:-24px;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .pane',{x:-120,autoAlpha:0,duration:0.3,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .orb',${SETTLE},0.14);\n` +
        `tl.from('#${id} .chip',{y:-40,autoAlpha:0,duration:0.24,ease:'power2.out'},0.26);\n` +
        `tl.from('#${id} .sp',${SPOP},0.4);\n` +
        `tl.to('#${id} .s1',${BLINK},0.66);`,
    ),
  'big-number': () =>
    mk(
      'yo_num',
      'big-number',
      (id) => `
<div class="w">
  <div class="card"><b class="n" data-edit="num">38</b><i class="u" data-edit="unit">%</i></div>
  <div class="ring2"></div>
  <div class="orb"></div>
  <div class="chip" data-edit="label">${txt('数据说明', 'Data label')}</div>
  <i class="sp s1">✦</i><i class="sp s2">✦</i>
</div>
<style>
#${id} .w{position:absolute;right:130px;top:130px;width:470px;font-family:var(--font-head);color:var(--fg);}
#${id} .card{background:var(--panel);border-radius:56px;box-shadow:var(--shadow);padding:42px 40px 36px;display:flex;align-items:baseline;justify-content:center;gap:12px;}
#${id} .n{${ITAL}font-family:var(--font-num);font-size:180px;line-height:1;}
#${id} .u{font-style:italic;font-size:60px;font-weight:900;color:var(--accent);}
#${id} .orb{position:absolute;left:50%;top:44%;width:126%;height:120%;transform:translate(-50%,-50%) rotate(-10deg);${ORB}}
#${id} .ring2{position:absolute;left:52%;top:44%;width:134%;height:130%;transform:translate(-50%,-50%) rotate(7deg);${RING2}}
#${id} .chip{position:absolute;${CHIP}left:50%;bottom:-72px;transform:translateX(-50%);}
#${id} .sp{position:absolute;font-style:normal;color:var(--accent-2);line-height:1;}
#${id} .s1{font-size:60px;left:-64px;top:-40px;}
#${id} .s2{font-size:38px;right:-44px;bottom:-6px;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .card',${INFLATE},0);\n` +
        `tl.from('#${id} .n',{innerText:0,snap:{innerText:1},duration:0.7,ease:'power1.out'},0.12);\n` +
        `tl.from('#${id} .orb,#${id} .ring2',${SETTLE},0.18);\n` +
        `tl.from('#${id} .chip',{y:24,autoAlpha:0,duration:0.24,ease:'power2.out'},0.34);\n` +
        `tl.from('#${id} .sp',${SPOP},0.44);\n` +
        `tl.to('#${id} .s1',${BLINK},0.68);`,
    ),
  'bullet-list': () =>
    mk(
      'yo_list',
      'bullet-list',
      (id) => `
<div class="w">
  <div class="chip hd" data-edit="title">${txt('列表标题', 'List title')}</div>
  <div class="r r1" data-edit="p1">${txt('要点一', 'Point 1')}</div>
  <div class="r r2 hot"><i class="hl"></i><span data-edit="p2">${txt('要点二', 'Point 2')}</span></div>
  <div class="r r3" data-edit="p3">${txt('要点三', 'Point 3')}</div>
  <i class="sp s1">✦</i><i class="sp s2">✦</i>
</div>
<style>
#${id} .w{position:absolute;left:90px;top:50%;transform:translateY(-50%);width:620px;font-family:var(--font-head);color:var(--fg);}
#${id} .hd{position:relative;display:inline-block;}
#${id} .r{position:relative;margin-top:26px;background:var(--panel);border:3px solid var(--accent);border-radius:999px;box-shadow:var(--shadow);font-size:46px;font-weight:800;padding:24px 52px;white-space:nowrap;display:inline-block;}
#${id} .r2{margin-left:64px;}
#${id} .r3{margin-left:24px;}
#${id} .r.hot{${DBL}}
#${id} .hl{position:absolute;width:46px;height:22px;background:var(--panel);border-radius:999px;top:12px;left:44px;transform:rotate(-18deg);}
#${id} .sp{position:absolute;font-style:normal;color:var(--accent-2);line-height:1;}
#${id} .s1{font-size:56px;right:-10px;top:-16px;}
#${id} .s2{font-size:38px;right:60px;bottom:-30px;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .hd',{y:-40,autoAlpha:0,duration:0.24,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .r',{scale:0.5,autoAlpha:0,duration:0.3,stagger:0.13,ease:'back.out(1.6)'},0.1);\n` +
        `tl.from('#${id} .hl',{scale:0,autoAlpha:0,duration:0.2,ease:'back.out(2)'},0.56);\n` +
        `tl.from('#${id} .sp',${SPOP},0.6);\n` +
        `tl.to('#${id} .s1',${BLINK},0.72);`,
    ),
  'keyword-slam': () =>
    mk(
      'yo_kw',
      'keyword-slam',
      (id) => `
<div class="w">
  <div class="ring2"></div>
  <div class="cap"><b class="t" data-edit="word">${txt('关键词', 'Keyword')}</b></div>
  <div class="orb"></div>
  <i class="sp s1">✦</i><i class="sp s2">✦</i><i class="sp s3">✦</i>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-family:var(--font-head);color:var(--fg);}
#${id} .cap{background:var(--panel);border-radius:999px;box-shadow:var(--shadow);padding:36px 84px;}
#${id} .t{${ITAL}font-size:130px;line-height:1.1;white-space:nowrap;}
#${id} .orb{position:absolute;left:50%;top:50%;width:130%;height:160%;transform:translate(-50%,-50%) rotate(-11deg);${ORB}}
#${id} .ring2{position:absolute;left:50%;top:50%;width:142%;height:180%;transform:translate(-50%,-50%) rotate(7deg);${RING2}}
#${id} .sp{position:absolute;font-style:normal;color:var(--accent-2);line-height:1;}
#${id} .s1{font-size:70px;left:-110px;top:-90px;}
#${id} .s2{font-size:44px;right:-120px;bottom:-60px;}
#${id} .s3{font-size:36px;right:-70px;top:-100px;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',${INFLATE},0);\n` +
        `tl.from('#${id} .orb,#${id} .ring2',${SETTLE},0.16);\n` +
        `tl.from('#${id} .sp',${SPOP},0.36);\n` +
        `tl.to('#${id} .s1',${BLINK},0.66);`,
    ),
  'callout': () =>
    mk(
      'yo_call',
      'callout',
      (id) => `
<div class="w">
  <div class="chip" data-edit="note">${txt('标注一', 'Note 1')}</div>
  <div class="bb"><i class="hl"></i></div>
  <i class="sp s1">✦</i>
</div>
<style>
#${id} .w{position:absolute;right:160px;top:24%;display:flex;flex-direction:column;align-items:center;gap:18px;font-family:var(--font-head);}
#${id} .chip{${CHIP}font-size:38px;box-shadow:var(--shadow);}
#${id} .bb{position:relative;width:110px;height:110px;border-radius:999px;background:var(--panel-2);}
#${id} .hl{position:absolute;width:24%;height:24%;background:var(--panel);border-radius:999px;top:16%;left:18%;}
#${id} .sp{position:absolute;font-style:normal;color:var(--accent-2);font-size:52px;line-height:1;right:-52px;top:-30px;}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',${INFLATE.replace('0.32', '0.28')},0);\n` +
        `tl.from('#${id} .bb',{scale:0,autoAlpha:0,duration:0.26,ease:'back.out(1.6)'},0.18);\n` +
        `tl.from('#${id} .sp',{scale:0,autoAlpha:0,duration:0.22,ease:'back.out(2)'},0.36);\n` +
        `tl.to('#${id} .sp',${BLINK},0.62);`,
    ),
  'follow-cta': () =>
    mk(
      'yo_cta',
      'follow-cta',
      (id) => `
<div class="w">
  <div class="cta" data-edit="cta">${txt('+ 关注', '+ Follow')}</div>
  <div class="orb"></div>
  <div class="chip" data-edit="side">${txt('说明一', 'Detail 1')}</div>
  <i class="sp s1">✦</i><i class="sp s2">✦</i><i class="sp s3">✦</i>
</div>
<style>
#${id} .w{position:absolute;right:130px;bottom:130px;font-family:var(--font-head);}
#${id} .cta{${DBL}font-size:60px;font-weight:900;padding:28px 76px;white-space:nowrap;}
#${id} .orb{position:absolute;left:50%;top:40%;width:128%;height:150%;transform:translate(-50%,-50%) rotate(-9deg);${ORB}}
#${id} .chip{position:absolute;${CHIP}left:50%;bottom:-74px;transform:translateX(-50%);font-size:28px;}
#${id} .sp{position:absolute;font-style:normal;color:var(--accent-2);line-height:1;}
#${id} .s1{font-size:64px;left:-84px;top:-64px;}
#${id} .s2{font-size:40px;right:-64px;top:-30px;}
#${id} .s3{font-size:34px;right:-40px;bottom:-30px;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .cta',{scale:0.4,autoAlpha:0,duration:0.32,ease:'back.out(1.7)'},0);\n` +
        `tl.from('#${id} .orb',${SETTLE},0.16);\n` +
        `tl.from('#${id} .chip',{y:24,autoAlpha:0,duration:0.24,ease:'power2.out'},0.3);\n` +
        `tl.from('#${id} .sp',${SPOP},0.38);\n` +
        `tl.to('#${id} .s1',${BLINK},0.68);`,
    ),
  'quote': () =>
    mk(
      'yo_quote',
      'quote',
      (id) => `
<div class="w">
  <div class="ring2"></div>
  <div class="bub">
    <i class="hl"></i>
    <div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b data-edit="l2">${txt('下半句。', 'and line two.')}</b></div>
  </div>
  <div class="chip" data-edit="sig">${txt('@署名', '@Attribution')}</div>
  <i class="sp s1">✦</i>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);width:1150px;height:360px;font-family:var(--font-head);color:var(--fg);}
#${id} .bub{position:absolute;inset:0;background:var(--panel);border-radius:50%;box-shadow:var(--shadow);display:flex;align-items:center;justify-content:center;}
#${id} .hl{position:absolute;width:120px;height:64px;background:var(--panel-2);border-radius:999px;top:44px;left:180px;transform:rotate(-24deg);}
#${id} .t{${ITAL}transform:scaleX(1.08);font-size:58px;line-height:1.4;text-align:center;padding:0 130px;}
#${id} .t b{color:var(--accent);}
#${id} .ring2{position:absolute;left:52%;top:48%;width:108%;height:124%;transform:translate(-50%,-50%) rotate(6deg);${RING2}}
#${id} .chip{position:absolute;${CHIP}right:120px;bottom:-28px;font-size:28px;z-index:2;}
#${id} .sp{position:absolute;font-style:normal;color:var(--accent-2);font-size:56px;line-height:1;left:-40px;top:-44px;}
</style>`,
      (id) =>
        `tl.from('#${id} .bub',{scale:0.55,autoAlpha:0,duration:0.34,ease:'back.out(1.4)'},0);\n` +
        `tl.from('#${id} .ring2',${SETTLE},0.16);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,y:26,duration:0.26},0.26);\n` +
        `tl.from('#${id} .chip',{scale:0,autoAlpha:0,duration:0.24,ease:'back.out(1.8)'},0.44);\n` +
        `tl.from('#${id} .sp',{scale:0,autoAlpha:0,duration:0.22,ease:'back.out(2)'},0.52);\n` +
        `tl.to('#${id} .sp',${BLINK},0.7);`,
    ),
  'comparison': () =>
    mk(
      'yo_cmp',
      'comparison',
      (id) => `
<div class="w">
  <div class="s a"><i data-edit="lt">${txt('选项一', 'Option A')}</i><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <b class="vs">VS</b>
  <div class="s b"><i data-edit="rt">${txt('选项二', 'Option B')}</i><b data-edit="rv">${txt('数值二', 'Value B')}</b></div>
  <i class="sp s1">✦</i><i class="sp s2">✦</i>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);display:flex;align-items:center;gap:26px;font-family:var(--font-head);color:var(--fg);}
#${id} .s{width:370px;padding:28px 30px;display:flex;flex-direction:column;align-items:center;gap:12px;border-radius:56px;}
#${id} .s i{font-style:normal;font-size:28px;font-weight:800;letter-spacing:0.12em;}
#${id} .s b{font-family:var(--font-num);font-size:76px;font-weight:900;font-style:italic;line-height:1;display:inline-block;transform:scaleX(1.08);}
#${id} .a{background:var(--panel);border:3px solid var(--accent);box-shadow:var(--shadow);}
#${id} .a i{color:var(--muted);}
#${id} .b{${DBL}border-radius:56px;}
#${id} .vs{${ITAL}font-size:52px;color:var(--fg);}
#${id} .sp{position:absolute;font-style:normal;color:var(--accent-2);line-height:1;}
#${id} .s1{font-size:56px;right:-48px;top:-52px;}
#${id} .s2{font-size:36px;left:-42px;bottom:-24px;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .a',{scale:0.5,autoAlpha:0,duration:0.3,ease:'back.out(1.5)'},0);\n` +
        `tl.from('#${id} .b',{scale:0.5,autoAlpha:0,duration:0.3,ease:'back.out(1.5)'},0.14);\n` +
        `tl.from('#${id} .vs',{scale:0,autoAlpha:0,duration:0.22,ease:'back.out(2)'},0.34);\n` +
        `tl.from('#${id} .sp',${SPOP},0.44);\n` +
        `tl.to('#${id} .s1',${BLINK},0.68);`,
    ),
};

export type { Block };
