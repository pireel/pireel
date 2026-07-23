/**
 * Zen — minimal zen-white dialect: golden-ratio anchors, a single hairline, one cinnabar seal dot.
 * Zero radius, zero shadow; motion is only a 0.6-0.9s slow fade + 10px shift; no dual-axis centering.
 */

import { type Block, mk } from './shared';

const zenRoot = (id: string) => `
#${id} .zn{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);}
#${id} .dot{position:absolute;width:12px;height:12px;border-radius:999px;background:var(--accent);}`;

export const cover: () => Block = () =>
  mk(
    'cv_zn',
    '封面',
    (id) => `
<div class="zn">
  <div class="h">留白</div>
  <div class="hr"></div>
  <div class="dot"></div>
  <div class="side">空 白 处 皆 有 声</div>
  <div class="cap">ZEN · WHITE SPACE</div>
</div>
<style>${zenRoot(id)}
#${id} .h{position:absolute;left:150px;top:238px;font-size:280px;font-weight:400;letter-spacing:0.2em;line-height:1;}
#${id} .hr{position:absolute;left:150px;right:260px;top:667px;height:1px;background:var(--line);}
#${id} .dot{left:1186px;top:661px;}
#${id} .side{position:absolute;right:120px;top:150px;writing-mode:vertical-rl;font-size:36px;letter-spacing:0.5em;color:var(--muted);}
#${id} .cap{position:absolute;left:150px;top:735px;font-size:30px;letter-spacing:0.24em;color:var(--accent-2);}
</style>`,
    (id) =>
      `tl.from('#${id} .hr',{autoAlpha:0,duration:0.8},0);\n` +
      `tl.from('#${id} .h',{autoAlpha:0,y:10,duration:0.8,ease:'power1.out'},0.1);\n` +
      `tl.from('#${id} .side,#${id} .cap',{autoAlpha:0,duration:0.6},0.5);\n` +
      `tl.from('#${id} .dot',{autoAlpha:0,duration:0.4},0.8);`,
  );

export const blocks: Record<string, () => Block> = {
  'title-card': () =>
    mk(
      'zn_ttl',
      'title-card',
      (id) => `
<div class="zn">
  <div class="h">慢一点,也没关系</div>
  <div class="hr"></div>
  <div class="dot"></div>
  <div class="side">写 给 赶 路 的 人</div>
  <div class="cap">ESSAY · NO.07</div>
</div>
<style>${zenRoot(id)}
#${id} .zn{background-color:var(--paper);}
#${id} .h{position:absolute;left:150px;top:478px;font-size:110px;font-weight:500;letter-spacing:0.12em;line-height:1;}
#${id} .hr{position:absolute;left:150px;right:260px;top:667px;height:1px;background:var(--line);}
#${id} .dot{left:1186px;top:661px;}
#${id} .side{position:absolute;right:120px;top:150px;writing-mode:vertical-rl;font-size:34px;letter-spacing:0.5em;color:var(--muted);}
#${id} .cap{position:absolute;left:150px;top:733px;font-size:30px;letter-spacing:0.24em;color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .hr',{autoAlpha:0,duration:0.8},0);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,y:10,duration:0.7,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .side,#${id} .cap',{autoAlpha:0,duration:0.6},0.5);\n` +
        `tl.from('#${id} .dot',{autoAlpha:0,duration:0.4},0.8);`,
    ),
  'quote': () =>
    mk(
      'zn_qte',
      'quote',
      (id) => `
<div class="zn">
  <div class="q">心里有一亩田,<br/>种什么都来得及</div>
  <div class="dot"></div>
  <div class="a">摘自今日手记 · 三月初七</div>
</div>
<style>${zenRoot(id)}
#${id} .zn{background-color:var(--paper);}
#${id} .q{position:absolute;right:434px;top:150px;writing-mode:vertical-rl;font-size:78px;font-weight:500;letter-spacing:0.18em;line-height:2;}
#${id} .dot{right:544px;top:836px;}
#${id} .a{position:absolute;left:150px;bottom:150px;font-size:30px;letter-spacing:0.24em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .q',{autoAlpha:0,y:10,duration:0.9,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .a',{autoAlpha:0,duration:0.6},0.5);\n` +
        `tl.from('#${id} .dot',{autoAlpha:0,duration:0.4},0.8);`,
    ),
  'qa': () =>
    mk(
      'zn_qna',
      'qa',
      (id) => `
<div class="zn">
  <div class="q">问 · 一天里,哪一刻属于自己</div>
  <div class="hr"></div>
  <div class="dot"></div>
  <div class="a">留白的那一刻</div>
  <div class="cap">ONE QUESTION · ONE ANSWER</div>
</div>
<style>${zenRoot(id)}
#${id} .zn{background-color:var(--paper);}
#${id} .q{position:absolute;left:150px;top:413px;font-size:42px;letter-spacing:0.3em;color:var(--muted);}
#${id} .hr{position:absolute;left:150px;right:260px;top:667px;height:1px;background:var(--line);}
#${id} .dot{left:1186px;top:661px;}
#${id} .a{position:absolute;left:150px;top:735px;font-size:110px;font-weight:500;letter-spacing:0.12em;line-height:1;}
#${id} .cap{position:absolute;right:150px;bottom:150px;font-size:30px;letter-spacing:0.24em;color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .hr',{autoAlpha:0,duration:0.8},0);\n` +
        `tl.from('#${id} .q',{autoAlpha:0,duration:0.7},0.1);\n` +
        `tl.from('#${id} .a',{autoAlpha:0,y:10,duration:0.8,ease:'power1.out'},0.4);\n` +
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.6},0.6);\n` +
        `tl.from('#${id} .dot',{autoAlpha:0,duration:0.4},0.8);`,
    ),
  'big-number': () =>
    mk(
      'zn_num',
      'big-number',
      (id) => `
