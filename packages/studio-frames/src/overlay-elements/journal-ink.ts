/**
 * Journal talking-head overlays: newspaper-clipping language. Each element is a
 * small scrap of newsprint (--panel) cut out and stuck on the shot: 6px double
 * masthead rule, 2px hairlines, a double-rule sandwich (4px+2px), gray-bar
 * greeked text, heavy serif 900 type, mono page numbers; red used only for
 * editorial marks (rotated red stamp / red circle / red number). Motion is
 * paper-like: quick fade + slide along the column axis, no scale bounce (except
 * the red stamp thumping down).
 */

import { mk, txt, type Block } from '../dialects/shared';

/** Newsprint scrap base: bright paper + near-square corners + faint paper shadow */
const SCRAP = 'background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);';
/** Double-rule sandwich (for closing off a block) */
const SANDWICH = 'border-top:4px solid var(--fg);border-bottom:2px solid var(--fg);';
/** Gray-bar greeked text */
const fake = (n: number): string =>
  Array.from({ length: n }, (_, i) => `<i style="width:${i === n - 1 ? 62 : 100}%"></i>`).join('');

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'jo_ttl',
      '标题条',
      (id) => `
<div class="w">
  <div class="mast"><span class="m" data-edit="kick">${txt('视 频 日 报', 'THE DAILY REEL')}</span><span class="d" data-edit="vol">VOL.24 · 2026</span></div>
  <div class="h" data-edit="title">${txt('标题一', 'Title 1')}</div>
</div>
<style>
#${id} .w{position:absolute;left:76px;bottom:96px;width:58%;${SCRAP}padding:24px 40px 30px;color:var(--fg);font-family:var(--font-head);}
#${id} .mast{display:flex;align-items:baseline;justify-content:space-between;border-bottom:6px double var(--fg);padding-bottom:14px;}
#${id} .m{font-size:32px;font-weight:900;letter-spacing:0.3em;}
#${id} .d{font-family:var(--font-num);font-size:26px;color:var(--muted);}
#${id} .h{margin-top:18px;font-size:80px;font-weight:900;line-height:1.15;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,y:36,duration:0.28,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .mast',{autoAlpha:0,y:-16,duration:0.22},0.12);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,duration:0.3},0.24);`,
    ),
  大数字: () =>
    mk(
      'jo_num',
      '大数字',
      (id) => `
<div class="w">
  <div class="cap" data-edit="cap">${txt('数 据 版', 'DATA DESK')}</div>
  <div class="v"><b data-edit="num">38</b><i data-edit="unit">%</i></div>
  <div class="src" data-edit="label">${txt('数据说明', 'Data label')}</div>
</div>
<style>
#${id} .w{position:absolute;right:96px;top:110px;width:430px;${SCRAP}padding:26px 36px 24px;color:var(--fg);font-family:var(--font-head);text-align:center;}
#${id} .cap{font-size:30px;font-weight:900;letter-spacing:0.4em;padding-left:0.4em;border-top:6px double var(--fg);border-bottom:2px solid var(--fg);padding-top:14px;padding-bottom:14px;}
#${id} .v{margin-top:16px;line-height:1;}
#${id} .v b{font-family:var(--font-num);font-size:180px;font-weight:800;letter-spacing:-0.04em;}
#${id} .v i{font-style:normal;font-size:60px;font-weight:900;color:var(--accent);margin-left:6px;}
#${id} .src{margin-top:18px;${SANDWICH}padding:14px 0 12px;font-family:var(--font-num);font-size:28px;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,y:-30,duration:0.26,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .v b',{innerText:0,snap:{innerText:1},duration:0.7,ease:'power1.out'},0.16);\n` +
        `tl.from('#${id} .src',{autoAlpha:0,duration:0.24},0.4);`,
    ),
  要点列表: () =>
    mk(
      'jo_list',
      '要点列表',
      (id) => `
<div class="w">
  <div class="cap" data-edit="title">${txt('本 期 要 目', 'IN THIS ISSUE')}</div>
  <div class="r r1"><b>一</b><span data-edit="p1">${txt('要点一', 'Point 1')}</span><i>P.02</i></div>
  <div class="r r2"><b>二</b><span data-edit="p2">${txt('要点二', 'Point 2')}</span><i>P.05</i></div>
  <div class="r r3"><b>三</b><span data-edit="p3">${txt('要点三', 'Point 3')}</span><i>P.09</i></div>
</div>
<style>
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:560px;${SCRAP}padding:24px 34px 10px;color:var(--fg);font-family:var(--font-head);}
#${id} .cap{text-align:center;font-size:34px;font-weight:900;letter-spacing:0.4em;padding-left:0.4em;border-top:6px double var(--fg);border-bottom:2px solid var(--fg);padding-top:14px;padding-bottom:14px;}
#${id} .r{display:flex;align-items:baseline;gap:24px;padding:22px 4px;border-bottom:2px solid var(--line);font-size:40px;}
#${id} .r:last-child{border-bottom:none;}
#${id} .r b{color:var(--accent);font-weight:900;flex:none;}
#${id} .r span{flex:1;font-weight:700;}
#${id} .r i{font-style:normal;font-family:var(--font-num);font-size:26px;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,x:-44,duration:0.26,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .r1',{autoAlpha:0,x:-40,duration:0.24},0.16);\n` +
        `tl.from('#${id} .r2',{autoAlpha:0,x:-40,duration:0.24},0.27);\n` +
        `tl.from('#${id} .r3',{autoAlpha:0,x:-40,duration:0.24},0.38);`,
    ),
  关键词重击: () =>
    mk(
      'jo_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <span class="t" data-edit="word">${txt('关键词', 'Keyword')}</span>
  <b class="stamp" data-edit="stamp">${txt('头条', 'SCOOP')}</b>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);${SCRAP}${SANDWICH}padding:36px 64px 44px;color:var(--fg);font-family:var(--font-head);}
