/**
 * 翻牌 Flipboard 的口播叠加件:单条 departure row 语言——每件带一小段 --paper 候机厅
 * 墙面(自带横向 ruled 线),上面钉翻牌格(上半 --panel / 下半 --panel-2 / 4px --paper 中缝),
 * mono 大写字距、琥珀目的地、准点绿 chip(每屏限一枚)。动效只许翻:rotationX -90→0
 * 逐格波浪 + chip steps 闪,不淡入不弹跳不发光。
 */

import { mk, txt, type Block } from '../dialects/shared';

const FLIP = `transformPerspective:900,transformOrigin:'center center'`;

const BAND =
  'background-color:var(--paper);background-image:linear-gradient(var(--grid) 2px,transparent 2px);background-size:100% 108px;box-shadow:var(--shadow);color:var(--fg);font-family:var(--font-num);';

const base = (id: string) => `
#${id} .tiles{display:flex;gap:12px;}
#${id} .tiles i{display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:700;letter-spacing:0.04em;white-space:nowrap;border-radius:var(--radius);box-shadow:var(--shadow);background:linear-gradient(180deg,var(--panel) 0,var(--panel) calc(50% - 2px),var(--paper) calc(50% - 2px),var(--paper) calc(50% + 2px),var(--panel-2) calc(50% + 2px),var(--panel-2) 100%);}
#${id} .amber i{color:var(--accent);}
#${id} .chip{display:inline-flex;align-items:center;justify-content:center;padding:8px 26px;border:3px solid var(--accent-2);border-radius:var(--radius);color:var(--accent-2);font-size:28px;font-weight:700;letter-spacing:0.14em;white-space:nowrap;}
#${id} .chip.amber{border-color:var(--accent);color:var(--accent);}
#${id} .cap{font-size:26px;font-weight:700;letter-spacing:0.28em;color:var(--muted);text-transform:uppercase;}`;

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'fl_ttl',
      '标题条',
      (id) => `
<div class="w">
  <div class="hd"><span class="cap" data-edit="kick">${txt('出发 DEPARTURES', 'DEPARTURES')}</span><b data-edit="tag">PR-101</b></div>
  <div class="row">
    <div class="tiles amber"><i class="f1" data-edit="t1">${txt('标题一', 'TITLE 1')}</i><i class="f2" data-edit="t2">${txt('标题二', 'TITLE 2')}</i></div>
    <span class="chip ok" data-edit="chip">${txt('准点 ON TIME', 'ON TIME')}</span>
  </div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:76px;bottom:96px;width:60%;${BAND}padding:26px 40px 32px;}
#${id} .hd{display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid var(--line);padding-bottom:16px;}
#${id} .hd b{font-size:28px;font-weight:700;letter-spacing:0.2em;color:var(--accent);}
#${id} .row{margin-top:24px;display:flex;align-items:center;gap:30px;}
#${id} .tiles i{height:130px;min-width:150px;padding:0 34px;font-size:76px;}
</style>`,
      (id) =>
        `tl.from('#${id} .hd',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .f1',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out'},0.12);\n` +
        `tl.from('#${id} .f2',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out'},0.2);\n` +
        `tl.from('#${id} .chip',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0.34);\n` +
        `tl.to('#${id} .chip',{autoAlpha:0,duration:0.08,yoyo:true,repeat:3,ease:'steps(1)'},0.6);`,
    ),
  大数字: () =>
    mk(
      'fl_num',
      '大数字',
      (id) => `
<div class="w">
  <div class="cap" data-edit="label">${txt('数据说明 DATA', 'DATA LABEL')}</div>
  <div class="tiles amber"><i class="v" data-edit="num">1286</i><i class="u" data-edit="unit">${txt('家', 'SHOPS')}</i></div>
  <div class="note" data-edit="note">${txt('环比上月 +42%', '+42% VS LAST MONTH')}</div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;right:96px;top:110px;${BAND}padding:26px 38px 30px;display:flex;flex-direction:column;align-items:center;gap:22px;}
#${id} .tiles .v{height:200px;padding:0 40px;font-size:140px;}
#${id} .tiles .u{height:200px;min-width:130px;font-size:90px;color:var(--fg);}
#${id} .note{font-size:26px;font-weight:700;letter-spacing:0.14em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.18,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .v',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out'},0.1);\n` +
        `tl.from('#${id} .v',{innerText:0,snap:{innerText:1},duration:0.6,ease:'power1.out'},0.16);\n` +
        `tl.from('#${id} .u',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out'},0.24);\n` +
        `tl.to('#${id} .v',{rotationX:-14,duration:0.07,yoyo:true,repeat:1,ease:'power1.inOut'},0.8);\n` +
        `tl.from('#${id} .note',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0.9);`,
    ),
  要点列表: () =>
    mk(
      'fl_list',
      '要点列表',
      (id) => `
<div class="w">
  <div class="cols"><span data-edit="c1">${txt('航段 LEG', 'LEG')}</span><span data-edit="c2">${txt('目的地 DEST', 'DEST')}</span></div>
  <div class="r r1"><span class="no">LEG 1</span><span class="dst" data-edit="p1">${txt('要点一', 'Point 1')}</span></div>
  <div class="r r2"><span class="no">LEG 2</span><span class="dst" data-edit="p2">${txt('要点二', 'Point 2')}</span></div>
  <div class="r r3"><span class="no">LEG 3</span><span class="dst" data-edit="p3">${txt('要点三', 'Point 3')}</span></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:600px;${BAND}padding:26px 40px 14px;}
#${id} .cols{display:flex;gap:60px;font-size:24px;font-weight:700;letter-spacing:0.24em;color:var(--muted);border-bottom:3px solid var(--line);padding-bottom:16px;}
#${id} .r{display:flex;align-items:center;gap:44px;padding:26px 0;border-bottom:3px solid var(--line);}
#${id} .r:last-child{border-bottom:none;}
#${id} .no{font-size:28px;font-weight:700;letter-spacing:0.14em;color:var(--muted);flex:none;}
#${id} .dst{font-size:44px;font-weight:700;letter-spacing:0.06em;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .cols',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.18,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .r1',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out'},0.14);\n` +
        `tl.from('#${id} .r2',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out'},0.28);\n` +
        `tl.from('#${id} .r3',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out'},0.42);`,
    ),
  关键词重击: () =>
    mk(
      'fl_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <div class="cap" data-edit="kick">${txt('现在呼叫 NOW CALLING', 'NOW CALLING')}</div>
  <div class="tiles amber"><i class="k" data-edit="word">${txt('关键词', 'Keyword')}</i></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);${BAND}padding:26px 44px 34px;display:flex;flex-direction:column;align-items:center;gap:22px;max-width:52%;}
