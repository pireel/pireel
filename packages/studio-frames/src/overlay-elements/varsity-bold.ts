/**
 * Varsity talking-head overlays: sports-broadcast lower-third language.
 * Everything leans forward with skewX(-8deg): charcoal scoreboard slabs, orange
 * mono uppercase chips, diagonal hazard-stripe bands, hollow jersey-outline
 * numbers, a single 1.04 pulse on the winner's orange panel, and a 0.2s power3
 * hard slam-in from opposite sides. Each element reads like a broadcast graphic
 * cut into the shot.
 */

import { mk, txt, type Block } from '../dialects/shared';

const SKEW = 'transform:skewX(-8deg);';
const SLAB = 'background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);';
const WIN = 'background:var(--accent);color:var(--paper);border-radius:var(--radius);box-shadow:var(--glow);';
const CHIP =
  'background:var(--accent);color:var(--paper);font-family:var(--font-num);font-size:32px;font-weight:700;letter-spacing:0.2em;padding:14px 34px;';
const HZ = 'background:repeating-linear-gradient(45deg,var(--accent) 0 28px,transparent 28px 56px);';
const SLAM_L = `{x:-220,autoAlpha:0,duration:0.2,ease:'power3.out'}`;
const SLAM_R = `{x:220,autoAlpha:0,duration:0.2,ease:'power3.out'}`;
const WIPE = `{scaleX:0,transformOrigin:'left center',duration:0.24,ease:'power3.out'}`;
const PULSE = `{scale:1.04,duration:0.1,yoyo:true,repeat:1}`;

