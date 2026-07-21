/**
 * 孟菲斯 Memphis 的口播叠加件:几何纸屑语言——白 panel 必带 4px 深蓝描边 +
 * 12px 无模糊硬黄偏移影(签名组合,缺一不可);粗描边空心圆/实心粉三角/薄荷
 * 半圆/波点补丁当纸屑压在件的另一侧;粉色每件只填一个形状或胶囊;黄锯齿线
 * SVG 最后 draw 收尾。构图不对称,动效 power3 滑入 + back.out 弹形状,1s 落定。
 */

import { mk, txt, type Block } from '../dialects/shared';

/** 硬影白板:4px 描边 + 硬黄偏移影 */
const PANEL =
  'background:var(--panel);border:4px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);';
/** 纸屑:空心圆 / 实心粉三角 / 薄荷半圆 / 波点补丁 */
const CONFETTI = (id: string) => `
#${id} .circle{position:absolute;border:6px solid var(--fg);border-radius:999px;}
#${id} .tri{position:absolute;background:var(--accent);clip-path:polygon(50% 0,100% 100%,0 100%);}
#${id} .half{position:absolute;border:6px solid var(--fg);border-bottom:none;border-radius:200px 200px 0 0;background:var(--panel-2);}
#${id} .dots{position:absolute;background-image:radial-gradient(var(--fg) 3px,transparent 3px);background-size:30px 30px;}`;
const ZIGZAG = (w = 300) =>
  `<svg class="zig" viewBox="0 0 ${w} 60"><polyline points="${Array.from(
    { length: Math.floor(w / 40) + 1 },
    (_, i) => `${i * 40},${i % 2 === 0 ? 50 : 10}`,
  ).join(' ')}"/></svg>`;
const ZIG_CSS = (id: string, w = 300) => `
#${id} .zig{position:absolute;width:${w}px;height:60px;}
#${id} .zig polyline{fill:none;stroke:var(--accent-2);stroke-width:12;stroke-dasharray:1400;stroke-dashoffset:1400;}`;

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'me_ttl',
      '标题条',
      (id) => `
<div class="w">
  <div class="panel">
    <span class="chip" data-edit="kick">${txt('标签', 'Label')}</span>
    <div class="h" data-edit="title">${txt('标题一', 'Title 1')}</div>
  </div>
  <i class="circle"></i>
  <i class="tri"></i>
  ${ZIGZAG(300)}
</div>
<style>
#${id} .w{position:absolute;left:76px;bottom:96px;width:58%;color:var(--fg);font-family:var(--font-head);}
${CONFETTI(id)}
#${id} .panel{${PANEL}padding:26px 40px 32px;display:flex;flex-direction:column;align-items:flex-start;gap:18px;}
#${id} .chip{background:var(--accent);color:var(--paper);border:4px solid var(--fg);border-radius:999px;padding:8px 30px;font-size:32px;font-weight:800;letter-spacing:0.08em;}
#${id} .h{font-size:78px;font-weight:900;line-height:1.15;}
#${id} .circle{right:-40px;top:-56px;width:110px;height:110px;}
#${id} .tri{right:110px;top:-44px;width:80px;height:72px;transform:rotate(18deg);}
#${id} .zig{left:20px;bottom:-46px;}
${ZIG_CSS(id, 300)}
</style>`,
      (id) =>
        `tl.from('#${id} .panel',{x:-160,autoAlpha:0,duration:0.3,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .chip',{scale:0,duration:0.22,ease:'back.out(2)'},0.2);\n` +
        `tl.from('#${id} .circle,#${id} .tri',{scale:0,autoAlpha:0,duration:0.24,stagger:0.09,ease:'back.out(1.8)'},0.28);\n` +
        `tl.to('#${id} .zig polyline',{strokeDashoffset:0,duration:0.36,ease:'power2.out'},0.5);`,
    ),
  大数字: () =>
    mk(
      'me_num',
      '大数字',
      (id) => `
<div class="w">
  <i class="circle"></i>
  <div class="v" data-edit="num">38</div>
  <i class="tri"></i>
  <div class="panel" data-edit="label">${txt('数据说明 38%', 'Data label 38%')}</div>
</div>
<style>
#${id} .w{position:absolute;right:96px;top:100px;width:460px;height:440px;color:var(--fg);font-family:var(--font-head);}
${CONFETTI(id)}
#${id} .circle{right:10px;top:0;width:330px;height:330px;}
#${id} .v{position:absolute;right:70px;top:44px;font-family:var(--font-num);font-size:250px;font-weight:800;letter-spacing:-0.04em;line-height:1;}
#${id} .tri{left:20px;top:210px;width:110px;height:100px;transform:rotate(22deg);}
#${id} .panel{position:absolute;left:0;bottom:0;${PANEL}padding:18px 34px;font-size:38px;font-weight:800;}
</style>`,
      (id) =>
        `tl.from('#${id} .circle',{scale:0,autoAlpha:0,duration:0.28,ease:'back.out(1.8)'},0);\n` +
        `tl.from('#${id} .v',{scale:1.5,autoAlpha:0,duration:0.28,ease:'back.out(1.6)'},0.1);\n` +
        `tl.from('#${id} .v',{innerText:0,snap:{innerText:1},duration:0.6,ease:'power1.out'},0.14);\n` +
        `tl.from('#${id} .tri',{scale:0,autoAlpha:0,duration:0.24,ease:'back.out(2)'},0.4);\n` +
        `tl.from('#${id} .panel',{x:-120,autoAlpha:0,duration:0.26,ease:'power3.out'},0.5);`,
    ),
  要点列表: () =>
    mk(
      'me_list',
      '要点列表',
      (id) => `
<div class="w">
  <div class="panel hd" data-edit="title">${txt('列表标题', 'List title')}</div>
  <div class="panel r r1"><i class="b1"></i><span data-edit="p1">${txt('要点一', 'Point 1')}</span></div>
  <div class="panel r r2"><i class="b2"></i><span data-edit="p2">${txt('要点二', 'Point 2')}</span></div>
  <div class="panel r r3"><i class="b3"></i><span data-edit="p3">${txt('要点三', 'Point 3')}</span></div>
</div>
<style>
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:560px;color:var(--fg);font-family:var(--font-head);}
${CONFETTI(id)}
#${id} .panel{${PANEL}}
#${id} .hd{display:inline-block;padding:14px 36px;font-size:42px;font-weight:900;}
#${id} .r{margin-top:26px;padding:20px 32px;display:flex;align-items:center;gap:24px;font-size:42px;font-weight:700;}
#${id} .r1{transform:rotate(-0.5deg);}
#${id} .r2{transform:rotate(0.6deg);margin-left:34px;}
#${id} .r3{transform:rotate(-0.4deg);margin-left:12px;}
#${id} .r i{flex:none;width:38px;height:38px;}
#${id} .b1{background:var(--accent);border-radius:999px;}
#${id} .b2{background:var(--accent-2);clip-path:polygon(50% 0,100% 100%,0 100%);}
#${id} .b3{border:5px solid var(--fg);background:var(--panel-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .hd',{y:-40,autoAlpha:0,duration:0.24,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .r1',{x:-160,autoAlpha:0,duration:0.24,ease:'power3.out'},0.14);\n` +
        `tl.from('#${id} .r2',{x:-160,autoAlpha:0,duration:0.24,ease:'power3.out'},0.26);\n` +
        `tl.from('#${id} .r3',{x:-160,autoAlpha:0,duration:0.24,ease:'power3.out'},0.38);\n` +
        `tl.from('#${id} .r i',{scale:0,duration:0.22,stagger:0.08,ease:'back.out(2)'},0.5);`,
    ),
  关键词重击: () =>
    mk(
      'me_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <div class="panel"><span class="t" data-edit="word">${txt('关键词', 'Keyword')}</span></div>
  <i class="tri"></i>
  <i class="half"></i>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:var(--fg);font-family:var(--font-head);}
