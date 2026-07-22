/**
 * Arcade overlay elements: HUD-sprite language — hard-edged indigo plates that fake pixel-stair
 * corners via a same-color cross of expanded shadows (no radius); titles get a var(--shadow)
 * no-blur hard-offset text-shadow (a stamped look); HUD/data are all mono uppercase wide-tracked;
 * coin-gold for scores / PRESS START; mint-green for health-bar cells / arrows / active state
 * (the two colors use different frames); the health bar lights up cell by cell. Motion is
 * mechanical: 0.2s hard slide + steps(1) finite blink that ends on a visible frame.
 */

import { mk, txt, type Block } from '../dialects/shared';

const PLATE =
  'background:var(--panel);box-shadow:0 14px 0 var(--panel),0 -14px 0 var(--panel),14px 0 0 var(--panel),-14px 0 0 var(--panel);';
const PLATE_ACTIVE =
  'background:var(--panel);box-shadow:0 14px 0 var(--accent-2),0 -14px 0 var(--accent-2),14px 0 0 var(--accent-2),-14px 0 0 var(--accent-2),var(--glow);';
const COIN =
  'width:36px;height:36px;background:var(--accent);box-shadow:0 10px 0 var(--accent),0 -10px 0 var(--accent),10px 0 0 var(--accent),-10px 0 0 var(--accent);';

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'px_ttl',
      '标题条',
      (id) => `
<div class="w">
  <div class="hud"><span class="c"><i></i><b data-edit="coin">× 12</b></span><span data-edit="stage">STAGE 1-1</span></div>
  <div class="pl">
    <div class="cap" data-edit="kick">NEW GAME</div>
    <div class="h" data-edit="title">${txt('标题一', 'Title 1')}</div>
  </div>
  <div class="st" data-edit="start">PRESS START ▶</div>
</div>
<style>
#${id} .w{position:absolute;left:88px;bottom:100px;width:58%;color:var(--fg);font-family:var(--font-num);}
#${id} .hud{display:flex;justify-content:space-between;align-items:center;font-size:30px;font-weight:700;letter-spacing:0.16em;color:var(--muted);border-bottom:4px solid var(--line);padding-bottom:16px;}
#${id} .c{display:inline-flex;align-items:center;gap:26px;}
#${id} .c i{${COIN}margin:10px 10px 10px 12px;}
#${id} .c b{color:var(--accent);}
#${id} .pl{margin:34px 14px 0;${PLATE}padding:22px 34px 26px;}
#${id} .cap{font-size:32px;font-weight:700;letter-spacing:0.2em;color:var(--accent);}
#${id} .h{margin-top:10px;font-family:var(--font-head);font-size:88px;font-weight:900;line-height:1.15;text-shadow:var(--shadow);}
#${id} .st{margin-top:36px;font-size:40px;font-weight:700;letter-spacing:0.3em;color:var(--accent);}
</style>`,
      (id) =>
        `tl.from('#${id} .hud',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0);\n` +
        `tl.from('#${id} .pl',{y:-30,autoAlpha:0,duration:0.22,ease:'power3.out'},0.12);\n` +
        `tl.from('#${id} .st',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.4);\n` +
        `tl.to('#${id} .st',{autoAlpha:0,duration:0.1,yoyo:true,repeat:5,ease:'steps(1)'},0.6);`,
    ),
  大数字: () =>
    mk(
      'px_num',
      '大数字',
      (id) => `
<div class="w">
  <div class="cap" data-edit="label">${txt('数据说明 SCORE', 'DATA LABEL')}</div>
  <div class="v" data-edit="num">9.8</div>
  <div class="xp"><b>XP</b><div class="bar"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i></i></div></div>
</div>
<style>
#${id} .w{position:absolute;right:110px;top:120px;width:460px;${PLATE}padding:30px 38px 34px;color:var(--fg);font-family:var(--font-num);}
#${id} .cap{font-size:30px;font-weight:700;letter-spacing:0.2em;color:var(--muted);}
#${id} .v{margin-top:8px;font-size:220px;font-weight:800;line-height:1;color:var(--accent);text-shadow:var(--shadow);}
#${id} .xp{margin-top:26px;display:flex;align-items:center;gap:20px;}
#${id} .xp b{font-size:32px;font-weight:700;letter-spacing:0.12em;color:var(--accent-2);}
#${id} .bar{display:flex;gap:10px;border:4px solid var(--fg);padding:10px;}
#${id} .bar i{width:52px;height:36px;background:var(--panel-2);}
#${id} .bar i.on{background:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:-30,autoAlpha:0,duration:0.22,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .v',{y:50,autoAlpha:0,duration:0.22,ease:'power3.out'},0.16);\n` +
        `tl.from('#${id} .bar i.on',{autoAlpha:0,duration:0.1,ease:'steps(1)',stagger:0.08},0.44);`,
    ),
  要点列表: () =>
    mk(
      'px_list',
      '要点列表',
      (id) => `
<div class="w">
  <div class="r r1 done"><b>LEVEL 1</b><span data-edit="p1">${txt('要点一', 'Point 1')}</span><em>CLEAR</em></div>
  <div class="r r2 act"><b>LEVEL 2</b><span data-edit="p2">${txt('要点二', 'Point 2')}</span><em>▸ PLAY</em></div>
  <div class="r r3 lock"><b>LEVEL 3</b><span data-edit="p3">${txt('要点三', 'Point 3')}</span><em>???</em></div>
</div>
<style>
#${id} .w{position:absolute;left:100px;top:50%;transform:translateY(-50%);width:600px;font-family:var(--font-num);color:var(--fg);}
#${id} .r{display:flex;align-items:center;gap:26px;${PLATE}padding:22px 30px;margin-bottom:44px;font-size:40px;}
#${id} .r:last-child{margin-bottom:0;}
#${id} .r b{font-size:28px;font-weight:700;letter-spacing:0.14em;color:var(--accent);flex:none;}
#${id} .r span{font-family:var(--font-head);font-weight:900;}
#${id} .r em{font-style:normal;margin-left:auto;font-size:28px;font-weight:700;letter-spacing:0.12em;color:var(--muted);}
#${id} .done{opacity:0.55;}
#${id} .act{${PLATE_ACTIVE}}
#${id} .act em{color:var(--accent-2);}
#${id} .lock span{color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .r1',{x:-60,autoAlpha:0,duration:0.2,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .r2',{x:-60,autoAlpha:0,duration:0.2,ease:'power3.out'},0.12);\n` +
        `tl.from('#${id} .r3',{x:-60,autoAlpha:0,duration:0.2,ease:'power3.out'},0.24);\n` +
        `tl.to('#${id} .act em',{autoAlpha:0,duration:0.1,yoyo:true,repeat:5,ease:'steps(1)'},0.55);`,
    ),
  关键词重击: () =>
    mk(
      'px_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <div class="cap" data-edit="kick">CRITICAL HIT!</div>
  <div class="t" data-edit="word">${txt('关键词', 'Keyword')}</div>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:50%;${PLATE}padding:30px 56px 40px;text-align:center;}
