/**
 * Particle — deep-space stardust dialect: scattered particles converging, constellation lines,
 * halos gathering. No cards, no borders, text floats directly; signature motion = each particle
 * flies in from a hardcoded x/y offset to its resting spot.
 */

import { type Block, mk } from './shared';

/* Particle field: position/size/color/opacity/fly-in offset are all hardcoded (no runtime randomness) */
type Dust = { l: number; t: number; s: number; c: 'a' | 'b' | 'f'; o: number; dx: number; dy: number };
const DUST: Dust[] = [
  { l: 150, t: 170, s: 7, c: 'a', o: 0.9, dx: -160, dy: -90 },
  { l: 340, t: 420, s: 4, c: 'f', o: 0.5, dx: -120, dy: 140 },
  { l: 230, t: 760, s: 6, c: 'b', o: 0.8, dx: -180, dy: 60 },
  { l: 480, t: 930, s: 3, c: 'f', o: 0.4, dx: -60, dy: 170 },
  { l: 640, t: 150, s: 5, c: 'a', o: 0.7, dx: 40, dy: -170 },
  { l: 820, t: 620, s: 3, c: 'f', o: 0.35, dx: -90, dy: 110 },
  { l: 960, t: 300, s: 8, c: 'b', o: 0.9, dx: 70, dy: -150 },
  { l: 1120, t: 860, s: 5, c: 'a', o: 0.6, dx: 60, dy: 160 },
  { l: 1290, t: 200, s: 4, c: 'f', o: 0.5, dx: 130, dy: -120 },
  { l: 1430, t: 540, s: 7, c: 'a', o: 0.85, dx: 170, dy: 40 },
  { l: 1560, t: 830, s: 3, c: 'f', o: 0.4, dx: 150, dy: 140 },
  { l: 1660, t: 320, s: 6, c: 'b', o: 0.8, dx: 180, dy: -80 },
  { l: 1780, t: 640, s: 4, c: 'f', o: 0.55, dx: 190, dy: 90 },
  { l: 1740, t: 120, s: 5, c: 'a', o: 0.7, dx: 160, dy: -140 },
];
const DUST_COLOR = { a: 'var(--accent)', b: 'var(--accent-2)', f: 'var(--fg)' } as const;

const dustHtml = (): string => DUST.map((_, i) => `<i class="d d${i}"></i>`).join('');

const dustCss = (id: string): string =>
  `#${id} .d{position:absolute;border-radius:999px;}\n` +
  DUST.map(
    (d, i) =>
      `#${id} .d${i}{left:${d.l}px;top:${d.t}px;width:${d.s}px;height:${d.s}px;background:${DUST_COLOR[d.c]};opacity:${d.o};}`,
  ).join('\n');

/** Signature motion: particles converge from their hardcoded offsets, staggered one by one. */
const dustTl = (id: string): string =>
  DUST.map(
    (d, i) =>
      `tl.from('#${id} .d${i}',{x:${d.dx},y:${d.dy},autoAlpha:0,duration:0.7,ease:'power2.out'},${(i * 0.03).toFixed(2)});`,
  ).join('\n');

const spaceRoot = (id: string) =>
  `#${id} .sp{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);overflow:hidden;}
#${id} .halo{position:absolute;border-radius:999px;background:var(--accent);filter:blur(80px);opacity:0.25;}
${dustCss(id)}`;

