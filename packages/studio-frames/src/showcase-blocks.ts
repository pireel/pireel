/**
 * Factory for the real-preview blocks shown on a frame's detail page ("what this
 * theme produces"), keyed by (frameId, kind). Each frame is its own layout dialect,
 * not one skeleton reskinned:
 *   Blueprint = engineering drawing: wireframes, dimension lines, grid, title block, stroke-only
 *   Cream     = sticker candy: tilted rounded stickers, pills, dot accents, layering
 *   Biennale  = constructivist poster: giant bleeding type, vertical text, reversed panels
 *   Noir      = fashion editorial: centered, extreme whitespace, hairline gold frame, thin serif
 *   Journal   = newspaper front page: double-rule masthead, faux columns, drop caps, red-pen notes
 *   Neon      = HUD terminal: scan grid, corner brackets, status bar, mono readouts, cursor
 * Design rules: commit to an extreme direction, dominant color + sharp accent, no
 * "rounded card + left border" cliche, text no smaller than 24px-equivalent at 1080p.
 * 1920x1080 canvas, rendered for real via blockPreviewDoc.
 * Open vocabulary: a kind a frame doesn't implement returns null, panel falls back to a label card.
 */


import { framePack, localizeBlock, type SupportedLocale } from './locales';
import { type Block, mk } from './dialects/shared';
import * as kawaiiBubble from './dialects/kawaii-bubble';
import * as megaSale from './dialects/mega-sale';
import * as pixelArcade from './dialects/pixel-arcade';
import * as varsityBold from './dialects/varsity-bold';
import * as scrapbookTape from './dialects/scrapbook-tape';
import * as memphisPop from './dialects/memphis-pop';
import * as y2kChrome from './dialects/y2k-chrome';
import * as mangaPanel from './dialects/manga-panel';
import * as particleDust from './dialects/particle-dust';
import * as glassTech from './dialects/glass-tech';
import * as zenWhite from './dialects/zen-white';
import * as cinemaFrame from './dialects/cinema-frame';
import * as paperCut from './dialects/paper-cut';
import * as boardroom from './dialects/boardroom';
import * as chalkClass from './dialects/chalk-class';
import * as botanicPress from './dialects/botanic-press';
import * as flipBoard from './dialects/flip-board';
import * as circuitBoard from './dialects/circuit-board';
import * as stickerCollage from './dialects/sticker-collage';

/* ================================================================
   Blueprint — engineering-drawing dialect: grid ground, wireframes, dimension marks, title block
   ================================================================ */

const bpRoot = (id: string) => `
#${id} .bp{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);
  background-color:var(--paper);/* 页面底:纸色垫在网格纹之下 */
  background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);
  background-size:96px 96px;}
#${id} .frame{position:absolute;inset:56px;border:2px solid var(--line);}
#${id} .dwg{position:absolute;right:80px;bottom:80px;border:2px solid var(--line);display:flex;font-family:var(--font-num);font-size:28px;color:var(--muted);}
#${id} .dwg span{padding:16px 28px;border-left:2px solid var(--line);}
#${id} .dwg span:first-child{border-left:none;color:var(--accent);}`;