#${id} .cap{font-family:var(--font-num);font-size:34px;font-weight:700;letter-spacing:0.24em;color:var(--accent);}
#${id} .t{margin-top:14px;color:var(--fg);font-family:var(--font-head);font-size:140px;font-weight:900;line-height:1;white-space:nowrap;text-shadow:var(--shadow);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{scale:1.5,autoAlpha:0,duration:0.18,ease:'power3.in'},0);\n` +
        `tl.from('#${id} .t',{y:-20,duration:0.12,ease:'steps(2)'},0.2);\n` +
        `tl.to('#${id} .cap',{autoAlpha:0,duration:0.1,yoyo:true,repeat:5,ease:'steps(1)'},0.45);`,
    ),
  标注: () =>
    mk(
      'px_call',
      '标注',
      (id) => `
<div class="w">
  <div class="chip"><i></i><span data-edit="note">× CHECK</span></div>
  <div class="ar a1">▼</div>
  <div class="ar a2">▼</div>
</div>
<style>
#${id} .w{position:absolute;right:180px;top:24%;text-align:center;font-family:var(--font-num);}
#${id} .chip{display:inline-flex;align-items:center;gap:24px;${PLATE}padding:16px 30px;color:var(--accent);font-size:36px;font-weight:700;letter-spacing:0.14em;}
#${id} .chip i{${COIN}margin:8px 6px 8px 10px;flex:none;}
#${id} .ar{color:var(--accent-2);font-size:44px;line-height:1.1;margin-top:22px;}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{y:-30,autoAlpha:0,duration:0.2,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .a1',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.26);\n` +
        `tl.from('#${id} .a2',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.4);\n` +
        `tl.to('#${id} .a2',{autoAlpha:0,duration:0.1,yoyo:true,repeat:3,ease:'steps(1)'},0.6);`,
    ),
  关注引导: () =>
    mk(
      'px_cta',
      '关注引导',
      (id) => `
<div class="w">
  <div class="coin"></div>
  <div class="p" data-edit="cta">PRESS ❤ TO FOLLOW</div>
  <div class="f" data-edit="side">CONTINUE? 9</div>
</div>
<style>
#${id} .w{position:absolute;right:120px;bottom:110px;text-align:center;font-family:var(--font-num);}
#${id} .coin{width:90px;height:90px;margin:0 auto 44px;background:var(--accent);box-shadow:0 26px 0 var(--accent),0 -26px 0 var(--accent),26px 0 0 var(--accent),-26px 0 0 var(--accent);}
#${id} .p{color:var(--accent);font-size:44px;font-weight:700;letter-spacing:0.22em;}
#${id} .f{margin-top:18px;color:var(--muted);font-size:30px;font-weight:700;letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .coin',{y:-40,autoAlpha:0,duration:0.2,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .p',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.24);\n` +
        `tl.from('#${id} .f',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.38);\n` +
        `tl.to('#${id} .p',{autoAlpha:0,duration:0.1,yoyo:true,repeat:5,ease:'steps(1)'},0.58);`,
    ),
  金句: () =>
    mk(
      'px_quote',
      '金句',
      (id) => `
<div class="w">
  <div class="tag" data-edit="sig">${txt('NPC · 署名', 'NPC · Attribution')}</div>
  <div class="l l1"><b>&gt;</b><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span></div>
  <div class="l l2"><b>&gt;</b><span data-edit="l2">${txt('下半句。', 'and line two.')}</span><i class="cur">▌</i></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:100px;transform:translateX(-50%);width:58%;${PLATE}padding:26px 42px 32px;color:var(--fg);font-family:var(--font-num);}
#${id} .tag{font-size:30px;font-weight:700;letter-spacing:0.16em;color:var(--accent);}
#${id} .l{margin-top:18px;display:flex;align-items:baseline;gap:22px;font-family:var(--font-head);font-size:56px;font-weight:900;line-height:1.25;text-shadow:var(--shadow);}
#${id} .l b{font-family:var(--font-num);color:var(--accent-2);text-shadow:none;}
#${id} .cur{font-style:normal;color:var(--accent-2);text-shadow:none;margin-left:6px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:30,autoAlpha:0,duration:0.22,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .l1',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.26);\n` +
        `tl.from('#${id} .l2',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.44);\n` +
        `tl.to('#${id} .cur',{autoAlpha:0,duration:0.1,yoyo:true,repeat:3,ease:'steps(1)'},0.7);`,
    ),
  左右对比: () =>
    mk(
      'px_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="s a"><b>1P</b><span data-edit="lt">${txt('选项一', 'Option A')}</span><div class="hp"><i class="on"></i><i class="on"></i><i></i><i></i><i></i></div><em data-edit="lv">${txt('数值一', 'Value A')}</em></div>
  <div class="vs">VS</div>
  <div class="s b"><b>2P</b><span data-edit="rt">${txt('选项二', 'Option B')}</span><div class="hp"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i></i></div><em data-edit="rv">${txt('数值二', 'Value B')}</em></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:100px;transform:translateX(-50%);display:flex;align-items:center;gap:48px;font-family:var(--font-num);color:var(--fg);}
