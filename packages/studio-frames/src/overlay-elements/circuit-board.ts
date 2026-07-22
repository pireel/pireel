/**
 * Circuit overlay elements: breakout-board language — each element is a small --paper PCB soldered
 * onto the frame (with its own fab grid), copper-gold traces (45deg bends + vias), chip parts
 * (pin teeth + silkscreen designators), a current pulse (accent-2 copy, dasharray 14 200 -> offset
 * -114, runs once) that lights up an LED. Three states, never mixed: no power = gray line /
 * powered = accent gold / active = accent-2 cyan.
 */

import { mk, txt, type Block } from '../dialects/shared';

const MOD =
  'background-color:var(--paper);background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:80px 80px;border:2px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);color:var(--fg);';

const base = (id: string) => `
#${id} .net{position:absolute;inset:0;width:100%;height:100%;}
#${id} .tr{fill:none;stroke:var(--accent);stroke-width:5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:100;}
#${id} .tr.dim{stroke:var(--line);}
#${id} .pu{fill:none;stroke:var(--accent-2);stroke-width:5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:14 200;stroke-dashoffset:14;filter:drop-shadow(0 0 8px var(--accent-2));}
#${id} .via{fill:var(--paper);stroke:var(--accent);stroke-width:4;}
#${id} .led{position:absolute;width:20px;height:20px;border-radius:50%;background:var(--accent-2);box-shadow:var(--glow);}
#${id} .silk{font-family:var(--font-num);font-weight:700;letter-spacing:0.26em;text-transform:uppercase;color:var(--muted);}
#${id} .silk em{font-style:normal;color:var(--accent);}
#${id} .chip{position:relative;background:var(--panel);border:2px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);}
#${id} .chip::before,#${id} .chip::after{content:'';position:absolute;top:20px;bottom:20px;width:12px;background:repeating-linear-gradient(180deg,var(--accent) 0 10px,transparent 10px 32px);}
#${id} .chip::before{left:-14px;}
#${id} .chip::after{right:-14px;}
#${id} .chip b{font-family:var(--font-num);font-size:26px;font-weight:700;letter-spacing:0.24em;color:var(--accent);}
#${id} .chip.act{border-color:var(--accent-2);box-shadow:var(--shadow),var(--glow);}
#${id} .chip.act b{color:var(--accent-2);}`;

