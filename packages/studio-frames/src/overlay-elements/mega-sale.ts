/**
 * Mega Sale overlay elements: burst-sticker language — each element is a promo sticker slapped
 * on the frame: a 24-point burst (star clip-path, gold ground with deep-wine text, spins in),
 * a slanted ribbon strip (gold ground, wide-tracked wine text), deep-red countdown tiles + gold
 * colon, a giant price tag (white 900 + deep-wine stroke, old price struck through), and a gold
 * CTA bar (glow + one pulse). Motion hits hard: power4.in slam-in / back.out(2) with spin;
 * no soft fades.
 */

import { mk, txt, type Block } from '../dialects/shared';

const BURST_CLIP =
  'polygon(50% 0%,59% 15%,75% 7%,76% 25%,93% 25%,85% 41%,100% 50%,85% 59%,93% 75%,76% 76%,75% 93%,59% 85%,50% 100%,41% 85%,25% 93%,24% 76%,7% 75%,15% 59%,0% 50%,15% 41%,7% 25%,24% 24%,25% 7%,41% 15%)';
/** Gold burst sticker: deep-wine text */
const BURST = `clip-path:${BURST_CLIP};background:var(--panel);color:var(--accent-2);display:flex;align-items:center;justify-content:center;text-align:center;font-weight:900;line-height:1.1;`;
/** Sale red sticker backing */
const RED = 'background:var(--paper);box-shadow:var(--shadow);border-radius:var(--radius);';

