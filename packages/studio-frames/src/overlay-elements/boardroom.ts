/**
 * 简报 Boardroom 的口播叠加件:咨询报告碎片语言——白 --panel 镶边卡(1px line 边 +
 * radius + shadow)顶着 8px accent 行动色条、mono 字距页眉、SOURCE 脚注、
 * 涨跌配色(accent 涨 / accent-2 跌)。零旋转零装饰,每件像从简报裁下的一块贴在画面上。
 */

import { mk, txt, type Block } from '../dialects/shared';

const CARD =
  'background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;color:var(--fg);';

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'br_ttl',
      '标题条',
      (id) => `
<div class="w">
  <div class="tp"></div>
  <div class="in">
    <div class="kick"><b data-edit="kick">ACTION · 01</b><span class="sp"></span><i data-edit="pg">P.01</i></div>
    <div class="t" data-edit="title">${txt('标题一', 'Title 1')}</div>
    <div class="src" data-edit="src">${txt('SOURCE: 署名', 'SOURCE: ATTRIBUTION')}</div>
  </div>
</div>
<style>
#${id} .w{position:absolute;left:76px;bottom:96px;width:58%;${CARD}font-family:var(--font-head);}
#${id} .tp{height:8px;background:var(--accent);}
#${id} .in{padding:28px 44px 26px;}
#${id} .kick{display:flex;align-items:baseline;font-family:var(--font-num);font-size:28px;font-weight:700;color:var(--accent);letter-spacing:0.18em;}
#${id} .kick .sp{flex:1;}
#${id} .kick i{font-style:normal;color:var(--muted);}
#${id} .t{margin-top:16px;font-size:70px;font-weight:700;line-height:1.25;}
#${id} .src{margin-top:20px;border-top:1px solid var(--line);padding-top:14px;font-family:var(--font-num);font-size:24px;color:var(--muted);letter-spacing:0.08em;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:60,autoAlpha:0,duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .tp',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.out'},0.16);\n` +
        `tl.from('#${id} .kick,#${id} .t,#${id} .src',{y:16,autoAlpha:0,duration:0.24,stagger:0.1,ease:'power2.out'},0.24);`,
    ),
  大数字: () =>
    mk(
      'br_num',
      '大数字',
      (id) => `
<div class="w">
  <div class="tp"></div>
  <div class="in">
    <div class="lab" data-edit="label">${txt('数据说明', 'Data label')}</div>
    <div class="v"><b class="n" data-edit="num">128</b><i data-edit="unit">%</i></div>
    <div class="row"><em class="chip" data-edit="delta">▲ 12%</em><span data-edit="note">${txt('环比上月', 'vs last month')}</span></div>
  </div>
</div>
<style>
#${id} .w{position:absolute;right:96px;top:110px;width:460px;${CARD}font-family:var(--font-head);}
#${id} .tp{height:8px;background:var(--accent);}
#${id} .in{padding:30px 40px 32px;}
#${id} .lab{font-size:30px;color:var(--muted);letter-spacing:0.08em;}
#${id} .v{margin-top:14px;display:flex;align-items:baseline;font-family:var(--font-num);line-height:1;}
#${id} .v .n{font-size:168px;font-weight:700;letter-spacing:-0.01em;}
#${id} .v i{font-style:normal;font-size:64px;color:var(--muted);margin-left:12px;}
#${id} .row{margin-top:22px;display:flex;align-items:center;gap:22px;border-top:1px solid var(--line);padding-top:20px;}
#${id} .chip{font-style:normal;font-family:var(--font-num);font-size:28px;font-weight:700;background:var(--accent);color:var(--paper);border-radius:999px;padding:8px 24px;}
#${id} .row span{font-size:26px;color:var(--muted);letter-spacing:0.06em;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:-60,autoAlpha:0,duration:0.28,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .tp',{scaleX:0,transformOrigin:'left center',duration:0.28,ease:'power2.out'},0.14);\n` +
        `tl.from('#${id} .n',{innerText:0,snap:{innerText:1},duration:0.7,ease:'power1.out'},0.2);\n` +
        `tl.from('#${id} .row',{y:14,autoAlpha:0,duration:0.24,ease:'power2.out'},0.5);`,
    ),
  要点列表: () =>
    mk(
      'br_list',
      '要点列表',
      (id) => `
<div class="w">
  <div class="tp"></div>
  <div class="in">
    <div class="hd"><b data-edit="title">${txt('列表标题', 'List title')}</b><i data-edit="pg">3 ITEMS</i></div>
    <div class="r r1"><span class="n">01</span><span data-edit="p1">${txt('要点一', 'Point 1')}</span></div>
    <div class="r r2"><span class="n">02</span><span data-edit="p2">${txt('要点二', 'Point 2')}</span></div>
    <div class="r r3"><span class="n">03</span><span data-edit="p3">${txt('要点三', 'Point 3')}</span></div>
  </div>
</div>
<style>
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:560px;${CARD}font-family:var(--font-head);}
#${id} .tp{height:8px;background:var(--accent);}
#${id} .in{padding:26px 40px 12px;}
#${id} .hd{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:18px;}
#${id} .hd b{font-size:36px;font-weight:700;}
#${id} .hd i{font-style:normal;font-family:var(--font-num);font-size:24px;font-weight:700;color:var(--muted);letter-spacing:0.14em;}
#${id} .r{display:flex;align-items:center;gap:26px;padding:22px 0;border-top:1px solid var(--line);font-size:40px;font-weight:600;}
#${id} .r .n{font-family:var(--font-num);font-size:30px;font-weight:700;color:var(--accent);flex:none;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{x:-80,autoAlpha:0,duration:0.28,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .tp',{scaleX:0,transformOrigin:'left center',duration:0.26,ease:'power2.out'},0.14);\n` +
        `tl.from('#${id} .r1',{x:-30,autoAlpha:0,duration:0.22,ease:'power2.out'},0.24);\n` +
        `tl.from('#${id} .r2',{x:-30,autoAlpha:0,duration:0.22,ease:'power2.out'},0.36);\n` +
        `tl.from('#${id} .r3',{x:-30,autoAlpha:0,duration:0.22,ease:'power2.out'},0.48);`,
    ),
  关键词重击: () =>
    mk(
      'br_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <div class="tp"></div>
  <div class="in">
    <div class="k" data-edit="kick">KEY TAKEAWAY</div>
    <div class="t" data-edit="word">${txt('关键词', 'Keyword')}</div>
  </div>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:520px;max-width:52%;${CARD}font-family:var(--font-head);text-align:center;}