#${id} .s{width:360px;${PLATE}padding:22px 28px 26px;text-align:center;}
#${id} .s.b{${PLATE_ACTIVE}}
#${id} .s b{display:block;font-size:26px;font-weight:700;letter-spacing:0.2em;color:var(--muted);}
#${id} .s.b b{color:var(--fg);}
#${id} .s span{display:block;margin-top:8px;font-family:var(--font-head);font-size:56px;font-weight:900;text-shadow:var(--shadow);}
#${id} .hp{margin:16px auto 0;display:flex;justify-content:center;gap:8px;border:4px solid var(--fg);padding:8px;width:fit-content;}
#${id} .hp i{width:40px;height:28px;background:var(--panel-2);}
#${id} .hp i.on{background:var(--accent-2);}
#${id} .s em{display:block;margin-top:14px;font-style:normal;font-size:30px;font-weight:700;letter-spacing:0.12em;color:var(--muted);}
#${id} .vs{font-size:96px;font-weight:800;color:var(--accent);text-shadow:var(--shadow);}
</style>`,
      (id) =>
        `tl.from('#${id} .s.a',{x:-60,autoAlpha:0,duration:0.2,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .s.b',{x:60,autoAlpha:0,duration:0.2,ease:'power3.out'},0.1);\n` +
        `tl.from('#${id} .vs',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.28);\n` +
        `tl.from('#${id} .hp i.on',{autoAlpha:0,duration:0.1,ease:'steps(1)',stagger:0.05},0.4);\n` +
        `tl.to('#${id} .vs',{autoAlpha:0,duration:0.1,yoyo:true,repeat:3,ease:'steps(1)'},0.85);`,
    ),
};

export type { Block };