${CONFETTI(id)}
#${id} .panel{${PANEL}padding:36px 64px 44px;transform:rotate(-1deg);}
#${id} .t{font-size:140px;font-weight:900;line-height:1;}
#${id} .tri{left:-74px;bottom:-46px;width:120px;height:108px;transform:rotate(-14deg);}
#${id} .half{right:-84px;top:-52px;width:150px;height:75px;transform:rotate(16deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .panel',{x:-180,autoAlpha:0,duration:0.26,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .tri,#${id} .half',{scale:0,autoAlpha:0,duration:0.24,stagger:0.09,ease:'back.out(1.8)'},0.28);`,
    ),
  标注: () =>
    mk(
      'me_call',
      '标注',
      (id) => `
<div class="w">
  <i class="circle"></i>
  <div class="chip" data-edit="note">${txt('标注一', 'Note 1')}</div>
</div>
<style>
#${id} .w{position:absolute;right:150px;top:26%;color:var(--fg);font-family:var(--font-head);}
${CONFETTI(id)}
#${id} .circle{left:0;top:70px;width:220px;height:220px;}
#${id} .chip{position:absolute;left:130px;top:0;background:var(--accent);color:var(--paper);border:4px solid var(--fg);border-radius:999px;padding:14px 36px;font-size:42px;font-weight:800;white-space:nowrap;box-shadow:var(--shadow);}
</style>`,
      (id) =>
        `tl.from('#${id} .circle',{scale:0,autoAlpha:0,duration:0.28,ease:'back.out(1.8)'},0);\n` +
        `tl.from('#${id} .chip',{scale:0,autoAlpha:0,duration:0.24,ease:'back.out(2)'},0.2);`,
    ),
  关注引导: () =>
    mk(
      'me_cta',
      '关注引导',
      (id) => `
<div class="w">
  <div class="panel">
    <div class="h" data-edit="side">${txt('说明一', 'Detail 1')}</div>
    <span class="pill" data-edit="cta">${txt('+ 关注', '+ Follow')}</span>
  </div>
  <i class="circle"></i>
  <i class="tri"></i>
  ${ZIGZAG(220)}
</div>
<style>
#${id} .w{position:absolute;right:96px;bottom:104px;width:440px;color:var(--fg);font-family:var(--font-head);}
${CONFETTI(id)}
#${id} .panel{${PANEL}padding:28px 36px 32px;display:flex;flex-direction:column;align-items:flex-start;gap:20px;}
#${id} .h{font-size:44px;font-weight:900;}
#${id} .pill{background:var(--accent);color:var(--paper);border:4px solid var(--fg);border-radius:999px;padding:12px 40px;font-size:44px;font-weight:800;}
#${id} .circle{left:-58px;top:-52px;width:100px;height:100px;}
#${id} .tri{right:-40px;top:-40px;width:84px;height:76px;transform:rotate(20deg);}
#${id} .zig{left:30px;bottom:-48px;}
${ZIG_CSS(id, 220)}
</style>`,
      (id) =>
        `tl.from('#${id} .panel',{x:140,autoAlpha:0,duration:0.28,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .pill',{scale:0,duration:0.24,ease:'back.out(2)'},0.24);\n` +
        `tl.from('#${id} .circle,#${id} .tri',{scale:0,autoAlpha:0,duration:0.22,stagger:0.09,ease:'back.out(1.8)'},0.4);\n` +
        `tl.to('#${id} .zig polyline',{strokeDashoffset:0,duration:0.34,ease:'power2.out'},0.56);`,
    ),
  金句: () =>
    mk(
      'me_quote',
      '金句',
      (id) => `
<div class="w">
  <div class="panel">
    <div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b class="key" data-edit="l2">${txt('下半句。', 'and line two.')}</b></div>
    <div class="a" data-edit="from">${txt('—— 署名', '— Attribution')}</div>
  </div>
  <i class="ring"></i>
  <i class="tri"></i>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);width:58%;color:var(--fg);font-family:var(--font-head);}
${CONFETTI(id)}
#${id} .panel{${PANEL}padding:32px 48px 26px;}
#${id} .t{font-size:56px;font-weight:900;line-height:1.35;}
#${id} .key{position:relative;}
#${id} .ring{position:absolute;right:26%;top:-16px;width:250px;height:110px;border:6px solid var(--fg);border-radius:999px;transform:rotate(-3deg);}
#${id} .a{margin-top:12px;font-size:30px;font-weight:700;color:var(--muted);text-align:right;}
#${id} .tri{left:-64px;top:-44px;width:100px;height:90px;transform:rotate(-16deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .panel',{x:-160,autoAlpha:0,duration:0.3,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,y:20,duration:0.24},0.16);\n` +
        `tl.from('#${id} .ring',{scale:0,autoAlpha:0,duration:0.26,ease:'back.out(1.8)'},0.36);\n` +
        `tl.from('#${id} .tri',{scale:0,autoAlpha:0,duration:0.22,ease:'back.out(2)'},0.5);`,
    ),
  左右对比: () =>
    mk(
      'me_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="panel s a"><i class="b1"></i><em data-edit="lt">${txt('选项一', 'Option A')}</em><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <span class="vs">VS</span>
  <div class="panel s b"><i class="b2"></i><em data-edit="rt">${txt('选项二', 'Option B')}</em><b data-edit="rv">${txt('数值二', 'Value B')}</b></div>
  <i class="half"></i>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);display:flex;align-items:center;gap:26px;color:var(--fg);font-family:var(--font-head);}
