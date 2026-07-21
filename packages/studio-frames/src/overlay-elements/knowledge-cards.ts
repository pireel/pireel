/**
 * 蓝图 Blueprint 的口播叠加件:制图纸 detail callout 语言——每件是一小片带
 * 坐标网格的深蓝图纸,发丝内框、虚线尺寸线(端刺)、引出标注(accent 点→线→
 * mono 注记)、空心描边巨数、45° 斜纹强调、mono 图签(FIG./REV/SCALE)。
 * 动效 rise-and-settle ≤0.4s 不弹跳。根透明,件贴在说话画面上。
 */

import { mk, txt, type Block } from '../dialects/shared';

/** 小片图纸底:navy 纸 + 48px 网格 + 发丝框 */
const PATCH =
  'background-color:var(--paper);background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:48px 48px;border:2px solid var(--line);box-shadow:var(--shadow);';
/** 虚线尺寸线(端刺走伪元素,动效只选父级) */
const DIM = (id: string, cls = 'dim') => `
#${id} .${cls}{display:flex;align-items:center;gap:16px;color:var(--muted);}
#${id} .${cls} i{flex:1;height:0;border-top:2px dashed var(--line);position:relative;}
#${id} .${cls} i::before,#${id} .${cls} i::after{content:'';position:absolute;top:-8px;width:2px;height:18px;background:var(--line);}
#${id} .${cls} i::before{left:0}#${id} .${cls} i::after{right:0}
#${id} .${cls} b{font-family:var(--font-num);font-size:26px;font-weight:500;letter-spacing:0.2em;}`;
/** 45° 斜纹强调 */
const HATCH = 'repeating-linear-gradient(45deg,var(--accent) 0 10px,transparent 10px 24px)';

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'kc_ttl',
      '标题条',
      (id) => `
<div class="w">
  <div class="k" data-edit="kick">FIG.01 — OPENING</div>
  <div class="h" data-edit="title">${txt('标题一', 'Title 1')}</div>
  <div class="dim"><i></i><b data-edit="dim">1920</b><i></i></div>
</div>
<style>
#${id} .w{position:absolute;left:76px;bottom:96px;width:58%;${PATCH}padding:28px 40px 24px;color:var(--fg);font-family:var(--font-head);}
#${id} .k{font-family:var(--font-num);font-size:28px;letter-spacing:0.34em;color:var(--accent);}
#${id} .h{margin-top:16px;font-size:80px;font-weight:900;letter-spacing:-0.02em;line-height:1.15;}
${DIM(id)}
#${id} .dim{margin-top:20px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,duration:0.26},0);\n` +
        `tl.from('#${id} .k',{x:-30,autoAlpha:0,duration:0.24},0.08);\n` +
        `tl.from('#${id} .h',{y:36,autoAlpha:0,duration:0.32,ease:'power3.out'},0.14);\n` +
        `tl.from('#${id} .dim',{autoAlpha:0,duration:0.26},0.38);`,
    ),
  大数字: () =>
    mk(
      'kc_num',
      '大数字',
      (id) => `
<div class="w">
  <div class="v"><b data-edit="num">38</b><i data-edit="unit">%</i></div>
  <div class="lab" data-edit="label">${txt('数据说明', 'Data label')}</div>
  <div class="dwg"><span data-edit="tag">DATA</span><span>±0.5</span><span>REV A</span></div>
</div>
<style>
#${id} .w{position:absolute;right:96px;top:110px;width:440px;${PATCH}padding:30px 36px 0;color:var(--fg);font-family:var(--font-num);}
#${id} .v{display:flex;align-items:baseline;gap:12px;line-height:1;}
#${id} .v b{font-size:210px;font-weight:700;letter-spacing:-0.05em;color:transparent;-webkit-text-stroke:6px var(--accent);}
#${id} .v i{font-style:normal;font-size:90px;font-weight:700;color:transparent;-webkit-text-stroke:4px var(--fg);}
#${id} .lab{margin-top:14px;font-family:var(--font-head);font-size:36px;font-weight:600;color:var(--muted);}
#${id} .dwg{margin:24px -36px 0;border-top:2px solid var(--line);display:flex;font-size:24px;color:var(--muted);}
#${id} .dwg span{padding:14px 22px;border-left:2px solid var(--line);letter-spacing:0.2em;}
#${id} .dwg span:first-child{border-left:none;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,duration:0.26},0);\n` +
        `tl.from('#${id} .v',{x:-40,autoAlpha:0,duration:0.34,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .v b',{innerText:0,snap:{innerText:1},duration:0.7,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .lab,#${id} .dwg',{autoAlpha:0,duration:0.24},0.45);`,
    ),
  要点列表: () =>
    mk(
      'kc_list',
      '要点列表',
      (id) => `
<div class="w">
  <div class="cap" data-edit="title">${txt('SPEC — 列表标题', 'SPEC — LIST TITLE')}</div>
  <div class="r r1"><span>01</span><b data-edit="p1">${txt('要点一', 'Point 1')}</b><i>PASS</i></div>
  <div class="r r2"><span>02</span><b data-edit="p2">${txt('要点二', 'Point 2')}</b><i>PASS</i></div>
  <div class="r r3"><span>03</span><b data-edit="p3">${txt('要点三', 'Point 3')}</b><i>HOLD</i></div>
</div>
<style>
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:580px;${PATCH}border:3px solid var(--fg);padding:0;color:var(--fg);font-family:var(--font-head);}
#${id} .cap{padding:20px 30px;border-bottom:3px solid var(--fg);font-family:var(--font-num);font-size:28px;letter-spacing:0.24em;color:var(--accent);}
#${id} .r{display:flex;align-items:center;gap:26px;padding:22px 30px;border-bottom:2px solid var(--line);font-size:40px;}
#${id} .r:last-child{border-bottom:none;}
#${id} .r span{font-family:var(--font-num);font-size:30px;color:var(--muted);flex:none;}
#${id} .r b{font-weight:600;flex:1;}
#${id} .r i{font-style:normal;font-family:var(--font-num);font-size:24px;letter-spacing:0.2em;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:36,autoAlpha:0,duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .r1',{autoAlpha:0,duration:0.22},0.2);\n` +
        `tl.from('#${id} .r2',{autoAlpha:0,duration:0.22},0.3);\n` +
        `tl.from('#${id} .r3',{autoAlpha:0,duration:0.22},0.4);`,
    ),
  关键词重击: () =>
    mk(
      'kc_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <i class="ch a">+</i><i class="ch b">+</i>
  <div class="dim top"><i></i><b data-edit="spec">SPEC — KEY</b><i></i></div>
  <div class="t" data-edit="word">${txt('关键词', 'Keyword')}</div>
  <div class="hl"></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:48%;${PATCH}padding:26px 56px 34px;color:var(--fg);font-family:var(--font-head);text-align:center;}