#${id} .tiles .k{height:230px;padding:0 60px;font-size:150px;letter-spacing:0.02em;}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.18,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .k',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.24,ease:'power2.out'},0.12);\n` +
        `tl.to('#${id} .k',{rotationX:-14,duration:0.07,yoyo:true,repeat:1,ease:'power1.inOut'},0.4);`,
    ),
  标注: () =>
    mk(
      'fl_call',
      '标注',
      (id) => `
<div class="w">
  <span class="cap" data-edit="tag">GATE 24</span>
  <div class="tiles amber"><i class="n" data-edit="note">${txt('标注一', 'Note 1')}</i></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;right:150px;top:26%;${BAND}padding:22px 32px 26px;display:flex;flex-direction:column;align-items:center;gap:16px;}
#${id} .tiles .n{height:110px;padding:0 34px;font-size:60px;}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.18,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .n',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out'},0.12);\n` +
        `tl.to('#${id} .n',{rotationX:-14,duration:0.07,yoyo:true,repeat:1,ease:'power1.inOut'},0.38);`,
    ),
  关注引导: () =>
    mk(
      'fl_cta',
      '关注引导',
      (id) => `
<div class="w">
  <div class="tiles amber"><i class="f1" data-edit="cta">${txt('+ 关注', '+ Follow')}</i><i class="f2" data-edit="cta2">${txt('说明一', 'DETAIL 1')}</i></div>
  <div class="ft"><span class="gate" data-edit="side">${txt('说明二', 'DETAIL 2')}</span><span class="chip" data-edit="chip">${txt('立即登机 BOARD NOW', 'BOARD NOW')}</span></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;right:96px;bottom:110px;${BAND}padding:26px 36px 28px;display:flex;flex-direction:column;align-items:center;gap:22px;}
#${id} .tiles i{height:120px;min-width:130px;padding:0 30px;font-size:68px;}
#${id} .ft{display:flex;align-items:center;gap:28px;}
#${id} .gate{font-size:24px;font-weight:700;letter-spacing:0.14em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .f1',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .f2',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out'},0.08);\n` +
        `tl.from('#${id} .ft',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0.26);\n` +
        `tl.to('#${id} .chip',{autoAlpha:0,duration:0.08,yoyo:true,repeat:3,ease:'steps(1)'},0.55);`,
    ),
  金句: () =>
    mk(
      'fl_quote',
      '金句',
      (id) => `
<div class="w">
  <span class="cap" data-edit="tag">${txt('广播 ANNOUNCEMENT', 'ANNOUNCEMENT')}</span>
  <div class="tiles qt"><i class="l1" data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</i></div>
  <div class="tiles qt"><i class="l2" data-edit="l2">${txt('下半句。', 'and line two.')}</i></div>
  <div class="who" data-edit="sig">${txt('—— 署名', '— ATTRIBUTION')}</div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:50%;bottom:100px;transform:translateX(-50%);width:60%;${BAND}padding:26px 44px 28px;display:flex;flex-direction:column;align-items:center;gap:18px;}
#${id} .qt{width:100%;}
#${id} .qt i{width:100%;height:150px;font-family:var(--font-head);font-size:64px;font-weight:900;letter-spacing:0.02em;}
#${id} .who{font-size:26px;font-weight:700;letter-spacing:0.2em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.18,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .l1',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.26,ease:'power2.out'},0.12);\n` +
        `tl.from('#${id} .l2',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.26,ease:'power2.out'},0.36);\n` +
        `tl.from('#${id} .who',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0.64);`,
    ),
  左右对比: () =>
    mk(
      'fl_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="r r1"><span class="no">PLAN A</span><span class="dst dim" data-edit="lt">${txt('选项一', 'Option A')}</span><span class="tm" data-edit="lv">${txt('数值一', 'Value A')}</span><span class="chip amber" data-edit="lchip">${txt('延误 DELAYED', 'DELAYED')}</span></div>
  <div class="r r2"><span class="no">PLAN B</span><span class="dst" data-edit="rt">${txt('选项二', 'Option B')}</span><span class="tm" data-edit="rv">${txt('数值二', 'Value B')}</span><span class="chip" data-edit="rchip">${txt('准点 ON TIME', 'ON TIME')}</span></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:50%;bottom:100px;transform:translateX(-50%);width:62%;${BAND}padding:14px 44px;}
#${id} .r{display:grid;grid-template-columns:170px 1fr 170px 300px;align-items:center;gap:34px;padding:30px 0;border-bottom:3px solid var(--line);}
#${id} .r:last-child{border-bottom:none;}
#${id} .no{font-size:28px;font-weight:700;letter-spacing:0.14em;color:var(--muted);}
#${id} .dst{font-size:44px;font-weight:700;letter-spacing:0.04em;color:var(--accent);}
#${id} .dst.dim{color:var(--muted);}
#${id} .tm{font-size:36px;font-weight:700;color:var(--fg);}
#${id} .r1{opacity:0.7;}
</style>`,
      (id) =>
        `tl.from('#${id} .r1',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .r2',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out'},0.16);\n` +
        `tl.to('#${id} .r2 .chip',{autoAlpha:0,duration:0.08,yoyo:true,repeat:3,ease:'steps(1)'},0.5);`,
    ),
};

export type { Block };
