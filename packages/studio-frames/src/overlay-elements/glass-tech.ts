/**
 * 玻璃 Glass 的口播叠加件:悬浮磨砂 pane 语言——每件是一片自带 frost 底的玻璃
 * (--panel 8% 白 + backdrop blur + --line 边而顶边 --muted 更亮读作受光棱 + 28px 圆角),
 * pane 内部藏一颗 blur 光斑(overflow hidden 裁住)当光源、玻璃 chip 药丸带发光小圆点、
 * 数据用 mono accent 冰蓝 + text-shadow 光晕。光先亮,玻璃后浮起。
 */

import { mk, txt, type Block } from '../dialects/shared';

const PANE =
  'overflow:hidden;background:var(--panel);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);border:1px solid var(--line);border-top-color:var(--muted);border-radius:var(--radius);box-shadow:var(--shadow);color:var(--fg);';

const base = (id: string) => `
#${id} .orb{position:absolute;border-radius:999px;filter:blur(60px);opacity:0.5;pointer-events:none;}
#${id} .oa{background:var(--accent);}
#${id} .ob{background:var(--accent-2);}
#${id} .chip{display:inline-flex;align-items:center;gap:16px;padding:12px 30px;border-radius:999px;background:var(--panel-2);border:1px solid var(--line);font-size:28px;color:var(--muted);letter-spacing:0.12em;}
#${id} .chip i{width:12px;height:12px;border-radius:999px;background:var(--accent);box-shadow:var(--glow);flex:none;}`;

const orbIn = (id: string) => `tl.from('#${id} .orb',{autoAlpha:0,scale:0.6,duration:0.4,stagger:0.08},0);`;

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'gt_ttl',
      '标题条',
      (id) => `
<div class="w">
  <i class="orb oa o1"></i><i class="orb ob o2"></i>
  <div class="chip"><i></i><span data-edit="kick">${txt('标签 · HANDS-ON', 'HANDS-ON · LABEL')}</span></div>
  <div class="t" data-edit="title">${txt('标题一', 'Title 1')}</div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:76px;bottom:96px;width:60%;${PANE}padding:36px 52px 40px;display:flex;flex-direction:column;align-items:flex-start;gap:26px;font-family:var(--font-head);}
#${id} .o1{width:420px;height:420px;left:-140px;top:-180px;}
#${id} .o2{width:360px;height:360px;right:-140px;bottom:-200px;}
#${id} .t{font-size:72px;font-weight:900;line-height:1.2;letter-spacing:-0.01em;}
</style>`,
      (id) =>
        `${orbIn(id)}\n` +
        `tl.from('#${id} .w',{y:60,autoAlpha:0,duration:0.4,ease:'power2.out'},0.1);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,y:22,duration:0.3},0.4);\n` +
        `tl.from('#${id} .chip i',{scale:0,duration:0.24,ease:'back.out(2)'},0.55);`,
    ),
  大数字: () =>
    mk(
      'gt_num',
      '大数字',
      (id) => `
<div class="w">
  <i class="orb oa o1"></i>
  <div class="lab" data-edit="label">${txt('数据说明', 'Data label')}</div>
  <div class="v"><b class="n" data-edit="num">89</b><i data-edit="unit">%</i></div>
  <div class="chip"><i></i><span data-edit="note">REAL WORLD · 30 DAYS</span></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;right:96px;top:110px;width:470px;${PANE}padding:36px 48px 40px;display:flex;flex-direction:column;align-items:flex-start;gap:22px;font-family:var(--font-head);}
#${id} .o1{width:380px;height:380px;right:-140px;top:-160px;}
#${id} .lab{font-size:32px;color:var(--muted);letter-spacing:0.08em;}
#${id} .v{display:flex;align-items:baseline;line-height:1;font-family:var(--font-num);}
#${id} .v .n{font-size:180px;font-weight:800;letter-spacing:-0.04em;color:var(--accent);text-shadow:var(--glow);}
#${id} .v i{font-style:normal;font-size:80px;color:var(--fg);margin-left:10px;}
</style>`,
      (id) =>
        `tl.from('#${id} .orb',{autoAlpha:0,scale:0.6,duration:0.4},0);\n` +
        `tl.from('#${id} .w',{y:-60,autoAlpha:0,duration:0.38,ease:'power2.out'},0.08);\n` +
        `tl.from('#${id} .n',{innerText:0,snap:{innerText:1},duration:0.6,ease:'power1.out'},0.3);\n` +
        `tl.from('#${id} .chip i',{scale:0,duration:0.24,ease:'back.out(2)'},0.7);`,
    ),
  要点列表: () =>
    mk(
      'gt_list',
      '要点列表',
      (id) => `
<div class="w">
  <i class="orb ob o1"></i>
  <div class="chip hd"><i></i><span data-edit="title">${txt('列表标题 · CHECKLIST', 'CHECKLIST')}</span></div>
  <div class="r r1"><b class="n a">01</b><span data-edit="p1">${txt('要点一', 'Point 1')}</span></div>
  <div class="r r2"><b class="n">02</b><span data-edit="p2">${txt('要点二', 'Point 2')}</span></div>
  <div class="r r3"><b class="n">03</b><span data-edit="p3">${txt('要点三', 'Point 3')}</span></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:580px;${PANE}padding:34px 46px 38px;display:flex;flex-direction:column;align-items:flex-start;gap:26px;font-family:var(--font-head);}
#${id} .o1{width:400px;height:400px;left:-160px;bottom:-200px;}
#${id} .r{display:flex;align-items:center;gap:28px;}
#${id} .n{font-family:var(--font-num);font-size:34px;font-weight:700;color:var(--muted);background:var(--panel-2);border:1px solid var(--line);border-radius:16px;padding:12px 20px;flex:none;}
#${id} .n.a{color:var(--paper);background:var(--accent);border-color:var(--accent);box-shadow:var(--glow);}
#${id} .r span{font-size:42px;font-weight:800;}
</style>`,
      (id) =>
        `tl.from('#${id} .orb',{autoAlpha:0,scale:0.6,duration:0.4},0);\n` +
        `tl.from('#${id} .w',{x:-60,autoAlpha:0,duration:0.38,ease:'power2.out'},0.08);\n` +
        `tl.from('#${id} .r',{y:30,autoAlpha:0,duration:0.28,stagger:0.12,ease:'power2.out'},0.34);\n` +
        `tl.from('#${id} .n.a',{scale:0.6,duration:0.24,ease:'back.out(2)'},0.8);`,
    ),
  关键词重击: () =>
    mk(
      'gt_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <i class="orb oa o1"></i><i class="orb ob o2"></i>
  <div class="chip"><i></i><span data-edit="kick">KEY SPEC</span></div>
  <div class="t" data-edit="word">${txt('关键词', 'Keyword')}</div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:520px;max-width:52%;${PANE}padding:38px 80px 52px;display:flex;flex-direction:column;align-items:center;gap:26px;font-family:var(--font-head);}
