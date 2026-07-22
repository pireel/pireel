/**
 * Paper-cut overlay elements: hanging-ornament language — stacked notched red paper boards
 * (panel on top + panel-2 offset 18px to the bottom-right, cut with a clip-path), gold L-shaped
 * corner marks, a round gold seal (6px gold border with glow, stamped down last with scale
 * 1.6->1 power3.in), vertical couplet strips (writing-mode: vertical-rl, dropping like a hanging
 * scroll), hollow gold cloud arcs. Cream serif is the main ink; gold is precious — at most one
 * gilded touch per element.
 */

import { mk, txt, type Block } from '../dialects/shared';

const CUT = (n: number) =>
  `clip-path:polygon(${n}px 0,calc(100% - ${n}px) 0,100% ${n}px,100% calc(100% - ${n}px),calc(100% - ${n}px) 100%,${n}px 100%,0 calc(100% - ${n}px),0 ${n}px);`;
const SEAL =
  'border:6px solid var(--accent);border-radius:999px;color:var(--accent);box-shadow:var(--glow);display:flex;align-items:center;justify-content:center;';

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'pc_ttl',
      '标题条',
      (id) => `
<div class="w">
  <div class="p2"></div>
  <div class="p1">
    <div class="k" data-edit="kick">${txt('标 签', 'Label')}</div>
    <div class="h" data-edit="title">${txt('标题一', 'Title 1')}</div>
  </div>
  <div class="seal" data-edit="seal">吉</div>
</div>
<style>
#${id} .w{position:absolute;left:72px;bottom:92px;width:58%;height:230px;font-family:var(--font-head);color:var(--fg);}
#${id} .p1,#${id} .p2{position:absolute;inset:0;${CUT(32)}}
#${id} .p1{background:var(--panel);padding:34px 48px;}
#${id} .p2{background:var(--panel-2);transform:translate(18px,18px);}
#${id} .k{font-size:30px;letter-spacing:0.4em;color:var(--accent);}
#${id} .h{margin-top:14px;font-size:82px;font-weight:800;letter-spacing:0.04em;line-height:1.1;}
#${id} .seal{position:absolute;right:-26px;top:-40px;width:110px;height:110px;${SEAL}font-size:52px;font-weight:700;transform:rotate(6deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .p2',{autoAlpha:0,scale:0.97,duration:0.24,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .p1',{autoAlpha:0,scale:0.97,duration:0.24,ease:'power2.out'},0.08);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,y:16,duration:0.22},0.26);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,y:26,duration:0.26,ease:'power2.out'},0.36);\n` +
        `tl.from('#${id} .seal',{scale:1.6,autoAlpha:0,duration:0.22,ease:'power3.in'},0.72);`,
    ),
  大数字: () =>
    mk(
      'pc_num',
      '大数字',
      (id) => `
<div class="w">
  <div class="p2"></div>
  <div class="p1">
    <div class="cm tl"></div><div class="cm tr"></div><div class="cm bl"></div><div class="cm br"></div>
    <div class="lab" data-edit="label">${txt('数 据 说 明', 'Data label')}</div>
    <div class="v"><b data-edit="num">38</b><span data-edit="unit">${txt('成', '%')}</span></div>
    <div class="cloud"><i></i><i class="m"></i><i></i></div>
  </div>
</div>
<style>
#${id} .w{position:absolute;right:96px;top:110px;width:460px;height:420px;font-family:var(--font-head);color:var(--fg);}
#${id} .p1,#${id} .p2{position:absolute;inset:0;${CUT(30)}}
#${id} .p1{background:var(--panel);padding:40px 36px;text-align:center;}
#${id} .p2{background:var(--panel-2);transform:translate(18px,18px);}
#${id} .cm{position:absolute;width:48px;height:48px;border:0 solid var(--accent);}
#${id} .cm.tl{left:16px;top:16px;border-left-width:5px;border-top-width:5px;}
#${id} .cm.tr{right:16px;top:16px;border-right-width:5px;border-top-width:5px;}
#${id} .cm.bl{left:16px;bottom:16px;border-left-width:5px;border-bottom-width:5px;}
#${id} .cm.br{right:16px;bottom:16px;border-right-width:5px;border-bottom-width:5px;}
#${id} .lab{font-size:32px;letter-spacing:0.32em;color:var(--muted);}
#${id} .v{margin-top:8px;line-height:1;}
#${id} .v b{font-family:var(--font-num);font-size:200px;font-weight:800;color:var(--accent);}
#${id} .v span{font-size:60px;font-weight:700;margin-left:10px;}
#${id} .cloud{margin-top:22px;display:flex;justify-content:center;align-items:flex-end;gap:6px;}
#${id} .cloud i{width:64px;height:34px;border:5px solid var(--accent);border-bottom:none;border-radius:96px 96px 0 0;opacity:0.7;}
#${id} .cloud i.m{width:84px;height:46px;opacity:1;}
</style>`,
      (id) =>
        `tl.from('#${id} .p2,#${id} .p1',{autoAlpha:0,scale:0.97,duration:0.26,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .v b',{innerText:0,snap:{innerText:1},duration:0.6,ease:'power1.out'},0.2);\n` +
        `tl.from('#${id} .v',{y:30,autoAlpha:0,duration:0.24,ease:'power2.out'},0.16);\n` +
        `tl.from('#${id} .cloud i',{autoAlpha:0,y:14,duration:0.2,stagger:0.06},0.6);`,
    ),
  要点列表: () =>
    mk(
      'pc_list',
      '要点列表',
      (id) => `
<div class="w">
  <div class="p2"></div>
  <div class="p1">
    <div class="k" data-edit="title">${txt('列 表 标 题', 'List title')}</div>
    <div class="r r1"><i></i><span data-edit="p1">${txt('要点一', 'Point 1')}</span></div>
    <div class="r r2"><i></i><span data-edit="p2">${txt('要点二', 'Point 2')}</span></div>
    <div class="r r3"><i></i><span data-edit="p3">${txt('要点三', 'Point 3')}</span></div>
  </div>
</div>
<style>
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:560px;height:460px;font-family:var(--font-head);color:var(--fg);}
#${id} .p1,#${id} .p2{position:absolute;inset:0;${CUT(30)}}
#${id} .p1{background:var(--panel);padding:36px 44px;}
#${id} .p2{background:var(--panel-2);transform:translate(18px,18px);}
#${id} .k{font-size:32px;letter-spacing:0.4em;color:var(--accent);text-align:center;border-bottom:2px solid var(--line);padding-bottom:18px;}
#${id} .r{display:flex;align-items:center;gap:22px;padding:24px 2px;font-size:42px;font-weight:700;border-bottom:2px solid var(--line);}
#${id} .r:last-child{border-bottom:none;}
#${id} .r i{width:46px;height:26px;border:5px solid var(--accent);border-bottom:none;border-radius:96px 96px 0 0;flex:none;transform:translateY(6px);}
</style>`,
      (id) =>
        `tl.from('#${id} .p2,#${id} .p1',{autoAlpha:0,scale:0.97,duration:0.26,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .r1',{x:-60,autoAlpha:0,duration:0.22,ease:'power2.out'},0.22);\n` +
        `tl.from('#${id} .r2',{x:-60,autoAlpha:0,duration:0.22,ease:'power2.out'},0.36);\n` +
        `tl.from('#${id} .r3',{x:-60,autoAlpha:0,duration:0.22,ease:'power2.out'},0.5);`,
    ),
  关键词重击: () =>
    mk(
      'pc_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <div class="p2"></div>
  <div class="p1">
    <div class="cm tl"></div><div class="cm tr"></div><div class="cm bl"></div><div class="cm br"></div>
    <span class="t" data-edit="word">${txt('关键词', 'Keyword')}</span>
  </div>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:46%;height:290px;font-family:var(--font-head);}
