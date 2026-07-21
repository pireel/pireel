/**
 * 黑金 Noir 的口播叠加件:鎏金 placard 语言——小块暖近黑底(--panel)配双层发丝框
 * (外 1px 暗金 + 内 1px 象牙 ::before),衬线细字、拉丁小字 caps 极限字距、
 * — ◆ — 菱形饰线、金色只做发丝线/单个鎏金数字或词、无填充金边 pill。
 * 动效只有 0.4-0.6s 淡入与缓移,arrive never pop。每件是请柬上裁下的一枚。
 */

import { mk, txt, type Block } from '../dialects/shared';

const PLACARD =
  'background:var(--panel);border:1px solid var(--accent-2);box-shadow:var(--shadow);position:relative;';
const INNER = (id: string, cls: string) =>
  `#${id} .${cls}::before{content:'';position:absolute;inset:10px;border:1px solid var(--line);pointer-events:none;}`;

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'ng_ttl',
      '标题条',
      (id) => `
<div class="w">
  <div class="k" data-edit="kick">COLLECTION · 2026</div>
  <div class="h" data-edit="title">${txt('标题一', 'Title 1')}</div>
  <div class="orn"><i></i><b>◆</b><i></i></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:92px;transform:translateX(-50%);width:58%;${PLACARD}padding:36px 40px 40px;color:var(--fg);font-family:var(--font-head);text-align:center;}
${INNER(id, 'w')}
#${id} .k{font-size:26px;letter-spacing:0.6em;padding-left:0.6em;color:var(--accent);}
#${id} .h{margin-top:18px;font-size:82px;font-weight:600;letter-spacing:0.08em;line-height:1.2;}
#${id} .orn{margin-top:20px;display:flex;align-items:center;justify-content:center;gap:26px;color:var(--accent);}
#${id} .orn i{width:110px;height:1px;background:var(--accent-2);}
#${id} .orn b{font-size:22px;font-weight:400;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,duration:0.5},0);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,y:-12,duration:0.4},0.15);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,duration:0.5},0.3);\n` +
        `tl.from('#${id} .orn i',{scaleX:0,duration:0.4,ease:'power2.out'},0.55);\n` +
        `tl.from('#${id} .orn b',{autoAlpha:0,duration:0.3},0.75);`,
    ),
  大数字: () =>
    mk(
      'ng_num',
      '大数字',
      (id) => `
<div class="w">
  <div class="k" data-edit="label">LIMITED TO</div>
  <div class="v" data-edit="num">399</div>
  <div class="u"><i></i><span data-edit="unit">${txt('件 · 全球', 'pieces · worldwide')}</span><i></i></div>
</div>
<style>
#${id} .w{position:absolute;right:96px;top:120px;width:480px;${PLACARD}padding:40px 36px 44px;color:var(--fg);font-family:var(--font-head);text-align:center;}
${INNER(id, 'w')}
#${id} .k{font-size:26px;letter-spacing:0.6em;padding-left:0.6em;color:var(--muted);}
#${id} .v{margin-top:14px;font-size:230px;font-weight:400;line-height:1;color:var(--accent);letter-spacing:0.02em;}
#${id} .u{margin-top:20px;display:flex;align-items:center;justify-content:center;gap:24px;font-size:32px;letter-spacing:0.3em;}
#${id} .u i{width:70px;height:1px;background:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,duration:0.5},0);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.4},0.15);\n` +
        `tl.from('#${id} .v',{autoAlpha:0,letterSpacing:'0.3em',duration:0.6,ease:'power2.out'},0.25);\n` +
        `tl.from('#${id} .u',{autoAlpha:0,duration:0.4},0.65);`,
    ),
  要点列表: () =>
    mk(
      'ng_list',
      '要点列表',
      (id) => `
<div class="w">
  <div class="k" data-edit="title">LA CARTE</div>
  <div class="r r1"><span data-edit="p1">${txt('要点一', 'Point 1')}</span><i></i><b>Ⅰ</b></div>
  <div class="r r2"><span data-edit="p2">${txt('要点二', 'Point 2')}</span><i></i><b>Ⅱ</b></div>
  <div class="r r3"><span data-edit="p3">${txt('要点三', 'Point 3')}</span><i></i><b>Ⅲ</b></div>
</div>
<style>
#${id} .w{position:absolute;left:88px;top:50%;transform:translateY(-50%);width:560px;${PLACARD}padding:36px 44px 40px;color:var(--fg);font-family:var(--font-head);}
${INNER(id, 'w')}
#${id} .k{font-size:26px;letter-spacing:0.6em;padding-left:0.6em;color:var(--accent);text-align:center;}
#${id} .r{display:flex;align-items:baseline;gap:22px;margin-top:30px;font-size:40px;font-weight:600;letter-spacing:0.06em;}
#${id} .r i{flex:1;border-bottom:1px dotted var(--accent-2);transform:translateY(-8px);}
#${id} .r b{font-weight:400;color:var(--accent);font-size:36px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,duration:0.5},0);\n` +
        `tl.from('#${id} .r1',{autoAlpha:0,duration:0.35},0.25);\n` +
        `tl.from('#${id} .r2',{autoAlpha:0,duration:0.35},0.42);\n` +
        `tl.from('#${id} .r3',{autoAlpha:0,duration:0.35},0.59);`,
    ),
  关键词重击: () =>
    mk(
      'ng_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <div class="orn t"><i></i><b>◆</b><i></i></div>
  <div class="t2" data-edit="word">${txt('关键词', 'Keyword')}</div>
  <div class="orn b2"><i></i><b>◆</b><i></i></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:52%;text-align:center;font-family:var(--font-head);}
