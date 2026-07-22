/**
 * Botanical — herbarium-journal dialect: thin-line foliage SVGs drawn in stroke by stroke, specimen
 * label cards + diagonal tape, Latin catalog lines, terracotta wax-seal dots. Layout logic:
 * asymmetric two columns + a hairline vertical rule, lots of whitespace, slow pace.
 */

import { type Block, mk } from './shared';

const SPRIG = `<svg class="sprig" viewBox="0 0 260 660">
  <path class="st" d="M132 640 C104 520 158 420 128 310 C112 240 138 120 132 20"/>
  <path class="lf" d="M124 540 C84 524 52 534 30 566 C68 586 106 570 124 540"/>
  <path class="lf" d="M136 470 C176 454 208 464 230 496 C192 516 154 500 136 470"/>
  <path class="lf" d="M122 392 C86 376 56 384 36 412 C72 432 106 420 122 392"/>
  <path class="lf" d="M134 316 C172 302 202 310 224 338 C188 358 152 344 134 316"/>
  <path class="lf" d="M124 232 C92 218 66 224 48 250 C80 270 110 258 124 232"/>
  <path class="lf" d="M134 150 C168 138 196 146 216 172 C184 190 152 176 134 150"/>
</svg>`;

const LEAF = `<svg class="glyph" viewBox="0 0 90 70">
  <path class="lf" d="M8 62 C10 30 34 8 82 8 C80 44 52 66 8 62 Z"/>
  <path class="lf" d="M8 62 C30 44 52 28 82 8"/>
</svg>`;

/* Three-stage growth sprigs: sprout / leaf-out / bloom, drawn in stroke by stroke on the same canvas */
const SPROUT = `<svg class="stage" viewBox="0 0 200 220">
  <path class="st" d="M100 210 C96 160 104 120 100 70"/>
  <path class="lf" d="M100 110 C70 96 46 100 30 122 C58 138 86 130 100 110"/>
  <path class="lf" d="M100 84 C130 70 156 74 172 96 C144 112 116 104 100 84"/>
</svg>`;

const LEAFY = `<svg class="stage" viewBox="0 0 200 220">
  <path class="st" d="M100 210 C92 150 108 100 100 30"/>
  <path class="lf" d="M100 150 C68 136 44 140 28 162 C56 178 84 170 100 150"/>
  <path class="lf" d="M100 118 C132 104 158 108 174 130 C146 146 118 138 100 118"/>
  <path class="lf" d="M100 84 C72 70 50 74 36 94 C62 110 86 102 100 84"/>
  <path class="lf" d="M100 56 C128 44 152 48 168 68 C142 84 116 76 100 56"/>
</svg>`;

const BLOOM = `<svg class="stage" viewBox="0 0 200 220">
  <path class="st" d="M100 210 C94 150 106 110 100 66"/>
  <path class="lf" d="M100 150 C70 136 46 140 30 162 C58 178 86 170 100 150"/>
  <path class="lf" d="M100 118 C130 104 156 108 172 130 C144 146 116 138 100 118"/>
  <circle class="bl" cx="100" cy="44" r="26"/>
  <circle class="bd" cx="100" cy="44" r="8"/>
</svg>`;

/* Horizontal branch: the axis of the growth-log timeline, one curved stem + three small leaves, drawn in like the sprig */
const BRANCH = `<svg class="branch" viewBox="0 0 1580 120">
  <path class="st" d="M8 66 C300 40 560 92 800 64 C1080 34 1320 66 1572 50"/>
  <path class="lf" d="M330 56 C312 30 318 10 344 2 C360 28 352 48 330 56"/>
  <path class="lf" d="M700 76 C722 98 748 104 774 94 C762 68 730 62 700 76"/>
  <path class="lf" d="M1180 50 C1164 26 1170 8 1194 0 C1210 24 1202 42 1180 50"/>
</svg>`;