const blueprint: Record<string, () => Block> = {
  'title-card': () =>
    mk(
      'bp_ttl',
      'title-card',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="body">
    <div class="k">FIG.01 — OPENING</div>
    <div class="h">把观点讲成画面</div>
    <div class="dim"><i></i><b>1920</b><i></i></div>
  </div>
  <div class="dwg"><span>DWG-01</span><span>SCALE 1:1</span><span>REV A</span></div>
</div>
<style>${bpRoot(id)}
#${id} .body{position:absolute;left:150px;top:230px;right:150px;display:flex;flex-direction:column;gap:52px;}
#${id} .k{font-family:var(--font-num);font-size:36px;letter-spacing:0.34em;color:var(--accent);}
#${id} .h{font-size:158px;font-weight:900;letter-spacing:-0.02em;}
#${id} .dim{display:flex;align-items:center;gap:20px;color:var(--muted);}
#${id} .dim i{flex:1;height:0;border-top:2px dashed var(--line);position:relative;}
#${id} .dim i::before,#${id} .dim i::after{content:'';position:absolute;top:-9px;width:2px;height:20px;background:var(--line);}
#${id} .dim i::before{left:0}#${id} .dim i::after{right:0}
#${id} .dim b{font-family:var(--font-num);font-size:34px;font-weight:500;}
</style>`,
      (id) =>
        `tl.from('#${id} .frame',{autoAlpha:0,duration:0.3},0);\n` +
        `tl.from('#${id} .k',{x:-30,autoAlpha:0,duration:0.25},0.1);\n` +
        `tl.from('#${id} .h',{y:46,autoAlpha:0,duration:0.34,ease:'power3.out'},0.18);\n` +
        `tl.from('#${id} .dim,#${id} .dwg',{autoAlpha:0,duration:0.3},0.42);`,
    ),
  'big-number': () =>
    mk(
      'bp_num',
      'big-number',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="v">38<i>%</i></div>
  <div class="lead"><span class="dot"></span><span class="ln"></span><span class="note">本月转化增长<br/>MEASURED · Q2</span></div>
  <div class="dwg"><span>DATA</span><span>±0.5</span></div>
</div>
<style>${bpRoot(id)}
#${id} .v{position:absolute;left:150px;top:50%;transform:translateY(-54%);font-family:var(--font-num);font-size:560px;font-weight:700;line-height:1;letter-spacing:-0.05em;
  color:transparent;-webkit-text-stroke:6px var(--accent);}
#${id} .v i{font-style:normal;font-size:260px;-webkit-text-stroke:4px var(--fg);}
#${id} .lead{position:absolute;right:150px;top:250px;display:flex;align-items:flex-start;gap:0;}
#${id} .dot{width:16px;height:16px;border-radius:999px;background:var(--accent);margin-top:8px;}
#${id} .ln{width:170px;height:2px;background:var(--line);margin-top:15px;}
#${id} .note{padding-left:26px;font-size:40px;line-height:1.5;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .frame',{autoAlpha:0,duration:0.3},0);\n` +
        `tl.from('#${id} .v',{autoAlpha:0,x:-60,duration:0.4,ease:'power3.out'},0.1);\n` +
        `tl.from('#${id} .ln',{scaleX:0,transformOrigin:'left center',duration:0.3},0.4);\n` +
        `tl.from('#${id} .note,#${id} .dot',{autoAlpha:0,duration:0.25},0.55);`,
    ),
  'count-up': () =>
    mk(
      'bp_cnt',
      'count-up',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="k">FIG.04 — LIVE COUNT</div>
  <div class="big"><b class="v">365</b><i class="u">天</i></div>
  <div class="dim"><i></i><b>TOL ±0</b><i></i></div>
  <div class="lead"><span class="dot"></span><span class="ln"></span><span class="note">连续日更实测<br/>NO GAPS · VERIFIED</span></div>
  <div class="dwg"><span>CNT-04</span><span>TOL ±0</span><span>REV A</span></div>
</div>
<style>${bpRoot(id)}
#${id} .k{position:absolute;left:150px;top:150px;font-family:var(--font-num);font-size:36px;letter-spacing:0.34em;color:var(--accent);}
#${id} .big{position:absolute;left:150px;top:50%;transform:translateY(-58%);display:flex;align-items:baseline;gap:36px;font-family:var(--font-num);}
#${id} .v{font-size:520px;font-weight:700;line-height:1;letter-spacing:-0.04em;color:transparent;-webkit-text-stroke:6px var(--accent);}
#${id} .u{font-style:normal;font-size:200px;font-weight:700;color:transparent;-webkit-text-stroke:4px var(--fg);}
#${id} .dim{position:absolute;left:150px;right:150px;bottom:200px;display:flex;align-items:center;gap:20px;color:var(--muted);}
#${id} .dim i{flex:1;height:0;border-top:2px dashed var(--line);position:relative;}
#${id} .dim i::before,#${id} .dim i::after{content:'';position:absolute;top:-9px;width:2px;height:20px;background:var(--line);}
#${id} .dim i::before{left:0}#${id} .dim i::after{right:0}
#${id} .dim b{font-family:var(--font-num);font-size:32px;font-weight:500;letter-spacing:0.2em;}
#${id} .lead{position:absolute;right:150px;top:250px;display:flex;align-items:flex-start;gap:0;}
#${id} .dot{width:16px;height:16px;border-radius:999px;background:var(--accent);margin-top:8px;}
#${id} .ln{width:170px;height:2px;background:var(--line);margin-top:15px;}
#${id} .note{padding-left:26px;font-size:40px;line-height:1.5;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .frame,#${id} .k',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .big',{x:-60,autoAlpha:0,duration:0.36,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .v',{innerText:0,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .dim',{scaleX:0.6,autoAlpha:0,transformOrigin:'center',duration:0.3},0.4);\n` +
        `tl.from('#${id} .ln',{scaleX:0,transformOrigin:'left center',duration:0.26},0.5);\n` +
        `tl.from('#${id} .dot,#${id} .note,#${id} .dwg',{autoAlpha:0,duration:0.25},0.6);`,
    ),
  'chart': () =>
    mk(
      'bp_bar',
      'chart',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="h">季度增速 <span>FIG.03</span></div>
  <div class="plot">
    <div class="b" style="height:170px"></div><div class="b" style="height:300px"></div><div class="b" style="height:230px"></div><div class="b hot" style="height:470px"><em>×4.2</em></div>
  </div>
</div>
<style>${bpRoot(id)}
#${id} .h{position:absolute;left:150px;top:150px;font-size:78px;font-weight:800;display:flex;align-items:baseline;gap:36px;}
#${id} .h span{font-family:var(--font-num);font-size:34px;letter-spacing:0.3em;color:var(--accent);}
#${id} .plot{position:absolute;left:150px;right:150px;bottom:170px;display:flex;align-items:flex-end;gap:110px;border-bottom:3px solid var(--fg);padding:0 70px;}
#${id} .b{position:relative;width:160px;border:3px solid var(--fg);border-bottom:none;}
#${id} .b.hot{background:repeating-linear-gradient(45deg,var(--accent) 0 10px,transparent 10px 24px);border-color:var(--accent);}
#${id} .b em{position:absolute;top:-72px;left:50%;transform:translateX(-50%);font-style:normal;font-family:var(--font-num);font-size:50px;font-weight:700;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .frame,#${id} .h',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .b',{scaleY:0,transformOrigin:'bottom',duration:0.38,stagger:0.1,ease:'power3.out'},0.15);\n` +
        `tl.from('#${id} .b em',{autoAlpha:0,duration:0.22},0.7);`,
    ),
  'trend': () =>
    mk(
      'bp_trd',
      'trend',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="h">增长轨迹 <span>PROJECTED</span></div>
  <svg viewBox="0 0 1620 560" class="tr">
    <polyline class="ln" points="30,470 420,390 810,420 1180,180"/>
    <polyline class="proj" points="1180,180 1560,60"/>
    <g class="nd"><circle cx="30" cy="470" r="10"/><circle cx="420" cy="390" r="10"/><circle cx="810" cy="420" r="10"/><circle cx="1180" cy="180" r="14"/></g>
  </svg>
</div>
<style>${bpRoot(id)}
#${id} .h{position:absolute;left:150px;top:150px;font-size:78px;font-weight:800;display:flex;align-items:baseline;gap:36px;}
#${id} .h span{font-family:var(--font-num);font-size:34px;letter-spacing:0.3em;color:var(--muted);}
#${id} .tr{position:absolute;left:150px;right:150px;bottom:130px;width:1620px;height:560px;}
#${id} .ln{fill:none;stroke:var(--accent);stroke-width:8;stroke-dasharray:2200;stroke-dashoffset:2200;}
#${id} .proj{fill:none;stroke:var(--muted);stroke-width:6;stroke-dasharray:26 22;}
#${id} .nd circle{fill:var(--paper);stroke:var(--accent);stroke-width:6;}
</style>`,
      (id) =>
        `tl.from('#${id} .frame,#${id} .h',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.to('#${id} .ln',{strokeDashoffset:0,duration:0.7,ease:'power2.inOut'},0.15);\n` +
        `tl.from('#${id} .proj',{autoAlpha:0,duration:0.4},0.8);\n` +
        `tl.from('#${id} .nd circle',{scale:0,transformOrigin:'center',duration:0.2,stagger:0.08},0.3);`,
    ),
  'list': () =>
    mk(
      'bp_lst',
      'list',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="tbl">
    <div class="cap">SPEC — 三个要点</div>
    <div class="r"><span>01</span><b>先说结论,再给理由</b><i>PASS</i></div>
    <div class="r"><span>02</span><b>每个论点配一张图</b><i>PASS</i></div>
    <div class="r"><span>03</span><b>结尾回扣开场钩子</b><i>HOLD</i></div>
  </div>
</div>
<style>${bpRoot(id)}
#${id} .tbl{position:absolute;left:150px;right:150px;top:50%;transform:translateY(-50%);border:3px solid var(--fg);}
#${id} .cap{padding:30px 44px;border-bottom:3px solid var(--fg);font-family:var(--font-num);font-size:38px;letter-spacing:0.24em;color:var(--accent);}
#${id} .r{display:flex;align-items:center;gap:48px;padding:38px 44px;border-bottom:2px solid var(--line);font-size:56px;}
#${id} .r:last-child{border-bottom:none;}
#${id} .r span{font-family:var(--font-num);font-size:42px;color:var(--muted);}
#${id} .r b{font-weight:600;flex:1;}
#${id} .r i{font-style:normal;font-family:var(--font-num);font-size:32px;letter-spacing:0.2em;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .frame',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .tbl',{y:40,autoAlpha:0,duration:0.3,ease:'power2.out'},0.1);\n` +
        `tl.from('#${id} .r',{autoAlpha:0,duration:0.22,stagger:0.1},0.3);`,
    ),
  'chapters': () =>
    mk(
      'bp_sec',
      'chapters',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="tabs">
    <div class="tab"><span>SEC.01</span><b>开场</b></div>
    <div class="tab on"><i class="fill"></i><span>SEC.02</span><b>方法</b></div>
    <div class="tab"><span>SEC.03</span><b>实操</b></div>
  </div>
  <div class="cur">
    <div class="ck">CURRENT SECTION</div>
    <div class="h">先框架,后细节</div>
    <div class="dim"><i></i><b>2 / 3</b><i></i></div>
  </div>
  <div class="dwg"><span>SEC-02</span><span>SHEET 2/3</span><span>REV A</span></div>
</div>
<style>${bpRoot(id)}
#${id} .tabs{position:absolute;left:150px;right:150px;top:150px;display:flex;gap:40px;}
#${id} .tab{position:relative;flex:1;border:2px solid var(--line);padding:34px 44px;display:flex;align-items:baseline;gap:30px;overflow:hidden;}
#${id} .tab span{position:relative;font-family:var(--font-num);font-size:32px;letter-spacing:0.2em;color:var(--muted);}
#${id} .tab b{position:relative;font-size:46px;font-weight:700;color:var(--muted);}
#${id} .tab.on{border:3px solid var(--accent);}
#${id} .tab.on span{color:var(--accent);}
#${id} .tab.on b{color:var(--fg);}
#${id} .fill{position:absolute;inset:0;background:repeating-linear-gradient(45deg,var(--accent) 0 10px,transparent 10px 24px);opacity:0.25;}
#${id} .cur{position:absolute;left:150px;right:150px;top:46%;display:flex;flex-direction:column;gap:56px;}
#${id} .ck{font-family:var(--font-num);font-size:34px;letter-spacing:0.3em;color:var(--muted);}
#${id} .h{font-size:150px;font-weight:900;letter-spacing:-0.02em;}
#${id} .dim{display:flex;align-items:center;gap:20px;color:var(--muted);}
#${id} .dim i{flex:1;height:0;border-top:2px dashed var(--line);position:relative;}
#${id} .dim i::before,#${id} .dim i::after{content:'';position:absolute;top:-9px;width:2px;height:20px;background:var(--line);}
#${id} .dim i::before{left:0}#${id} .dim i::after{right:0}
#${id} .dim b{font-family:var(--font-num);font-size:32px;font-weight:500;letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .frame',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .tab',{y:-30,autoAlpha:0,duration:0.26,stagger:0.08},0.08);\n` +
        `tl.from('#${id} .fill',{scaleX:0,transformOrigin:'left center',duration:0.34,ease:'power2.out'},0.34);\n` +
        `tl.from('#${id} .ck',{x:-30,autoAlpha:0,duration:0.24},0.4);\n` +
        `tl.from('#${id} .h',{y:46,autoAlpha:0,duration:0.34,ease:'power3.out'},0.48);\n` +
        `tl.from('#${id} .dim,#${id} .dwg',{autoAlpha:0,duration:0.28},0.72);`,
    ),
  'code': () =>
    mk(
      'bp_cod',
      'code',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="win">
    <div class="cap"><span>SRC — hook.js</span><span>UTF-8</span></div>
    <div class="r"><span>01</span><em class="cm">// 开场 3 秒,留人或劝退</em></div>
    <div class="r"><span>02</span><em><b>const</b> hook = boldClaim()</em></div>
    <div class="r hl"><i class="hf"></i><span>03</span><em>video.<b>open</b>(hook, { maxSec: 3 })</em></div>
    <div class="r"><span>04</span><em>caption.<b>set</b>('看到最后有彩蛋')</em></div>
  </div>
  <div class="lead"><span class="dot"></span><span class="lw"></span><span class="note">完播率在这一行定生死<br/>L03 · CRITICAL</span></div>
  <div class="dwg"><span>SRC-03</span><span>REV B</span></div>
</div>
<style>${bpRoot(id)}
#${id} .win{position:absolute;left:150px;top:50%;transform:translateY(-52%);width:1000px;border:3px solid var(--fg);}
#${id} .cap{display:flex;justify-content:space-between;padding:28px 40px;border-bottom:3px solid var(--fg);font-family:var(--font-num);font-size:34px;letter-spacing:0.2em;}
#${id} .cap span:first-child{color:var(--accent);}
#${id} .cap span:last-child{color:var(--muted);}
#${id} .r{position:relative;display:flex;align-items:baseline;gap:34px;padding:30px 40px;border-bottom:2px solid var(--line);font-family:var(--font-num);font-size:42px;}
#${id} .r:last-child{border-bottom:none;}
#${id} .r span{position:relative;font-size:32px;color:var(--muted);}
#${id} .r em{position:relative;font-style:normal;letter-spacing:0.02em;}
#${id} .r em b{color:var(--accent);font-weight:700;}
#${id} .cm{color:var(--muted);}
#${id} .r.hl{outline:3px solid var(--accent);outline-offset:-3px;}
#${id} .hf{position:absolute;inset:0;background:repeating-linear-gradient(45deg,var(--accent) 0 10px,transparent 10px 24px);opacity:0.18;}
#${id} .lead{position:absolute;left:1210px;top:614px;display:flex;align-items:flex-start;}
#${id} .dot{width:16px;height:16px;border-radius:999px;background:var(--accent);margin-top:8px;}
#${id} .lw{width:120px;height:2px;background:var(--line);margin-top:15px;}
#${id} .note{padding-left:26px;font-family:var(--font-num);font-size:30px;line-height:1.6;color:var(--muted);letter-spacing:0.08em;}
</style>`,
      (id) =>
        `tl.from('#${id} .frame',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .win',{y:40,autoAlpha:0,duration:0.3,ease:'power2.out'},0.08);\n` +
        `tl.from('#${id} .r',{autoAlpha:0,duration:0.2,stagger:0.08},0.24);\n` +
        `tl.from('#${id} .hf',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.out'},0.6);\n` +
        `tl.from('#${id} .lw',{scaleX:0,transformOrigin:'left center',duration:0.26},0.72);\n` +
        `tl.from('#${id} .dot,#${id} .note,#${id} .dwg',{autoAlpha:0,duration:0.25},0.85);`,
    ),
  'quote': () =>
    mk(
      'bp_qte',
      'quote',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="body">
    <div class="dim"><i></i><b>SPEC — QUOTE</b><i></i></div>
    <div class="t">结构,是给观众的礼貌</div>
    <div class="dim"><i></i><b>VERIFIED</b><i></i></div>
    <div class="lead"><span class="dot"></span><span class="ln"></span><span class="note">SOURCE: 口播 02'14"</span></div>
  </div>
  <div class="dwg"><span>QTE-05</span><span>REV A</span></div>
</div>
<style>${bpRoot(id)}
#${id} .body{position:absolute;left:150px;right:150px;top:50%;transform:translateY(-54%);display:flex;flex-direction:column;gap:56px;}
#${id} .dim{display:flex;align-items:center;gap:22px;color:var(--muted);}
#${id} .dim i{flex:1;height:0;border-top:2px dashed var(--line);position:relative;}
#${id} .dim i::before,#${id} .dim i::after{content:'';position:absolute;top:-9px;width:2px;height:20px;background:var(--line);}
#${id} .dim i::before{left:0}#${id} .dim i::after{right:0}
#${id} .dim b{font-family:var(--font-num);font-size:32px;font-weight:500;letter-spacing:0.3em;color:var(--accent);}
#${id} .t{font-size:120px;font-weight:800;letter-spacing:-0.01em;text-align:center;}
#${id} .lead{display:flex;align-items:flex-start;justify-content:flex-end;margin-top:6px;}
#${id} .dot{width:16px;height:16px;border-radius:999px;background:var(--accent);margin-top:8px;}
#${id} .ln{width:170px;height:2px;background:var(--line);margin-top:15px;}
#${id} .note{padding-left:26px;font-family:var(--font-num);font-size:34px;line-height:1.5;color:var(--muted);letter-spacing:0.12em;}
</style>`,
      (id) =>
        `tl.from('#${id} .frame',{autoAlpha:0,duration:0.3},0);\n` +
        `tl.from('#${id} .dim',{scaleX:0.6,autoAlpha:0,transformOrigin:'center',duration:0.3},0.1);\n` +
        `tl.from('#${id} .t',{y:40,autoAlpha:0,duration:0.34,ease:'power3.out'},0.22);\n` +
        `tl.from('#${id} .ln',{scaleX:0,transformOrigin:'left center',duration:0.26},0.5);\n` +
        `tl.from('#${id} .dot,#${id} .note,#${id} .dwg',{autoAlpha:0,duration:0.25},0.62);`,
    ),
  'qa': () =>
    mk(
      'bp_qa',
      'qa',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="q"><span class="dot"></span><span class="lw"></span><span class="tag">FIG.Q1</span><span class="qt">为什么你的视频没人看完?</span></div>
  <div class="ans">
    <div class="cap">ANSWER — VERIFIED</div>
    <div class="a">不是内容差,是结构乱</div>
  </div>
  <div class="dwg"><span>QA-01</span><span>FIG.Q1</span><span>REV A</span></div>
</div>
<style>${bpRoot(id)}
#${id} .q{position:absolute;left:150px;top:230px;display:flex;align-items:center;}
#${id} .dot{width:16px;height:16px;border-radius:999px;background:var(--accent);flex:none;}
#${id} .lw{width:140px;height:2px;background:var(--line);flex:none;}
#${id} .tag{font-family:var(--font-num);font-size:34px;letter-spacing:0.24em;color:var(--accent);padding:0 34px 0 26px;flex:none;}
#${id} .qt{font-size:56px;font-weight:600;}
#${id} .ans{position:absolute;left:150px;right:150px;top:42%;border:3px solid var(--fg);}
#${id} .cap{padding:28px 44px;border-bottom:3px solid var(--fg);font-family:var(--font-num);font-size:34px;letter-spacing:0.24em;color:var(--accent);}
#${id} .a{padding:96px 60px;font-size:110px;font-weight:800;letter-spacing:-0.01em;text-align:center;}
</style>`,
      (id) =>
        `tl.from('#${id} .frame',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .dot',{scale:0,duration:0.2},0.08);\n` +
        `tl.from('#${id} .lw',{scaleX:0,transformOrigin:'left center',duration:0.26},0.12);\n` +
        `tl.from('#${id} .tag,#${id} .qt',{x:-24,autoAlpha:0,duration:0.26},0.3);\n` +
        `tl.from('#${id} .ans',{autoAlpha:0,duration:0.26},0.55);\n` +
        `tl.from('#${id} .a',{y:40,autoAlpha:0,duration:0.32,ease:'power3.out'},0.68);\n` +
        `tl.from('#${id} .dwg',{autoAlpha:0,duration:0.24},0.9);`,
    ),
  'cta': () =>
    mk(
      'bp_cta',
      'cta',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="k">FIG.06 — CALL TO ACTION</div>
  <div class="wrap">
    <div class="btn"><i class="fill"></i><b>关注</b></div>
    <i class="x xtl">+</i><i class="x xbr">+</i>
    <div class="w"><i></i><b>W 640</b><i></i></div>
    <div class="hd"><i></i><b>H 220</b><i></i></div>
  </div>
  <div class="note">PRESS TO FOLLOW · NEXT EPISODE</div>
  <div class="dwg"><span>CTA-01</span><span>SCALE 1:1</span></div>
</div>
<style>${bpRoot(id)}
#${id} .k{position:absolute;left:150px;top:150px;font-family:var(--font-num);font-size:36px;letter-spacing:0.34em;color:var(--accent);}
#${id} .wrap{position:absolute;left:50%;top:50%;transform:translate(-50%,-56%);width:640px;height:220px;}
#${id} .btn{position:absolute;inset:0;border:3px solid var(--accent);display:flex;align-items:center;justify-content:center;overflow:hidden;}
#${id} .fill{position:absolute;inset:0;background:repeating-linear-gradient(45deg,var(--accent) 0 10px,transparent 10px 24px);opacity:0.3;}
#${id} .btn b{position:relative;font-size:84px;font-weight:800;letter-spacing:0.24em;padding-left:0.24em;}
#${id} .x{position:absolute;font-style:normal;font-family:var(--font-num);font-size:52px;color:var(--accent);line-height:1;}
#${id} .x.xtl{left:-72px;top:-66px;}
#${id} .x.xbr{right:-72px;bottom:-66px;}
#${id} .w{position:absolute;left:0;right:0;top:calc(100% + 44px);display:flex;align-items:center;gap:20px;color:var(--muted);}
#${id} .w i{flex:1;height:0;border-top:2px dashed var(--line);position:relative;}
#${id} .w i::before,#${id} .w i::after{content:'';position:absolute;top:-9px;width:2px;height:20px;background:var(--line);}
#${id} .w i::before{left:0}#${id} .w i::after{right:0}
#${id} .w b,#${id} .hd b{font-family:var(--font-num);font-size:30px;font-weight:500;letter-spacing:0.14em;}
#${id} .hd{position:absolute;left:calc(100% + 44px);top:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:16px;color:var(--muted);}
#${id} .hd i{width:0;flex:1;border-left:2px dashed var(--line);position:relative;}
#${id} .hd i::before,#${id} .hd i::after{content:'';position:absolute;left:-9px;width:20px;height:2px;background:var(--line);}
#${id} .hd i::before{top:0}#${id} .hd i::after{bottom:0}
#${id} .note{position:absolute;left:50%;bottom:210px;transform:translateX(-50%);font-family:var(--font-num);font-size:34px;letter-spacing:0.26em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .frame,#${id} .k',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .btn',{autoAlpha:0,duration:0.26},0.12);\n` +
        `tl.from('#${id} .fill',{scaleX:0,transformOrigin:'left center',duration:0.4,ease:'power2.out'},0.26);\n` +
        `tl.from('#${id} .x',{scale:0,autoAlpha:0,duration:0.22,stagger:0.08},0.4);\n` +
        `tl.from('#${id} .w,#${id} .hd',{autoAlpha:0,duration:0.26},0.52);\n` +
        `tl.from('#${id} .note,#${id} .dwg',{autoAlpha:0,duration:0.26},0.66);`,
    ),
};

/* ================================================================
   Cream — sticker-candy dialect: tilted stickers, pills, dot accents
   ================================================================ */

const cream: Record<string, () => Block> = {
  'title-card': () =>
    mk(
      'cr_ttl',
      'title-card',
      (id) => `
<div class="rt">
  <div class="stick">
    <div class="h">外脆里糯的秘密</div>
    <div class="dots"><i></i><i></i><i></i></div>
  </div>
  <div class="badge">今日菜谱</div>
  <div class="pearl p1"></div><div class="pearl p2"></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
#${id} .stick{position:absolute;left:180px;right:220px;top:50%;transform:translateY(-52%) rotate(-2deg);background:var(--panel);border-radius:56px;box-shadow:var(--shadow);padding:120px 110px;display:flex;flex-direction:column;gap:54px;}
#${id} .h{font-size:150px;font-weight:800;letter-spacing:0.01em;}
#${id} .dots{display:flex;gap:26px;}
#${id} .dots i{width:26px;height:26px;border-radius:999px;background:var(--accent);}
#${id} .dots i:nth-child(2){background:var(--accent-2);}
#${id} .dots i:nth-child(3){background:var(--panel-2);}
#${id} .badge{position:absolute;right:150px;top:190px;transform:rotate(6deg);background:var(--accent);color:#fff;font-size:48px;font-weight:800;padding:30px 56px;border-radius:999px;box-shadow:var(--glow);}
#${id} .pearl{position:absolute;border-radius:999px;background:var(--panel-2);}
#${id} .pearl.p1{width:120px;height:120px;left:90px;bottom:120px;}
#${id} .pearl.p2{width:64px;height:64px;right:130px;bottom:230px;background:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .stick',{y:70,autoAlpha:0,rotation:-6,duration:0.36,ease:'back.out(1.6)'},0);\n` +
        `tl.from('#${id} .badge',{scale:0,duration:0.3,ease:'back.out(2)'},0.24);\n` +
        `tl.from('#${id} .pearl',{scale:0,duration:0.25,stagger:0.08,ease:'back.out(2)'},0.3);`,
    ),
  'steps': () =>
    mk(
      'cr_stp',
      'steps',
      (id) => `
<div class="rt">
  <div class="c c1"><b>1</b><span>备料</span></div>
  <div class="c c2"><b>2</b><span>下锅</span></div>
  <div class="c c3"><b>3</b><span>出餐</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);font-family:var(--font-head);color:var(--fg);}
#${id} .c{position:absolute;top:50%;width:430px;padding:90px 0 70px;background:var(--panel);border-radius:48px;box-shadow:var(--shadow);display:flex;flex-direction:column;align-items:center;gap:30px;}
#${id} .c b{width:150px;height:150px;border-radius:999px;background:var(--panel-2);display:flex;align-items:center;justify-content:center;font-size:76px;font-weight:800;color:var(--accent);}
#${id} .c1 b{background:var(--accent);color:#fff;box-shadow:var(--glow);}
#${id} .c span{font-size:60px;font-weight:700;}
#${id} .c1{left:170px;transform:translateY(-50%) rotate(-5deg);}
#${id} .c2{left:50%;transform:translate(-50%,-56%);z-index:2;}
#${id} .c3{right:170px;transform:translateY(-50%) rotate(5deg);}
</style>`,
      (id) => `tl.from('#${id} .c',{y:90,autoAlpha:0,duration:0.34,stagger:0.12,ease:'back.out(1.7)'},0);`,
    ),
  'list': () =>
    mk(
      'cr_lst',
      'list',
      (id) => `
<div class="rt">
  <div class="h">食材清单</div>
  <div class="chips">
    <span class="chip a">糯米粉 200g</span><span class="chip">牛奶 150ml</span><span class="chip b">黄油 30g</span>
    <span class="chip">白糖 40g</span><span class="chip a">芝士碎 一把</span><span class="chip">盐 一撮</span>
  </div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:170px 180px;font-family:var(--font-head);color:var(--fg);display:flex;flex-direction:column;justify-content:center;gap:70px;}
#${id} .h{font-size:96px;font-weight:800;}
#${id} .chips{display:flex;flex-wrap:wrap;gap:34px;}
#${id} .chip{padding:34px 58px;border-radius:999px;background:var(--panel);box-shadow:var(--shadow);font-size:54px;font-weight:700;}
#${id} .chip.a{background:var(--accent);color:#fff;}
#${id} .chip.b{background:var(--accent-2);color:#fff;}
</style>`,
      (id) =>
        `tl.from('#${id} .h',{autoAlpha:0,y:30,duration:0.26},0);\n` +
        `tl.from('#${id} .chip',{scale:0,duration:0.26,stagger:0.07,ease:'back.out(1.8)'},0.12);`,
    ),
  'big-number': () =>
    mk(
      'cr_num',
      'big-number',
      (id) => `
<div class="rt">
  <div class="blob"><b>180°C</b><span>· 12 分钟 ·</span></div>
  <div class="spr s1"></div><div class="spr s2"></div><div class="spr s3"></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);font-family:var(--font-head);color:var(--fg);}
#${id} .blob{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-2deg);background:var(--panel);border-radius:44% 56% 52% 48% / 55% 46% 54% 45%;box-shadow:var(--shadow);width:1120px;height:660px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;}
#${id} .blob b{font-family:var(--font-num);font-size:230px;font-weight:800;color:var(--accent);letter-spacing:-0.03em;}
#${id} .blob span{font-size:56px;font-weight:700;color:var(--muted);}
#${id} .spr{position:absolute;border-radius:999px;}
#${id} .spr.s1{width:70px;height:70px;left:250px;top:200px;background:var(--accent-2);}
#${id} .spr.s2{width:44px;height:44px;right:290px;top:260px;background:var(--accent);}
#${id} .spr.s3{width:94px;height:94px;right:210px;bottom:170px;background:var(--panel-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .blob',{scale:0.6,autoAlpha:0,duration:0.38,ease:'back.out(1.5)'},0);\n` +
        `tl.from('#${id} .spr',{scale:0,duration:0.26,stagger:0.09,ease:'back.out(2)'},0.24);`,
    ),
  'count-up': () =>
    mk(
      'cr_prc',
      'count-up',
      (id) => `
<div class="rt">
  <div class="old"><span class="tag">原价</span><b>¥29.9</b><i class="strike"></i></div>
  <div class="save">立省 ¥10</div>
  <div class="blob">
    <div class="row"><i class="cur">¥</i><b class="v">19</b><i class="dec">.9</i></div>
    <span class="cap">今日到手价</span>
  </div>
  <div class="spr s1"></div><div class="spr s2"></div><div class="spr s3"></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);font-family:var(--font-head);color:var(--fg);}
#${id} .old{position:absolute;left:230px;top:150px;z-index:2;transform:rotate(-6deg);background:var(--panel);border-radius:36px;box-shadow:var(--shadow);padding:34px 52px;display:flex;align-items:baseline;gap:24px;}
#${id} .tag{font-size:34px;font-weight:700;color:var(--muted);}
#${id} .old b{font-family:var(--font-num);font-size:76px;font-weight:800;color:var(--muted);}
#${id} .strike{position:absolute;left:26px;right:26px;top:54%;height:12px;border-radius:999px;background:var(--fg);transform:rotate(-7deg);}
#${id} .save{position:absolute;right:210px;top:190px;z-index:2;transform:rotate(7deg);background:var(--accent-2);color:#fff;font-size:46px;font-weight:800;padding:28px 52px;border-radius:999px;box-shadow:var(--shadow);}
#${id} .blob{position:absolute;left:50%;top:55%;transform:translate(-50%,-50%) rotate(-2deg);background:var(--panel);border-radius:44% 56% 52% 48% / 55% 46% 54% 45%;box-shadow:var(--shadow);width:1120px;height:640px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;}
#${id} .row{display:flex;align-items:baseline;font-family:var(--font-num);color:var(--accent);}
#${id} .cur{font-style:normal;font-size:120px;font-weight:800;margin-right:16px;}
#${id} .v{font-size:250px;font-weight:800;line-height:1;letter-spacing:-0.03em;}
#${id} .dec{font-style:normal;font-size:150px;font-weight:800;}
#${id} .cap{font-size:52px;font-weight:700;color:var(--muted);}
#${id} .spr{position:absolute;border-radius:999px;}
#${id} .spr.s1{width:70px;height:70px;left:220px;bottom:200px;background:var(--accent-2);}
#${id} .spr.s2{width:44px;height:44px;right:300px;top:340px;background:var(--accent);}
#${id} .spr.s3{width:94px;height:94px;right:230px;bottom:160px;background:var(--panel-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .old',{y:-40,autoAlpha:0,rotation:-14,duration:0.3,ease:'back.out(1.7)'},0);\n` +
        `tl.from('#${id} .blob',{scale:0.6,autoAlpha:0,duration:0.38,ease:'back.out(1.5)'},0.08);\n` +
        `tl.from('#${id} .v',{innerText:29,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .strike',{scaleX:0,transformOrigin:'left center',duration:0.26,ease:'power2.out'},0.48);\n` +
        `tl.from('#${id} .save',{scale:0,duration:0.3,ease:'back.out(2)'},0.6);\n` +
        `tl.from('#${id} .spr',{scale:0,duration:0.26,stagger:0.09,ease:'back.out(2)'},0.66);`,
    ),
  'cta': () =>
    mk(
      'cr_cta',
      'cta',
      (id) => `
<div class="rt">
  <div class="t">收藏防丢 · 配方在评论区</div>
  <div class="btn">＋ 关注</div>
  <div class="hearts"><i>🧡</i><i>💛</i><i>🧡</i></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:64px;font-family:var(--font-head);color:var(--fg);}
#${id} .t{font-size:76px;font-weight:800;}
#${id} .btn{padding:48px 130px;border-radius:999px;background:var(--accent);color:#fff;font-size:80px;font-weight:800;box-shadow:var(--glow);transform:rotate(-1.5deg);}
#${id} .hearts{display:flex;gap:44px;font-size:64px;}
#${id} .hearts i{font-style:normal;display:inline-block;}
#${id} .hearts i:nth-child(1){transform:rotate(-12deg);}
#${id} .hearts i:nth-child(3){transform:rotate(12deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .t',{y:34,autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .btn',{scale:0.4,autoAlpha:0,duration:0.32,ease:'back.out(1.8)'},0.14);\n` +
        `tl.from('#${id} .hearts i',{y:40,autoAlpha:0,duration:0.26,stagger:0.08,ease:'back.out(2)'},0.34);`,
    ),
  'quote': () =>
    mk(
      'cr_qte',
      'quote',
      (id) => `
<div class="rt">
  <div class="stick">
    <div class="q">“外脆里糯,<b>一口上瘾</b>”</div>
    <div class="a">—— 今日试吃结论</div>
    <div class="dots"><i></i><i></i><i></i></div>
  </div>
  <div class="pearl p1"></div><div class="pearl p2"></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
#${id} .stick{position:absolute;left:210px;right:210px;top:50%;transform:translateY(-52%) rotate(2deg);background:var(--panel);border-radius:56px;box-shadow:var(--shadow);padding:110px 100px;display:flex;flex-direction:column;gap:48px;}
#${id} .q{font-size:108px;font-weight:800;line-height:1.35;}
#${id} .q b{color:var(--accent);}
#${id} .a{font-size:44px;font-weight:700;color:var(--muted);}
#${id} .dots{display:flex;gap:26px;}
#${id} .dots i{width:26px;height:26px;border-radius:999px;background:var(--accent);}
#${id} .dots i:nth-child(2){background:var(--accent-2);}
#${id} .dots i:nth-child(3){background:var(--panel-2);}
#${id} .pearl{position:absolute;border-radius:999px;background:var(--panel-2);}
#${id} .pearl.p1{width:100px;height:100px;left:110px;top:170px;}
#${id} .pearl.p2{width:70px;height:70px;right:130px;bottom:160px;background:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .stick',{y:70,autoAlpha:0,rotation:7,duration:0.36,ease:'back.out(1.6)'},0);\n` +
        `tl.from('#${id} .q b',{autoAlpha:0,duration:0.24},0.28);\n` +
        `tl.from('#${id} .dots i,#${id} .pearl',{scale:0,duration:0.25,stagger:0.07,ease:'back.out(2)'},0.32);`,
    ),
  'comments': () =>
    mk(
      'cr_cmt',
      'comments',
      (id) => `
<div class="rt">
  <div class="h">评论区炸了</div>
  <div class="cm c1"><span class="av a1">🍚</span><div class="tx"><b>干饭魁首</b><span class="say">拉丝那一下我直接空腹开冲</span></div><span class="lk hot">🧡 3.2k</span></div>
  <div class="cm c2"><span class="av a2">🧀</span><div class="tx"><b>芝士就是力量</b><span class="say">照着做了,出锅十分钟就被抢光</span></div><span class="lk">🧡 1.8k</span></div>
  <div class="cm c3"><span class="av a3">🌙</span><div class="tx"><b>深夜放毒署</b><span class="say">半夜刷到这个真的会饿哭</span></div><span class="lk">🧡 996</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);font-family:var(--font-head);color:var(--fg);}
#${id} .h{position:absolute;left:180px;top:120px;font-size:92px;font-weight:800;}
#${id} .cm{position:absolute;width:1240px;background:var(--panel);border-radius:44px;box-shadow:var(--shadow);padding:40px 52px;display:flex;align-items:center;gap:36px;}
#${id} .c1{left:200px;top:290px;transform:rotate(-3deg);}
#${id} .c2{left:440px;top:540px;transform:rotate(1.5deg);z-index:2;}
#${id} .c3{left:250px;top:790px;transform:rotate(-2deg);}
#${id} .av{width:110px;height:110px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:56px;flex:none;}
#${id} .a1{background:var(--accent-2);}
#${id} .a2{background:var(--panel-2);}
#${id} .a3{background:var(--accent-2);}
#${id} .tx{display:flex;flex-direction:column;gap:12px;flex:1;}
#${id} .tx b{font-size:38px;font-weight:800;color:var(--muted);}
#${id} .say{font-size:50px;font-weight:700;}
#${id} .lk{flex:none;background:var(--panel-2);border-radius:999px;padding:20px 36px;font-size:38px;font-weight:800;}
#${id} .lk.hot{background:var(--accent);color:#fff;box-shadow:var(--glow);}
</style>`,
      (id) =>
        `tl.from('#${id} .h',{autoAlpha:0,y:30,duration:0.26},0);\n` +
        `tl.from('#${id} .cm',{y:80,autoAlpha:0,rotation:5,duration:0.34,stagger:0.12,ease:'back.out(1.7)'},0.1);\n` +
        `tl.from('#${id} .lk',{scale:0,duration:0.26,stagger:0.1,ease:'back.out(2)'},0.5);`,
    ),
  'chart': () =>
    mk(
      'cr_bar',
      'chart',
      (id) => `
<div class="rt">
  <div class="h">全网人气打分</div>
  <div class="plot">
    <div class="b"><i class="top">7.8</i><i class="stem" style="height:200px"></i><span>原味</span></div>
    <div class="b"><i class="top">8.5</i><i class="stem" style="height:300px"></i><span>芝士</span></div>
    <div class="b hot"><i class="top">9.6</i><i class="stem" style="height:430px"></i><span>麻薯</span></div>
    <div class="b"><i class="top">8.1</i><i class="stem" style="height:250px"></i><span>抹茶</span></div>
  </div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);font-family:var(--font-head);color:var(--fg);}
#${id} .h{position:absolute;left:180px;top:140px;font-size:92px;font-weight:800;}
#${id} .plot{position:absolute;left:180px;right:180px;bottom:130px;display:flex;align-items:flex-end;justify-content:center;gap:150px;}
#${id} .b{display:flex;flex-direction:column;align-items:center;}
#${id} .top{font-style:normal;width:136px;height:136px;border-radius:999px;background:var(--panel-2);box-shadow:var(--shadow);display:flex;align-items:center;justify-content:center;font-family:var(--font-num);font-size:52px;font-weight:800;margin-bottom:-18px;position:relative;z-index:2;}
#${id} .stem{width:58px;border-radius:999px;background:var(--panel);box-shadow:var(--shadow);}
#${id} .b span{margin-top:28px;font-size:46px;font-weight:700;color:var(--muted);}
#${id} .b.hot .top{background:var(--accent);color:var(--paper);box-shadow:var(--glow);}
#${id} .b.hot .stem{background:var(--accent-2);}
#${id} .b.hot span{color:var(--fg);}
</style>`,
      (id) =>
        `tl.from('#${id} .h',{autoAlpha:0,y:30,duration:0.26},0);\n` +
        `tl.from('#${id} .stem',{scaleY:0,transformOrigin:'bottom',duration:0.32,stagger:0.09,ease:'power2.out'},0.1);\n` +
        `tl.from('#${id} .top',{scale:0,duration:0.28,stagger:0.09,ease:'back.out(1.8)'},0.28);\n` +
        `tl.from('#${id} .b span',{autoAlpha:0,duration:0.24},0.66);`,
    ),
};

/* ================================================================
   Biennale — constructivist-poster dialect: giant bleeding type, vertical text, reversed panels
   ================================================================ */

const biennale: Record<string, () => Block> = {
  'title-card': () =>
    mk(
      'bi_ttl',
      'title-card',
      (id) => `
<div class="rt">
  <div class="l1">把观点</div>
  <div class="l2">讲成画面</div>
  <div class="side">PIREEL BIENNALE — 2026</div>
  <div class="ft"><span>№01</span><span>OPENING</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);overflow:hidden;}
#${id} .l1{position:absolute;left:110px;top:70px;font-size:330px;font-weight:900;letter-spacing:-0.04em;line-height:1;}
#${id} .l2{position:absolute;left:110px;top:470px;font-size:330px;font-weight:900;letter-spacing:-0.04em;line-height:1.06;background:var(--fg);color:var(--paper);padding:0 40px 20px;}
#${id} .side{position:absolute;right:80px;top:70px;writing-mode:vertical-rl;font-family:var(--font-num);font-size:36px;letter-spacing:0.5em;color:var(--fg);}
#${id} .ft{position:absolute;left:110px;bottom:70px;right:110px;display:flex;justify-content:space-between;border-top:6px solid var(--fg);padding-top:26px;font-family:var(--font-num);font-size:40px;font-weight:700;letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .l1',{x:-140,autoAlpha:0,duration:0.3,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .l2',{x:140,autoAlpha:0,duration:0.3,ease:'power3.out'},0.12);\n` +
        `tl.from('#${id} .side,#${id} .ft',{autoAlpha:0,duration:0.26},0.34);`,
    ),
  'big-number': () =>
    mk(
      'bi_num',
      'big-number',
      (id) => `
<div class="rt">
  <div class="v">38</div>
  <div class="pct">%</div>
  <div class="lab">本月增长<br/>GROWTH INDEX</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-num);overflow:hidden;}
#${id} .v{position:absolute;left:60px;top:50%;transform:translateY(-50%);font-size:1050px;font-weight:800;line-height:1;letter-spacing:-0.08em;}
#${id} .pct{position:absolute;right:210px;top:120px;width:300px;height:300px;background:var(--fg);color:var(--paper);display:flex;align-items:center;justify-content:center;font-size:180px;font-weight:800;}
#${id} .lab{position:absolute;right:210px;bottom:130px;text-align:right;font-family:var(--font-head);font-size:52px;font-weight:800;line-height:1.5;border-right:14px solid var(--fg);padding-right:40px;}
</style>`,
      (id) =>
        `tl.from('#${id} .v',{y:180,autoAlpha:0,duration:0.36,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .pct',{scale:0,duration:0.28,ease:'power3.out'},0.2);\n` +
        `tl.from('#${id} .lab',{autoAlpha:0,duration:0.24},0.4);`,
    ),
  'count-up': () =>
    mk(
      'bi_cnt',
      'count-up',
      (id) => `
<div class="rt">
  <div class="cap">LIVE COUNT — EVIDENCE</div>
  <div class="big"><b class="v">3650</b><span class="u">条</span></div>
  <div class="claim">规律是拆出来的</div>
  <div class="side">DATA OVER TASTE — 2026</div>
  <div class="ft"><span>№04</span><span>COUNT</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);overflow:hidden;}
#${id} .cap{position:absolute;left:110px;top:80px;font-family:var(--font-num);font-size:40px;font-weight:700;letter-spacing:0.4em;}
#${id} .big{position:absolute;left:110px;top:44%;transform:translateY(-50%);display:flex;align-items:flex-end;gap:50px;}
#${id} .v{font-family:var(--font-num);font-size:460px;font-weight:800;line-height:1;letter-spacing:-0.05em;}
#${id} .u{background:var(--fg);color:var(--paper);font-size:120px;font-weight:900;line-height:1;padding:24px 44px;margin-bottom:44px;}
#${id} .claim{position:absolute;left:110px;bottom:250px;font-size:84px;font-weight:900;letter-spacing:-0.02em;}
#${id} .side{position:absolute;right:80px;top:80px;writing-mode:vertical-rl;font-family:var(--font-num);font-size:34px;letter-spacing:0.4em;}
#${id} .ft{position:absolute;left:110px;right:110px;bottom:70px;display:flex;justify-content:space-between;border-top:6px solid var(--fg);padding-top:26px;font-family:var(--font-num);font-size:40px;font-weight:700;letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.22},0);\n` +
        `tl.from('#${id} .big',{x:-140,autoAlpha:0,duration:0.32,ease:'power3.out'},0.06);\n` +
        `tl.from('#${id} .v',{innerText:0,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .u',{scale:0,duration:0.26,ease:'power3.out'},0.3);\n` +
        `tl.from('#${id} .claim',{x:-120,autoAlpha:0,duration:0.28,ease:'power3.out'},0.5);\n` +
        `tl.from('#${id} .side,#${id} .ft',{autoAlpha:0,duration:0.26},0.7);`,
    ),
  'compare': () =>
    mk(
      'bi_cmp',
      'compare',
      (id) => `
<div class="rt">
  <div class="half a"><span>老办法</span><b>3天</b></div>
  <div class="half b"><span>新办法</span><b>3小时</b></div>
  <div class="seam">VS</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);display:flex;font-family:var(--font-head);overflow:hidden;}
#${id} .half{flex:1;display:flex;flex-direction:column;justify-content:center;gap:30px;padding:0 110px;}
#${id} .half span{font-size:56px;font-weight:700;letter-spacing:0.2em;}
#${id} .half b{font-size:300px;font-weight:900;letter-spacing:-0.05em;line-height:1;}
#${id} .half.a{color:var(--fg);}
#${id} .half.b{background:var(--fg);color:var(--paper);align-items:flex-end;text-align:right;}
#${id} .seam{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-8deg);font-family:var(--font-num);font-size:110px;font-weight:800;background:var(--paper);border:10px solid var(--fg);padding:10px 44px;}
</style>`,
      (id) =>
        `tl.from('#${id} .half.a',{x:-160,autoAlpha:0,duration:0.3,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .half.b',{x:160,autoAlpha:0,duration:0.3,ease:'power3.out'},0.1);\n` +
        `tl.from('#${id} .seam',{scale:0,rotation:20,duration:0.3,ease:'back.out(1.8)'},0.32);`,
    ),
  'cta': () =>
    mk(
      'bi_cta',
      'cta',
      (id) => `
<div class="rt">
  <div class="plate"><span>关注</span><i>↗</i></div>
  <div class="strip">FOLLOW — NEXT EPISODE — FOLLOW — NEXT EPISODE —</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);font-family:var(--font-head);overflow:hidden;}
#${id} .plate{position:absolute;inset:110px 110px 250px;background:var(--fg);color:var(--paper);display:flex;align-items:center;justify-content:center;gap:60px;}
#${id} .plate span{font-size:340px;font-weight:900;letter-spacing:0.04em;}
#${id} .plate i{font-style:normal;font-size:300px;font-weight:900;color:var(--accent-2);-webkit-text-stroke:8px var(--paper);}
#${id} .strip{position:absolute;left:0;right:0;bottom:100px;white-space:nowrap;font-family:var(--font-num);font-size:44px;font-weight:700;letter-spacing:0.32em;color:var(--fg);border-top:6px solid var(--fg);border-bottom:6px solid var(--fg);padding:22px 40px;}
</style>`,
      (id) =>
        `tl.from('#${id} .plate',{y:-120,autoAlpha:0,duration:0.32,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .plate i',{x:60,y:60,autoAlpha:0,duration:0.3,ease:'power2.out'},0.24);\n` +
        `tl.from('#${id} .strip',{x:200,autoAlpha:0,duration:0.4,ease:'power2.out'},0.3);`,
    ),
  'list': () =>
    mk(
      'bi_lst',
      'list',
      (id) => `
<div class="rt">
  <div class="cap">MANIFESTO</div>
  <div class="r"><span>01</span><b>先说结论</b></div>
  <div class="r inv"><span>02</span><b>一图一论点</b></div>
  <div class="r"><span>03</span><b>回扣钩子</b></div>
  <div class="ft"><span>№03</span><span>INDEX</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:80px 110px;color:var(--fg);font-family:var(--font-head);overflow:hidden;display:flex;flex-direction:column;}
#${id} .cap{font-family:var(--font-num);font-size:40px;font-weight:700;letter-spacing:0.4em;padding-bottom:26px;}
#${id} .r{flex:1;display:flex;align-items:center;gap:70px;border-top:6px solid var(--fg);}
#${id} .r span{font-family:var(--font-num);font-size:60px;font-weight:700;}
#${id} .r b{font-size:168px;font-weight:900;letter-spacing:-0.04em;line-height:1;white-space:nowrap;}
#${id} .r.inv{background:var(--fg);color:var(--paper);margin:0 -110px;padding:0 110px;}
#${id} .ft{display:flex;justify-content:space-between;border-top:6px solid var(--fg);padding-top:24px;font-family:var(--font-num);font-size:40px;font-weight:700;letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.22},0);\n` +
        `tl.from('#${id} .r:not(.inv)',{x:-200,autoAlpha:0,duration:0.28,stagger:0.16,ease:'power3.out'},0.06);\n` +
        `tl.from('#${id} .r.inv',{x:200,autoAlpha:0,duration:0.28,ease:'power3.out'},0.2);\n` +
        `tl.from('#${id} .ft',{autoAlpha:0,duration:0.24},0.44);`,
    ),
  'chapters': () =>
    mk(
      'bi_sec',
      'chapters',
      (id) => `
<div class="rt">
  <div class="tabs">
    <div class="tab">第Ⅰ幕</div>
    <div class="tab on">第Ⅱ幕</div>
    <div class="tab">第Ⅲ幕</div>
  </div>
  <div class="h">亮出判断</div>
  <div class="side">BIENNALE — ACT Ⅱ</div>
  <div class="ft"><span>№02</span><span>ACT Ⅱ / Ⅲ</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);overflow:hidden;}
#${id} .tabs{position:absolute;left:110px;right:110px;top:70px;display:flex;border:6px solid var(--fg);}
#${id} .tab{flex:1;text-align:center;padding:34px 0;font-size:64px;font-weight:900;letter-spacing:0.06em;border-left:6px solid var(--fg);}
#${id} .tab:first-child{border-left:none;}
#${id} .tab.on{background:var(--fg);color:var(--paper);}
#${id} .h{position:absolute;left:110px;top:400px;font-size:330px;font-weight:900;letter-spacing:-0.04em;line-height:1;}
#${id} .side{position:absolute;right:80px;top:290px;writing-mode:vertical-rl;font-family:var(--font-num);font-size:34px;letter-spacing:0.4em;}
#${id} .ft{position:absolute;left:110px;right:110px;bottom:70px;display:flex;justify-content:space-between;border-top:6px solid var(--fg);padding-top:26px;font-family:var(--font-num);font-size:40px;font-weight:700;letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .tabs',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .tab',{y:-90,autoAlpha:0,duration:0.26,stagger:0.08,ease:'power3.out'},0.06);\n` +
        `tl.from('#${id} .h',{x:-160,autoAlpha:0,duration:0.3,ease:'power3.out'},0.32);\n` +
        `tl.from('#${id} .side,#${id} .ft',{autoAlpha:0,duration:0.26},0.56);`,
    ),
  'quote': () =>
    mk(
      'bi_qte',
      'quote',
      (id) => `
<div class="rt">
  <div class="l1">别追热点</div>
  <div class="l2"><em>做</em>热点</div>
  <div class="side">QUOTE · 摘自口播 02'14"</div>
  <div class="ft"><span>№05</span><span>QUOTE</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);overflow:hidden;}
#${id} .l1{position:absolute;left:110px;top:100px;font-size:290px;font-weight:900;letter-spacing:-0.05em;line-height:1;white-space:nowrap;}
#${id} .l2{position:absolute;left:110px;top:460px;font-size:330px;font-weight:900;letter-spacing:-0.05em;line-height:1;white-space:nowrap;display:flex;align-items:center;gap:30px;}
#${id} .l2 em{font-style:normal;background:var(--fg);color:var(--paper);padding:0 36px 20px;}
#${id} .side{position:absolute;right:80px;top:80px;writing-mode:vertical-rl;font-family:var(--font-num);font-size:34px;letter-spacing:0.4em;}
#${id} .ft{position:absolute;left:110px;right:110px;bottom:70px;display:flex;justify-content:space-between;border-top:6px solid var(--fg);padding-top:26px;font-family:var(--font-num);font-size:40px;font-weight:700;letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .l1',{x:-160,autoAlpha:0,duration:0.28,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .l2',{x:160,autoAlpha:0,duration:0.28,ease:'power3.out'},0.12);\n` +
        `tl.from('#${id} .l2 em',{scale:1.5,autoAlpha:0,duration:0.24,ease:'power3.in'},0.4);\n` +
        `tl.from('#${id} .side,#${id} .ft',{autoAlpha:0,duration:0.26},0.6);`,
    ),
};

/* ================================================================
   Noir — fashion-editorial dialect: centered, hairline gold frame, serif, wide tracking
   ================================================================ */

const noirFrame = (id: string) => `
#${id} .nf{position:absolute;inset:70px;border:1px solid var(--accent-2);}
#${id} .nf::before{content:'';position:absolute;inset:14px;border:1px solid var(--line);}`;

const noir: Record<string, () => Block> = {
  'title-card': () =>
    mk(
      'nr_ttl',
      'title-card',
      (id) => `
<div class="rt"><div class="nf"></div>
  <div class="k">COLLECTION · 2026</div>
  <div class="h">质感的答案</div>
  <div class="orn"><i></i><b>◆</b><i></i></div>
  <div class="f">PIREEL MAISON</div>
</div>
<style>${noirFrame(id)}
#${id} .rt{position:absolute;inset:0;background:var(--paper);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:56px;color:var(--fg);font-family:var(--font-head);text-align:center;}
#${id} .k{font-size:34px;letter-spacing:0.72em;color:var(--accent);padding-left:0.72em;}
#${id} .h{font-size:170px;font-weight:700;letter-spacing:0.08em;}
#${id} .orn{display:flex;align-items:center;gap:34px;color:var(--accent);}
#${id} .orn i{width:150px;height:1px;background:var(--accent-2);}
#${id} .orn b{font-size:30px;}
#${id} .f{font-size:28px;letter-spacing:0.5em;color:var(--muted);padding-left:0.5em;}
</style>`,
      (id) =>
        `tl.from('#${id} .nf',{autoAlpha:0,duration:0.5},0);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,y:-16,duration:0.4},0.15);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,duration:0.55},0.3);\n` +
        `tl.from('#${id} .orn,#${id} .f',{autoAlpha:0,duration:0.4},0.55);`,
    ),
  'quote': () =>
    mk(
      'nr_qte',
      'quote',
      (id) => `
<div class="rt"><div class="nf"></div>
  <div class="q">“</div>
  <div class="t">贵的东西,<br/>只有一个缺点</div>
  <div class="a">— 本期金句</div>
</div>
<style>${noirFrame(id)}
#${id} .rt{position:absolute;inset:0;background:var(--paper);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;color:var(--fg);font-family:var(--font-head);text-align:center;}
#${id} .q{font-size:260px;line-height:0.35;height:100px;color:var(--accent);font-weight:400;}
#${id} .t{font-size:120px;font-weight:600;font-style:italic;line-height:1.4;letter-spacing:0.04em;}
#${id} .a{margin-top:26px;font-size:34px;letter-spacing:0.4em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .nf',{autoAlpha:0,duration:0.5},0);\n` +
        `tl.from('#${id} .q',{autoAlpha:0,y:-30,duration:0.45},0.15);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,duration:0.6},0.3);\n` +
        `tl.from('#${id} .a',{autoAlpha:0,duration:0.4},0.6);`,
    ),
  'big-number': () =>
    mk(
      'nr_num',
      'big-number',
      (id) => `
<div class="rt"><div class="nf"></div>
  <div class="k">LIMITED TO</div>
  <div class="v">399</div>
  <div class="u"><i></i>件 · 全球<i></i></div>
</div>
<style>${noirFrame(id)}
#${id} .rt{position:absolute;inset:0;background:var(--paper);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px;color:var(--fg);font-family:var(--font-head);}
#${id} .k{font-size:32px;letter-spacing:0.66em;color:var(--muted);padding-left:0.66em;}
#${id} .v{font-size:430px;font-weight:400;line-height:1;color:var(--accent);letter-spacing:0.02em;}
#${id} .u{display:flex;align-items:center;gap:36px;font-size:44px;letter-spacing:0.3em;}
#${id} .u i{width:110px;height:1px;background:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .nf',{autoAlpha:0,duration:0.5},0);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.4},0.15);\n` +
        `tl.from('#${id} .v',{autoAlpha:0,letterSpacing:'0.3em',duration:0.6,ease:'power2.out'},0.25);\n` +
        `tl.from('#${id} .u',{autoAlpha:0,duration:0.4},0.6);`,
    ),
  'countdown': () =>
    mk(
      'nr_cnt',
      'countdown',
      (id) => `
<div class="rt"><div class="nf"></div>
  <div class="k">LIMITED DROP</div>
  <div class="cd"><b class="v">72</b><span class="u">小时</span></div>
  <div class="l"><i></i><span>发售当夜 · 不见不散</span><i></i></div>
  <div class="f">MMXXVI · MAISON PIREEL</div>
</div>
<style>${noirFrame(id)}
#${id} .rt{position:absolute;inset:0;background:var(--paper);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:44px;color:var(--fg);font-family:var(--font-head);}
#${id} .k{font-size:32px;letter-spacing:0.66em;color:var(--muted);padding-left:0.66em;}
#${id} .cd{display:flex;align-items:baseline;gap:44px;}
#${id} .v{font-size:400px;font-weight:400;line-height:1;color:var(--accent);letter-spacing:0.02em;}
#${id} .u{font-size:44px;letter-spacing:0.5em;}
#${id} .l{display:flex;align-items:center;gap:36px;font-size:38px;letter-spacing:0.3em;}
#${id} .l i{width:130px;height:1px;background:var(--accent-2);}
#${id} .f{font-size:28px;letter-spacing:0.5em;color:var(--muted);padding-left:0.5em;}
</style>`,
      (id) =>
        `tl.from('#${id} .nf',{autoAlpha:0,duration:0.5},0);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.4},0.15);\n` +
        `tl.from('#${id} .cd',{autoAlpha:0,duration:0.5},0.2);\n` +
        `tl.from('#${id} .v',{innerText:96,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .l i',{scaleX:0,transformOrigin:'center',duration:0.5,ease:'power1.out'},0.4);\n` +
        `tl.from('#${id} .l span',{autoAlpha:0,duration:0.4},0.55);\n` +
        `tl.from('#${id} .f',{autoAlpha:0,duration:0.4},0.7);`,
    ),
  'cta': () =>
    mk(
      'nr_cta',
      'cta',
      (id) => `
<div class="rt"><div class="nf"></div>
  <div class="k">JOIN THE HOUSE</div>
  <div class="btn">关 注</div>
  <div class="f">下一支影片 · 不见不散</div>
</div>
<style>${noirFrame(id)}
#${id} .rt{position:absolute;inset:0;background:var(--paper);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:60px;color:var(--fg);font-family:var(--font-head);}
#${id} .k{font-size:32px;letter-spacing:0.6em;color:var(--muted);padding-left:0.6em;}
#${id} .btn{padding:44px 150px;border:1px solid var(--accent);color:var(--accent);font-size:76px;letter-spacing:0.5em;padding-left:calc(150px + 0.5em);}
#${id} .f{font-size:34px;letter-spacing:0.2em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .nf',{autoAlpha:0,duration:0.5},0);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.4},0.15);\n` +
        `tl.from('#${id} .btn',{autoAlpha:0,scale:0.96,duration:0.5,ease:'power1.out'},0.3);\n` +
        `tl.from('#${id} .f',{autoAlpha:0,duration:0.4},0.6);`,
    ),
  'compare': () =>
    mk(
      'nr_cmp',
      'compare',
      (id) => `
<div class="rt"><div class="nf"></div>
  <div class="k">SIDE BY SIDE</div>
  <div class="cols">
    <div class="c"><span class="n">经典系列</span><b class="v">3,200</b><span class="s">CLASSIC</span></div>
    <div class="sep"></div>
    <div class="c win"><i class="d">◆</i><span class="n">限定系列</span><b class="v">3,900</b><span class="s">LIMITED · 399</span></div>
  </div>
  <div class="f">MAISON PIREEL</div>
</div>
<style>${noirFrame(id)}
#${id} .rt{position:absolute;inset:0;background:var(--paper);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:64px;color:var(--fg);font-family:var(--font-head);text-align:center;}
#${id} .k{font-size:32px;letter-spacing:0.6em;color:var(--muted);padding-left:0.6em;}
#${id} .cols{display:flex;align-items:center;gap:110px;}
#${id} .c{width:560px;display:flex;flex-direction:column;align-items:center;gap:36px;position:relative;}
#${id} .n{font-size:44px;letter-spacing:0.3em;padding-left:0.3em;}
#${id} .v{font-size:140px;font-weight:400;color:var(--accent);letter-spacing:0.02em;line-height:1;}
#${id} .win .v{font-size:180px;}
#${id} .s{font-size:28px;letter-spacing:0.5em;color:var(--muted);padding-left:0.5em;}
#${id} .d{position:absolute;top:-76px;left:50%;transform:translateX(-50%);font-style:normal;font-size:30px;color:var(--accent);}
#${id} .sep{width:1px;height:420px;background:var(--accent-2);}
#${id} .f{font-size:28px;letter-spacing:0.5em;color:var(--muted);padding-left:0.5em;}
</style>`,
      (id) =>
        `tl.from('#${id} .nf',{autoAlpha:0,duration:0.5},0);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.4},0.15);\n` +
        `tl.from('#${id} .sep',{scaleY:0,transformOrigin:'center',duration:0.5,ease:'power1.out'},0.2);\n` +
        `tl.from('#${id} .c,#${id} .f',{autoAlpha:0,duration:0.5,stagger:0.14},0.3);\n` +
        `tl.from('#${id} .d',{autoAlpha:0,y:-14,duration:0.4},0.75);`,
    ),
  'list': () =>
    mk(
      'nr_lst',
      'list',
      (id) => `
<div class="rt"><div class="nf"></div>
  <div class="k">LA CARTE</div>
  <div class="ls">
    <div class="r"><span>开场 · 一句钩子</span><i></i><b>Ⅰ</b></div>
    <div class="r"><span>主体 · 三个论点</span><i></i><b>Ⅱ</b></div>
    <div class="r"><span>收束 · 回扣开场</span><i></i><b>Ⅲ</b></div>
  </div>
  <div class="orn"><i></i><b>◆</b><i></i></div>
  <div class="f">MAISON PIREEL</div>
</div>
<style>${noirFrame(id)}
#${id} .rt{position:absolute;inset:0;background:var(--paper);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:60px;color:var(--fg);font-family:var(--font-head);}
#${id} .k{font-size:32px;letter-spacing:0.6em;color:var(--muted);padding-left:0.6em;}
#${id} .ls{width:1060px;display:flex;flex-direction:column;}
#${id} .r{display:flex;align-items:baseline;gap:44px;padding:42px 0;font-size:56px;font-weight:600;letter-spacing:0.08em;}
#${id} .r i{flex:1;border-bottom:2px dotted var(--line);transform:translateY(-16px);}
#${id} .r b{font-weight:400;font-size:52px;color:var(--accent);}
#${id} .orn{display:flex;align-items:center;gap:34px;color:var(--accent);}
#${id} .orn i{width:150px;height:1px;background:var(--accent-2);}
#${id} .orn b{font-size:30px;}
#${id} .f{font-size:28px;letter-spacing:0.5em;color:var(--muted);padding-left:0.5em;}
</style>`,
      (id) =>
        `tl.from('#${id} .nf',{autoAlpha:0,duration:0.5},0);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.4},0.15);\n` +
        `tl.from('#${id} .r',{autoAlpha:0,duration:0.45,stagger:0.14},0.25);\n` +
        `tl.from('#${id} .orn,#${id} .f',{autoAlpha:0,duration:0.4},0.75);`,
    ),
  'chapters': () =>
    mk(
      'nr_sec',
      'chapters',
      (id) => `
<div class="rt"><div class="nf"></div>
  <div class="k">SOMMAIRE</div>
  <div class="tabs">
    <span class="t">CHAPITRE Ⅰ</span><i class="sep"></i>
    <span class="t on"><i class="d">◆</i>CHAPITRE Ⅱ</span><i class="sep"></i>
    <span class="t">CHAPITRE Ⅲ</span>
  </div>
  <div class="h">材质的语言</div>
  <div class="f">MAISON PIREEL</div>
</div>
<style>${noirFrame(id)}
#${id} .rt{position:absolute;inset:0;background:var(--paper);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:60px;color:var(--fg);font-family:var(--font-head);text-align:center;}
#${id} .k{font-size:32px;letter-spacing:0.6em;color:var(--muted);padding-left:0.6em;}
#${id} .tabs{display:flex;align-items:center;gap:56px;}
#${id} .t{position:relative;font-size:30px;letter-spacing:0.42em;padding-left:0.42em;color:var(--muted);}
#${id} .t.on{color:var(--fg);}
#${id} .d{position:absolute;top:-64px;left:50%;transform:translateX(-50%);font-style:normal;font-size:28px;color:var(--accent);}
#${id} .sep{width:1px;height:44px;background:var(--accent-2);}
#${id} .h{font-size:150px;font-weight:700;letter-spacing:0.08em;}
#${id} .f{font-size:28px;letter-spacing:0.5em;color:var(--muted);padding-left:0.5em;}
</style>`,
      (id) =>
        `tl.from('#${id} .nf',{autoAlpha:0,duration:0.5},0);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.4},0.15);\n` +
        `tl.from('#${id} .sep',{scaleY:0,transformOrigin:'center',duration:0.4,ease:'power1.out'},0.2);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,duration:0.4,stagger:0.1},0.25);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,duration:0.55},0.45);\n` +
        `tl.from('#${id} .f',{autoAlpha:0,duration:0.4},0.6);\n` +
        `tl.from('#${id} .d',{autoAlpha:0,y:-12,duration:0.4},0.75);`,
    ),
};

/* ================================================================
   Journal — newspaper-front-page dialect: double-rule masthead, faux columns, red-pen annotations
   ================================================================ */

const jnFake = (n: number, w = 100): string =>
  Array.from({ length: n }, (_, i) => `<i style="width:${i === n - 1 ? 62 : w}%"></i>`).join('');

const journal: Record<string, () => Block> = {
  'title-card': () =>
    mk(
      'jn_ttl',
      'title-card',
      (id) => `
<div class="rt">
  <div class="mast"><span class="d">VOL.24</span><span class="m">视 频 日 报</span><span class="d">2026·07</span></div>
  <div class="h">把观点讲成画面</div>
  <div class="deck">本刊记者 · 三分钟看懂结构化表达</div>
  <div class="cols"><div class="col">${jnFake(6)}</div><div class="col">${jnFake(6)}</div><div class="col">${jnFake(6)}</div></div>
  <div class="stamp">头条</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:110px 150px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;gap:44px;}
#${id} .mast{display:flex;align-items:baseline;justify-content:space-between;border-bottom:6px double var(--fg);padding-bottom:26px;}
#${id} .m{font-size:60px;font-weight:900;letter-spacing:0.3em;}
#${id} .d{font-family:var(--font-num);font-size:30px;color:var(--muted);}
#${id} .h{font-size:150px;font-weight:900;line-height:1.05;text-align:center;}
#${id} .deck{text-align:center;font-size:40px;color:var(--muted);border-top:2px solid var(--line);border-bottom:2px solid var(--line);padding:20px 0;}
#${id} .cols{display:flex;gap:56px;flex:1;min-height:0;}
#${id} .col{flex:1;display:flex;flex-direction:column;gap:22px;border-right:2px solid var(--line);padding-right:56px;}
#${id} .col:last-child{border-right:none;padding-right:0;}
#${id} .col i{height:14px;background:var(--panel-2);display:block;}
#${id} .stamp{position:absolute;right:120px;top:280px;transform:rotate(9deg);border:6px solid var(--accent);color:var(--accent);font-size:56px;font-weight:900;padding:14px 34px;border-radius:8px;opacity:0.9;}
</style>`,
      (id) =>
        `tl.from('#${id} .mast',{autoAlpha:0,y:-24,duration:0.26},0);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,duration:0.32},0.12);\n` +
        `tl.from('#${id} .deck,#${id} .cols',{autoAlpha:0,duration:0.3},0.3);\n` +
        `tl.from('#${id} .stamp',{scale:1.7,autoAlpha:0,rotation:24,duration:0.3,ease:'power3.in'},0.5);`,
    ),
  'chapters': () =>
    mk(
      'jn_sec',
      'chapters',
      (id) => `
<div class="rt">
  <div class="nav">
    <div class="s"><b>要闻</b><i>P.01</i></div>
    <div class="s on"><b>深度</b><i>P.04</i><em class="ul"></em></div>
    <div class="s"><b>专栏</b><i>P.08</i></div>
  </div>
  <div class="h">完播率是设计出来的</div>
  <div class="cols"><div class="col">${jnFake(7)}</div><div class="col">${jnFake(7)}</div><div class="col">${jnFake(7)}</div></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:110px 150px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;gap:48px;}
#${id} .nav{display:flex;border-top:6px double var(--fg);border-bottom:2px solid var(--fg);}
#${id} .s{position:relative;flex:1;display:flex;align-items:baseline;justify-content:center;gap:26px;padding:36px 0 30px;border-right:2px solid var(--line);}
#${id} .s:last-child{border-right:none;}
#${id} .s b{font-size:54px;font-weight:900;letter-spacing:0.22em;padding-left:0.22em;color:var(--muted);}
#${id} .s i{font-style:normal;font-family:var(--font-num);font-size:30px;color:var(--muted);}
#${id} .s.on b{color:var(--fg);}
#${id} .s.on i{color:var(--accent);font-weight:700;}
#${id} .ul{position:absolute;left:22%;right:22%;bottom:0;height:10px;background:var(--accent);}
#${id} .h{font-size:120px;font-weight:900;line-height:1.1;text-align:center;}
#${id} .cols{display:flex;gap:56px;flex:1;min-height:0;}
#${id} .col{flex:1;display:flex;flex-direction:column;gap:22px;border-right:2px solid var(--line);padding-right:56px;}
#${id} .col:last-child{border-right:none;padding-right:0;}
#${id} .col i{height:14px;background:var(--panel-2);display:block;}
</style>`,
      (id) =>
        `tl.from('#${id} .nav',{autoAlpha:0,y:-24,duration:0.26},0);\n` +
        `tl.from('#${id} .s',{autoAlpha:0,duration:0.2,stagger:0.08},0.08);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.28,ease:'power2.out'},0.36);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,duration:0.32},0.46);\n` +
        `tl.from('#${id} .cols',{autoAlpha:0,duration:0.3},0.66);`,
    ),
  'list': () =>
    mk(
      'jn_lst',
      'list',
      (id) => `
<div class="rt">
  <div class="cap">本 期 要 目</div>
  <div class="r"><b>一</b><span>先说结论,再给理由</span><i>P.02</i></div>
  <div class="r"><b>二</b><span>每个论点配一张图</span><i>P.05</i></div>
  <div class="r"><b>三</b><span>结尾回扣开场钩子</span><i>P.09</i></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:170px 260px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;justify-content:center;gap:0;}
#${id} .cap{text-align:center;font-size:64px;font-weight:900;letter-spacing:0.4em;border-top:6px double var(--fg);border-bottom:2px solid var(--fg);padding:30px 0;margin-bottom:20px;}
#${id} .r{display:flex;align-items:baseline;gap:56px;padding:52px 10px;border-bottom:2px solid var(--line);font-size:64px;}
#${id} .r b{color:var(--accent);font-weight:900;}
#${id} .r span{flex:1;font-weight:600;}
#${id} .r i{font-style:normal;font-family:var(--font-num);font-size:38px;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .r',{autoAlpha:0,x:-40,duration:0.26,stagger:0.11},0.16);`,
    ),
  'compare': () =>
    mk(
      'jn_cmp',
      'compare',
      (id) => `
<div class="rt">
  <div class="cap">本报评测</div>
  <div class="tbl">
    <div class="tr th"><span></span><span>耗时</span><span>成本</span><span>结论</span></div>
    <div class="tr"><span>老办法</span><span>3 天</span><span>¥1200</span><span>—</span></div>
    <div class="tr win"><span>新办法</span><span>3 小时</span><span>¥90</span><span class="mark">推荐</span></div>
  </div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:150px 200px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;justify-content:center;gap:54px;}
#${id} .cap{font-size:76px;font-weight:900;border-left:none;text-align:center;letter-spacing:0.3em;}
#${id} .tbl{border-top:6px double var(--fg);border-bottom:6px double var(--fg);}
#${id} .tr{display:flex;border-bottom:2px solid var(--line);font-size:56px;}
#${id} .tr:last-child{border-bottom:none;}
#${id} .tr span{flex:1;padding:44px 30px;text-align:center;}
#${id} .tr span:first-child{text-align:left;font-weight:700;}
#${id} .th{font-size:40px;color:var(--muted);letter-spacing:0.2em;}
#${id} .th span{padding:26px 30px;}
#${id} .win{font-weight:700;}
#${id} .mark{position:relative;color:var(--accent);font-weight:900;}
#${id} .mark::after{content:'';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-4deg);width:170px;height:96px;border:5px solid var(--accent);border-radius:50%;}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.26},0);\n` +
        `tl.from('#${id} .tr',{autoAlpha:0,duration:0.24,stagger:0.1},0.14);\n` +
        `tl.from('#${id} .mark',{scale:1.4,duration:0.24,ease:'power3.in'},0.5);`,
    ),
  'quote': () =>
    mk(
      'jn_qte',
      'quote',
      (id) => `
<div class="rt">
  <div class="rule top"></div>
  <div class="dash">——</div>
  <div class="t">结构,是给观众的礼貌</div>
  <div class="a">摘自本期口播 · 02'14"</div>
  <div class="rule"></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:150px 240px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:44px;text-align:center;}
#${id} .rule{width:100%;height:10px;border-top:4px solid var(--fg);border-bottom:2px solid var(--fg);}
#${id} .dash{font-size:110px;font-weight:900;color:var(--accent);line-height:0.6;}
#${id} .t{font-size:128px;font-weight:800;line-height:1.3;}
#${id} .a{font-size:38px;color:var(--muted);font-family:var(--font-num);}
</style>`,
      (id) =>
        `tl.from('#${id} .rule',{scaleX:0,duration:0.34,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .dash',{autoAlpha:0,x:-40,duration:0.26},0.16);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,duration:0.34},0.26);\n` +
        `tl.from('#${id} .a',{autoAlpha:0,duration:0.26},0.5);`,
    ),
  'qa': () =>
    mk(
      'jn_qa',
      'qa',
      (id) => `
<div class="rt">
  <div class="cap">读 者 来 信</div>
  <div class="q"><b class="m qm">问</b><div class="qt">「为什么我的视频总在三秒被划走?」</div></div>
  <div class="ans"><b class="m am">答</b>
    <div class="ab">
      <div class="at">开场第一句就把结论亮出来,画面跟着上证据</div>
      <div class="fk">${jnFake(3)}</div>
      <div class="sig">—— 本报编辑部</div>
    </div>
  </div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:120px 240px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;gap:56px;}
#${id} .cap{text-align:center;font-size:56px;font-weight:900;letter-spacing:0.4em;padding-left:0.4em;border-top:6px double var(--fg);border-bottom:2px solid var(--fg);padding-top:26px;padding-bottom:26px;}
#${id} .q{display:flex;align-items:flex-start;gap:44px;}
#${id} .m{flex:none;width:96px;height:96px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:46px;font-weight:900;}
#${id} .qm{border:5px solid var(--accent);color:var(--accent);transform:rotate(-6deg);}
#${id} .am{border:4px solid var(--fg);}
#${id} .qt{flex:1;font-size:64px;font-weight:800;line-height:1.4;padding-top:4px;}
#${id} .ans{display:flex;align-items:flex-start;gap:44px;border-top:2px solid var(--line);padding-top:52px;}
#${id} .ab{flex:1;display:flex;flex-direction:column;gap:34px;}
#${id} .at{font-size:50px;font-weight:600;line-height:1.5;}
#${id} .fk{display:flex;flex-direction:column;gap:20px;}
#${id} .fk i{height:14px;background:var(--panel-2);display:block;}
#${id} .sig{text-align:right;font-family:var(--font-num);font-size:34px;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.26},0);\n` +
        `tl.from('#${id} .qt',{autoAlpha:0,x:-40,duration:0.28},0.12);\n` +
        `tl.from('#${id} .qm',{scale:1.7,autoAlpha:0,rotation:18,duration:0.28,ease:'power3.in'},0.3);\n` +
        `tl.from('#${id} .ans',{autoAlpha:0,duration:0.26},0.5);\n` +
        `tl.from('#${id} .at,#${id} .fk,#${id} .sig',{autoAlpha:0,y:20,duration:0.26,stagger:0.08},0.6);`,
    ),
  'chart': () =>
    mk(
      'jn_bar',
      'chart',
      (id) => `
<div class="rt">
  <div class="cap">数 据 版</div>
  <div class="plot">
    <div class="b"><em>36</em><i style="height:160px"></i><span>周三</span></div>
    <div class="b"><em>52</em><i style="height:230px"></i><span>周四</span></div>
    <div class="b"><em>48</em><i style="height:210px"></i><span>周五</span></div>
    <div class="b key"><em>98</em><i style="height:400px"></i><span>周六</span></div>
    <div class="b"><em>61</em><i style="height:270px"></i><span>周日</span></div>
  </div>
  <div class="src">单位:万次播放 · 本报资料室制图</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:130px 240px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;justify-content:center;gap:54px;}
#${id} .cap{text-align:center;font-size:64px;font-weight:900;letter-spacing:0.4em;padding-left:0.4em;border-top:6px double var(--fg);border-bottom:2px solid var(--fg);padding-top:26px;padding-bottom:26px;}
#${id} .plot{display:flex;align-items:flex-end;justify-content:space-between;padding:0 90px;border-bottom:4px solid var(--fg);border-left:2px solid var(--line);height:450px;}
#${id} .b{position:relative;display:flex;flex-direction:column;align-items:center;gap:16px;width:120px;}
#${id} .b em{font-style:normal;font-family:var(--font-num);font-size:32px;color:var(--muted);}
#${id} .b i{width:44px;background:var(--fg);display:block;}
#${id} .b span{position:absolute;top:calc(100% + 22px);font-size:34px;color:var(--muted);}
#${id} .b.key em{color:var(--accent);font-weight:700;}
#${id} .b.key i{background:var(--accent);}
#${id} .src{margin-top:42px;border-top:6px double var(--fg);padding-top:26px;text-align:center;font-family:var(--font-num);font-size:32px;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.26},0);\n` +
        `tl.from('#${id} .plot',{autoAlpha:0,duration:0.24},0.1);\n` +
        `tl.from('#${id} .b i',{scaleY:0,transformOrigin:'bottom',duration:0.3,stagger:0.07,ease:'power2.out'},0.16);\n` +
        `tl.from('#${id} .b em',{autoAlpha:0,duration:0.22,stagger:0.07},0.34);\n` +
        `tl.from('#${id} .src',{autoAlpha:0,duration:0.26},0.7);`,
    ),
  'lower-third': () =>
    mk(
      'jn_low',
      'lower-third',
      (id) => `
<div class="rt">
  <div class="ph"><span class="sec">人物专访</span><span class="no">A04</span></div>
  <div class="fk">${jnFake(4)}</div>
  <div class="by"><b>沈知行</b><span class="role">本报记者</span><i class="lead"></i><span class="desk">THE GROWTH DESK</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:100px 150px 130px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;}
#${id} .ph{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid var(--line);padding-bottom:22px;}
#${id} .sec{font-size:36px;font-weight:900;letter-spacing:0.3em;}
#${id} .no{font-family:var(--font-num);font-size:32px;font-weight:700;color:var(--accent);letter-spacing:0.2em;}
#${id} .fk{margin-top:36px;width:520px;display:flex;flex-direction:column;gap:22px;}
#${id} .fk i{height:14px;background:var(--panel-2);display:block;}
#${id} .by{margin-top:auto;display:flex;align-items:baseline;gap:44px;border-top:4px solid var(--fg);border-bottom:2px solid var(--fg);padding:42px 10px;}
#${id} .by b{font-size:76px;font-weight:900;letter-spacing:0.08em;}
#${id} .role{font-size:36px;color:var(--muted);letter-spacing:0.3em;}
#${id} .lead{flex:1;border-bottom:2px solid var(--line);transform:translateY(-14px);}
#${id} .desk{font-family:var(--font-num);font-size:30px;color:var(--muted);letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .ph',{autoAlpha:0,y:-16,duration:0.24},0);\n` +
        `tl.from('#${id} .fk i',{autoAlpha:0,duration:0.18,stagger:0.05},0.1);\n` +
        `tl.from('#${id} .by',{autoAlpha:0,y:26,duration:0.3,ease:'power2.out'},0.28);\n` +
        `tl.from('#${id} .by b,#${id} .role,#${id} .desk',{autoAlpha:0,duration:0.24,stagger:0.08},0.42);\n` +
        `tl.from('#${id} .lead',{scaleX:0,transformOrigin:'left center',duration:0.3},0.5);`,
    ),
  'cta': () =>
    mk(
      'jn_cta',
      'cta',
      (id) => `
<div class="rt">
  <div class="cap">读 者 服 务</div>
  <div class="ad">
    <div class="inner">
      <div class="h">订阅本刊</div>
      <div class="s">点下关注 · 每周更新 · 不错过下一期头版</div>
      <div class="m">广告部敬启 · 第 24 版</div>
    </div>
    <div class="stamp">免费</div>
  </div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:120px 300px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:56px;}
#${id} .cap{font-size:48px;font-weight:900;letter-spacing:0.5em;padding-left:0.5em;border-bottom:2px solid var(--line);padding-bottom:24px;}
#${id} .ad{position:relative;align-self:stretch;border:4px solid var(--fg);padding:16px;}
#${id} .inner{border:2px solid var(--line);padding:84px 80px;display:flex;flex-direction:column;align-items:center;gap:40px;text-align:center;}
#${id} .h{font-size:150px;font-weight:900;line-height:1.05;}
#${id} .s{font-size:42px;color:var(--muted);border-top:2px solid var(--line);border-bottom:2px solid var(--line);padding:20px 30px;}
#${id} .m{font-family:var(--font-num);font-size:30px;color:var(--muted);}
#${id} .stamp{position:absolute;right:-80px;top:-70px;transform:rotate(9deg);border:6px solid var(--accent);color:var(--accent);font-size:56px;font-weight:900;padding:14px 34px;border-radius:8px;opacity:0.9;}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,y:-20,duration:0.26},0);\n` +
        `tl.from('#${id} .ad',{autoAlpha:0,y:30,duration:0.3},0.12);\n` +
        `tl.from('#${id} .s,#${id} .m',{autoAlpha:0,duration:0.26},0.34);\n` +
        `tl.from('#${id} .stamp',{scale:1.7,autoAlpha:0,rotation:24,duration:0.3,ease:'power3.in'},0.52);`,
    ),
};

/* ================================================================
   Neon — HUD-terminal dialect: status bar, corner brackets, mono readouts, cursor
   ================================================================ */

const neonChrome = (id: string) => `
#${id} .hud{position:absolute;inset:0;color:var(--fg);font-family:var(--font-num);
  background-color:var(--paper);/* 页面底:纸色垫在网格纹之下 */
  background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);
  background-size:120px 120px;}
#${id} .bar{position:absolute;left:70px;right:70px;top:60px;display:flex;justify-content:space-between;font-size:32px;letter-spacing:0.22em;color:var(--muted);border-bottom:2px solid var(--line);padding-bottom:22px;}
#${id} .bar b{color:var(--accent-2);font-weight:700;}
#${id} .ck{position:absolute;width:70px;height:70px;border:4px solid var(--accent);}
#${id} .ck.tl{left:70px;top:150px;border-right:none;border-bottom:none;}
#${id} .ck.br{right:70px;bottom:70px;border-left:none;border-top:none;}`;

const neon: Record<string, () => Block> = {
  'title-card': () =>
    mk(
      'ne_ttl',
      'title-card',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● REC</b>&nbsp; SESSION_04</span><span>00:03 / FPS 60</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="body">
    <div class="p">&gt; run night_mode --start</div>
    <div class="h">夜跑配速拆解<span class="cur"></span></div>
    <div class="sub">LOADING MODULES ▓▓▓▓▓▓▓▓░░ 82%</div>
  </div>
</div>
<style>${neonChrome(id)}
#${id} .body{position:absolute;left:150px;top:330px;right:150px;display:flex;flex-direction:column;gap:52px;}
#${id} .p{font-size:42px;color:var(--accent);letter-spacing:0.08em;}
#${id} .h{font-family:var(--font-head);font-size:158px;font-weight:900;letter-spacing:0.01em;text-shadow:var(--glow);}
#${id} .cur{display:inline-block;width:26px;height:120px;background:var(--accent);margin-left:30px;vertical-align:baseline;}
#${id} .sub{font-size:38px;color:var(--muted);letter-spacing:0.14em;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .p',{autoAlpha:0,x:-30,duration:0.22},0.1);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,duration:0.3},0.22);\n` +
        `tl.to('#${id} .cur',{autoAlpha:0,duration:0.12,yoyo:true,repeat:5,ease:'steps(1)'},0.4);\n` +
        `tl.from('#${id} .sub',{autoAlpha:0,duration:0.24},0.4);`,
    ),
  'big-number': () =>
    mk(
      'ne_num',
      'big-number',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● LIVE</b>&nbsp; PACE_MONITOR</span><span>GPS LOCKED</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="v">4'32"<span>/KM</span></div>
  <div class="alert">PB −0'11"</div>
</div>
<style>${neonChrome(id)}
#${id} .v{position:absolute;left:150px;top:50%;transform:translateY(-46%);font-size:440px;font-weight:800;letter-spacing:-0.04em;color:var(--accent);text-shadow:var(--glow);}
#${id} .v span{font-size:90px;color:var(--muted);text-shadow:none;margin-left:30px;letter-spacing:0.1em;}
#${id} .alert{position:absolute;right:150px;top:250px;border:3px solid var(--accent-2);color:var(--accent-2);font-size:48px;font-weight:700;letter-spacing:0.16em;padding:24px 42px;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .v',{autoAlpha:0,y:60,duration:0.32,ease:'power3.out'},0.1);\n` +
        `tl.from('#${id} .alert',{autoAlpha:0,scale:1.3,duration:0.22,ease:'power3.in'},0.4);\n` +
        `tl.to('#${id} .alert',{autoAlpha:0.4,duration:0.14,yoyo:true,repeat:3},0.66);`,
    ),
  'count-up': () =>
    mk(
      'ne_bch',
      'count-up',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● SYS</b>&nbsp; BENCH_SCORE</span><span>RUN 03/03</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="col">
    <div class="p">&gt; bench --final --gpu</div>
    <div class="h">新装备跑分</div>
    <div class="ro"><b class="v">18450</b><span>PTS</span></div>
    <div class="sub">PREV 16140 · GPU 97% · 60FPS STABLE</div>
  </div>
  <div class="tag">NEW BEST</div>
</div>
<style>${neonChrome(id)}
#${id} .col{position:absolute;left:150px;top:270px;display:flex;flex-direction:column;gap:44px;}
#${id} .p{font-size:42px;color:var(--accent);letter-spacing:0.08em;}
#${id} .h{font-family:var(--font-head);font-size:96px;font-weight:900;}
#${id} .ro{display:flex;align-items:baseline;gap:36px;}
#${id} .v{font-size:330px;font-weight:800;letter-spacing:-0.02em;line-height:1;color:var(--accent);text-shadow:var(--glow);}
#${id} .ro span{font-size:64px;color:var(--muted);letter-spacing:0.2em;}
#${id} .sub{font-size:34px;color:var(--muted);letter-spacing:0.14em;}
#${id} .tag{position:absolute;right:150px;top:250px;border:3px solid var(--accent-2);color:var(--accent-2);font-size:48px;font-weight:700;letter-spacing:0.16em;padding:24px 42px;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .p',{autoAlpha:0,x:-30,duration:0.22},0.08);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,duration:0.26},0.16);\n` +
        `tl.from('#${id} .ro',{autoAlpha:0,y:50,duration:0.3,ease:'power3.out'},0.2);\n` +
        `tl.from('#${id} .v',{innerText:0,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .sub',{autoAlpha:0,duration:0.24},0.5);\n` +
        `tl.from('#${id} .tag',{autoAlpha:0,scale:1.3,duration:0.22,ease:'power3.in'},0.4);\n` +
        `tl.to('#${id} .tag',{autoAlpha:0.4,duration:0.14,yoyo:true,repeat:3},0.64);`,
    ),
  'countdown': () =>
    mk(
      'ne_cdn',
      'countdown',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● SYS</b>&nbsp; T_MINUS</span><span>GATE B · ARMED</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="lab">起跑窗口关闭前</div>
  <div class="cd"><b>00</b><i>:</i><b class="v">59</b></div>
  <div class="warn">最后召集 · LANE 04</div>
</div>
<style>${neonChrome(id)}
#${id} .lab{position:absolute;left:150px;top:300px;font-family:var(--font-head);font-size:72px;font-weight:900;letter-spacing:0.06em;}
#${id} .cd{position:absolute;left:150px;top:50%;transform:translateY(-38%);display:flex;align-items:baseline;color:var(--accent);text-shadow:var(--glow);}
#${id} .cd b{font-size:400px;font-weight:800;letter-spacing:-0.02em;line-height:1;}
#${id} .cd i{font-style:normal;font-size:300px;font-weight:800;padding:0 28px;}
#${id} .warn{position:absolute;right:150px;top:250px;border:3px solid var(--accent-2);color:var(--accent-2);font-size:44px;font-weight:700;letter-spacing:0.16em;padding:24px 40px;text-shadow:none;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .lab',{autoAlpha:0,x:-30,duration:0.24},0.1);\n` +
        `tl.from('#${id} .cd',{autoAlpha:0,y:60,duration:0.3,ease:'power3.out'},0.12);\n` +
        `tl.from('#${id} .v',{innerText:90,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .warn',{autoAlpha:0,scale:1.3,duration:0.22,ease:'power3.in'},0.4);\n` +
        `tl.to('#${id} .warn',{autoAlpha:0.4,duration:0.14,yoyo:true,repeat:3},0.64);`,
    ),
  'trend': () =>
    mk(
      'ne_trd',
      'trend',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● LIVE</b>&nbsp; HEART_RATE</span><span>ZONE 4</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <svg viewBox="0 0 1500 520" class="tr">
    <polyline class="ln" points="0,300 150,300 210,180 280,420 350,260 520,300 610,140 700,430 790,250 960,300 1050,170 1140,410 1230,240 1400,290 1500,260"/>
  </svg>
  <div class="ro"><b>162</b><span>BPM</span></div>
</div>
<style>${neonChrome(id)}
#${id} .tr{position:absolute;left:110px;top:260px;width:1500px;height:520px;}
#${id} .ln{fill:none;stroke:var(--accent);stroke-width:6;filter:drop-shadow(0 0 14px var(--accent));stroke-dasharray:4200;stroke-dashoffset:4200;}
#${id} .ro{position:absolute;right:150px;bottom:170px;display:flex;align-items:baseline;gap:24px;}
#${id} .ro b{font-size:170px;font-weight:800;color:var(--accent-2);}
#${id} .ro span{font-size:50px;color:var(--muted);letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.to('#${id} .ln',{strokeDashoffset:0,duration:0.9,ease:'none'},0.1);\n` +
        `tl.from('#${id} .ro',{autoAlpha:0,duration:0.26},0.5);`,
    ),
  'steps': () =>
    mk(
      'ne_stp',
      'steps',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● TASK</b>&nbsp; WARMUP_SEQ</span><span>2/3 DONE</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="ls">
    <div class="r done"><i>[✓]</i><span>动态拉伸 5min</span><em>DONE</em></div>
    <div class="r done"><i>[✓]</i><span>配速热身 1km</span><em>DONE</em></div>
    <div class="r act"><i>[▸]</i><span>间歇冲刺 6×400m</span><em>RUNNING<b class="cur"></b></em></div>
  </div>
</div>
<style>${neonChrome(id)}
#${id} .ls{position:absolute;left:150px;right:150px;top:300px;display:flex;flex-direction:column;gap:38px;}
#${id} .r{display:flex;align-items:center;gap:52px;font-size:64px;padding:34px 46px;border:2px solid var(--line);}
#${id} .r i{font-style:normal;color:var(--accent);}
#${id} .r span{flex:1;font-family:var(--font-head);font-weight:700;}
#${id} .r em{font-style:normal;font-size:36px;letter-spacing:0.2em;color:var(--muted);}
#${id} .r.done{opacity:0.62;}
#${id} .r.act{border-color:var(--accent);box-shadow:var(--glow);}
#${id} .r.act em{color:var(--accent-2);}
#${id} .cur{display:inline-block;width:16px;height:40px;background:var(--accent-2);margin-left:16px;vertical-align:middle;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .r',{x:-60,autoAlpha:0,duration:0.26,stagger:0.12,ease:'power2.out'},0.1);\n` +
        `tl.to('#${id} .cur',{autoAlpha:0,duration:0.14,yoyo:true,repeat:5,ease:'steps(1)'},0.5);`,
    ),
  'code': () =>
    mk(
      'ne_cod',
      'code',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● SRC</b>&nbsp; NIGHT_RUN.SH</span><span>TTY 04 · BASH</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="win">
    <div class="r"><i>$</i><em><b>load</b> plan --week <u>08</u></em></div>
    <div class="r cm"><em># 目标 · 周末破 5km PB</em></div>
    <div class="r"><i>$</i><em><b>set</b> pace <u>4'40"</u> --zone <u>4</u></em></div>
    <div class="r ex"><i>&gt;</i><em><b>exec</b> night_run --go</em><b class="cur"></b></div>
    <div class="r"><i>✓</i><em class="ok">SESSION ARMED · 21:30</em></div>
  </div>
</div>
<style>${neonChrome(id)}
#${id} .win{position:absolute;left:150px;right:150px;top:300px;border:2px solid var(--line);padding:34px 0;display:flex;flex-direction:column;}
#${id} .r{display:flex;align-items:baseline;gap:36px;padding:26px 56px;font-size:44px;letter-spacing:0.04em;}
#${id} .r i{font-style:normal;color:var(--accent);flex:none;}
#${id} .r em{font-style:normal;}
#${id} .r em b{color:var(--accent);font-weight:700;}
#${id} .r em u{text-decoration:none;color:var(--accent-2);}
#${id} .cm em{color:var(--muted);}
#${id} .ok{color:var(--muted);letter-spacing:0.14em;}
#${id} .ex{outline:2px solid var(--accent);outline-offset:-2px;box-shadow:var(--glow);}
#${id} .cur{display:inline-block;width:16px;height:40px;background:var(--accent-2);margin-left:20px;vertical-align:middle;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .win',{autoAlpha:0,y:30,duration:0.26,ease:'power2.out'},0.08);\n` +
        `tl.from('#${id} .r',{autoAlpha:0,x:-40,duration:0.2,stagger:0.08},0.18);\n` +
        `tl.to('#${id} .cur',{autoAlpha:0,duration:0.12,yoyo:true,repeat:5,ease:'steps(1)'},0.45);`,
    ),
  'chart': () =>
    mk(
      'ne_eq',
      'chart',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● LIVE</b>&nbsp; AUDIO_LEVELS</span><span>CH 06 / 48kHz</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="eq">
    <div class="c" style="height:220px"></div>
    <div class="c" style="height:340px"></div>
    <div class="c" style="height:280px"></div>
    <div class="c pk" style="height:560px"><i></i></div>
    <div class="c" style="height:430px"></div>
    <div class="c" style="height:250px"></div>
  </div>
  <div class="scale"><span>100</span><span>75</span><span>50</span><span>25</span><span>00</span></div>
</div>
<style>${neonChrome(id)}
#${id} .eq{position:absolute;left:150px;right:360px;bottom:170px;display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid var(--line);padding:0 30px;}
#${id} .c{width:120px;background:repeating-linear-gradient(to top,var(--accent) 0 30px,transparent 30px 44px);opacity:0.92;}
#${id} .c.pk{position:relative;}
#${id} .c.pk i{position:absolute;left:0;right:0;top:0;height:30px;background:var(--accent-2);box-shadow:0 0 18px var(--accent-2);}
#${id} .scale{position:absolute;right:170px;bottom:170px;height:590px;display:flex;flex-direction:column;justify-content:space-between;border-left:2px solid var(--line);padding-left:26px;font-size:30px;color:var(--muted);letter-spacing:0.14em;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .scale',{autoAlpha:0,duration:0.24},0.1);\n` +
        `tl.from('#${id} .c',{scaleY:0,transformOrigin:'bottom',duration:0.3,stagger:0.06,ease:'power3.out'},0.16);\n` +
        `tl.from('#${id} .pk i',{autoAlpha:0,duration:0.16},0.6);\n` +
        `tl.to('#${id} .pk i',{autoAlpha:0.3,duration:0.1,yoyo:true,repeat:3},0.8);`,
    ),
  'cta': () =>
    mk(
      'ne_cta',
      'cta',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● SYS</b>&nbsp; CTA_MODULE</span><span>LOADED</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="c">
    <div class="p">&gt; exec follow --confirm</div>
    <div class="btn">+ FOLLOW</div>
    <div class="sub">NEXT_SESSION 已排期<span class="cur"></span></div>
  </div>
</div>
<style>${neonChrome(id)}
#${id} .c{position:absolute;left:0;right:0;top:50%;transform:translateY(-46%);display:flex;flex-direction:column;align-items:center;gap:64px;}
#${id} .p{font-size:42px;color:var(--accent);letter-spacing:0.08em;}
#${id} .btn{border:4px solid var(--accent);color:var(--accent);font-size:110px;font-weight:700;letter-spacing:0.18em;padding:44px 110px 44px calc(110px + 0.18em);box-shadow:var(--glow);}
#${id} .sub{font-size:36px;color:var(--muted);letter-spacing:0.2em;}
#${id} .cur{display:inline-block;width:18px;height:44px;background:var(--accent-2);margin-left:20px;vertical-align:middle;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .p',{autoAlpha:0,x:-30,duration:0.22},0.1);\n` +
        `tl.from('#${id} .btn',{autoAlpha:0,scale:0.9,duration:0.26,ease:'power3.out'},0.24);\n` +
        `tl.to('#${id} .btn',{scale:1.04,duration:0.15,yoyo:true,repeat:3,ease:'power1.inOut'},0.56);\n` +
        `tl.from('#${id} .sub',{autoAlpha:0,duration:0.24},0.4);\n` +
        `tl.to('#${id} .cur',{autoAlpha:0,duration:0.12,yoyo:true,repeat:5,ease:'steps(1)'},0.45);`,
    ),
};

/* ================================================================ */

const DIALECTS: Record<string, Record<string, () => Block>> = {
  'knowledge-cards': blueprint,
  'foodie-vlog': cream,
  'biennale-poster': biennale,
  'noir-gold': noir,
  'journal-ink': journal,
  'neon-runner': neon,
  'kawaii-bubble': kawaiiBubble.blocks,
  'mega-sale': megaSale.blocks,
  'pixel-arcade': pixelArcade.blocks,
  'varsity-bold': varsityBold.blocks,
  'scrapbook-tape': scrapbookTape.blocks,
  'memphis-pop': memphisPop.blocks,
  'y2k-chrome': y2kChrome.blocks,
  'manga-panel': mangaPanel.blocks,
  'particle-dust': particleDust.blocks,
  'glass-tech': glassTech.blocks,
  'zen-white': zenWhite.blocks,
  'cinema-frame': cinemaFrame.blocks,
  'paper-cut': paperCut.blocks,
  'boardroom': boardroom.blocks,
  'chalk-class': chalkClass.blocks,
  'botanic-press': botanicPress.blocks,
  'flip-board': flipBoard.blocks,
  'circuit-board': circuitBoard.blocks,
  'sticker-collage': stickerCollage.blocks,
};

/** (frameId, showcase kind) → the real sample block in that theme's dialect; null if not
 *  implemented (panel falls back to a label card). locale applies the adapted copy pack for
 *  non-Chinese languages (dialect source stays single-source Chinese, see lib/frames/locales). */
export function showcaseBlock(frameId: string, kind: string, locale?: SupportedLocale): Block | null {
  const b = DIALECTS[frameId]?.[kind]?.() ?? null;
  return b ? localizeBlock(b, framePack(locale, frameId)) : null;
}

/* ================================================================
   Covers — list thumbnails: theme name is the hero, hint the style without listing details (like a slide-deck theme cover)
   ================================================================ */

const COVERS: Record<string, () => Block> = {
  'kawaii-bubble': kawaiiBubble.cover,
  'mega-sale': megaSale.cover,
  'pixel-arcade': pixelArcade.cover,
  'varsity-bold': varsityBold.cover,
  'scrapbook-tape': scrapbookTape.cover,
  'memphis-pop': memphisPop.cover,
  'y2k-chrome': y2kChrome.cover,
  'manga-panel': mangaPanel.cover,
  'particle-dust': particleDust.cover,
  'glass-tech': glassTech.cover,
  'zen-white': zenWhite.cover,
  'cinema-frame': cinemaFrame.cover,
  'paper-cut': paperCut.cover,
  'boardroom': boardroom.cover,
  'chalk-class': chalkClass.cover,
  'botanic-press': botanicPress.cover,
  'flip-board': flipBoard.cover,
  'circuit-board': circuitBoard.cover,
  'sticker-collage': stickerCollage.cover,
  'knowledge-cards': () =>
    mk(
      'cv_bp',
      '封面',
      (id) => `
<div class="bp"><div class="frame"></div>
  <div class="c"><div class="k">FRAME · BLUEPRINT</div><div class="h">蓝图</div><div class="dim"><i></i><b>1920 × 1080</b><i></i></div></div>
  <div class="dwg"><span>DWG-00</span><span>COVER</span></div>
</div>
<style>${bpRoot(id)}
#${id} .c{position:absolute;left:150px;right:150px;top:50%;transform:translateY(-52%);display:flex;flex-direction:column;gap:56px;}
#${id} .k{font-family:var(--font-num);font-size:40px;letter-spacing:0.4em;color:var(--accent);}
#${id} .h{font-size:300px;font-weight:900;letter-spacing:0.06em;line-height:1;}
#${id} .dim{display:flex;align-items:center;gap:22px;color:var(--muted);max-width:900px;}
#${id} .dim i{flex:1;height:0;border-top:2px dashed var(--line);}
#${id} .dim b{font-family:var(--font-num);font-size:36px;font-weight:500;}
</style>`,
      (id) => `tl.from('#${id} .c',{autoAlpha:0,y:40,duration:0.3},0);`,
    ),
  'foodie-vlog': () =>
    mk(
      'cv_cr',
      '封面',
      (id) => `
<div class="rt">
  <div class="stick"><div class="h">奶油</div><div class="s">CREAM · 好吃的排版</div></div>
  <div class="badge">FRAME</div>
  <div class="pearl p1"></div><div class="pearl p2"></div><div class="pearl p3"></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;font-family:var(--font-head);color:var(--fg);}
#${id} .stick{position:absolute;left:50%;top:50%;transform:translate(-50%,-52%) rotate(-2deg);background:var(--panel);border-radius:64px;box-shadow:var(--shadow);padding:100px 180px;display:flex;flex-direction:column;align-items:center;gap:30px;}
#${id} .h{font-size:260px;font-weight:800;line-height:1;}
#${id} .s{font-size:44px;font-weight:700;color:var(--accent);letter-spacing:0.18em;}
#${id} .badge{position:absolute;right:220px;top:150px;transform:rotate(8deg);background:var(--accent);color:#fff;font-size:44px;font-weight:800;padding:26px 52px;border-radius:999px;box-shadow:var(--glow);}
#${id} .pearl{position:absolute;border-radius:999px;background:var(--panel-2);}
#${id} .pearl.p1{width:110px;height:110px;left:150px;bottom:150px;}
#${id} .pearl.p2{width:60px;height:60px;left:280px;top:170px;background:var(--accent-2);}
#${id} .pearl.p3{width:80px;height:80px;right:180px;bottom:240px;background:var(--accent-2);}
</style>`,
      (id) => `tl.from('#${id} .stick',{scale:0.7,autoAlpha:0,rotation:-8,duration:0.34,ease:'back.out(1.6)'},0);\ntl.from('#${id} .badge,#${id} .pearl',{scale:0,duration:0.26,stagger:0.06,ease:'back.out(2)'},0.2);`,
    ),
  'biennale-poster': () =>
    mk(
      'cv_bi',
      '封面',
      (id) => `
<div class="rt">
  <div class="h">双年展</div>
  <div class="bar">BIENNALE — PIREEL FRAME — 2026</div>
  <div class="side">POSTER SYSTEM</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;font-family:var(--font-head);color:var(--fg);overflow:hidden;}
#${id} .h{position:absolute;left:60px;top:40px;font-size:520px;font-weight:900;letter-spacing:-0.06em;line-height:1;white-space:nowrap;}
#${id} .bar{position:absolute;left:0;right:0;bottom:150px;background:var(--fg);color:var(--paper);font-family:var(--font-num);font-size:52px;font-weight:700;letter-spacing:0.24em;padding:34px 110px;white-space:nowrap;}
#${id} .side{position:absolute;right:70px;top:80px;writing-mode:vertical-rl;font-family:var(--font-num);font-size:34px;letter-spacing:0.5em;}
</style>`,
      (id) => `tl.from('#${id} .h',{x:-200,autoAlpha:0,duration:0.32,ease:'power3.out'},0);\ntl.from('#${id} .bar',{x:300,autoAlpha:0,duration:0.3,ease:'power3.out'},0.16);\ntl.from('#${id} .side',{autoAlpha:0,duration:0.24},0.36);`,
    ),
  'noir-gold': () =>
    mk(
      'cv_nr',
      '封面',
      (id) => `
<div class="rt"><div class="nf"></div>
  <div class="k">MAISON PIREEL</div>
  <div class="h">黑 金</div>
  <div class="orn"><i></i><b>◆</b><i></i></div>
  <div class="f">NOIR · EST. 2026</div>
</div>
<style>${noirFrame(id)}
#${id} .rt{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:60px;color:var(--fg);font-family:var(--font-head);}
#${id} .k{font-size:34px;letter-spacing:0.7em;color:var(--muted);padding-left:0.7em;}
#${id} .h{font-size:280px;font-weight:700;letter-spacing:0.14em;color:var(--accent);line-height:1;}
#${id} .orn{display:flex;align-items:center;gap:36px;color:var(--accent);}
#${id} .orn i{width:170px;height:1px;background:var(--accent-2);}
#${id} .orn b{font-size:30px;}
#${id} .f{font-size:30px;letter-spacing:0.5em;color:var(--muted);padding-left:0.5em;}
</style>`,
      (id) => `tl.from('#${id} .nf',{autoAlpha:0,duration:0.5},0);\ntl.from('#${id} .h',{autoAlpha:0,duration:0.55},0.2);\ntl.from('#${id} .k,#${id} .orn,#${id} .f',{autoAlpha:0,duration:0.4},0.45);`,
    ),
  'journal-ink': () =>
    mk(
      'cv_jn',
      '封面',
      (id) => `
<div class="rt">
  <div class="mast"><span class="d">VOL.01</span><span class="m">视 频 日 报</span><span class="d">FRAME</span></div>
  <div class="h">报刊</div>
  <div class="deck">JOURNAL · 纸墨与一枚红章</div>
  <div class="stamp">创刊</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;padding:120px 170px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;align-items:center;gap:40px;}
#${id} .mast{width:100%;display:flex;align-items:baseline;justify-content:space-between;border-bottom:6px double var(--fg);padding-bottom:28px;}
#${id} .m{font-size:56px;font-weight:900;letter-spacing:0.3em;}
#${id} .d{font-family:var(--font-num);font-size:30px;color:var(--muted);}
#${id} .h{font-size:330px;font-weight:900;line-height:1.05;}
#${id} .deck{width:100%;text-align:center;font-size:42px;color:var(--muted);border-top:2px solid var(--line);border-bottom:2px solid var(--line);padding:22px 0;}
#${id} .stamp{position:absolute;right:200px;top:300px;transform:rotate(10deg);border:6px solid var(--accent);color:var(--accent);font-size:60px;font-weight:900;padding:16px 36px;border-radius:8px;}
</style>`,
      (id) => `tl.from('#${id} .mast',{autoAlpha:0,y:-20,duration:0.26},0);\ntl.from('#${id} .h',{autoAlpha:0,duration:0.32},0.12);\ntl.from('#${id} .deck',{autoAlpha:0,duration:0.26},0.3);\ntl.from('#${id} .stamp',{scale:1.8,autoAlpha:0,rotation:26,duration:0.3,ease:'power3.in'},0.44);`,
    ),
  'neon-runner': () =>
    mk(
      'cv_ne',
      '封面',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● SYS</b>&nbsp; FRAME_BOOT</span><span>OK</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="c"><div class="p">&gt; load neon.frame</div><div class="h">霓虹<span class="cur"></span></div><div class="s">NEON · TERMINAL GLOW</div></div>
</div>
<style>${neonChrome(id)}
#${id} .c{position:absolute;left:150px;top:320px;display:flex;flex-direction:column;gap:48px;}
#${id} .p{font-size:44px;color:var(--accent);letter-spacing:0.08em;}
#${id} .h{font-family:var(--font-head);font-size:300px;font-weight:900;line-height:1;text-shadow:var(--glow);}
#${id} .cur{display:inline-block;width:30px;height:200px;background:var(--accent);margin-left:40px;}
#${id} .s{font-size:40px;color:var(--muted);letter-spacing:0.3em;}
</style>`,
      (id) => `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\ntl.from('#${id} .c',{autoAlpha:0,duration:0.3},0.12);\ntl.to('#${id} .cur',{autoAlpha:0,duration:0.14,yoyo:true,repeat:5,ease:'steps(1)'},0.4);`,
    ),
};

/** frameId → cover block (list thumbnail; null if none, panel falls back to a row). */
export function coverBlock(frameId: string, locale?: SupportedLocale): Block | null {
  const b = COVERS[frameId]?.() ?? null;
  return b ? localizeBlock(b, framePack(locale, frameId)) : null;
}