<div class="zn">
  <div class="v">100</div>
  <div class="vr"></div>
  <div class="lab">天 · 一 件 小 事</div>
  <div class="dot"></div>
  <div class="cap">CONSISTENCY OVER INTENSITY</div>
</div>
<style>${zenRoot(id)}
#${id} .zn{background-color:var(--paper);}
#${id} .v{position:absolute;left:150px;top:413px;font-size:200px;font-weight:400;letter-spacing:0.06em;line-height:1;}
#${id} .vr{position:absolute;left:734px;top:413px;width:1px;height:200px;background:var(--line);}
#${id} .lab{position:absolute;left:790px;top:417px;writing-mode:vertical-rl;font-size:38px;letter-spacing:0.4em;color:var(--muted);}
#${id} .dot{left:729px;top:637px;}
#${id} .cap{position:absolute;right:150px;bottom:150px;font-size:30px;letter-spacing:0.24em;color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .v',{autoAlpha:0,y:10,duration:0.8,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .vr',{scaleY:0,transformOrigin:'top',duration:0.7,ease:'power1.inOut'},0.1);\n` +
        `tl.from('#${id} .lab,#${id} .cap',{autoAlpha:0,duration:0.6},0.5);\n` +
        `tl.from('#${id} .dot',{autoAlpha:0,duration:0.4},0.8);`,
    ),
  'timeline': () =>
    mk(
      'zn_tml',
      'timeline',
      (id) => `
<div class="zn">
  <div class="hr"></div>
  <div class="nd n1"><b>起念</b><i class="tk"></i><span>三月初三</span></div>
  <div class="nd n2"><b>日日一页</b><i class="tk"></i><span>六月十九</span></div>
  <div class="nd n3"><b>第一百天</b><i class="dot"></i><span>今日</span></div>
  <div class="cap">A YEAR ON ONE LINE</div>
</div>
<style>${zenRoot(id)}
#${id} .zn{background-color:var(--paper);}
#${id} .hr{position:absolute;left:150px;right:260px;top:667px;height:1px;background:var(--line);}
#${id} .nd{position:absolute;top:579px;width:360px;}
#${id} .n1{left:250px;}
#${id} .n2{left:631px;}
#${id} .n3{left:1012px;}
#${id} .nd b{position:absolute;left:0;top:0;width:360px;text-align:center;font-size:44px;font-weight:500;letter-spacing:0.12em;line-height:1;}
#${id} .nd .tk{position:absolute;left:180px;top:76px;width:1px;height:24px;background:var(--line);}
#${id} .n3 .dot{left:174px;top:82px;}
#${id} .nd span{position:absolute;left:0;top:132px;width:360px;text-align:center;font-size:28px;letter-spacing:0.3em;color:var(--muted);}
#${id} .cap{position:absolute;right:150px;bottom:150px;font-size:30px;letter-spacing:0.24em;color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .hr',{scaleX:0,transformOrigin:'left center',duration:0.9,ease:'power1.inOut'},0);\n` +
        `tl.from('#${id} .nd',{autoAlpha:0,y:10,duration:0.7,ease:'power1.out',stagger:0.15},0.2);\n` +
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.6},0.5);\n` +
        `tl.from('#${id} .n3 .dot',{autoAlpha:0,duration:0.4},0.8);`,
    ),
  'list': () =>
    mk(
      'zn_lst',
      'list',
      (id) => `