export const overlays: Record<string, () => Block> = {
  'title-bar': () =>
    mk(
      'mx_ttl',
      'title-bar',
      (id) => `
<div class="w">
  <div class="rib" data-edit="kick">${txt('标签', 'Label')}</div>
  <div class="bar"><span class="h" data-edit="title">${txt('标题一', 'Title 1')}</span></div>
</div>
<style>
#${id} .w{position:absolute;left:76px;bottom:96px;width:58%;font-family:var(--font-head);}
#${id} .rib{position:relative;z-index:1;display:inline-block;background:var(--panel);color:var(--accent-2);font-size:34px;font-weight:900;letter-spacing:0.24em;padding:12px 34px;transform:rotate(-3deg);box-shadow:var(--shadow);margin-left:14px;}
#${id} .bar{${RED}margin-top:-10px;padding:26px 40px 32px;transform:rotate(-1deg);}
#${id} .h{color:var(--fg);font-size:84px;font-weight:900;line-height:1.15;letter-spacing:-0.01em;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar',{scale:2.0,autoAlpha:0,duration:0.24,ease:'power4.in'},0);\n` +
        `tl.from('#${id} .rib',{x:-320,autoAlpha:0,duration:0.26,ease:'power3.out'},0.26);`,
    ),
  'big-number': () =>
    mk(
      'mx_num',
      'big-number',
      (id) => `
<div class="w">
  <div class="card">
    <div class="old" data-edit="old">${txt('日常价 ¥399', 'Was ¥399')}</div>
    <div class="price"><i>¥</i><b data-edit="num">199</b></div>
  </div>
  <div class="burst" data-edit="off">-50%</div>
</div>
<style>
#${id} .w{position:absolute;right:96px;top:100px;width:470px;font-family:var(--font-head);}
#${id} .card{${RED}padding:30px 40px 36px;transform:rotate(1.5deg);}
#${id} .old{font-size:44px;font-weight:700;color:var(--muted);text-decoration:line-through;}
#${id} .price{margin-top:6px;color:var(--fg);font-size:190px;font-weight:900;line-height:1.05;letter-spacing:-0.02em;-webkit-text-stroke:5px var(--accent-2);white-space:nowrap;}
#${id} .price i{font-style:normal;font-size:84px;color:var(--accent);-webkit-text-stroke:2px var(--accent-2);margin-right:10px;}
#${id} .burst{position:absolute;width:230px;height:230px;right:-58px;top:-64px;transform:rotate(12deg);font-size:56px;${BURST}}
</style>`,
      (id) =>
        `tl.from('#${id} .old',{autoAlpha:0,y:-24,duration:0.2},0);\n` +
        `tl.from('#${id} .price',{scale:2.4,autoAlpha:0,duration:0.22,ease:'power4.in'},0.12);\n` +
        `tl.to('#${id} .price',{scale:1.06,duration:0.12,yoyo:true,repeat:1},0.4);\n` +
        `tl.from('#${id} .burst',{scale:0,rotation:80,duration:0.28,ease:'back.out(2)'},0.56);`,
    ),
  'bullet-list': () =>
    mk(
      'mx_list',
      'bullet-list',
      (id) => `
<div class="w">
  <div class="hd" data-edit="title">${txt('列表标题', 'List title')}</div>
  <div class="r r1"><b>1</b><span data-edit="p1">${txt('要点一', 'Point 1')}</span></div>
  <div class="r r2"><b>2</b><span data-edit="p2">${txt('要点二', 'Point 2')}</span></div>
  <div class="r r3"><b>3</b><span data-edit="p3">${txt('要点三', 'Point 3')}</span></div>
</div>
<style>
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:560px;font-family:var(--font-head);}
#${id} .hd{display:inline-block;${RED}color:var(--fg);font-size:46px;font-weight:900;padding:16px 36px;transform:rotate(-2deg);}
#${id} .r{background:var(--panel);color:var(--accent-2);border-radius:var(--radius);box-shadow:var(--shadow);margin-top:22px;padding:18px 30px;display:flex;align-items:center;gap:24px;font-size:44px;font-weight:900;}
#${id} .r1{transform:rotate(-1deg);}
#${id} .r2{transform:rotate(1deg);margin-left:20px;}
#${id} .r3{transform:rotate(-0.8deg);margin-left:6px;}
#${id} .r b{font-family:var(--font-num);font-size:52px;flex:none;}
</style>`,
      (id) =>
        `tl.from('#${id} .hd',{scale:2.0,autoAlpha:0,duration:0.22,ease:'power4.in'},0);\n` +
        `tl.from('#${id} .r1',{x:-320,autoAlpha:0,duration:0.24,ease:'power3.out'},0.22);\n` +
        `tl.from('#${id} .r2',{x:320,autoAlpha:0,duration:0.24,ease:'power3.out'},0.34);\n` +
        `tl.from('#${id} .r3',{x:-320,autoAlpha:0,duration:0.24,ease:'power3.out'},0.46);`,
    ),
  'keyword-slam': () =>
    mk(
      'mx_kw',
      'keyword-slam',
      (id) => `
<div class="w"><div class="burst"><span data-edit="word">${txt('关键词', 'KEYWORD')}</span></div></div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-family:var(--font-head);}
#${id} .burst{width:560px;height:560px;transform:rotate(-8deg);font-size:130px;${BURST}filter:drop-shadow(0 16px 30px rgb(90 8 4 / 0.5));}
</style>`,
      (id) =>
        `tl.from('#${id} .burst',{scale:0,rotation:-80,autoAlpha:0,duration:0.3,ease:'back.out(2)'},0);\n` +
        `tl.to('#${id} .burst',{scale:1.06,duration:0.12,yoyo:true,repeat:1},0.4);`,
    ),
  'callout': () =>
    mk(
      'mx_call',
      'callout',
      (id) => `
<div class="w">
  <div class="tag" data-edit="note">${txt('标注一', 'Note 1')}</div>
  <i class="wedge"></i>
</div>
<style>
#${id} .w{position:absolute;right:160px;top:28%;font-family:var(--font-head);text-align:center;}
#${id} .tag{background:var(--panel);color:var(--accent-2);font-size:46px;font-weight:900;letter-spacing:0.1em;padding:16px 34px;border-radius:var(--radius);transform:rotate(-4deg);box-shadow:var(--shadow);}
#${id} .wedge{display:block;width:0;height:0;margin:2px auto 0;border-left:26px solid transparent;border-right:26px solid transparent;border-top:44px solid var(--panel);filter:drop-shadow(0 10px 14px rgb(90 8 4 / 0.4));}
</style>`,
      (id) =>
        `tl.from('#${id} .tag',{scale:2.0,autoAlpha:0,rotation:-20,duration:0.24,ease:'power4.in'},0);\n` +
        `tl.from('#${id} .wedge',{scaleY:0,autoAlpha:0,transformOrigin:'top',duration:0.2,ease:'power3.out'},0.24);`,
    ),
  'follow-cta': () =>
    mk(
      'mx_cta',
      'follow-cta',
      (id) => `
<div class="w">
  <div class="k" data-edit="kick">${txt('距 结 束 仅 剩', 'ENDS IN')}</div>
  <div class="row">
    <span class="tile" data-edit="h">00</span><i>:</i><span class="tile" data-edit="m">12</span><i>:</i><span class="tile" data-edit="s">45</span>
  </div>
  <div class="cta" data-edit="cta">${txt('+ 关注', '+ Follow')}</div>
</div>
<style>
#${id} .w{position:absolute;right:96px;bottom:100px;width:460px;font-family:var(--font-head);text-align:center;}
#${id} .k{font-size:30px;font-weight:800;letter-spacing:0.4em;padding-left:0.4em;color:var(--fg);text-shadow:0 2px 10px rgb(90 8 4 / 0.6);}
#${id} .row{margin-top:16px;display:flex;align-items:center;justify-content:center;gap:10px;}
#${id} .tile{background:var(--panel-2);color:var(--fg);font-family:var(--font-num);font-size:66px;font-weight:800;padding:14px 22px;border-radius:var(--radius);box-shadow:var(--shadow);}
#${id} .row i{font-style:normal;color:var(--accent);font-size:54px;font-weight:900;}
#${id} .cta{margin-top:22px;background:var(--panel);color:var(--accent-2);font-size:52px;font-weight:900;padding:20px 0;border-radius:var(--radius);transform:rotate(-2deg);box-shadow:var(--glow);}
</style>`,
      (id) =>
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .tile',{y:-90,autoAlpha:0,duration:0.26,stagger:0.1,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .row i',{autoAlpha:0,duration:0.16},0.4);\n` +
        `tl.from('#${id} .cta',{scale:2.0,autoAlpha:0,duration:0.22,ease:'power4.in'},0.5);\n` +
        `tl.to('#${id} .cta',{scale:1.05,duration:0.12,yoyo:true,repeat:1},0.76);`,
    ),
  'quote': () =>
    mk(
      'mx_quote',
      'quote',
      (id) => `
<div class="w">
  <div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b data-edit="l2">${txt('下半句。', 'and line two.')}</b></div>
  <div class="fine" data-edit="fine">${txt('说明一 · FINAL CALL', 'Detail 1 · FINAL CALL')}</div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:104px;transform:translateX(-50%) rotate(-1deg);width:60%;${RED}padding:34px 48px 26px;font-family:var(--font-head);text-align:center;}