#${id} .tp{height:8px;background:var(--accent);}
#${id} .in{padding:30px 70px 44px;}
#${id} .k{font-family:var(--font-num);font-size:28px;font-weight:700;color:var(--accent);letter-spacing:0.24em;}
#${id} .t{margin-top:18px;font-size:132px;font-weight:800;line-height:1.1;letter-spacing:0.01em;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{scale:0.85,autoAlpha:0,duration:0.24,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .tp',{scaleX:0,transformOrigin:'left center',duration:0.26,ease:'power2.out'},0.12);\n` +
        `tl.from('#${id} .t',{y:20,autoAlpha:0,duration:0.24,ease:'power2.out'},0.2);`,
    ),
  标注: () =>
    mk(
      'br_call',
      '标注',
      (id) => `
<div class="w">
  <div class="card"><b data-edit="tag">NOTE</b><span data-edit="note">${txt('标注一', 'Note 1')}</span></div>
  <div class="lead"></div><i class="dot"></i>
</div>
<style>
#${id} .w{position:absolute;right:150px;top:30%;font-family:var(--font-head);display:flex;flex-direction:column;align-items:center;}
#${id} .card{${CARD}border-left:8px solid var(--accent);display:flex;align-items:center;gap:24px;padding:20px 34px;}
#${id} .card b{font-family:var(--font-num);font-size:26px;font-weight:700;color:var(--accent);letter-spacing:0.18em;}
#${id} .card span{font-size:42px;font-weight:700;}
#${id} .lead{width:2px;height:110px;background:var(--line);}
#${id} .dot{width:16px;height:16px;border-radius:999px;background:var(--accent);border:3px solid var(--panel);box-shadow:var(--shadow);}
</style>`,
      (id) =>
        `tl.from('#${id} .card',{y:-50,autoAlpha:0,duration:0.24,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .lead',{scaleY:0,transformOrigin:'top center',duration:0.22,ease:'power2.out'},0.18);\n` +
        `tl.from('#${id} .dot',{scale:0,duration:0.18,ease:'power2.out'},0.36);`,
    ),
  关注引导: () =>
    mk(
      'br_cta',
      '关注引导',
      (id) => `
<div class="w">
  <span class="p" data-edit="cta">${txt('+ 关注', '+ Follow')}</span>
  <span class="m" data-edit="side">UPDATED WEEKLY</span>
</div>
<style>
#${id} .w{position:absolute;right:96px;bottom:110px;display:flex;align-items:stretch;${CARD}font-family:var(--font-head);}
#${id} .p{background:var(--accent);color:var(--paper);font-size:46px;font-weight:800;padding:20px 38px;}
#${id} .m{display:flex;align-items:center;font-family:var(--font-num);font-size:26px;font-weight:700;color:var(--muted);letter-spacing:0.16em;padding:0 30px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{x:90,autoAlpha:0,duration:0.26,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .p',{autoAlpha:0,duration:0.2},0.2);`,
    ),
  金句: () =>
    mk(
      'br_quote',
      '金句',
      (id) => `
<div class="w">
  <div class="ab"></div>
  <div class="in">
    <div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b data-edit="l2">${txt('下半句。', 'and line two.')}</b></div>
    <div class="src" data-edit="sig">${txt('SOURCE: 署名', 'SOURCE: ATTRIBUTION')}</div>
  </div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);width:60%;${CARD}display:flex;font-family:var(--font-head);}
#${id} .ab{width:10px;flex:none;background:var(--accent);}
#${id} .in{flex:1;padding:32px 48px 26px;}
#${id} .t{font-size:54px;font-weight:700;line-height:1.4;}
#${id} .t b{color:var(--accent);}
#${id} .src{margin-top:20px;border-top:1px solid var(--line);padding-top:14px;font-family:var(--font-num);font-size:24px;color:var(--muted);letter-spacing:0.1em;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:80,autoAlpha:0,duration:0.28,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .ab',{scaleY:0,transformOrigin:'top center',duration:0.26,ease:'power2.out'},0.16);\n` +
        `tl.from('#${id} .t b',{autoAlpha:0,duration:0.2},0.36);\n` +
        `tl.from('#${id} .src',{autoAlpha:0,duration:0.2},0.48);`,
    ),
  左右对比: () =>
    mk(
      'br_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="s a"><div class="ch" data-edit="lt">${txt('选项一', 'Option A')}</div><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <div class="vs">VS</div>
  <div class="s b"><div class="ch on"><span data-edit="rt">${txt('选项二', 'Option B')}</span><em>${txt('推荐', 'PICK')}</em></div><b data-edit="rv">${txt('数值二', 'Value B')}</b></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);display:flex;align-items:center;gap:24px;font-family:var(--font-head);}
#${id} .s{width:380px;${CARD}}
#${id} .ch{padding:18px 32px;font-size:32px;font-weight:700;border-bottom:1px solid var(--line);color:var(--muted);}
#${id} .ch.on{background:var(--accent);color:var(--paper);display:flex;align-items:center;justify-content:space-between;}
#${id} .ch em{font-style:normal;font-size:22px;font-weight:700;border:2px solid var(--paper);border-radius:999px;padding:2px 16px;}
#${id} .s b{display:block;padding:22px 32px 26px;font-family:var(--font-num);font-size:64px;font-weight:700;line-height:1;}
#${id} .b b{color:var(--accent);}
#${id} .vs{font-family:var(--font-num);font-size:32px;font-weight:700;color:var(--muted);letter-spacing:0.1em;}
</style>`,
      (id) =>
        `tl.from('#${id} .a',{x:-70,autoAlpha:0,duration:0.24,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .vs',{autoAlpha:0,duration:0.18},0.16);\n` +
        `tl.from('#${id} .b',{x:70,autoAlpha:0,duration:0.24,ease:'power2.out'},0.22);\n` +
        `tl.from('#${id} .ch.on em',{scale:0,duration:0.18,ease:'power2.out'},0.5);`,
    ),
};

export type { Block };