<div class="zn">
  <div class="vr"></div>
  <div class="ls">
    <div class="it"><span class="no">01</span><b>晨起,先坐五分钟</b></div>
    <div class="it key"><span class="no">02</span><b>一日只留一件要紧事</b><i class="dot"></i></div>
    <div class="it"><span class="no">03</span><b>入夜,把手机还给抽屉</b></div>
  </div>
  <div class="cap">THREE SMALL RITUALS</div>
</div>
<style>${zenRoot(id)}
#${id} .zn{background-color:var(--paper);}
#${id} .vr{position:absolute;left:733px;top:206px;height:668px;width:1px;background:var(--line);}
#${id} .ls{position:absolute;left:806px;top:262px;display:flex;flex-direction:column;gap:98px;}
#${id} .it{position:relative;display:flex;align-items:baseline;gap:46px;}
#${id} .it .no{font-size:28px;letter-spacing:0.3em;color:var(--muted);}
#${id} .it b{font-size:64px;font-weight:500;letter-spacing:0.12em;}
#${id} .it .dot{right:-64px;top:32px;}
#${id} .cap{position:absolute;left:150px;bottom:150px;font-size:30px;letter-spacing:0.24em;color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .vr',{scaleY:0,transformOrigin:'top',duration:0.7,ease:'power1.inOut'},0);\n` +
        `tl.from('#${id} .it',{autoAlpha:0,y:10,duration:0.7,ease:'power1.out',stagger:0.15},0.1);\n` +
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.6},0.5);\n` +
        `tl.from('#${id} .it .dot',{autoAlpha:0,duration:0.4},0.8);`,
    ),
  'cta': () =>
    mk(
      'zn_cta',
      'cta',
      (id) => `
<div class="zn">
  <div class="hr"></div>
  <div class="f"><span>关注</span><i class="dot"></i></div>
  <div class="side">慢 更 · 下 周 三 见</div>
  <div class="cap">FOLLOW · STAY SLOW</div>
</div>
<style>${zenRoot(id)}
#${id} .zn{background-color:var(--paper);}
#${id} .hr{position:absolute;left:150px;right:260px;top:667px;height:1px;background:var(--line);}
#${id} .f{position:absolute;left:150px;top:521px;display:flex;align-items:center;gap:48px;}
#${id} .f span{font-size:96px;font-weight:500;letter-spacing:0.2em;}
#${id} .f .dot{position:static;}
#${id} .side{position:absolute;right:120px;top:150px;writing-mode:vertical-rl;font-size:34px;letter-spacing:0.5em;color:var(--muted);}
#${id} .cap{position:absolute;left:150px;top:733px;font-size:30px;letter-spacing:0.24em;color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .hr',{autoAlpha:0,duration:0.8},0);\n` +
        `tl.from('#${id} .f span',{autoAlpha:0,duration:0.8},0.15);\n` +
        `tl.from('#${id} .side,#${id} .cap',{autoAlpha:0,duration:0.6},0.5);\n` +
        `tl.from('#${id} .f .dot',{autoAlpha:0,duration:0.4},0.8);`,
    ),
};