const pulse = (id: string, at: number) =>
  `tl.to('#${id} .pu',{strokeDashoffset:-114,duration:0.35,ease:'power1.inOut'},${at});\n` +
  `tl.from('#${id} .led',{autoAlpha:0,duration:0.12,ease:'steps(1)'},${at + 0.33});`;

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'cc_ttl',
      '标题条',
      (id) => `
<div class="w">
  <div class="hd silk"><em data-edit="kick">SCH-01</em> · <span data-edit="tag">INTRO</span></div>
  <svg class="net" viewBox="0 0 1120 220">
    <path class="tr" pathLength="100" d="M0 176 H120 L170 126 H240"/>
    <path class="pu" pathLength="100" d="M0 176 H120 L170 126 H240"/>
    <circle class="via" cx="170" cy="126" r="8"/>
  </svg>
  <div class="chip main"><b>U1 · MAIN</b><span data-edit="title">${txt('标题一', 'Title 1')}</span></div>
  <div class="led" style="right:34px;bottom:36px;"></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:76px;bottom:96px;width:58%;height:220px;${MOD}}
#${id} .hd{position:absolute;left:36px;top:26px;font-size:26px;}
#${id} .main{position:absolute;left:270px;right:110px;top:66px;bottom:36px;display:flex;flex-direction:column;justify-content:center;gap:14px;padding:0 44px;}
#${id} .main span{font-family:var(--font-head);font-size:56px;font-weight:900;line-height:1.15;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:60,autoAlpha:0,duration:0.24,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .hd',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.2);\n` +
        `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.3,ease:'power2.out'},0.2);\n` +
        `tl.from('#${id} .via',{autoAlpha:0,duration:0.12},0.42);\n` +
        `tl.from('#${id} .chip',{x:40,autoAlpha:0,duration:0.22,ease:'power3.out'},0.3);\n` +
        pulse(id, 0.6),
    ),
  大数字: () =>
    mk(
      'cc_num',
      '大数字',
      (id) => `
<div class="w">
  <div class="hd silk"><em>MEAS-02</em> · <span data-edit="label">${txt('数据说明', 'DATA LABEL')}</span></div>
  <svg class="net" viewBox="0 0 480 340">
    <path class="tr" pathLength="100" d="M0 96 H90 L140 146 V250"/>
    <path class="pu" pathLength="100" d="M0 96 H90 L140 146 V250"/>
    <circle class="via" cx="140" cy="146" r="8"/>
  </svg>
  <div class="v"><b class="n" data-edit="num">16</b><i data-edit="unit">ms</i></div>
  <div class="cap silk" data-edit="note">AVG OF 100 RUNS</div>
  <div class="led" style="left:130px;bottom:76px;"></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;right:96px;top:110px;width:480px;height:340px;${MOD}}
#${id} .hd{position:absolute;left:34px;top:26px;font-size:26px;}
#${id} .v{position:absolute;left:180px;top:90px;line-height:1;color:var(--accent);}
#${id} .v .n{font-family:var(--font-num);font-size:170px;font-weight:800;}
#${id} .v i{font-style:normal;font-family:var(--font-num);font-size:60px;font-weight:700;color:var(--muted);margin-left:12px;}
#${id} .cap{position:absolute;left:180px;bottom:40px;font-size:24px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:-60,autoAlpha:0,duration:0.24,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .hd',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.18);\n` +
        `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.3,ease:'power2.out'},0.2);\n` +
        `tl.from('#${id} .n',{innerText:0,snap:{innerText:1},duration:0.55,ease:'power1.out'},0.3);\n` +
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.6);\n` +
        pulse(id, 0.62),
    ),
  要点列表: () =>
    mk(
      'cc_list',
      '要点列表',
      (id) => `
<div class="w">
  <div class="hd silk"><em>SEQ-03</em> · PIPELINE</div>
  <svg class="net" viewBox="0 0 560 520">
    <path class="tr" pathLength="100" d="M64 96 V420"/>
    <path class="pu" pathLength="100" d="M64 96 V420"/>
    <circle class="via" cx="64" cy="258" r="8"/>
  </svg>
  <div class="r r1 chip"><b>S1</b><span data-edit="p1">${txt('要点一', 'Point 1')}</span></div>
  <div class="r r2 chip act"><b>S2</b><span data-edit="p2">${txt('要点二', 'Point 2')}</span></div>
  <div class="r r3 chip"><b>S3</b><span data-edit="p3">${txt('要点三', 'Point 3')}</span></div>
  <div class="led" style="left:54px;top:412px;"></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:560px;height:520px;${MOD}}
#${id} .hd{position:absolute;left:34px;top:26px;font-size:26px;}
#${id} .r{position:absolute;left:120px;right:40px;height:110px;display:flex;align-items:center;gap:26px;padding:0 34px;}
#${id} .r1{top:88px;}
#${id} .r2{top:222px;}
#${id} .r3{top:356px;}
#${id} .r span{font-family:var(--font-head);font-size:40px;font-weight:900;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{x:-70,autoAlpha:0,duration:0.24,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .hd',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.18);\n` +
        `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.35,ease:'power2.out'},0.2);\n` +
        `tl.from('#${id} .r',{x:36,autoAlpha:0,duration:0.2,stagger:0.12,ease:'power3.out'},0.28);\n` +
        pulse(id, 0.7),
    ),
  关键词重击: () =>
    mk(
      'cc_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <div class="hd silk"><em>U1</em> · <span data-edit="kick">KEYWORD</span></div>
  <svg class="net" viewBox="0 0 900 300">
    <path class="tr" pathLength="100" d="M0 226 H90 L140 176 H190"/>
    <path class="pu" pathLength="100" d="M0 226 H90 L140 176 H190"/>
    <circle class="via" cx="140" cy="176" r="8"/>
  </svg>
  <div class="chip act kw"><span data-edit="word">${txt('关键词', 'Keyword')}</span></div>
  <div class="led" style="right:36px;top:36px;"></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:900px;height:300px;${MOD}}