#${id} .o1{width:380px;height:380px;left:-140px;top:-160px;}
#${id} .o2{width:340px;height:340px;right:-140px;bottom:-180px;}
#${id} .t{font-size:136px;font-weight:900;line-height:1.1;color:var(--accent);text-shadow:var(--glow);}
</style>`,
      (id) =>
        `${orbIn(id)}\n` +
        `tl.from('#${id} .w',{scale:0.85,autoAlpha:0,duration:0.32,ease:'power2.out'},0.08);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,y:24,duration:0.3,ease:'power2.out'},0.36);\n` +
        `tl.from('#${id} .chip i',{scale:0,duration:0.24,ease:'back.out(2)'},0.55);`,
    ),
  标注: () =>
    mk(
      'gt_call',
      '标注',
      (id) => `
<div class="w">
  <i class="orb oa o1"></i>
  <div class="chip"><i></i><span data-edit="tag">FOCUS</span></div>
  <b data-edit="note">${txt('标注一', 'Note 1')}</b>
</div>
<style>${base(id)}
#${id} .w{position:absolute;right:150px;top:28%;${PANE}padding:26px 40px;display:flex;align-items:center;gap:28px;font-family:var(--font-head);}
#${id} .o1{width:260px;height:260px;right:-100px;top:-120px;}
#${id} .w b{font-size:44px;font-weight:800;}
</style>`,
      (id) =>
        `tl.from('#${id} .orb',{autoAlpha:0,scale:0.6,duration:0.36},0);\n` +
        `tl.from('#${id} .w',{y:-44,autoAlpha:0,duration:0.34,ease:'power2.out'},0.06);\n` +
        `tl.from('#${id} .chip i',{scale:0,duration:0.24,ease:'back.out(2)'},0.4);\n` +
        `tl.from('#${id} .w b',{autoAlpha:0,duration:0.24},0.44);`,
    ),
  关注引导: () =>
    mk(
      'gt_cta',
      '关注引导',
      (id) => `