#${id} .p1,#${id} .p2{position:absolute;inset:0;${CUT(36)}}
#${id} .p1{background:var(--panel);display:flex;align-items:center;justify-content:center;}
#${id} .p2{background:var(--panel-2);transform:translate(18px,18px);}
#${id} .cm{position:absolute;width:52px;height:52px;border:0 solid var(--accent);}
#${id} .cm.tl{left:18px;top:18px;border-left-width:5px;border-top-width:5px;}
#${id} .cm.tr{right:18px;top:18px;border-right-width:5px;border-top-width:5px;}
#${id} .cm.bl{left:18px;bottom:18px;border-left-width:5px;border-bottom-width:5px;}
#${id} .cm.br{right:18px;bottom:18px;border-right-width:5px;border-bottom-width:5px;}
#${id} .t{color:var(--fg);font-size:140px;font-weight:900;letter-spacing:0.06em;line-height:1;white-space:nowrap;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{scale:1.5,autoAlpha:0,duration:0.22,ease:'power3.in'},0);\n` +
        `tl.from('#${id} .cm',{autoAlpha:0,scale:0.6,duration:0.2,ease:'power2.out',stagger:0.05},0.26);`,
    ),
  标注: () =>
    mk(
      'pc_call',
      '标注',
      (id) => `
<div class="w">
  <div class="cpl" data-edit="note">${txt('标注一', 'Note 1')}</div>
  <div class="seal" data-edit="seal">注</div>
</div>
<style>
#${id} .w{position:absolute;right:170px;top:16%;font-family:var(--font-head);text-align:center;}
#${id} .cpl{writing-mode:vertical-rl;background:var(--panel-2);border:2px solid var(--line);box-shadow:var(--shadow);color:var(--fg);font-size:46px;font-weight:600;letter-spacing:0.18em;padding:44px 22px;}
#${id} .seal{width:86px;height:86px;margin:18px auto 0;${SEAL}font-size:40px;font-weight:700;transform:rotate(-6deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .cpl',{y:-140,autoAlpha:0,duration:0.32,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .seal',{scale:1.6,autoAlpha:0,duration:0.22,ease:'power3.in'},0.44);`,
    ),
  关注引导: () =>
    mk(
      'pc_cta',
      '关注引导',
      (id) => `
<div class="w">
  <div class="ring" data-edit="cta">${txt('+ 关注', '+ Follow')}</div>
  <div class="f" data-edit="side">${txt('说 明 一', 'Detail 1')}</div>
</div>
<style>
#${id} .w{position:absolute;right:110px;bottom:96px;text-align:center;font-family:var(--font-head);}
#${id} .ring{width:230px;height:230px;margin:0 auto;${SEAL}writing-mode:vertical-rl;font-size:72px;font-weight:800;letter-spacing:0.12em;transform:rotate(6deg);background:var(--panel-2);}
#${id} .f{margin-top:20px;font-size:26px;letter-spacing:0.3em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .ring',{scale:1.6,autoAlpha:0,duration:0.24,ease:'power3.in'},0.1);\n` +
        `tl.from('#${id} .f',{autoAlpha:0,y:14,duration:0.24},0.44);`,
    ),
  金句: () =>
    mk(
      'pc_quote',
      '金句',
      (id) => `
<div class="w">
  <div class="cpl a" data-edit="l1">金句上半句</div>
  <div class="cpl b" data-edit="l2">对出下半句</div>
  <div class="seal" data-edit="seal">印</div>
</div>
<style>
#${id} .w{position:absolute;right:130px;top:90px;font-family:var(--font-head);}
#${id} .cpl{position:absolute;writing-mode:vertical-rl;background:var(--panel-2);border:2px solid var(--line);box-shadow:var(--shadow);color:var(--fg);font-size:56px;font-weight:700;letter-spacing:0.16em;padding:48px 26px;}
#${id} .a{right:0;top:0;}
#${id} .b{right:150px;top:90px;}
#${id} .seal{position:absolute;right:170px;top:600px;width:96px;height:96px;${SEAL}font-size:44px;font-weight:700;transform:rotate(8deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .a',{y:-160,autoAlpha:0,duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .b',{y:-160,autoAlpha:0,duration:0.3,ease:'power2.out'},0.2);\n` +
        `tl.from('#${id} .seal',{scale:1.6,autoAlpha:0,duration:0.22,ease:'power3.in'},0.58);`,
    ),
  左右对比: () =>
    mk(
      'pc_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="s sa"><div class="p2"></div><div class="p1"><i data-edit="lt">${txt('选项一', 'Option A')}</i><b data-edit="lv">${txt('数值一', 'Value A')}</b></div></div>
  <div class="mid">比</div>
  <div class="s sb"><div class="p2"></div><div class="p1"><i data-edit="rt">${txt('选项二', 'Option B')}</i><b class="g" data-edit="rv">${txt('数值二', 'Value B')}</b></div></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:100px;transform:translateX(-50%);display:flex;align-items:center;gap:34px;font-family:var(--font-head);color:var(--fg);}
#${id} .s{position:relative;width:340px;height:210px;}
#${id} .s .p1,#${id} .s .p2{position:absolute;inset:0;${CUT(24)}}
#${id} .s .p1{background:var(--panel);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;}
#${id} .s .p2{background:var(--panel-2);transform:translate(14px,14px);}
#${id} .s i{font-style:normal;font-size:30px;letter-spacing:0.24em;color:var(--muted);}
#${id} .s b{font-family:var(--font-num);font-size:70px;font-weight:800;line-height:1;}
#${id} .s b.g{color:var(--accent);}
#${id} .mid{width:96px;height:96px;flex:none;${SEAL}font-size:42px;font-weight:700;transform:rotate(6deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .sa',{x:-100,autoAlpha:0,duration:0.24,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .sb',{x:100,autoAlpha:0,duration:0.24,ease:'power2.out'},0.14);\n` +
        `tl.from('#${id} .mid',{scale:1.6,autoAlpha:0,duration:0.22,ease:'power3.in'},0.5);`,
    ),
};

export type { Block };