export const cover: () => Block = () =>
  mk(
    'cv_pd',
    '封面',
    (id) => `
<div class="sp">
  <div class="halo hz"></div>
  ${dustHtml()}
  <div class="c">
    <div class="k">PARTICLE · DEEP FIELD</div>
    <div class="h">星尘</div>
    <div class="s">尘埃落定,即成星座</div>
  </div>
  <svg class="cons" viewBox="0 0 520 300">
    <polyline class="cl" points="20,240 150,120 300,190 470,40" fill="none"/>
    <g class="cn"><circle cx="20" cy="240" r="7"/><circle cx="150" cy="120" r="6"/><circle cx="300" cy="190" r="6"/><circle cx="470" cy="40" r="9"/></g>
  </svg>
</div>
<style>${spaceRoot(id)}
#${id} .hz{width:1000px;height:1000px;left:440px;top:60px;}
#${id} .c{position:absolute;left:0;right:0;top:50%;transform:translateY(-54%);display:flex;flex-direction:column;align-items:center;gap:52px;text-align:center;}
#${id} .k{font-family:var(--font-num);font-size:34px;letter-spacing:0.42em;color:var(--accent);padding-left:0.42em;}
#${id} .h{font-size:320px;font-weight:900;line-height:1;letter-spacing:0.04em;text-shadow:var(--glow);}
#${id} .s{font-size:40px;color:var(--muted);letter-spacing:0.2em;}
#${id} .cons{position:absolute;right:120px;top:110px;width:520px;height:300px;}
#${id} .cl{stroke:var(--accent);stroke-width:3;opacity:0.55;stroke-dasharray:900;stroke-dashoffset:900;}
#${id} .cn circle{fill:var(--fg);opacity:0.9;}
</style>`,
    (id) =>
      `tl.from('#${id} .halo',{autoAlpha:0,scale:0.7,duration:0.5},0);\n` +
      `${dustTl(id)}\n` +
      `tl.from('#${id} .c',{y:40,autoAlpha:0,duration:0.45,ease:'power2.out'},0.2);\n` +
      `tl.to('#${id} .cl',{strokeDashoffset:0,duration:0.5,ease:'power2.inOut'},0.55);\n` +
      `tl.from('#${id} .cn circle',{scale:0,transformOrigin:'center',duration:0.2,stagger:0.06},0.7);`,
  );

export const blocks: Record<string, () => Block> = {
  标题卡: () =>
    mk(
      'pd_ttl',
      '标题卡',
      (id) => `
<div class="sp">
  <div class="halo hz"></div>
  ${dustHtml()}
  <div class="c">
    <div class="k">DEEP FIELD · EP.01</div>
    <div class="h">深空从不沉默</div>
    <div class="s">那些光,走了一亿年才到你眼里</div>
  </div>
  <svg class="cons" viewBox="0 0 460 260">
    <polyline class="cl" points="20,210 140,90 290,160 430,30" fill="none"/>
    <g class="cn"><circle cx="20" cy="210" r="6"/><circle cx="140" cy="90" r="5"/><circle cx="290" cy="160" r="5"/><circle cx="430" cy="30" r="8"/></g>
  </svg>
</div>
<style>${spaceRoot(id)}
#${id} .sp{background-color:var(--paper);}
#${id} .hz{width:940px;height:940px;left:130px;top:220px;}
#${id} .c{position:absolute;left:170px;top:50%;transform:translateY(-52%);display:flex;flex-direction:column;gap:50px;}
#${id} .k{font-family:var(--font-num);font-size:34px;letter-spacing:0.38em;color:var(--accent);}
#${id} .h{font-size:155px;font-weight:900;line-height:1.1;letter-spacing:-0.01em;text-shadow:var(--glow);}
#${id} .s{font-size:42px;color:var(--muted);letter-spacing:0.06em;}
#${id} .cons{position:absolute;right:130px;top:130px;width:460px;height:260px;}
#${id} .cl{stroke:var(--accent);stroke-width:3;opacity:0.55;stroke-dasharray:800;stroke-dashoffset:800;}
#${id} .cn circle{fill:var(--fg);opacity:0.9;}
</style>`,
      (id) =>
        `tl.from('#${id} .halo',{autoAlpha:0,scale:0.7,duration:0.5},0);\n` +
        `${dustTl(id)}\n` +
        `tl.from('#${id} .k',{autoAlpha:0,x:-30,duration:0.35},0.15);\n` +
        `tl.from('#${id} .h',{y:40,autoAlpha:0,duration:0.45,ease:'power2.out'},0.25);\n` +
        `tl.from('#${id} .s',{autoAlpha:0,duration:0.35},0.5);\n` +
        `tl.to('#${id} .cl',{strokeDashoffset:0,duration:0.5,ease:'power2.inOut'},0.55);\n` +
        `tl.from('#${id} .cn circle',{scale:0,transformOrigin:'center',duration:0.2,stagger:0.06},0.72);`,
    ),
  大数字: () =>
    mk(
      'pd_num',
      '大数字',
      (id) => `
<div class="sp">
  <div class="halo hz"></div>
  ${dustHtml()}
  <div class="c">
    <div class="k">CONFIRMED EXOPLANETS</div>
    <div class="v">5600<i>+</i></div>
    <div class="s">已确认的系外行星 · 仍在增加</div>
  </div>
</div>
<style>${spaceRoot(id)}
#${id} .sp{background-color:var(--paper);}
#${id} .hz{width:1100px;height:1100px;left:410px;top:-10px;}
#${id} .c{position:absolute;left:0;right:0;top:50%;transform:translateY(-52%);display:flex;flex-direction:column;align-items:center;gap:40px;text-align:center;}
#${id} .k{font-family:var(--font-num);font-size:32px;letter-spacing:0.4em;color:var(--muted);padding-left:0.4em;}
#${id} .v{font-family:var(--font-num);font-size:360px;font-weight:800;line-height:1;letter-spacing:-0.04em;color:var(--accent);text-shadow:var(--glow);}
#${id} .v i{font-style:normal;font-size:180px;color:var(--accent-2);}
#${id} .s{font-size:42px;color:var(--muted);letter-spacing:0.1em;}
</style>`,
      (id) =>
        `tl.from('#${id} .halo',{autoAlpha:0,scale:0.6,duration:0.5},0);\n` +
        `${dustTl(id)}\n` +
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.35},0.15);\n` +
        `tl.from('#${id} .v',{autoAlpha:0,scale:0.9,duration:0.5,ease:'power2.out'},0.25);\n` +
        `tl.from('#${id} .s',{autoAlpha:0,duration:0.35},0.6);`,
    ),
  数字变化: () =>
    mk(
      'pd_cnt',
      '数字变化',
      (id) => `