#${id} .t{font-size:150px;font-weight:900;line-height:1;letter-spacing:0.02em;}
#${id} .stamp{position:absolute;right:-56px;top:-48px;transform:rotate(9deg);border:6px solid var(--accent);color:var(--accent);font-size:44px;font-weight:900;padding:10px 24px;border-radius:8px;opacity:0.9;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,y:20,duration:0.24,ease:'power2.out'},0.06);\n` +
        `tl.from('#${id} .stamp',{scale:1.7,autoAlpha:0,rotation:24,duration:0.28,ease:'power3.in'},0.3);`,
    ),
  标注: () =>
    mk(
      'jo_call',
      '标注',
      (id) => `
<div class="w">
  <div class="chip" data-edit="note">${txt('标注一', 'Note 1')}</div>
  <div class="rule"></div>
</div>
<style>
#${id} .w{position:absolute;right:160px;top:30%;text-align:center;font-family:var(--font-head);}
#${id} .chip{display:inline-block;transform:rotate(-8deg);border:6px solid var(--accent);color:var(--accent);background:var(--panel);font-size:46px;font-weight:900;padding:14px 30px;border-radius:8px;opacity:0.94;}
#${id} .rule{width:4px;height:110px;background:var(--accent);margin:8px auto 0;opacity:0.85;}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{scale:1.7,autoAlpha:0,rotation:-24,duration:0.28,ease:'power3.in'},0);\n` +
        `tl.from('#${id} .rule',{scaleY:0,transformOrigin:'top',duration:0.24,ease:'power2.out'},0.26);`,
    ),
  关注引导: () =>
    mk(
      'jo_cta',
      '关注引导',
      (id) => `
<div class="w">
  <div class="inner">
    <div class="h" data-edit="cta">${txt('+ 关注', '+ Follow')}</div>
    <div class="s" data-edit="side">${txt('说明一', 'Detail 1')}</div>
  </div>
  <b class="stamp" data-edit="stamp">${txt('免费', 'FREE')}</b>
</div>
<style>
#${id} .w{position:absolute;right:96px;bottom:104px;width:520px;${SCRAP}border:4px solid var(--fg);padding:10px;color:var(--fg);font-family:var(--font-head);}
#${id} .inner{border:2px solid var(--line);padding:26px 30px 24px;text-align:center;}
#${id} .h{font-size:64px;font-weight:900;line-height:1.1;}
#${id} .s{margin-top:14px;border-top:2px solid var(--line);padding-top:14px;font-size:28px;color:var(--muted);}
#${id} .stamp{position:absolute;right:-44px;top:-44px;transform:rotate(9deg);border:6px solid var(--accent);color:var(--accent);background:var(--panel);font-size:40px;font-weight:900;padding:8px 22px;border-radius:8px;opacity:0.92;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,x:60,duration:0.26,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .stamp',{scale:1.7,autoAlpha:0,rotation:24,duration:0.28,ease:'power3.in'},0.3);`,
    ),
  金句: () =>
    mk(
      'jo_quote',
      '金句',
      (id) => `
<div class="w">
  <i class="dash">——</i>
  <div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b data-edit="l2">${txt('下半句。', 'and line two.')}</b></div>
  <div class="a" data-edit="from">${txt('—— 署名', '— ATTRIBUTION')}</div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);width:60%;${SCRAP}${SANDWICH}padding:30px 48px 26px;color:var(--fg);font-family:var(--font-head);text-align:center;}
#${id} .dash{display:block;font-style:normal;font-size:64px;font-weight:900;color:var(--accent);line-height:0.7;}
#${id} .t{margin-top:14px;font-size:58px;font-weight:800;line-height:1.35;}
#${id} .t b{color:var(--accent);}
#${id} .a{margin-top:16px;border-top:2px solid var(--line);padding-top:12px;font-family:var(--font-num);font-size:28px;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,y:44,duration:0.28,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .dash',{autoAlpha:0,x:-36,duration:0.22},0.14);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,duration:0.28},0.22);\n` +
        `tl.from('#${id} .a',{autoAlpha:0,duration:0.22},0.42);`,
    ),
  左右对比: () =>
    mk(
      'jo_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="cap" data-edit="cap">${txt('本 报 评 测', 'THE VERDICT')}</div>
  <div class="tr a"><span data-edit="lt">${txt('选项一', 'Option A')}</span><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <div class="tr b"><span data-edit="rt">${txt('选项二', 'Option B')}</span><b class="win" data-edit="rv">${txt('数值二', 'Value B')}</b><i class="cir"></i></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:104px;transform:translateX(-50%);width:52%;${SCRAP}padding:22px 36px 8px;color:var(--fg);font-family:var(--font-head);}
