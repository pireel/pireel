/* ================================================================
   Noir — fashion-editorial dialect: centered, hairline gold frame, serif, wide tracking
   ================================================================ */

import { type Block, mk } from './shared';

const noirFrame = (id: string) => `
#${id} .nf{position:absolute;inset:70px;border:1px solid var(--accent-2);}
#${id} .nf::before{content:'';position:absolute;inset:14px;border:1px solid var(--line);}`;

export const blocks: Record<string, () => Block> = {
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

/** Cover — list thumbnail: the theme name is the hero (see showcase-blocks.ts). */
export const cover: () => Block = () =>
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
    );
