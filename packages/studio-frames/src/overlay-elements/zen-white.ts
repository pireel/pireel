/**
 * 留白 Zen 的口播叠加件:quiet slip 语言——一小条暖纸(--paper 底、零圆角零投影零光晕)
 * 落在画面一角,衬线小字+宽字距、一根 1px 发丝线、一枚 12px 朱砂印点(一件只一枚,
 * 全件最响的东西)、竖排批注 writing-mode:vertical-rl、黄金分割锚点不双轴居中。
 * 动效只许 0.6-0.9s 慢淡入 + 10px 位移,朱点永远最后落。
 */

import { mk, txt, type Block } from '../dialects/shared';

const SLIP = 'background:var(--paper);color:var(--fg);font-family:var(--font-head);';
const DOT = 'width:12px;height:12px;border-radius:999px;background:var(--accent);';
const HR = 'height:1px;background:var(--line);';
const FADE = `{autoAlpha:0,duration:0.7,ease:'power1.out'}`;
const DRIFT = `{autoAlpha:0,y:10,duration:0.7,ease:'power1.out'}`;
const SEAL = `{autoAlpha:0,duration:0.4}`;

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'zo_ttl',
      '标题条',
      (id) => `
<div class="w">
  <div class="t" data-edit="title">${txt('标题一', 'Title 1')}</div>
  <div class="hr"></div>
  <i class="dot"></i>
  <div class="cap" data-edit="kick">ESSAY · NO.07</div>
</div>
<style>
#${id} .w{position:absolute;left:96px;bottom:100px;width:52%;${SLIP}padding:52px 64px 44px;}
#${id} .t{font-size:66px;font-weight:500;letter-spacing:0.12em;line-height:1;}
#${id} .hr{margin-top:38px;${HR}}
#${id} .dot{position:absolute;${DOT}left:61.8%;bottom:118px;}
#${id} .cap{margin-top:22px;font-size:26px;letter-spacing:0.24em;color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',${FADE},0);\n` +
        `tl.from('#${id} .hr',{autoAlpha:0,duration:0.8},0.1);\n` +
        `tl.from('#${id} .t',${DRIFT},0.15);\n` +
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.6},0.5);\n` +
        `tl.from('#${id} .dot',${SEAL},0.8);`,
    ),
  大数字: () =>
    mk(
      'zo_num',
      '大数字',
      (id) => `
<div class="w">
  <div class="v" data-edit="num">100</div>
  <div class="vr"></div>
  <div class="lab" data-edit="label">${txt('天 · 数 据 说 明', 'days · data label')}</div>
  <i class="dot"></i>
</div>
<style>
#${id} .w{position:absolute;right:130px;top:120px;${SLIP}padding:56px 64px 60px;display:flex;gap:44px;}
#${id} .v{font-size:150px;font-weight:400;letter-spacing:0.06em;line-height:1;}
#${id} .vr{width:1px;background:var(--line);}
#${id} .lab{writing-mode:vertical-rl;font-size:32px;letter-spacing:0.4em;color:var(--muted);}
#${id} .dot{position:absolute;${DOT}left:64px;bottom:44px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',${FADE},0);\n` +
        `tl.from('#${id} .v',${DRIFT.replace('0.7', '0.8')},0.1);\n` +
        `tl.from('#${id} .vr',{scaleY:0,transformOrigin:'top',duration:0.7,ease:'power1.inOut'},0.2);\n` +
        `tl.from('#${id} .lab',{autoAlpha:0,duration:0.6},0.5);\n` +
        `tl.from('#${id} .dot',${SEAL},0.8);`,
    ),
  要点列表: () =>
    mk(
      'zo_list',
      '要点列表',
      (id) => `
<div class="w">
  <div class="vr"></div>
  <div class="ls">
    <div class="it"><i>01</i><b data-edit="p1">${txt('要点一', 'Point 1')}</b></div>
    <div class="it key"><i>02</i><b data-edit="p2">${txt('要点二', 'Point 2')}</b><span class="dot"></span></div>
    <div class="it"><i>03</i><b data-edit="p3">${txt('要点三', 'Point 3')}</b></div>
  </div>
</div>
<style>
#${id} .w{position:absolute;left:110px;top:50%;transform:translateY(-50%);${SLIP}padding:64px 84px 64px 64px;display:flex;gap:52px;}
#${id} .vr{width:1px;background:var(--line);}
#${id} .ls{display:flex;flex-direction:column;gap:64px;}
#${id} .it{position:relative;display:flex;align-items:baseline;gap:34px;}
#${id} .it i{font-style:normal;font-size:24px;letter-spacing:0.3em;color:var(--muted);}
#${id} .it b{font-size:46px;font-weight:500;letter-spacing:0.12em;}
#${id} .it .dot{position:absolute;${DOT}right:-40px;top:22px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',${FADE},0);\n` +
        `tl.from('#${id} .vr',{scaleY:0,transformOrigin:'top',duration:0.7,ease:'power1.inOut'},0.1);\n` +
        `tl.from('#${id} .it',{autoAlpha:0,y:10,duration:0.6,ease:'power1.out',stagger:0.15},0.2);\n` +
        `tl.from('#${id} .dot',${SEAL},0.8);`,
    ),
  关键词重击: () =>
    mk(
      'zo_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <span class="t" data-edit="word">${txt('关键词', 'Keyword')}</span>
  <i class="dot"></i>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:38.2%;transform:translate(-50%,-50%);${SLIP}padding:44px 72px 48px;display:flex;align-items:baseline;gap:40px;}