#${id} .cap{text-align:center;font-size:30px;font-weight:900;letter-spacing:0.4em;padding-left:0.4em;border-top:6px double var(--fg);border-bottom:2px solid var(--fg);padding-top:12px;padding-bottom:12px;}
#${id} .tr{position:relative;display:flex;align-items:baseline;justify-content:space-between;padding:22px 8px;border-bottom:2px solid var(--line);font-size:42px;}
#${id} .tr:last-child{border-bottom:none;}
#${id} .tr span{font-weight:700;color:var(--muted);}
#${id} .tr b{font-family:var(--font-num);font-weight:800;}
#${id} .b span,#${id} .b .win{color:var(--fg);}
#${id} .win{color:var(--accent);}
#${id} .cir{position:absolute;right:-24px;top:50%;transform:translateY(-50%) rotate(-4deg);width:200px;height:78px;border:5px solid var(--accent);border-radius:50%;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,y:40,duration:0.26,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .a',{autoAlpha:0,x:-30,duration:0.22},0.16);\n` +
        `tl.from('#${id} .b',{autoAlpha:0,x:-30,duration:0.22},0.28);\n` +
        `tl.from('#${id} .cir',{scale:1.5,autoAlpha:0,duration:0.26,ease:'power3.in'},0.46);`,
    ),
};

export type { Block };