#${id} .orn{display:flex;align-items:center;justify-content:center;gap:26px;color:var(--accent);}
#${id} .orn i{width:130px;height:1px;background:var(--accent-2);}
#${id} .orn b{font-size:24px;font-weight:400;}
#${id} .t2{margin:26px 0;font-size:150px;font-weight:600;letter-spacing:0.14em;padding-left:0.14em;color:var(--accent);white-space:nowrap;text-shadow:var(--glow);}
</style>`,
      (id) =>
        `tl.from('#${id} .t2',{autoAlpha:0,letterSpacing:'0.4em',duration:0.6,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .orn i',{scaleX:0,duration:0.4,ease:'power2.out'},0.4);\n` +
        `tl.from('#${id} .orn b',{autoAlpha:0,duration:0.3},0.7);`,
    ),
  标注: () =>
    mk(
      'ng_call',
      '标注',
      (id) => `
<div class="w">
  <div class="chip"><b>◆</b><span data-edit="note">${txt('标注一', 'Note 1')}</span></div>
  <div class="ln"></div>
</div>
<style>
#${id} .w{position:absolute;right:170px;top:28%;font-family:var(--font-head);text-align:center;}
#${id} .chip{${PLACARD}display:inline-flex;align-items:center;gap:18px;color:var(--fg);font-size:36px;font-weight:600;letter-spacing:0.22em;padding:18px 34px;}
#${id} .chip b{color:var(--accent);font-weight:400;font-size:24px;}
#${id} .ln{width:1px;height:130px;background:var(--accent-2);margin:0 auto;}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{autoAlpha:0,y:-20,duration:0.45},0);\n` +
        `tl.from('#${id} .ln',{scaleY:0,transformOrigin:'top',duration:0.4,ease:'power2.out'},0.35);`,
    ),
  关注引导: () =>
    mk(
      'ng_cta',
      '关注引导',
      (id) => `
<div class="w">
  <div class="k" data-edit="kick">JOIN THE HOUSE</div>
  <div class="pill" data-edit="cta">${txt('+ 关注', '+ Follow')}</div>
  <div class="f" data-edit="side">MMXXVI · PIREEL MAISON</div>
</div>
<style>
#${id} .w{position:absolute;right:110px;bottom:100px;text-align:center;font-family:var(--font-head);color:var(--fg);}
#${id} .k{font-size:24px;letter-spacing:0.5em;padding-left:0.5em;color:var(--muted);}
#${id} .pill{margin-top:20px;display:inline-block;border:1px solid var(--accent);color:var(--accent);font-size:48px;font-weight:600;letter-spacing:0.5em;padding:20px 52px 20px calc(52px + 0.5em);border-radius:999px;}
#${id} .f{margin-top:18px;font-size:22px;letter-spacing:0.4em;padding-left:0.4em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.4},0);\n` +
        `tl.from('#${id} .pill',{autoAlpha:0,scale:0.96,duration:0.5,ease:'power2.out'},0.2);\n` +
        `tl.from('#${id} .f',{autoAlpha:0,duration:0.4},0.55);`,
    ),
  金句: () =>
    mk(
      'ng_quote',
      '金句',
      (id) => `
<div class="w">
  <div class="q">“</div>
  <div class="t" data-edit="l1">${txt('金句上半句,下半句。', 'Quote line one, and line two.')}</div>
  <div class="a" data-edit="sig">${txt('—— 署名', '— Attribution')}</div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:100px;transform:translateX(-50%);width:56%;${PLACARD}padding:40px 52px 36px;color:var(--fg);font-family:var(--font-head);text-align:center;}
${INNER(id, 'w')}
#${id} .q{font-size:130px;line-height:0.4;height:52px;color:var(--accent);font-weight:400;}
#${id} .t{font-size:60px;font-weight:600;font-style:italic;line-height:1.4;letter-spacing:0.04em;}
#${id} .a{margin-top:18px;font-size:26px;letter-spacing:0.4em;padding-left:0.4em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,y:24,duration:0.5,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .q',{autoAlpha:0,y:-16,duration:0.4},0.2);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,duration:0.5},0.35);\n` +
        `tl.from('#${id} .a',{autoAlpha:0,duration:0.35},0.7);`,
    ),
  左右对比: () =>
    mk(
      'ng_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="s"><i data-edit="lt">${txt('选项一', 'Option A')}</i><b class="lv" data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <div class="div"></div>
  <div class="s win"><em>◆</em><i data-edit="rt">${txt('选项二', 'Option B')}</i><b class="rv" data-edit="rv">${txt('数值二', 'Value B')}</b></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);${PLACARD}display:flex;align-items:stretch;padding:40px 30px 36px;color:var(--fg);font-family:var(--font-head);}
${INNER(id, 'w')}
#${id} .s{width:340px;text-align:center;position:relative;padding-top:16px;}
#${id} .s i{display:block;font-style:normal;font-size:24px;letter-spacing:0.4em;padding-left:0.4em;color:var(--muted);}
#${id} .s b{display:block;margin-top:16px;font-weight:400;color:var(--accent);}
#${id} .lv{font-size:74px;opacity:0.7;}
#${id} .rv{font-size:92px;}
#${id} .div{width:1px;background:var(--accent-2);margin:0 34px;}
#${id} .win em{position:absolute;left:50%;top:-22px;transform:translateX(-50%);font-style:normal;color:var(--accent);font-size:20px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{autoAlpha:0,duration:0.5},0);\n` +
        `tl.from('#${id} .div',{scaleY:0,transformOrigin:'top',duration:0.4,ease:'power2.out'},0.25);\n` +
        `tl.from('#${id} .s i,#${id} .s b',{autoAlpha:0,duration:0.4},0.4);\n` +
        `tl.from('#${id} .win em',{autoAlpha:0,y:-10,duration:0.3},0.8);`,
    ),
};

export type { Block };
