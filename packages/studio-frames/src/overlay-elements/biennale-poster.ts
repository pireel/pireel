/**
 * 双年展 Biennale 的口播叠加件:海报碎片语言——白/墨方块、零圆角、10px 无模糊硬偏移
 * 墨影、mono 刊号章、反白墨板强调。每件是从海报上"撕下"的一块,贴在画面上。
 */

import { mk, txt, type Block } from '../dialects/shared';

const HARD = '10px 10px 0 var(--fg)';

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'bo_ttl',
      '标题条',
      (id) => `
<div class="w">
  <div class="kick"><span data-edit="kick">${txt('标签', 'LABEL')}</span><i>№01</i></div>
  <div class="bar" data-edit="title">${txt('标题一', 'Title 1')}</div>
</div>
<style>
#${id} .w{position:absolute;left:72px;bottom:96px;width:56%;font-family:var(--font-head);}
#${id} .kick{display:inline-flex;align-items:center;gap:22px;background:var(--fg);color:var(--paper);font-size:34px;font-weight:800;letter-spacing:0.18em;padding:12px 26px;}
#${id} .kick i{font-style:normal;font-family:var(--font-num);font-weight:700;opacity:0.85;}
#${id} .bar{margin-top:0;background:var(--panel);color:var(--fg);font-size:88px;font-weight:900;letter-spacing:-0.02em;line-height:1.12;padding:26px 40px 30px;box-shadow:${HARD};}
</style>`,
      (id) =>
        `tl.from('#${id} .kick',{x:-90,autoAlpha:0,duration:0.22,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .bar',{x:-140,autoAlpha:0,duration:0.25,ease:'power3.out'},0.08);`,
    ),
  大数字: () =>
    mk(
      'bo_num',
      '大数字',
      (id) => `
<div class="w">
  <div class="v"><b data-edit="num">38</b><i class="u" data-edit="unit">%</i></div>
  <div class="lab" data-edit="label">${txt('数据说明', 'Data label')}</div>
</div>
<style>
#${id} .w{position:absolute;right:96px;top:110px;width:430px;background:var(--panel);color:var(--fg);box-shadow:${HARD};padding:36px 40px 30px;font-family:var(--font-num);text-align:left;}
#${id} .v{display:flex;align-items:flex-start;gap:10px;line-height:1;}
#${id} .v b{font-size:200px;font-weight:800;letter-spacing:-0.06em;}
#${id} .u{font-style:normal;background:var(--fg);color:var(--paper);font-size:60px;font-weight:800;padding:10px 18px;margin-top:12px;}
#${id} .lab{margin-top:18px;border-top:6px solid var(--fg);padding-top:16px;font-family:var(--font-head);font-size:36px;font-weight:800;letter-spacing:0.08em;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:-120,autoAlpha:0,duration:0.25,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .v b',{innerText:0,snap:{innerText:1},duration:0.7,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .u',{scale:0,duration:0.2,ease:'power3.out'},0.3);`,
    ),
  要点列表: () =>
    mk(
      'bo_list',
      '要点列表',
      (id) => `
<div class="w">
  <div class="hd" data-edit="title">${txt('列表标题', 'List title')}</div>
  <div class="r r1"><i>1</i><span data-edit="p1">${txt('要点一', 'Point 1')}</span></div>
  <div class="r r2"><i>2</i><span data-edit="p2">${txt('要点二', 'Point 2')}</span></div>
  <div class="r r3"><i>3</i><span data-edit="p3">${txt('要点三', 'Point 3')}</span></div>
</div>
<style>
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:560px;background:var(--panel);color:var(--fg);box-shadow:${HARD};padding:30px 36px 34px;font-family:var(--font-head);}
#${id} .hd{background:var(--fg);color:var(--paper);display:inline-block;font-size:32px;font-weight:800;letter-spacing:0.16em;padding:8px 20px;margin-bottom:20px;}
#${id} .r{display:flex;align-items:center;gap:22px;padding:18px 2px;border-top:4px solid var(--fg);font-size:42px;font-weight:800;}
#${id} .r i{font-style:normal;font-family:var(--font-num);font-size:34px;font-weight:700;width:46px;height:46px;display:flex;align-items:center;justify-content:center;border:4px solid var(--fg);flex:none;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{x:-140,autoAlpha:0,duration:0.24,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .r1',{x:-60,autoAlpha:0,duration:0.2,ease:'power3.out'},0.16);\n` +
        `tl.from('#${id} .r2',{x:-60,autoAlpha:0,duration:0.2,ease:'power3.out'},0.28);\n` +
        `tl.from('#${id} .r3',{x:-60,autoAlpha:0,duration:0.2,ease:'power3.out'},0.4);`,
    ),
  关键词重击: () =>
    mk(
      'bo_kw',
      '关键词重击',
      (id) => `
<div class="w"><span class="t" data-edit="word">${txt('关键词', 'Keyword')}</span></div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);}
#${id} .t{display:block;background:var(--fg);color:var(--paper);font-family:var(--font-head);font-size:150px;font-weight:900;letter-spacing:-0.02em;line-height:1;padding:34px 54px 42px;box-shadow:${HARD.replace('var(--fg)', 'var(--panel)')};}
</style>`,
      (id) => `tl.from('#${id} .t',{scale:1.6,autoAlpha:0,duration:0.2,ease:'power3.in'},0);`,
    ),
  标注: () =>
    mk(
      'bo_call',
      '标注',
      (id) => `
<div class="w">
  <div class="chip" data-edit="note">${txt('标注一', 'Note 1')}</div>
  <div class="rule"></div>
</div>
<style>
#${id} .w{position:absolute;right:150px;top:32%;font-family:var(--font-head);}
#${id} .chip{background:var(--paper);border:6px solid var(--fg);color:var(--fg);font-size:44px;font-weight:900;padding:16px 30px;box-shadow:${HARD};}
#${id} .rule{width:6px;height:120px;background:var(--fg);margin:0 auto;}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{y:-70,autoAlpha:0,duration:0.22,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .rule',{scaleY:0,transformOrigin:'top',duration:0.2,ease:'power3.out'},0.18);`,
    ),
  关注引导: () =>
    mk(
      'bo_cta',
      '关注引导',
      (id) => `
<div class="w">
  <span class="p" data-edit="cta">${txt('+ 关注', '+ Follow')}</span>
  <span class="m" data-edit="side">UPDATED WEEKLY</span>
</div>
<style>
#${id} .w{position:absolute;right:96px;bottom:110px;display:flex;align-items:stretch;font-family:var(--font-head);box-shadow:${HARD};}
#${id} .p{background:var(--fg);color:var(--paper);font-size:52px;font-weight:900;padding:18px 34px;}
#${id} .m{background:var(--panel);color:var(--fg);font-family:var(--font-num);font-size:26px;font-weight:700;letter-spacing:0.2em;display:flex;align-items:center;padding:0 24px;}
</style>`,
      (id) => `tl.from('#${id} .w',{x:120,autoAlpha:0,duration:0.24,ease:'power3.out'},0);`,
    ),
  金句: () =>
    mk(
      'bo_quote',
      '金句',
      (id) => `
<div class="w">
  <i class="q">“</i>
  <div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b data-edit="l2">${txt('下半句。', 'and line two.')}</b></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);width:60%;background:var(--panel);color:var(--fg);box-shadow:${HARD};padding:34px 44px;display:flex;gap:28px;font-family:var(--font-head);}
#${id} .q{font-style:normal;background:var(--fg);color:var(--paper);font-size:84px;font-weight:900;line-height:1;padding:6px 18px 18px;align-self:flex-start;}
#${id} .t{font-size:56px;font-weight:800;line-height:1.35;}
#${id} .t b{background:var(--fg);color:var(--paper);padding:0 12px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:110,autoAlpha:0,duration:0.25,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .t b',{autoAlpha:0,duration:0.18},0.3);`,
    ),
  左右对比: () =>
    mk(
      'bo_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="s a"><i data-edit="lt">${txt('选项一', 'Option A')}</i><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <div class="vs">VS</div>
  <div class="s b"><i data-edit="rt">${txt('选项二', 'Option B')}</i><b data-edit="rv">${txt('数值二', 'Value B')}</b></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);display:flex;align-items:center;gap:26px;font-family:var(--font-head);}
#${id} .s{width:360px;padding:26px 28px;text-align:center;box-shadow:${HARD};}
#${id} .s i{display:block;font-style:normal;font-size:30px;font-weight:800;letter-spacing:0.12em;opacity:0.75;}
#${id} .s b{display:block;margin-top:10px;font-family:var(--font-num);font-size:74px;font-weight:800;line-height:1;}
#${id} .a{background:var(--panel);color:var(--fg);}
#${id} .b{background:var(--fg);color:var(--paper);}
#${id} .vs{font-family:var(--font-num);font-size:42px;font-weight:800;color:var(--paper);background:var(--fg);padding:10px 14px;}
</style>`,
      (id) =>
        `tl.from('#${id} .a',{x:-110,autoAlpha:0,duration:0.22,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .vs',{scale:0,duration:0.18,ease:'power3.out'},0.14);\n` +
        `tl.from('#${id} .b',{x:110,autoAlpha:0,duration:0.22,ease:'power3.out'},0.2);`,
    ),
};

export type { Block };