export const overlays: Record<string, () => Block> = {
  'title-bar': () =>
    mk(
      'va_ttl',
      'title-bar',
      (id) => `
<div class="w">
  <div class="chip" data-edit="kick">ROUND 01</div>
  <div class="slab" data-edit="title">${txt('标题一', 'Title 1')}</div>
  <div class="hz"></div>
</div>
<style>
#${id} .w{position:absolute;left:80px;bottom:96px;width:58%;font-family:var(--font-head);}
#${id} .chip{display:inline-block;${SKEW}${CHIP}}
#${id} .slab{margin-top:16px;${SKEW}${SLAB}color:var(--fg);font-size:84px;font-weight:900;letter-spacing:-0.02em;line-height:1.14;padding:28px 46px 32px;}
#${id} .hz{margin-top:14px;height:24px;${SKEW}${HZ}}
</style>`,
      (id) =>
        `tl.from('#${id} .slab',${SLAM_L},0);\n` +
        `tl.from('#${id} .chip',{x:-90,autoAlpha:0,duration:0.18,ease:'power3.out'},0.12);\n` +
        `tl.from('#${id} .hz',${WIPE},0.2);`,
    ),
  'big-number': () =>
    mk(
      'va_num',
      'big-number',
      (id) => `
<div class="w">
  <div class="hz"></div>
  <div class="n" data-edit="num">98</div>
  <div class="chip" data-edit="label">${txt('数据说明', 'DATA LABEL')}</div>
</div>
<style>
#${id} .w{position:absolute;right:100px;top:100px;width:520px;display:flex;flex-direction:column;align-items:flex-end;font-family:var(--font-head);}
#${id} .hz{width:100%;height:20px;${SKEW}${HZ}}
#${id} .n{${SKEW}font-family:var(--font-num);font-size:300px;font-weight:900;line-height:0.9;color:var(--paper);-webkit-text-stroke:8px var(--accent);margin:20px 0 6px;}
#${id} .chip{${SKEW}${CHIP}}
</style>`,
      (id) =>
        `tl.from('#${id} .hz',${WIPE},0);\n` +
        `tl.from('#${id} .n',${SLAM_R.replace('0.2,', '0.22,')},0.08);\n` +
        `tl.from('#${id} .n',{innerText:0,snap:{innerText:1},duration:0.7,ease:'power1.out'},0.14);\n` +
        `tl.from('#${id} .chip',{x:-90,autoAlpha:0,duration:0.18,ease:'power3.out'},0.3);`,
    ),
  'bullet-list': () =>
    mk(
      'va_list',
      'bullet-list',
      (id) => `
<div class="w">
  <div class="chip" data-edit="title">GAME PLAN</div>
  <div class="r r1 win"><i>01</i><span data-edit="p1">${txt('要点一', 'Point 1')}</span></div>
  <div class="r r2"><i>02</i><span data-edit="p2">${txt('要点二', 'Point 2')}</span></div>
  <div class="r r3"><i>03</i><span data-edit="p3">${txt('要点三', 'Point 3')}</span></div>
</div>
<style>
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:600px;font-family:var(--font-head);}
#${id} .chip{display:inline-block;${SKEW}${CHIP}}
#${id} .r{margin-top:22px;${SKEW}${SLAB}color:var(--fg);display:flex;align-items:center;gap:26px;padding:24px 36px;font-size:46px;font-weight:900;}
#${id} .r i{font-style:normal;font-family:var(--font-num);font-size:34px;font-weight:700;letter-spacing:0.12em;color:var(--accent-2);flex:none;}
#${id} .r.win{${WIN}}
#${id} .r.win i{color:var(--paper);}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{x:-90,autoAlpha:0,duration:0.18,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .r1',${SLAM_L},0.1);\n` +
        `tl.from('#${id} .r2',${SLAM_L},0.2);\n` +
        `tl.from('#${id} .r3',${SLAM_L},0.3);\n` +
        `tl.to('#${id} .win',${PULSE},0.6);`,
    ),
  'keyword-slam': () =>
    mk(
      'va_kw',
      'keyword-slam',
      (id) => `
<div class="w">
  <div class="t" data-edit="word">${txt('关键词', 'Keyword')}</div>
  <div class="hz"></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-family:var(--font-head);}
#${id} .t{${SKEW}${WIN}font-size:150px;font-weight:900;letter-spacing:-0.02em;line-height:1;padding:36px 64px 46px;white-space:nowrap;}
#${id} .hz{margin-top:16px;height:22px;${SKEW}${HZ}}
</style>`,
      (id) =>
        `tl.from('#${id} .t',{x:-260,autoAlpha:0,duration:0.2,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .hz',${WIPE},0.16);\n` +
        `tl.to('#${id} .t',${PULSE},0.44);`,
    ),
  'callout': () =>
    mk(
      'va_call',
      'callout',
      (id) => `
<div class="w">
  <div class="chip" data-edit="note">${txt('标注一 MARK', 'NOTE 1')}</div>
  <div class="bar"></div>
  <i class="sq"></i>
</div>
<style>
#${id} .w{position:absolute;right:160px;top:26%;display:flex;flex-direction:column;align-items:center;font-family:var(--font-head);}
#${id} .chip{${SKEW}${CHIP}font-size:36px;box-shadow:var(--shadow);}
#${id} .bar{width:8px;height:110px;margin-top:14px;background:var(--accent-2);transform:skewX(-8deg);}
#${id} .sq{width:26px;height:26px;margin-top:10px;background:var(--accent);transform:skewX(-8deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{y:-70,autoAlpha:0,duration:0.2,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .bar',{scaleY:0,transformOrigin:'top',duration:0.2,ease:'power3.out'},0.16);\n` +
        `tl.from('#${id} .sq',{scale:0,duration:0.18,ease:'back.out(1.8)'},0.3);`,
    ),
  'follow-cta': () =>
    mk(
      'va_cta',
      'follow-cta',
      (id) => `
<div class="w">
  <div class="chip" data-edit="side">JOIN THE SQUAD</div>
  <div class="fol" data-edit="cta">${txt('+ 关注', '+ Follow')}</div>
</div>
<style>
#${id} .w{position:absolute;right:100px;bottom:104px;display:flex;flex-direction:column;align-items:flex-end;font-family:var(--font-head);}
#${id} .chip{${SKEW}${CHIP}}
#${id} .fol{margin-top:16px;${SKEW}${WIN}font-family:var(--font-num);font-size:76px;font-weight:900;letter-spacing:0.04em;padding:24px 54px;white-space:nowrap;}
</style>`,
      (id) =>
        `tl.from('#${id} .fol',${SLAM_R.replace('220', '260')},0);\n` +
        `tl.from('#${id} .chip',{x:90,autoAlpha:0,duration:0.18,ease:'power3.out'},0.12);\n` +
        `tl.to('#${id} .fol',${PULSE},0.4);`,
    ),
  'quote': () =>
    mk(
      'va_quote',
      'quote',
      (id) => `
<div class="w">
  <div class="hz"></div>
  <div class="board">
    <span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b data-edit="l2">${txt('下半句。', 'and line two.')}</b>
  </div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);width:60%;font-family:var(--font-head);}
#${id} .hz{height:20px;${SKEW}${HZ}}
#${id} .board{margin-top:14px;${SKEW}${SLAB}color:var(--fg);font-size:56px;font-weight:900;line-height:1.4;padding:36px 50px;}
#${id} .board b{background:var(--accent);color:var(--paper);padding:2px 18px;display:inline-block;}
</style>`,
      (id) =>
        `tl.from('#${id} .board',${SLAM_L},0);\n` +
        `tl.from('#${id} .hz',${WIPE},0.14);\n` +
        `tl.from('#${id} .board b',{x:-60,autoAlpha:0,duration:0.18,ease:'power3.out'},0.3);`,
    ),
  'comparison': () =>
    mk(
      'va_cmp',
      'comparison',
      (id) => `
<div class="w">
  <div class="s lose"><i data-edit="lt">${txt('选项一', 'Option A')}</i><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <div class="s win"><i data-edit="rt">${txt('选项二', 'Option B')}</i><b data-edit="rv">${txt('数值二', 'Value B')}</b></div>
  <div class="vs">VS</div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:104px;transform:translateX(-50%);display:flex;gap:30px;font-family:var(--font-head);}
#${id} .s{width:380px;${SKEW}padding:28px 30px 32px;display:flex;flex-direction:column;align-items:center;gap:16px;}
#${id} .s i{font-style:normal;font-family:var(--font-num);font-size:30px;font-weight:700;letter-spacing:0.2em;}
#${id} .s b{font-family:var(--font-num);font-size:96px;font-weight:800;line-height:1;}
#${id} .lose{${SLAB}color:var(--muted);background:var(--panel-2);}
#${id} .win{${WIN}}
#${id} .vs{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) skewX(-8deg);background:var(--paper);border:4px solid var(--fg);color:var(--fg);font-family:var(--font-num);font-size:44px;font-weight:800;padding:10px 22px;z-index:2;}
</style>`,
      (id) =>
        `tl.from('#${id} .lose',${SLAM_L.replace('220', '260')},0);\n` +
        `tl.from('#${id} .win',${SLAM_R.replace('220', '260')},0.06);\n` +
        `tl.from('#${id} .vs',{scale:0,duration:0.26,ease:'back.out(1.8)'},0.28);\n` +
        `tl.to('#${id} .win',${PULSE},0.6);`,
    ),
};

export type { Block };