const stageCss = (id: string) => `
#${id} .stage{width:150px;height:165px;}
#${id} .stage .st,#${id} .stage .lf,#${id} .stage .bl{fill:none;stroke:var(--accent);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;}
#${id} .stage .st{stroke-dasharray:320;stroke-dashoffset:320;}
#${id} .stage .lf{stroke-dasharray:300;stroke-dashoffset:300;}
#${id} .stage .bl{stroke-dasharray:170;stroke-dashoffset:170;}
#${id} .stage .bd{fill:var(--accent);}`;

const btRoot = (id: string) => `
#${id} .bt{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);}
#${id} .sprig .st,#${id} .sprig .lf,#${id} .glyph .lf{fill:none;stroke:var(--accent);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;}
#${id} .sprig .st{stroke-dasharray:1400;stroke-dashoffset:1400;}
#${id} .sprig .lf{stroke-dasharray:420;stroke-dashoffset:420;}
#${id} .lat{font-family:var(--font-num);font-size:29px;letter-spacing:0.32em;color:var(--muted);}
#${id} .rule{position:absolute;width:1px;background:var(--line);}
#${id} .hr{height:1px;background:var(--line);}
#${id} .wax{width:44px;height:44px;border-radius:999px;background:var(--accent-2);box-shadow:var(--shadow);}
#${id} .tape{position:absolute;width:170px;height:50px;background:var(--panel-2);opacity:0.85;transform:rotate(-42deg);}`;

const sprigDraw = (id: string, at = 0) =>
  `tl.to('#${id} .sprig .st',{strokeDashoffset:0,duration:0.6,ease:'power1.inOut'},${at});\n` +
  `tl.to('#${id} .sprig .lf',{strokeDashoffset:0,duration:0.35,stagger:0.07},${at + 0.25});`;

export const cover: () => Block = () =>
  mk(
    'cv_bt',
    '封面',
    (id) => `
<div class="bt">
  ${SPRIG}
  <div class="rule vr"></div>
  <div class="c">
    <div class="lat">BOTANIC PRESS · FRAME</div>
    <div class="h">植物</div>
    <div class="sig"><div class="hr sh"></div><i class="wax"></i></div>
  </div>
</div>
<style>${btRoot(id)}
#${id} .sprig{position:absolute;left:200px;top:160px;width:300px;height:760px;}
#${id} .vr{left:620px;top:150px;bottom:150px;}
#${id} .c{position:absolute;left:740px;right:170px;top:50%;transform:translateY(-52%);display:flex;flex-direction:column;gap:64px;}
#${id} .h{font-size:280px;font-weight:600;line-height:1;letter-spacing:0.06em;}
#${id} .sig{display:flex;align-items:center;gap:34px;}
#${id} .sh{width:200px;}
</style>`,
    (id) =>
      sprigDraw(id, 0) +
      `\ntl.from('#${id} .vr',{scaleY:0,transformOrigin:'top center',duration:0.4,ease:'power1.out'},0.1);\n` +
      `tl.from('#${id} .c > *',{y:26,autoAlpha:0,duration:0.32,stagger:0.12,ease:'power1.out'},0.3);\n` +
      `tl.from('#${id} .wax',{scale:0,duration:0.24,ease:'power2.out'},0.9);`,
  );