#${id} .t{color:var(--fg);font-size:60px;font-weight:900;line-height:1.3;}
#${id} .t b{background:var(--panel);color:var(--accent-2);padding:0 16px;}
#${id} .fine{margin-top:18px;border-top:2px solid var(--line);padding-top:14px;font-size:26px;font-weight:700;letter-spacing:0.3em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{scale:2.0,autoAlpha:0,duration:0.24,ease:'power4.in'},0);\n` +
        `tl.from('#${id} .t b',{autoAlpha:0,duration:0.18},0.3);\n` +
        `tl.from('#${id} .fine',{autoAlpha:0,duration:0.22},0.44);`,
    ),
  'comparison': () =>
    mk(
      'mx_cmp',
      'comparison',
      (id) => `
<div class="w">
  <div class="s a"><i data-edit="lt">${txt('选项一', 'Option A')}</i><b class="dead" data-edit="lv">¥399</b></div>
  <div class="burst"><span><i class="bl" data-edit="rt">${txt('选项二', 'Option B')}</i><b data-edit="rv">¥199</b></span></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;font-family:var(--font-head);}
#${id} .s{width:340px;background:var(--panel-2);border-radius:var(--radius);box-shadow:var(--shadow);padding:28px 30px;text-align:center;color:var(--fg);transform:rotate(-1.5deg);}
#${id} .s i{display:block;font-style:normal;font-size:30px;font-weight:800;letter-spacing:0.2em;color:var(--muted);}
#${id} .s b{display:block;margin-top:8px;font-family:var(--font-num);font-size:74px;font-weight:800;line-height:1;}
#${id} .dead{color:var(--muted);text-decoration:line-through;}
#${id} .burst{width:380px;height:380px;transform:rotate(8deg);${BURST}filter:drop-shadow(0 14px 26px rgb(90 8 4 / 0.5));}
#${id} .bl{display:block;font-style:normal;font-size:34px;font-weight:900;letter-spacing:0.2em;}
#${id} .burst b{display:block;font-family:var(--font-num);font-size:92px;font-weight:900;line-height:1.05;}
</style>`,
      (id) =>
        `tl.from('#${id} .s',{x:-320,autoAlpha:0,duration:0.24,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .burst',{scale:0,rotation:80,autoAlpha:0,duration:0.3,ease:'back.out(2)'},0.2);\n` +
        `tl.to('#${id} .burst',{scale:1.06,duration:0.12,yoyo:true,repeat:1},0.54);`,
    ),
};

export type { Block };