${DIM(id)}
#${id} .t{margin-top:18px;font-size:140px;font-weight:900;letter-spacing:-0.02em;line-height:1;}
#${id} .hl{margin:20px auto 0;width:62%;height:22px;background:${HATCH};}
#${id} .ch{position:absolute;font-style:normal;font-family:var(--font-num);font-size:40px;color:var(--muted);line-height:1;}
#${id} .a{left:14px;top:8px;}
#${id} .b{right:14px;bottom:6px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .dim',{scaleX:0.5,autoAlpha:0,transformOrigin:'center',duration:0.26},0.06);\n` +
        `tl.from('#${id} .t',{y:30,autoAlpha:0,duration:0.3,ease:'power3.out'},0.14);\n` +
        `tl.from('#${id} .hl',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.out'},0.4);\n` +
        `tl.from('#${id} .ch',{autoAlpha:0,duration:0.2},0.5);`,
    ),
  标注: () =>
    mk(
      'kc_call',
      '标注',
      (id) => `
<div class="w">
  <span class="dot"></span><span class="ln"></span>
  <div class="note"><b data-edit="tag">FIG.A</b><span data-edit="note">${txt('标注一', 'Note 1')}</span></div>
</div>
<style>
#${id} .w{position:absolute;right:130px;top:30%;display:flex;align-items:center;font-family:var(--font-head);}
#${id} .dot{width:16px;height:16px;border-radius:999px;background:var(--accent);flex:none;}
#${id} .ln{width:150px;height:2px;background:var(--line);flex:none;}
#${id} .note{${PATCH}padding:18px 30px;display:flex;align-items:center;gap:20px;color:var(--fg);}
#${id} .note b{font-family:var(--font-num);font-size:26px;letter-spacing:0.24em;color:var(--accent);}
#${id} .note span{font-size:40px;font-weight:700;}
</style>`,
      (id) =>
        `tl.from('#${id} .dot',{scale:0,autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .ln',{scaleX:0,transformOrigin:'left center',duration:0.26,ease:'power2.out'},0.12);\n` +
        `tl.from('#${id} .note',{x:-30,autoAlpha:0,duration:0.26,ease:'power3.out'},0.3);`,
    ),
  关注引导: () =>
    mk(
      'kc_cta',
      '关注引导',
      (id) => `
<div class="w">
  <i class="ch a">+</i><i class="ch b">+</i>
  <div class="btn"><i class="fill"></i><span data-edit="cta">${txt('+ 关注', '+ Follow')}</span></div>
  <div class="dim"><i></i><b data-edit="dim">W 640</b><i></i></div>
  <div class="m" data-edit="side">PRESS TO FOLLOW · NEXT EPISODE</div>
</div>
<style>
#${id} .w{position:absolute;right:96px;bottom:100px;width:480px;${PATCH}padding:30px 36px 24px;color:var(--fg);font-family:var(--font-head);text-align:center;}
#${id} .btn{position:relative;border:3px solid var(--accent);padding:22px 0;font-size:60px;font-weight:900;letter-spacing:0.2em;overflow:hidden;}
#${id} .btn span{position:relative;}
#${id} .fill{position:absolute;inset:0;background:${HATCH};opacity:0.5;}
${DIM(id)}
#${id} .dim{margin-top:18px;}
#${id} .m{margin-top:16px;font-family:var(--font-num);font-size:22px;letter-spacing:0.2em;color:var(--muted);}
#${id} .ch{position:absolute;font-style:normal;font-family:var(--font-num);font-size:36px;color:var(--muted);line-height:1;}
#${id} .a{left:12px;top:6px;}
#${id} .b{right:12px;bottom:4px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .btn',{y:26,autoAlpha:0,duration:0.28,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .fill',{scaleX:0,transformOrigin:'left center',duration:0.34,ease:'power2.out'},0.3);\n` +
        `tl.from('#${id} .dim,#${id} .m,#${id} .ch',{autoAlpha:0,duration:0.24},0.5);`,
    ),
  金句: () =>
    mk(
      'kc_quote',
      '金句',
      (id) => `
<div class="w">
  <div class="dim"><i></i><b data-edit="spec">SPEC — QUOTE</b><i></i></div>
  <div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b data-edit="l2">${txt('下半句。', 'and line two.')}</b></div>
  <div class="dim btm"><i></i><b data-edit="src">${txt('SOURCE · 署名', 'SOURCE · ATTRIBUTION')}</b><i></i></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);width:60%;${PATCH}padding:24px 48px 22px;color:var(--fg);font-family:var(--font-head);text-align:center;}
${DIM(id)}
#${id} .t{margin:22px 0;font-size:58px;font-weight:800;line-height:1.35;}
#${id} .t b{color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,duration:0.22},0);\n` +
        `tl.from('#${id} .dim',{scaleX:0.5,autoAlpha:0,transformOrigin:'center',duration:0.28,stagger:0.1},0.06);\n` +
        `tl.from('#${id} .t',{y:26,autoAlpha:0,duration:0.3,ease:'power3.out'},0.24);`,
    ),
  左右对比: () =>
    mk(
      'kc_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="s a"><i data-edit="lt">${txt('选项一', 'Option A')}</i><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <div class="vs">VS</div>
  <div class="s b"><em class="fill"></em><i data-edit="rt">${txt('选项二', 'Option B')}</i><b data-edit="rv">${txt('数值二', 'Value B')}</b></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:104px;transform:translateX(-50%);display:flex;align-items:stretch;gap:22px;font-family:var(--font-head);}
#${id} .s{position:relative;width:350px;${PATCH}padding:24px 28px;text-align:center;color:var(--fg);overflow:hidden;}
#${id} .a{border:3px solid var(--line);}
#${id} .b{border:3px solid var(--accent);}
#${id} .fill{position:absolute;inset:0;background:${HATCH};opacity:0.28;}
#${id} .s i,#${id} .s b{position:relative;}
#${id} .s i{display:block;font-style:normal;font-size:28px;font-weight:600;letter-spacing:0.14em;color:var(--muted);}
#${id} .s b{display:block;margin-top:10px;font-family:var(--font-num);font-size:66px;font-weight:700;line-height:1;}
#${id} .b b{color:var(--accent);}
#${id} .vs{align-self:center;font-family:var(--font-num);font-size:32px;letter-spacing:0.2em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .a',{x:-50,autoAlpha:0,duration:0.28,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .vs',{autoAlpha:0,duration:0.2},0.16);\n` +
        `tl.from('#${id} .b',{x:50,autoAlpha:0,duration:0.28,ease:'power3.out'},0.2);\n` +
        `tl.from('#${id} .fill',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.out'},0.44);`,
    ),
};

export type { Block };