export const blocks: Record<string, () => Block> = {
  标题卡: () =>
    mk(
      'bt_ttl',
      '标题卡',
      (id) => `
<div class="bt">
  ${SPRIG}
  <div class="rule vr"></div>
  <div class="main">
    <div class="lat">HERBARIUM · NO.007</div>
    <div class="h">阳台上的<br/>香草图鉴</div>
    <div class="hr mh"></div>
    <div class="meta">六种可食用 · 从播种到剪收</div>
  </div>
  <div class="card"><i class="tape ta"></i><i class="tape tb"></i>
    <b>薄荷 · MENTHA</b>
    <div class="hr"></div>
    <span class="lat cl">COLLECTED 2026 · P.01</span>
    <i class="wax wx"></i>
  </div>
</div>
<style>${btRoot(id)}
#${id} .bt{background-color:var(--paper);}
#${id} .sprig{position:absolute;left:180px;top:170px;width:300px;height:760px;}
#${id} .vr{left:600px;top:150px;bottom:150px;}
#${id} .main{position:absolute;left:720px;right:180px;top:216px;display:flex;flex-direction:column;align-items:flex-start;gap:46px;}
#${id} .h{font-size:126px;font-weight:600;line-height:1.28;letter-spacing:0.04em;}
#${id} .mh{width:520px;}
#${id} .meta{font-size:40px;color:var(--muted);letter-spacing:0.06em;}
#${id} .card{position:absolute;right:180px;bottom:140px;background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);padding:42px 56px;display:flex;flex-direction:column;gap:24px;}
#${id} .card b{font-size:46px;font-weight:600;letter-spacing:0.04em;}
#${id} .card .cl{font-size:28px;}
#${id} .ta{left:-46px;top:-16px;}
#${id} .tb{right:-46px;bottom:-16px;}
#${id} .wx{position:absolute;right:-14px;top:-20px;}
</style>`,
      (id) =>
        sprigDraw(id, 0) +
        `\ntl.from('#${id} .vr',{scaleY:0,transformOrigin:'top center',duration:0.4,ease:'power1.out'},0.1);\n` +
        `tl.from('#${id} .main > *',{y:24,autoAlpha:0,duration:0.3,stagger:0.1,ease:'power1.out'},0.26);\n` +
        `tl.from('#${id} .card',{y:30,autoAlpha:0,duration:0.3,ease:'power1.out'},0.68);\n` +
        `tl.from('#${id} .wx',{scale:0,duration:0.22,ease:'power2.out'},0.94);`,
    ),
  列表: () =>
    mk(
      'bt_lst',
      '列表',
      (id) => `
<div class="bt">
  <div class="hdr"><span class="lat">采收清单 · JULY 2026</span><div class="hr f"></div><span class="lat">3 SPECIMENS</span></div>
  <div class="ls">
    <div class="r">${LEAF}<div class="t"><b>罗勒</b><span class="lat">OCIMUM · 摘心促分枝</span></div><span class="no">NO.01</span></div>
    <div class="r">${LEAF}<div class="t"><b>迷迭香</b><span class="lat">ROSMARINUS · 宁干勿湿</span></div><span class="no">NO.02</span></div>
    <div class="r rw">${LEAF}<div class="t"><b>薄荷</b><span class="lat">MENTHA · 见土就活</span></div><i class="wax"></i><span class="no">NO.03</span></div>
  </div>
  <div class="fnote lat">PRESSED &amp; FILED · 植物手账</div>
</div>
<style>${btRoot(id)}
#${id} .bt{background-color:var(--paper);}
#${id} .hdr{position:absolute;left:170px;right:170px;top:140px;display:flex;align-items:center;gap:44px;}
#${id} .hdr .f{flex:1;}
#${id} .ls{position:absolute;left:170px;right:170px;top:290px;display:flex;flex-direction:column;}
#${id} .r{display:flex;align-items:center;gap:52px;padding:52px 10px;border-bottom:1px solid var(--line);}
#${id} .r:last-child{border-bottom:none;}
#${id} .glyph{width:90px;height:70px;flex:none;}
#${id} .t{flex:1;display:flex;flex-direction:column;gap:16px;}
#${id} .t b{font-size:58px;font-weight:600;letter-spacing:0.05em;}
#${id} .no{font-family:var(--font-num);font-size:32px;color:var(--muted);letter-spacing:0.2em;}
#${id} .fnote{position:absolute;left:0;right:0;bottom:120px;text-align:center;}
</style>`,
      (id) =>
        `tl.from('#${id} .hdr',{autoAlpha:0,duration:0.3},0);\n` +
        `tl.from('#${id} .glyph',{autoAlpha:0,scale:0.6,transformOrigin:'left bottom',duration:0.3,stagger:0.14,ease:'power1.out'},0.14);\n` +
        `tl.from('#${id} .r .t,#${id} .r .no',{y:20,autoAlpha:0,duration:0.28,stagger:0.07,ease:'power1.out'},0.24);\n` +
        `tl.from('#${id} .rw .wax',{scale:0,duration:0.24,ease:'power2.out'},0.8);\n` +
        `tl.from('#${id} .fnote',{autoAlpha:0,duration:0.26},0.9);`,
    ),
  金句: () =>
    mk(
      'bt_qte',
      '金句',
      (id) => `
<div class="bt">
  ${SPRIG}
  <div class="qwrap">
    <div class="lat">PRESSED WORDS · P.12</div>
    <div class="q">植物不催你,<br/>它只是按时长大。</div>
    <div class="sig"><div class="hr sh"></div><span class="a">摘自七月手账</span><i class="wax"></i></div>
  </div>
</div>
<style>${btRoot(id)}
#${id} .bt{background-color:var(--paper);}
#${id} .sprig{position:absolute;left:150px;top:140px;width:280px;height:800px;}
#${id} .qwrap{position:absolute;left:600px;right:170px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:60px;}
#${id} .q{font-size:104px;font-weight:500;line-height:1.5;letter-spacing:0.03em;}
#${id} .sig{display:flex;align-items:center;gap:32px;}
#${id} .sh{width:160px;}
#${id} .a{font-size:36px;color:var(--muted);letter-spacing:0.1em;}
</style>`,
      (id) =>
        sprigDraw(id, 0) +
        `\ntl.from('#${id} .lat',{autoAlpha:0,duration:0.3},0.2);\n` +
        `tl.from('#${id} .q',{y:26,autoAlpha:0,duration:0.42,ease:'power1.out'},0.32);\n` +
        `tl.from('#${id} .sig .sh,#${id} .sig .a',{autoAlpha:0,duration:0.28},0.72);\n` +
        `tl.from('#${id} .sig .wax',{scale:0,duration:0.24,ease:'power2.out'},0.92);`,
    ),
  问答: () =>
    mk(
      'bt_qa',
      '问答',
      (id) => `
<div class="bt">
  ${SPRIG}
  <div class="qcard"><i class="tape ta"></i><i class="tape tb"></i>
    <span class="lat">QUAESTIO · NO.12</span>
    <b class="q">薄荷一晒就蔫,<br/>是缺水吗?</b>
  </div>
  <div class="ans">
    <div class="hr ah"></div>
    <span class="lat ak">ADNOTATIO · 标本注记</span>
    <div class="a">不是缺水,是根晒烫了。</div>
    <em class="rn">换陶盆,午后遮阴,半天就抬头。</em>
    <div class="sig"><span class="lat">MENTHA × PIPERITA</span><i class="wax"></i></div>
  </div>
</div>
<style>${btRoot(id)}
#${id} .bt{background-color:var(--paper);}
#${id} .sprig{position:absolute;left:150px;top:140px;width:280px;height:800px;}
#${id} .qcard{position:absolute;left:620px;right:170px;top:168px;background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);padding:60px 72px;display:flex;flex-direction:column;gap:36px;}
#${id} .q{font-size:76px;font-weight:600;line-height:1.45;letter-spacing:0.03em;}
#${id} .ta{left:-46px;top:-16px;}
#${id} .tb{right:-46px;bottom:-16px;}
#${id} .ans{position:absolute;left:620px;right:170px;top:604px;display:flex;flex-direction:column;align-items:flex-start;gap:34px;}
#${id} .ah{width:200px;}
#${id} .a{font-size:58px;font-weight:600;letter-spacing:0.03em;}
#${id} .rn{font-style:normal;font-size:36px;color:var(--muted);letter-spacing:0.04em;}
#${id} .sig{display:flex;align-items:center;gap:32px;margin-top:12px;}
</style>`,
      (id) =>
        sprigDraw(id, 0) +
        `\ntl.from('#${id} .qcard',{y:26,autoAlpha:0,duration:0.32,ease:'power1.out'},0.22);\n` +
        `tl.from('#${id} .ah',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power1.out'},0.58);\n` +
        `tl.from('#${id} .ak,#${id} .a',{y:20,autoAlpha:0,duration:0.3,stagger:0.1,ease:'power1.out'},0.66);\n` +
        `tl.from('#${id} .rn',{autoAlpha:0,duration:0.26},0.86);\n` +
        `tl.from('#${id} .sig .lat',{autoAlpha:0,duration:0.26},0.9);\n` +
        `tl.from('#${id} .sig .wax',{scale:0,duration:0.22,ease:'power2.out'},0.96);`,
    ),
  步骤: () =>
    mk(
      'bt_stp',
      '步骤',
      (id) => `
<div class="bt">
  <div class="hdr"><span class="lat">栽培手记 · MENTHA</span><div class="hr f"></div><span class="lat">3 STAGES</span></div>
  <div class="row">
    <div class="card sc"><i class="tape tp"></i>${SPROUT}<b>发芽</b><span class="lat">DAY 03 · SPROUT</span><em>保湿避晒,别急着施肥</em></div>
    <div class="card sc"><i class="tape tp"></i>${LEAFY}<b>展叶</b><span class="lat">DAY 14 · LEAF</span><em>见干见湿,晒足半日</em></div>
    <div class="card sc sw"><i class="tape tp"></i>${BLOOM}<b>开花</b><span class="lat">DAY 30 · BLOOM</span><em>掐尖留香,可以剪收了</em><i class="wax wx"></i></div>
  </div>
</div>
<style>${btRoot(id)}${stageCss(id)}
#${id} .bt{background-color:var(--paper);}
#${id} .hdr{position:absolute;left:170px;right:170px;top:150px;display:flex;align-items:center;gap:44px;}
#${id} .hdr .f{flex:1;}
#${id} .row{position:absolute;left:170px;right:170px;top:312px;display:flex;justify-content:space-between;gap:44px;}
#${id} .card{position:relative;flex:1;background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);padding:48px 40px 44px;display:flex;flex-direction:column;align-items:center;gap:22px;}
#${id} .card b{font-size:56px;font-weight:600;letter-spacing:0.05em;}
#${id} .card .lat{font-size:28px;}
#${id} .card em{font-style:normal;font-size:32px;color:var(--muted);letter-spacing:0.04em;}
#${id} .tp{left:50%;top:-20px;margin-left:-85px;transform:rotate(-3deg);}
#${id} .wx{position:absolute;right:-14px;top:-18px;}
</style>`,
      (id) =>
        `tl.from('#${id} .hdr',{autoAlpha:0,duration:0.3},0);\n` +
        `tl.from('#${id} .sc',{y:26,autoAlpha:0,duration:0.3,stagger:0.14,ease:'power1.out'},0.1);\n` +
        `tl.to('#${id} .stage .st',{strokeDashoffset:0,duration:0.4,ease:'power1.inOut',stagger:0.12},0.3);\n` +
        `tl.to('#${id} .stage .lf',{strokeDashoffset:0,duration:0.3,stagger:0.05},0.5);\n` +
        `tl.to('#${id} .stage .bl',{strokeDashoffset:0,duration:0.3},0.8);\n` +
        `tl.from('#${id} .sw .wax',{scale:0,duration:0.24,ease:'power2.out'},0.94);`,
    ),
  时间线: () =>
    mk(
      'bt_tml',
      '时间线',
      (id) => `
<div class="bt">
  <div class="hdr"><span class="lat">生长记录 · OCIMUM</span><div class="hr f"></div><span class="lat">21 DAYS</span></div>
  <div class="axis">
    ${BRANCH}
    <i class="nd n1"></i><i class="nd n2"></i><i class="nd n3"></i>
  </div>
  <i class="drop d1"></i><i class="drop d2"></i><i class="drop d3"></i>
  <div class="cards">
    <div class="tcard"><i class="tape tp"></i><span class="lat">DAY 01</span><b>破土</b><em>两片子叶,先别晒</em></div>
    <div class="tcard"><i class="tape tp"></i><span class="lat">DAY 07</span><b>真叶</b><em>香气从这天开始</em></div>
    <div class="tcard tw"><i class="tape tp"></i><span class="lat">DAY 21</span><b>成株</b><em>摘心,留住株形</em><i class="wax wx"></i></div>
  </div>
  <div class="fnote lat">SOWN &amp; LOGGED · 播种手记</div>
</div>
<style>${btRoot(id)}
#${id} .bt{background-color:var(--paper);}
#${id} .hdr{position:absolute;left:170px;right:170px;top:150px;display:flex;align-items:center;gap:44px;}
#${id} .hdr .f{flex:1;}
#${id} .axis{position:absolute;left:170px;right:170px;top:310px;height:120px;}
#${id} .branch{position:absolute;inset:0;width:1580px;height:120px;}
#${id} .branch .st,#${id} .branch .lf{fill:none;stroke:var(--accent);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;}
#${id} .branch .st{stroke-dasharray:1700;stroke-dashoffset:1700;}
#${id} .branch .lf{stroke-dasharray:240;stroke-dashoffset:240;}
#${id} .nd{position:absolute;width:18px;height:18px;border-radius:999px;border:2.5px solid var(--accent);background:var(--paper);}
#${id} .n1{left:206px;top:44px;}
#${id} .n2{left:781px;top:52px;}
#${id} .n3{left:1356px;top:40px;}
#${id} .drop{position:absolute;width:1px;background:var(--line);top:400px;height:116px;}
#${id} .d1{left:384px;}
#${id} .d2{left:959px;}
#${id} .d3{left:1534px;}
#${id} .cards{position:absolute;left:170px;right:170px;top:516px;display:flex;justify-content:space-between;}
#${id} .tcard{position:relative;width:430px;background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);padding:44px 48px 40px;display:flex;flex-direction:column;align-items:flex-start;gap:20px;}
#${id} .tcard .lat{font-size:28px;}
#${id} .tcard b{font-size:52px;font-weight:600;letter-spacing:0.05em;}
#${id} .tcard em{font-style:normal;font-size:32px;color:var(--muted);letter-spacing:0.04em;}
#${id} .tp{left:50%;top:-20px;margin-left:-85px;transform:rotate(-3deg);}
#${id} .wx{position:absolute;right:-14px;top:-18px;}
#${id} .fnote{position:absolute;left:0;right:0;bottom:110px;text-align:center;}
</style>`,
      (id) =>
        `tl.from('#${id} .hdr',{autoAlpha:0,duration:0.3},0);\n` +
        `tl.to('#${id} .branch .st',{strokeDashoffset:0,duration:0.55,ease:'power1.inOut'},0.05);\n` +
        `tl.to('#${id} .branch .lf',{strokeDashoffset:0,duration:0.3,stagger:0.08},0.3);\n` +
        `tl.from('#${id} .nd',{scale:0,duration:0.22,stagger:0.14,ease:'power2.out'},0.32);\n` +
        `tl.from('#${id} .drop',{scaleY:0,transformOrigin:'top center',duration:0.24,stagger:0.14},0.42);\n` +
        `tl.from('#${id} .tcard',{y:26,autoAlpha:0,duration:0.3,stagger:0.14,ease:'power1.out'},0.5);\n` +
        `tl.from('#${id} .fnote',{autoAlpha:0,duration:0.26},0.9);\n` +
        `tl.from('#${id} .tw .wax',{scale:0,duration:0.22,ease:'power2.out'},0.96);`,
    ),
  大数字: () =>
    mk(
      'bt_num',
      '大数字',
      (id) => `
<div class="bt">
  ${SPRIG}
  <div class="rule vr"></div>
  <div class="main">
    <div class="lat">GROWTH LOG · MENTHA</div>
    <div class="d"><span>DAY</span><b>30</b></div>
    <div class="hr mh"></div>
    <div class="meta">从一节茎,到一整盆薄荷香</div>
    <div class="sig"><span class="lat">PRESSED &amp; FILED</span><i class="wax"></i></div>
  </div>
</div>
<style>${btRoot(id)}
#${id} .bt{background-color:var(--paper);}
#${id} .sprig{position:absolute;left:180px;top:170px;width:300px;height:760px;}
#${id} .vr{left:600px;top:150px;bottom:150px;}
#${id} .main{position:absolute;left:720px;right:180px;top:196px;display:flex;flex-direction:column;align-items:flex-start;gap:44px;}
#${id} .d{display:flex;align-items:baseline;gap:44px;}
#${id} .d span{font-family:var(--font-num);font-size:44px;letter-spacing:0.32em;color:var(--muted);}
#${id} .d b{font-size:340px;font-weight:500;line-height:1;letter-spacing:0.02em;}
#${id} .mh{width:520px;}
#${id} .meta{font-size:40px;color:var(--muted);letter-spacing:0.06em;}
#${id} .sig{display:flex;align-items:center;gap:32px;}
</style>`,
      (id) =>
        sprigDraw(id, 0) +
        `\ntl.from('#${id} .vr',{scaleY:0,transformOrigin:'top center',duration:0.4,ease:'power1.out'},0.1);\n` +
        `tl.from('#${id} .main > *',{y:24,autoAlpha:0,duration:0.3,stagger:0.1,ease:'power1.out'},0.26);\n` +
        `tl.from('#${id} .sig .wax',{scale:0,duration:0.22,ease:'power2.out'},0.94);`,
    ),
  引导: () =>
    mk(
      'bt_cta',
      '引导',
      (id) => `
<div class="bt">
  ${SPRIG}
  <div class="cta"><i class="tape ta"></i><i class="tape tb"></i>
    <span class="lat">SUBSCRIBE · WEEKLY SPECIMEN</span>
    <b>关注 · 每周一株</b>
    <div class="hr ch"></div>
    <em>周五晚更新 · 从种子讲到餐桌</em>
    <i class="wax wx"></i>
  </div>
</div>
<style>${btRoot(id)}
#${id} .bt{background-color:var(--paper);}
#${id} .sprig{position:absolute;left:150px;top:140px;width:280px;height:800px;}
#${id} .cta{position:absolute;left:620px;right:170px;top:50%;transform:translateY(-50%);background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);padding:96px 100px;display:flex;flex-direction:column;align-items:flex-start;gap:46px;}
#${id} .cta b{font-size:96px;font-weight:600;letter-spacing:0.04em;}
#${id} .ch{width:200px;}
#${id} .cta em{font-style:normal;font-size:38px;color:var(--muted);letter-spacing:0.08em;}
#${id} .ta{left:-46px;top:-16px;}
#${id} .tb{right:-46px;bottom:-16px;}
#${id} .wx{position:absolute;right:-16px;top:-22px;}
</style>`,
      (id) =>
        sprigDraw(id, 0) +
        `\ntl.from('#${id} .cta',{y:30,autoAlpha:0,duration:0.34,ease:'power1.out'},0.3);\n` +
        `tl.from('#${id} .wx',{scale:0,duration:0.24,ease:'power2.out'},0.9);`,
    ),
};