#${id} .hd{position:absolute;left:36px;top:26px;font-size:26px;}
#${id} .kw{position:absolute;left:220px;right:80px;top:66px;bottom:44px;display:flex;align-items:center;justify-content:center;}
#${id} .kw span{font-family:var(--font-head);font-size:110px;font-weight:900;line-height:1;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{scale:0.88,autoAlpha:0,duration:0.22,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .hd',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.16);\n` +
        `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.3,ease:'power2.out'},0.18);\n` +
        `tl.from('#${id} .kw',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.36);\n` +
        `tl.from('#${id} .kw span',{y:20,autoAlpha:0,duration:0.2,ease:'power3.out'},0.44);\n` +
        pulse(id, 0.66),
    ),
  标注: () =>
    mk(
      'cc_call',
      '标注',
      (id) => `
<div class="w">
  <div class="hd silk"><em>TP1</em> · PROBE</div>
  <svg class="net" viewBox="0 0 460 200">
    <path class="tr" pathLength="100" d="M50 150 V96 L100 46 H150"/>
    <path class="pu" pathLength="100" d="M50 150 V96 L100 46 H150"/>
    <circle class="via" cx="50" cy="150" r="9"/>
  </svg>
  <div class="t" data-edit="note">${txt('标注一', 'Note 1')}</div>
  <div class="led" style="left:140px;top:36px;"></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;right:150px;top:26%;width:460px;height:200px;${MOD}}
#${id} .hd{position:absolute;left:32px;top:24px;font-size:24px;}
#${id} .t{position:absolute;left:190px;top:76px;font-family:var(--font-head);font-size:52px;font-weight:900;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:-50,autoAlpha:0,duration:0.22,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .hd',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.16);\n` +
        `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.28,ease:'power2.out'},0.18);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.4);\n` +
        pulse(id, 0.55),
    ),
  关注引导: () =>
    mk(
      'cc_cta',
      '关注引导',
      (id) => `
<div class="w">
  <div class="hd silk"><em>SW1</em> · MOMENTARY</div>
  <svg class="net" viewBox="0 0 640 240">
    <path class="tr" pathLength="100" d="M0 186 H110"/>
    <path class="tr" pathLength="100" d="M530 186 H640"/>
    <path class="pu" pathLength="100" d="M0 186 H110"/>
    <circle class="via" cx="110" cy="186" r="8"/>
    <circle class="via" cx="530" cy="186" r="8"/>
  </svg>
  <div class="chip btn"><span data-edit="cta">${txt('+ 关注', '+ Follow')}</span><i class="ring"></i></div>
  <div class="cap silk" data-edit="side">CLOSE THE LOOP</div>
  <div class="led" style="right:30px;bottom:44px;"></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;right:96px;bottom:110px;width:640px;height:240px;${MOD}}
#${id} .hd{position:absolute;left:34px;top:24px;font-size:24px;}
#${id} .btn{position:absolute;left:160px;top:66px;width:320px;height:130px;display:flex;align-items:center;justify-content:center;}
#${id} .btn span{font-family:var(--font-head);font-size:72px;font-weight:900;}
#${id} .ring{position:absolute;inset:-9px;border:3px solid var(--accent-2);border-radius:var(--radius);box-shadow:var(--glow);}
#${id} .cap{position:absolute;right:70px;bottom:30px;font-size:22px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{x:80,autoAlpha:0,duration:0.24,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .hd,#${id} .cap',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.18);\n` +
        `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.28,ease:'power2.out'},0.2);\n` +
        `tl.from('#${id} .btn',{y:-20,autoAlpha:0,duration:0.2,ease:'power3.out'},0.3);\n` +
        `tl.from('#${id} .ring',{autoAlpha:0,duration:0.1,ease:'steps(1)'},0.6);\n` +
        pulse(id, 0.72),
    ),
  金句: () =>
    mk(
      'cc_quote',
      '金句',
      (id) => `
<div class="w">
  <div class="hd silk"><em>NOTE-07</em> · <span data-edit="sig">SILKSCREEN</span></div>
  <svg class="net" viewBox="0 0 1150 260">
    <path class="tr" pathLength="100" d="M40 216 H860 L910 166 H1030"/>
    <path class="pu" pathLength="100" d="M40 216 H860 L910 166 H1030"/>
    <circle class="via" cx="910" cy="166" r="8"/>
  </svg>
  <div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><em data-edit="l2">${txt('下半句。', 'and line two.')}</em></div>
  <div class="led" style="right:96px;bottom:76px;"></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:50%;bottom:100px;transform:translateX(-50%);width:60%;height:260px;${MOD}}
#${id} .hd{position:absolute;left:36px;top:26px;font-size:26px;}
#${id} .t{position:absolute;left:40px;right:40px;top:82px;font-family:var(--font-head);font-size:64px;font-weight:900;line-height:1.2;}
#${id} .t em{font-style:normal;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:70,autoAlpha:0,duration:0.24,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .hd',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.18);\n` +
        `tl.from('#${id} .t span',{y:22,autoAlpha:0,duration:0.22,ease:'power3.out'},0.24);\n` +
        `tl.from('#${id} .t em',{y:22,autoAlpha:0,duration:0.22,ease:'power3.out'},0.38);\n` +
        `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.3,ease:'power2.out'},0.4);\n` +
        pulse(id, 0.75),
    ),
  左右对比: () =>
    mk(
      'cc_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="hd silk"><em>AB-06</em> · TEST</div>
  <svg class="net" viewBox="0 0 1060 340">
    <path class="tr dim" pathLength="100" d="M40 170 H90 L140 110 H190"/>
    <path class="tr" pathLength="100" d="M40 170 H90 L140 230 H570"/>
    <path class="pu" pathLength="100" d="M40 170 H90 L140 230 H570"/>
    <circle class="via" cx="90" cy="170" r="8"/>
  </svg>
  <div class="chip p1"><b>U2</b><i data-edit="lt">${txt('选项一', 'Option A')}</i><span data-edit="lv">${txt('数值一', 'Value A')}</span></div>
  <div class="chip act p2"><b>U3</b><i data-edit="rt">${txt('选项二', 'Option B')}</i><span data-edit="rv">${txt('数值二', 'Value B')}</span></div>
  <div class="led" style="left:556px;top:216px;"></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:50%;bottom:100px;transform:translateX(-50%);width:1060px;height:340px;${MOD}}
#${id} .hd{position:absolute;left:36px;top:26px;font-size:26px;}
#${id} .p1,#${id} .p2{position:absolute;width:380px;height:190px;top:80px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:10px;padding:0 38px;}
#${id} .p1{left:230px;opacity:0.55;}
#${id} .p2{left:648px;}
#${id} .p1 i,#${id} .p2 i{font-style:normal;font-family:var(--font-head);font-size:36px;font-weight:900;}
#${id} .p1 span,#${id} .p2 span{font-family:var(--font-num);font-size:44px;font-weight:700;color:var(--muted);}
#${id} .p2 span{color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:70,autoAlpha:0,duration:0.24,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .hd',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.16);\n` +
        `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.32,ease:'power2.out',stagger:0.06},0.2);\n` +
        `tl.from('#${id} .p1',{y:-20,autoAlpha:0,duration:0.2,ease:'power3.out'},0.3);\n` +
        `tl.from('#${id} .p2',{y:-20,autoAlpha:0,duration:0.2,ease:'power3.out'},0.42);\n` +
        pulse(id, 0.72),
    ),
};

export type { Block };