<div class="w">
  <i class="orb ob o1"></i>
  <div class="chip"><i></i><span data-edit="side">${txt('NEXT DROP · 说明一', 'NEXT DROP · DETAIL 1')}</span></div>
  <div class="pill" data-edit="cta">${txt('+ 关注', '+ Follow')}</div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;right:96px;bottom:110px;${PANE}padding:32px 46px 38px;display:flex;flex-direction:column;align-items:flex-start;gap:26px;font-family:var(--font-head);}
#${id} .o1{width:320px;height:320px;right:-120px;bottom:-160px;}
#${id} .pill{background:var(--accent);color:var(--paper);border-radius:999px;box-shadow:var(--glow);font-size:52px;font-weight:900;padding:22px 72px;}
</style>`,
      (id) =>
        `tl.from('#${id} .orb',{autoAlpha:0,scale:0.6,duration:0.36},0);\n` +
        `tl.from('#${id} .w',{y:60,autoAlpha:0,duration:0.36,ease:'power2.out'},0.08);\n` +
        `tl.from('#${id} .pill',{scale:0.6,autoAlpha:0,duration:0.28,ease:'back.out(1.6)'},0.42);\n` +
        `tl.from('#${id} .chip i',{scale:0,duration:0.24,ease:'back.out(2)'},0.55);`,
    ),
  金句: () =>
    mk(
      'gt_quote',
      '金句',
      (id) => `
<div class="w">
  <i class="orb oa o1"></i><i class="orb ob o2"></i>
  <div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b data-edit="l2">${txt('下半句。', 'and line two.')}</b></div>
  <div class="sig" data-edit="sig">${txt('—— 署名', '— Attribution')}</div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);width:60%;${PANE}padding:40px 56px 34px;font-family:var(--font-head);}
#${id} .o1{width:380px;height:380px;left:-140px;top:-180px;}
#${id} .o2{width:320px;height:320px;right:-120px;bottom:-180px;}
#${id} .t{font-size:56px;font-weight:800;line-height:1.45;}
#${id} .t b{color:var(--accent);font-weight:900;text-shadow:var(--glow);}
#${id} .sig{margin-top:18px;font-size:30px;color:var(--muted);letter-spacing:0.08em;text-align:right;}
</style>`,
      (id) =>
        `${orbIn(id)}\n` +
        `tl.from('#${id} .w',{y:60,autoAlpha:0,duration:0.4,ease:'power2.out'},0.08);\n` +
        `tl.from('#${id} .t b',{autoAlpha:0,duration:0.28},0.46);\n` +
        `tl.from('#${id} .sig',{autoAlpha:0,duration:0.26},0.6);`,
    ),
  左右对比: () =>
    mk(
      'gt_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="s a"><i class="orb ob o1"></i><span data-edit="lt">${txt('选项一', 'Option A')}</span><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <div class="chip vs"><i></i>VS</div>
  <div class="s b"><i class="orb oa o2"></i><span data-edit="rt">${txt('选项二', 'Option B')}</span><b class="win" data-edit="rv">${txt('数值二', 'Value B')}</b></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);display:flex;align-items:center;gap:26px;font-family:var(--font-head);}
#${id} .s{position:relative;width:380px;${PANE}padding:30px 40px 34px;display:flex;flex-direction:column;gap:16px;}
#${id} .o1{width:240px;height:240px;left:-100px;bottom:-120px;}
#${id} .o2{width:240px;height:240px;right:-100px;top:-120px;}
#${id} .s span{font-size:30px;color:var(--muted);letter-spacing:0.08em;}
#${id} .s b{font-family:var(--font-num);font-size:64px;font-weight:800;line-height:1;}
#${id} .s .win{color:var(--accent);text-shadow:var(--glow);}
</style>`,
      (id) =>
        `tl.from('#${id} .orb',{autoAlpha:0,scale:0.6,duration:0.36},0);\n` +
        `tl.from('#${id} .a',{x:-70,autoAlpha:0,duration:0.34,ease:'power2.out'},0.06);\n` +
        `tl.from('#${id} .vs',{scale:0.6,autoAlpha:0,duration:0.24,ease:'back.out(1.6)'},0.26);\n` +
        `tl.from('#${id} .b',{x:70,autoAlpha:0,duration:0.34,ease:'power2.out'},0.32);\n` +
        `tl.from('#${id} .win',{autoAlpha:0,duration:0.24},0.7);`,
    ),
};

export type { Block };