#${id} .t{font-size:104px;font-weight:500;letter-spacing:0.16em;line-height:1;white-space:nowrap;}
#${id} .dot{${DOT}flex:none;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',${FADE},0);\n` +
        `tl.from('#${id} .t',${DRIFT.replace('0.7', '0.8')},0.1);\n` +
        `tl.from('#${id} .dot',${SEAL},0.8);`,
    ),
  标注: () =>
    mk(
      'zo_call',
      '标注',
      (id) => `
<div class="w">
  <div class="t" data-edit="note">${txt('标 注 一', 'Note 1')}</div>
  <i class="dot"></i>
</div>
<style>
#${id} .w{position:absolute;right:140px;top:140px;${SLIP}padding:52px 40px 44px;display:flex;flex-direction:column;align-items:center;gap:34px;}
#${id} .t{writing-mode:vertical-rl;font-size:34px;letter-spacing:0.42em;color:var(--muted);}
#${id} .dot{${DOT}}
</style>`,
      (id) =>
        `tl.from('#${id} .w',${FADE},0);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,duration:0.7},0.15);\n` +
        `tl.from('#${id} .dot',${SEAL},0.8);`,
    ),
  关注引导: () =>
    mk(
      'zo_cta',
      '关注引导',
      (id) => `
<div class="w">
  <div class="f"><span data-edit="cta">${txt('+ 关注', '+ Follow')}</span><i class="dot"></i></div>
  <div class="hr"></div>
  <div class="cap" data-edit="side">FOLLOW · STAY SLOW</div>
</div>
<style>
#${id} .w{position:absolute;left:96px;bottom:110px;${SLIP}padding:52px 72px 44px;}
#${id} .f{display:flex;align-items:center;gap:40px;}
#${id} .f span{font-size:84px;font-weight:500;letter-spacing:0.2em;line-height:1;}
#${id} .f .dot{${DOT}}
#${id} .hr{margin-top:36px;${HR}}
#${id} .cap{margin-top:20px;font-size:26px;letter-spacing:0.24em;color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',${FADE},0);\n` +
        `tl.from('#${id} .f span',{autoAlpha:0,duration:0.8},0.15);\n` +
        `tl.from('#${id} .hr,#${id} .cap',{autoAlpha:0,duration:0.6},0.5);\n` +
        `tl.from('#${id} .dot',${SEAL},0.8);`,
    ),
  金句: () =>
    mk(
      'zo_quote',
      '金句',
      (id) => `
<div class="w">
  <div class="q"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><span data-edit="l2">${txt('下半句。', 'and line two.')}</span></div>
  <i class="dot"></i>
  <div class="a" data-edit="sig">${txt('—— 署名', '— Attribution')}</div>
</div>
<style>
#${id} .w{position:absolute;right:150px;top:110px;${SLIP}padding:60px 56px 48px;display:flex;flex-direction:column;align-items:center;gap:40px;}
#${id} .q{writing-mode:vertical-rl;font-size:52px;font-weight:500;letter-spacing:0.18em;line-height:2;}
#${id} .dot{${DOT}}
#${id} .a{font-size:24px;letter-spacing:0.24em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',${FADE},0);\n` +
        `tl.from('#${id} .q',{autoAlpha:0,y:10,duration:0.9,ease:'power1.out'},0.1);\n` +
        `tl.from('#${id} .a',{autoAlpha:0,duration:0.6},0.5);\n` +
        `tl.from('#${id} .dot',${SEAL},0.8);`,
    ),
  左右对比: () =>
    mk(
      'zo_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="s a"><i data-edit="lt">${txt('选项一', 'Option A')}</i><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <div class="vr"></div>
  <div class="s b"><i data-edit="rt">${txt('选项二', 'Option B')}</i><b data-edit="rv">${txt('数值二', 'Value B')}</b><span class="dot"></span></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);${SLIP}padding:52px 84px;display:flex;align-items:center;gap:72px;}
#${id} .vr{width:1px;height:150px;background:var(--line);}
#${id} .s{position:relative;display:flex;flex-direction:column;align-items:center;gap:26px;}
#${id} .s i{font-style:normal;font-size:26px;letter-spacing:0.3em;color:var(--muted);}
#${id} .s b{font-size:58px;font-weight:500;letter-spacing:0.1em;line-height:1;}
#${id} .a b{color:var(--muted);font-weight:400;}
#${id} .s .dot{position:absolute;${DOT}right:-38px;bottom:12px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',${FADE},0);\n` +
        `tl.from('#${id} .vr',{scaleY:0,transformOrigin:'top',duration:0.7,ease:'power1.inOut'},0.1);\n` +
        `tl.from('#${id} .a',{autoAlpha:0,duration:0.7},0.2);\n` +
        `tl.from('#${id} .b',${DRIFT},0.35);\n` +
        `tl.from('#${id} .dot',${SEAL},0.8);`,
    ),
};

export type { Block };