<div class="sp">
  <div class="halo hz"></div>
  ${dustHtml()}
  <div class="c">
    <div class="k">M1 · LIGHT TRAVEL TIME</div>
    <div class="row"><span class="v">6500</span><span class="u">光年</span></div>
    <div class="s">这束光出发时,金字塔还没动工</div>
  </div>
</div>
<style>${spaceRoot(id)}
#${id} .sp{background-color:var(--paper);}
#${id} .hz{width:1080px;height:1080px;left:420px;top:0;}
#${id} .c{position:absolute;left:0;right:0;top:50%;transform:translateY(-52%);display:flex;flex-direction:column;align-items:center;gap:44px;text-align:center;}
#${id} .k{font-family:var(--font-num);font-size:32px;letter-spacing:0.4em;color:var(--muted);padding-left:0.4em;}
#${id} .row{display:flex;align-items:baseline;justify-content:center;gap:36px;}
#${id} .v{font-family:var(--font-num);font-size:340px;font-weight:800;line-height:1;letter-spacing:-0.04em;color:var(--accent);text-shadow:var(--glow);}
#${id} .u{font-size:88px;font-weight:700;color:var(--accent-2);}
#${id} .s{font-size:42px;color:var(--muted);letter-spacing:0.1em;}
</style>`,
      (id) =>
        `tl.from('#${id} .halo',{autoAlpha:0,scale:0.6,duration:0.5},0);\n` +
        `${dustTl(id)}\n` +
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.35},0.12);\n` +
        `tl.from('#${id} .v',{autoAlpha:0,scale:0.92,transformOrigin:'center bottom',duration:0.35,ease:'power2.out'},0.1);\n` +
        `tl.from('#${id} .v',{innerText:0,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .s',{autoAlpha:0,duration:0.3},0.6);\n` +
        `tl.from('#${id} .u',{scale:0,transformOrigin:'center',autoAlpha:0,duration:0.25,ease:'back.out(2)'},0.9);`,
    ),
  金句: () =>
    mk(
      'pd_qte',
      '金句',
      (id) => `
<div class="sp">
  <div class="halo hz"></div>
  ${dustHtml()}
  <div class="q">
    <div class="t">我们皆由<b>星尘</b>构成,<br/>回望星空即是回望来处</div>
    <svg class="ul" viewBox="0 0 420 60">
      <polyline class="cl" points="10,44 140,18 280,38 410,14" fill="none"/>
      <g class="cn"><circle cx="10" cy="44" r="6"/><circle cx="140" cy="18" r="5"/><circle cx="280" cy="38" r="5"/><circle cx="410" cy="14" r="7"/></g>
    </svg>
    <div class="a">— 卡尔·萨根 · COSMOS</div>
  </div>
</div>
<style>${spaceRoot(id)}
#${id} .sp{background-color:var(--paper);}
#${id} .hz{width:880px;height:880px;left:180px;top:100px;}
#${id} .q{position:absolute;left:190px;top:270px;right:190px;display:flex;flex-direction:column;gap:44px;}
#${id} .t{font-size:110px;font-weight:700;line-height:1.5;text-shadow:var(--glow);}
#${id} .t b{color:var(--accent-2);font-weight:800;}
#${id} .ul{width:420px;height:60px;margin-left:430px;margin-top:-24px;}
#${id} .cl{stroke:var(--accent-2);stroke-width:4;opacity:0.8;stroke-dasharray:600;stroke-dashoffset:600;}
#${id} .cn circle{fill:var(--fg);opacity:0.9;}
#${id} .a{font-size:34px;color:var(--muted);letter-spacing:0.2em;margin-top:6px;}
</style>`,
      (id) =>
        `tl.from('#${id} .halo',{autoAlpha:0,scale:0.7,duration:0.5},0);\n` +
        `${dustTl(id)}\n` +
        `tl.from('#${id} .t',{autoAlpha:0,duration:0.5},0.2);\n` +
        `tl.to('#${id} .cl',{strokeDashoffset:0,duration:0.45,ease:'power2.inOut'},0.55);\n` +
        `tl.from('#${id} .cn circle',{scale:0,transformOrigin:'center',duration:0.18,stagger:0.06},0.75);\n` +
        `tl.from('#${id} .a',{autoAlpha:0,duration:0.3},0.85);`,
    ),
  走势: () =>
    mk(
      'pd_trd',
      '走势',
      (id) => `
<div class="sp">
  <div class="halo hz"></div>
  ${dustHtml()}
  <div class="c">
    <div class="k">GROWTH · 90 DAYS</div>
    <div class="h">曲线自己会说话</div>
  </div>
  <svg class="tr" viewBox="0 0 1440 560">
    <polyline class="cl" points="40,480 320,360 580,410 860,210 1120,260 1330,80" fill="none"/>
    <g class="cn"><circle cx="40" cy="480" r="6"/><circle cx="320" cy="360" r="5"/><circle cx="580" cy="410" r="5"/><circle cx="860" cy="210" r="6"/><circle cx="1120" cy="260" r="5"/></g>
    <path class="star" d="M1330 26 L1344 66 L1384 80 L1344 94 L1330 134 L1316 94 L1276 80 L1316 66 Z"/>
  </svg>
  <div class="lab">+327%</div>
</div>
<style>${spaceRoot(id)}
#${id} .sp{background-color:var(--paper);}
#${id} .hz{width:900px;height:900px;left:920px;top:60px;}
#${id} .c{position:absolute;left:180px;top:140px;display:flex;flex-direction:column;gap:44px;}
#${id} .k{font-family:var(--font-num);font-size:34px;letter-spacing:0.38em;color:var(--accent);}
#${id} .h{font-size:120px;font-weight:900;line-height:1.1;text-shadow:var(--glow);}
#${id} .tr{position:absolute;left:200px;top:420px;width:1440px;height:560px;}
#${id} .cl{stroke:var(--accent);stroke-width:4;opacity:0.65;stroke-dasharray:1900;stroke-dashoffset:1900;}
#${id} .cn circle{fill:var(--fg);opacity:0.9;}
#${id} .star{fill:var(--accent-2);filter:drop-shadow(0 0 18px var(--accent-2));}
#${id} .lab{position:absolute;right:180px;top:300px;font-family:var(--font-num);font-size:92px;font-weight:800;color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .halo',{autoAlpha:0,scale:0.7,duration:0.5},0);\n` +
        `${dustTl(id)}\n` +
        `tl.from('#${id} .k',{autoAlpha:0,x:-30,duration:0.35},0.12);\n` +
        `tl.from('#${id} .h',{y:36,autoAlpha:0,duration:0.4,ease:'power2.out'},0.2);\n` +
        `tl.to('#${id} .cl',{strokeDashoffset:0,duration:0.55,ease:'power2.inOut'},0.35);\n` +
        `tl.from('#${id} .cn circle',{scale:0,transformOrigin:'center',duration:0.18,stagger:0.05},0.55);\n` +
        `tl.from('#${id} .star',{scale:0,transformOrigin:'center',autoAlpha:0,duration:0.25,ease:'power2.out'},0.9);\n` +
        `tl.from('#${id} .lab',{autoAlpha:0,duration:0.25},0.95);`,
    ),
  时间线: () =>
    mk(
      'pd_tml',
      '时间线',
      (id) => `
<div class="sp">
  <div class="halo hz"></div>
  ${dustHtml()}
  <div class="c">
    <div class="k">LIGHT TRAIL · 1609 → 2021</div>
    <div class="h">我们把眼睛,越送越远</div>
  </div>
  <div class="trk">
    <svg class="rail" viewBox="0 0 1520 8" preserveAspectRatio="none"><line class="cl" x1="4" y1="4" x2="1516" y2="4"/></svg>
    <i class="nd n0"></i><i class="nd n1"></i><i class="nd n2"></i><i class="cur"></i>
    <div class="lb l0"><b>1609</b><span>伽利略抬头</span></div>
    <div class="lb l1"><b>1969</b><span>月面回望</span></div>
    <div class="lb l2"><b>1990</b><span>哈勃升空</span></div>
    <div class="lbc"><b>2021</b><span>韦布点亮</span></div>
  </div>
</div>
<style>${spaceRoot(id)}
#${id} .sp{background-color:var(--paper);}
#${id} .hz{width:880px;height:880px;left:1050px;top:300px;}
#${id} .c{position:absolute;left:200px;top:170px;display:flex;flex-direction:column;gap:44px;}
#${id} .k{font-family:var(--font-num);font-size:34px;letter-spacing:0.38em;color:var(--accent);}
#${id} .h{font-size:120px;font-weight:900;line-height:1.1;text-shadow:var(--glow);}
#${id} .trk{position:absolute;left:200px;top:640px;width:1520px;height:320px;}
#${id} .rail{position:absolute;left:0;top:66px;width:1520px;height:8px;}
#${id} .cl{stroke:var(--accent);stroke-width:3;opacity:0.5;stroke-dasharray:1520;stroke-dashoffset:1520;}
#${id} .nd,#${id} .cur{position:absolute;top:70px;border-radius:999px;}
#${id} .nd{width:14px;height:14px;margin:-7px 0 0 -7px;background:var(--fg);opacity:0.85;}
#${id} .cur{left:1400px;width:28px;height:28px;margin:-14px 0 0 -14px;background:var(--accent);box-shadow:var(--glow);}
#${id} .n0{left:70px;}#${id} .n1{left:520px;}#${id} .n2{left:970px;}
#${id} .lb,#${id} .lbc{position:absolute;top:124px;width:340px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;}
#${id} .lb b,#${id} .lbc b{font-family:var(--font-num);font-size:38px;font-weight:700;color:var(--muted);}
#${id} .lb span{font-size:32px;color:var(--muted);}
#${id} .l0{left:-100px;}#${id} .l1{left:350px;}#${id} .l2{left:800px;}
#${id} .lbc{left:1230px;}
#${id} .lbc b{color:var(--accent);font-size:44px;text-shadow:var(--glow);}
#${id} .lbc span{font-size:34px;color:var(--fg);font-weight:700;}
</style>`,
      (id) =>
        `tl.from('#${id} .halo',{autoAlpha:0,scale:0.7,duration:0.5},0);\n` +
        `${dustTl(id)}\n` +
        `tl.from('#${id} .k',{autoAlpha:0,x:-30,duration:0.35},0.12);\n` +
        `tl.from('#${id} .h',{y:36,autoAlpha:0,duration:0.4,ease:'power2.out'},0.2);\n` +
        `tl.to('#${id} .cl',{strokeDashoffset:0,duration:0.5,ease:'power2.inOut'},0.3);\n` +
        `tl.from('#${id} .nd',{scale:0,transformOrigin:'center',duration:0.22,stagger:0.13,ease:'power2.out'},0.45);\n` +
        `tl.from('#${id} .lb',{autoAlpha:0,y:18,duration:0.25,stagger:0.13},0.55);\n` +
        `tl.from('#${id} .cur',{scale:0,transformOrigin:'center',autoAlpha:0,duration:0.25,ease:'back.out(2)'},0.9);\n` +
        `tl.from('#${id} .lbc',{autoAlpha:0,y:18,duration:0.25},0.95);`,
    ),
  列表: () =>
    mk(
      'pd_lst',
      '列表',
      (id) => `
<div class="sp">
  <div class="halo hz"></div>
  ${dustHtml()}
  <div class="c">
    <div class="k">STAR CATALOGUE</div>
    <div class="r"><svg class="st s1" viewBox="0 0 48 48"><path d="M24 2 L29 19 L46 24 L29 29 L24 46 L19 29 L2 24 L19 19 Z"/></svg><span>先认北极星,再谈整片天空</span></div>
    <svg class="sep" viewBox="0 0 1200 4" preserveAspectRatio="none"><line class="sl" x1="2" y1="2" x2="1198" y2="2"/></svg>
    <div class="r"><svg class="st s2" viewBox="0 0 48 48"><path d="M24 2 L29 19 L46 24 L29 29 L24 46 L19 29 L2 24 L19 19 Z"/></svg><span>亮度不够,就靠得近一点</span></div>
    <svg class="sep" viewBox="0 0 1200 4" preserveAspectRatio="none"><line class="sl" x1="2" y1="2" x2="1198" y2="2"/></svg>
    <div class="r"><svg class="st s3" viewBox="0 0 48 48"><path d="M24 2 L29 19 L46 24 L29 29 L24 46 L19 29 L2 24 L19 19 Z"/></svg><span>看不见的那些,占了 95%</span></div>
  </div>
</div>
<style>${spaceRoot(id)}
#${id} .sp{background-color:var(--paper);}
#${id} .hz{width:880px;height:880px;left:160px;top:140px;}
#${id} .c{position:absolute;left:250px;top:210px;right:250px;display:flex;flex-direction:column;gap:48px;}
#${id} .k{font-family:var(--font-num);font-size:34px;letter-spacing:0.38em;color:var(--accent);margin-bottom:14px;}
#${id} .r{display:flex;align-items:center;gap:52px;font-size:62px;font-weight:700;}
#${id} .st{flex:none;}
#${id} .st.s1{width:52px;height:52px;}
#${id} .st.s1 path{fill:var(--accent);}
#${id} .st.s2{width:66px;height:66px;}
#${id} .st.s2 path{fill:var(--accent-2);}
#${id} .st.s3{width:40px;height:40px;}
#${id} .st.s3 path{fill:var(--fg);opacity:0.9;}
#${id} .sep{width:1200px;height:4px;}
#${id} .sl{stroke:var(--line);stroke-width:2;stroke-dasharray:1200;stroke-dashoffset:1200;}
</style>`,
      (id) =>
        `tl.from('#${id} .halo',{autoAlpha:0,scale:0.7,duration:0.5},0);\n` +
        `${dustTl(id)}\n` +
        `tl.from('#${id} .k',{autoAlpha:0,x:-30,duration:0.35},0.12);\n` +
        `tl.from('#${id} .r span',{autoAlpha:0,y:26,duration:0.35,stagger:0.14,ease:'power2.out'},0.2);\n` +
        `tl.from('#${id} .st',{scale:0,transformOrigin:'center',autoAlpha:0,duration:0.25,stagger:0.14,ease:'power2.out'},0.3);\n` +
        `tl.to('#${id} .sl',{strokeDashoffset:0,duration:0.5,ease:'power2.inOut',stagger:0.12},0.5);`,
    ),
  引导: () =>
    mk(
      'pd_cta',
      '引导',
      (id) => `
<div class="sp">
  <div class="halo hz"></div>
  ${dustHtml()}
  <i class="cv v0"></i><i class="cv v1"></i><i class="cv v2"></i><i class="cv v3"></i><i class="cv v4"></i><i class="cv v5"></i>
  <div class="btn">＋ 关注</div>
  <div class="s">每周五晚 · 一起仰望深空</div>
</div>
<style>${spaceRoot(id)}
#${id} .sp{background-color:var(--paper);}
#${id} .hz{width:940px;height:940px;left:490px;top:0;}
#${id} .btn{position:absolute;left:50%;top:44%;width:460px;height:460px;transform:translate(-50%,-50%);border-radius:999px;background:var(--accent);color:var(--paper);box-shadow:var(--glow);display:flex;align-items:center;justify-content:center;font-size:88px;font-weight:900;}
#${id} .s{position:absolute;left:0;right:0;bottom:170px;text-align:center;font-size:42px;color:var(--muted);letter-spacing:0.14em;}
#${id} .cv{position:absolute;border-radius:999px;}
#${id} .v0{left:380px;top:220px;width:10px;height:10px;background:var(--accent);opacity:0.9;}
#${id} .v1{left:1520px;top:180px;width:8px;height:8px;background:var(--accent-2);opacity:0.85;}
#${id} .v2{left:300px;top:760px;width:9px;height:9px;background:var(--fg);opacity:0.7;}
#${id} .v3{left:1620px;top:720px;width:11px;height:11px;background:var(--accent);opacity:0.9;}
#${id} .v4{left:760px;top:90px;width:7px;height:7px;background:var(--accent-2);opacity:0.8;}
#${id} .v5{left:1180px;top:900px;width:8px;height:8px;background:var(--fg);opacity:0.7;}
</style>`,
      (id) =>
        `tl.from('#${id} .halo',{autoAlpha:0,scale:0.7,duration:0.5},0);\n` +
        `${dustTl(id)}\n` +
        `tl.from('#${id} .btn',{autoAlpha:0,scale:0.85,duration:0.45,ease:'power2.out'},0.15);\n` +
        `tl.to('#${id} .v0',{x:540,y:230,autoAlpha:0,duration:0.5,ease:'power2.in'},0.35);\n` +
        `tl.to('#${id} .v1',{x:-520,y:270,autoAlpha:0,duration:0.5,ease:'power2.in'},0.4);\n` +
        `tl.to('#${id} .v2',{x:620,y:-260,autoAlpha:0,duration:0.5,ease:'power2.in'},0.45);\n` +
        `tl.to('#${id} .v3',{x:-620,y:-220,autoAlpha:0,duration:0.5,ease:'power2.in'},0.5);\n` +
        `tl.to('#${id} .v4',{x:190,y:360,autoAlpha:0,duration:0.5,ease:'power2.in'},0.55);\n` +
        `tl.to('#${id} .v5',{x:-200,y:-400,autoAlpha:0,duration:0.5,ease:'power2.in'},0.6);\n` +
        `tl.from('#${id} .s',{autoAlpha:0,duration:0.3},0.75);`,
    ),
};