${CONFETTI(id)}
#${id} .panel{${PANEL}}
#${id} .s{position:relative;width:340px;padding:26px 30px;text-align:center;}
#${id} .a{transform:rotate(-0.6deg);}
#${id} .b{transform:rotate(0.6deg);}
#${id} .s i{position:absolute;left:22px;top:-20px;width:36px;height:36px;}
#${id} .b1{border:5px solid var(--fg);background:var(--panel-2);border-radius:999px;}
#${id} .b2{background:var(--accent);border-radius:999px;border:4px solid var(--fg);}
#${id} .s em{display:block;font-style:normal;font-size:30px;font-weight:800;color:var(--muted);}
#${id} .s b{display:block;margin-top:8px;font-family:var(--font-num);font-size:66px;font-weight:800;line-height:1;}
#${id} .vs{font-size:46px;font-weight:900;flex:none;}
#${id} .half{right:-70px;top:-58px;width:130px;height:65px;transform:rotate(-16deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .a',{x:-160,autoAlpha:0,duration:0.26,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .vs',{scale:0,duration:0.2,ease:'back.out(2)'},0.16);\n` +
        `tl.from('#${id} .b',{x:160,autoAlpha:0,duration:0.26,ease:'power3.out'},0.22);\n` +
        `tl.from('#${id} .s i,#${id} .half',{scale:0,autoAlpha:0,duration:0.22,stagger:0.08,ease:'back.out(1.8)'},0.44);`,
    ),
};

export type { Block };
