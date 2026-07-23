/**
 * Botanical talking-head overlays: herbarium-label language. White --panel
 * label cards pinned by angled kraft tape (--panel-2, rotate -42deg), a Latin
 * catalog mono line (0.3em tracking), hairline --line dividers, one terracotta
 * wax seal (--accent-2, max one per card), and thin-line leaf SVGs drawn
 * stroke-by-stroke. Slow and quiet, no bounce.
 */

import { mk, txt, type Block } from '../dialects/shared';

const LABEL = 'background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);color:var(--fg);';

const LEAF = `<svg class="glyph" viewBox="0 0 90 70">
  <path class="lf" d="M8 62 C10 30 34 8 82 8 C80 44 52 66 8 62 Z"/>
  <path class="lf" d="M8 62 C30 44 52 28 82 8"/>
</svg>`;

const base = (id: string) => `
#${id} .tape{position:absolute;width:150px;height:44px;background:var(--panel-2);opacity:0.85;transform:rotate(-42deg);}
#${id} .lat{font-family:var(--font-num);font-size:26px;letter-spacing:0.3em;color:var(--muted);}
#${id} .hr{height:1px;background:var(--line);}
#${id} .wax{position:absolute;width:40px;height:40px;border-radius:999px;background:var(--accent-2);box-shadow:var(--shadow);}
#${id} .glyph{width:72px;height:56px;flex:none;}
#${id} .glyph .lf{fill:none;stroke:var(--accent);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:300;stroke-dashoffset:300;}`;

const leafDraw = (id: string, at = 0.3) =>
  `tl.to('#${id} .glyph .lf',{strokeDashoffset:0,duration:0.4,stagger:0.08,ease:'power1.inOut'},${at});`;

export const overlays: Record<string, () => Block> = {
  'title-bar': () =>
    mk(
      'bp_ttl',
      'title-bar',
      (id) => `
<div class="w">
  <i class="tape ta"></i><i class="tape tb"></i>
  <div class="lat" data-edit="kick">HERBARIUM · NO.007</div>
  <div class="t" data-edit="title">${txt('标题一', 'Title 1')}</div>
  <div class="hr mh"></div>
  <div class="meta" data-edit="meta">${txt('说明一', 'Detail 1')}</div>
  <i class="wax wx"></i>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:76px;bottom:100px;width:54%;${LABEL}padding:34px 48px 32px;font-family:var(--font-head);}
#${id} .t{margin-top:20px;font-size:68px;font-weight:600;line-height:1.3;letter-spacing:0.04em;}
#${id} .mh{width:52%;margin-top:22px;}
#${id} .meta{margin-top:18px;font-size:32px;color:var(--muted);letter-spacing:0.06em;}
#${id} .ta{left:-46px;top:-14px;}
#${id} .tb{right:-46px;bottom:-14px;}
#${id} .wx{right:-14px;top:-18px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:50,autoAlpha:0,duration:0.36,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .mh',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power1.out'},0.36);\n` +
        `tl.from('#${id} .meta',{autoAlpha:0,duration:0.26},0.52);\n` +
        `tl.from('#${id} .wx',{scale:0,duration:0.24,ease:'power2.out'},0.7);`,
    ),
  'big-number': () =>
    mk(
      'bp_num',
      'big-number',
      (id) => `
<div class="w">
  <i class="tape ta"></i>
  <div class="lat" data-edit="label">${txt('GROWTH LOG · 数据说明', 'GROWTH LOG · DATA LABEL')}</div>
  <div class="d"><span data-edit="unit">DAY</span><b data-edit="num">30</b></div>
  <div class="hr mh"></div>
  <div class="meta" data-edit="note">${txt('数值一', 'Value A')}</div>
  <i class="wax wx"></i>
</div>
<style>${base(id)}
#${id} .w{position:absolute;right:96px;top:110px;width:430px;${LABEL}padding:34px 44px 30px;font-family:var(--font-head);}
#${id} .d{margin-top:16px;display:flex;align-items:baseline;gap:30px;}
#${id} .d span{font-family:var(--font-num);font-size:34px;letter-spacing:0.3em;color:var(--muted);}
#${id} .d b{font-size:190px;font-weight:500;line-height:1;letter-spacing:0.02em;}
#${id} .mh{width:70%;margin-top:18px;}
#${id} .meta{margin-top:16px;font-size:30px;color:var(--muted);letter-spacing:0.06em;}
#${id} .ta{left:50%;top:-16px;margin-left:-75px;transform:rotate(-3deg);}
#${id} .wx{right:-14px;top:-18px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:-40,autoAlpha:0,duration:0.34,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .d b',{autoAlpha:0,y:16,duration:0.3,ease:'power1.out'},0.3);\n` +
        `tl.from('#${id} .mh',{scaleX:0,transformOrigin:'left center',duration:0.28,ease:'power1.out'},0.5);\n` +
        `tl.from('#${id} .wx',{scale:0,duration:0.22,ease:'power2.out'},0.72);`,
    ),
  'bullet-list': () =>
    mk(
      'bp_list',
      'bullet-list',
      (id) => `
<div class="w">
  <i class="tape ta"></i>
  <div class="hd"><span data-edit="title">${txt('列表标题', 'List title')}</span><i class="lat" data-edit="pg">3 SPECIMENS</i></div>
  <div class="r r1">${LEAF}<span data-edit="p1">${txt('要点一', 'Point 1')}</span><i class="lat">NO.01</i></div>
  <div class="r r2">${LEAF}<span data-edit="p2">${txt('要点二', 'Point 2')}</span><i class="lat">NO.02</i></div>
  <div class="r r3">${LEAF}<span data-edit="p3">${txt('要点三', 'Point 3')}</span><i class="lat">NO.03</i></div>
  <i class="wax wx"></i>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:560px;${LABEL}padding:30px 42px 16px;font-family:var(--font-head);}
#${id} .hd{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:20px;border-bottom:1px solid var(--line);}
#${id} .hd span{font-size:38px;font-weight:600;letter-spacing:0.05em;}
#${id} .hd i{font-style:normal;font-size:22px;}
#${id} .r{display:flex;align-items:center;gap:26px;padding:24px 0;border-bottom:1px solid var(--line);font-size:40px;font-weight:600;letter-spacing:0.04em;}
#${id} .r:last-of-type{border-bottom:none;}
#${id} .r span{flex:1;}
#${id} .r i{font-style:normal;font-size:22px;}
#${id} .ta{left:50%;top:-16px;margin-left:-75px;transform:rotate(-3deg);}
#${id} .wx{right:-14px;top:-18px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{x:-60,autoAlpha:0,duration:0.34,ease:'power1.out'},0);\n` +
        leafDraw(id, 0.24) +
        `\ntl.from('#${id} .r span,#${id} .r .lat',{y:14,autoAlpha:0,duration:0.26,stagger:0.06,ease:'power1.out'},0.3);\n` +
        `tl.from('#${id} .wx',{scale:0,duration:0.22,ease:'power2.out'},0.86);`,
    ),
  'keyword-slam': () =>
    mk(
      'bp_kw',
      'keyword-slam',
      (id) => `
<div class="w">
  <i class="tape ta"></i>
  <div class="t" data-edit="word">${txt('关键词', 'Keyword')}</div>
  <div class="hr mh"></div>
  <div class="lat cl" data-edit="kick">SPECIMEN · PRESSED WORD</div>
  <i class="wax wx"></i>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:480px;max-width:50%;${LABEL}padding:48px 76px 40px;font-family:var(--font-head);text-align:center;}
#${id} .t{font-size:124px;font-weight:600;line-height:1.15;letter-spacing:0.06em;}
#${id} .mh{width:56%;margin:26px auto 0;}
#${id} .cl{margin-top:20px;}
#${id} .ta{left:50%;top:-16px;margin-left:-75px;transform:rotate(-3deg);}
#${id} .wx{right:-14px;top:-18px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:36,autoAlpha:0,duration:0.36,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .mh',{scaleX:0,transformOrigin:'center center',duration:0.28,ease:'power1.out'},0.34);\n` +
        `tl.from('#${id} .cl',{autoAlpha:0,duration:0.24},0.5);\n` +
        `tl.from('#${id} .wx',{scale:0,duration:0.22,ease:'power2.out'},0.68);`,
    ),
  'callout': () =>
    mk(
      'bp_call',
      'callout',
      (id) => `
<div class="w">
  <i class="tape ta"></i>
  ${LEAF}
  <div class="tx">
    <span class="lat" data-edit="tag">${txt('ADNOTATIO · 注记', 'ADNOTATIO · NOTE')}</span>
    <b data-edit="note">${txt('标注一', 'Note 1')}</b>
  </div>
  <i class="wax wx"></i>
</div>
<style>${base(id)}
#${id} .w{position:absolute;right:150px;top:28%;${LABEL}padding:26px 40px;display:flex;align-items:center;gap:26px;font-family:var(--font-head);}
#${id} .tx{display:flex;flex-direction:column;gap:12px;}
#${id} .tx .lat{font-size:22px;}
#${id} .tx b{font-size:44px;font-weight:600;letter-spacing:0.05em;}
#${id} .ta{left:-46px;top:-14px;}
#${id} .wx{right:-14px;top:-18px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:-36,autoAlpha:0,duration:0.32,ease:'power1.out'},0);\n` +
        leafDraw(id, 0.2) +
        `\ntl.from('#${id} .wx',{scale:0,duration:0.22,ease:'power2.out'},0.66);`,
    ),
  'follow-cta': () =>
    mk(
      'bp_cta',
      'follow-cta',
      (id) => `
<div class="w">
  <i class="tape ta"></i><i class="tape tb"></i>
  <span class="lat" data-edit="side">SUBSCRIBE · WEEKLY SPECIMEN</span>
  <b data-edit="cta">${txt('+ 关注', '+ Follow')}</b>
  <div class="hr ch"></div>
  <i class="wax wx"></i>
</div>
<style>${base(id)}
#${id} .w{position:absolute;right:96px;bottom:110px;${LABEL}padding:30px 46px 26px;display:flex;flex-direction:column;align-items:flex-start;gap:18px;font-family:var(--font-head);}
#${id} .w b{font-size:52px;font-weight:600;letter-spacing:0.04em;}
#${id} .ch{width:140px;}
#${id} .ta{left:-46px;top:-14px;}
#${id} .tb{right:-46px;bottom:-14px;}
#${id} .wx{right:-14px;top:-18px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:40,autoAlpha:0,duration:0.34,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .ch',{scaleX:0,transformOrigin:'left center',duration:0.26,ease:'power1.out'},0.34);\n` +
        `tl.from('#${id} .wx',{scale:0,duration:0.24,ease:'power2.out'},0.56);`,
    ),
  'quote': () =>
    mk(
      'bp_quote',
      'quote',
      (id) => `
<div class="w">
  <i class="tape ta"></i><i class="tape tb"></i>
  <div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b data-edit="l2">${txt('下半句。', 'and line two.')}</b></div>
  <div class="sig"><div class="hr sh"></div><span class="lat" data-edit="sig">${txt('—— 署名', '— Attribution')}</span><i class="wax"></i></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);width:58%;${LABEL}padding:38px 56px 32px;font-family:var(--font-head);}
#${id} .t{font-size:52px;font-weight:500;line-height:1.5;letter-spacing:0.03em;}
#${id} .t b{font-weight:600;border-bottom:1px solid var(--accent);}
#${id} .sig{margin-top:22px;display:flex;align-items:center;gap:28px;}
#${id} .sig .hr{width:140px;}
#${id} .sig .wax{position:static;width:34px;height:34px;flex:none;}
#${id} .ta{left:-46px;top:-14px;}
#${id} .tb{right:-46px;bottom:-14px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:50,autoAlpha:0,duration:0.38,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .t b',{autoAlpha:0,duration:0.26},0.38);\n` +
        `tl.from('#${id} .sig .hr,#${id} .sig .lat',{autoAlpha:0,duration:0.26},0.52);\n` +
        `tl.from('#${id} .sig .wax',{scale:0,duration:0.22,ease:'power2.out'},0.72);`,
    ),
  'comparison': () =>
    mk(
      'bp_cmp',
      'comparison',
      (id) => `
<div class="w">
  <div class="s a"><i class="tape tp"></i><span class="lat" data-edit="lt">${txt('选项一', 'Option A')}</span><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <span class="lat vs">VS</span>
  <div class="s b"><i class="tape tp"></i><span class="lat" data-edit="rt">${txt('选项二', 'Option B')}</span><b data-edit="rv">${txt('数值二', 'Value B')}</b><i class="wax wx"></i></div>
</div>
<style>${base(id)}
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);display:flex;align-items:center;gap:30px;font-family:var(--font-head);}
#${id} .s{position:relative;width:360px;${LABEL}padding:30px 38px 28px;display:flex;flex-direction:column;gap:16px;}
#${id} .s .lat{font-size:24px;}
#${id} .s b{font-size:58px;font-weight:600;letter-spacing:0.04em;}
#${id} .b b{color:var(--accent);}
#${id} .vs{font-size:28px;}
#${id} .tp{left:50%;top:-16px;margin-left:-75px;transform:rotate(-3deg);}
#${id} .wx{right:-14px;top:-18px;}
</style>`,
      (id) =>
        `tl.from('#${id} .a',{y:36,autoAlpha:0,duration:0.32,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .vs',{autoAlpha:0,duration:0.24},0.2);\n` +
        `tl.from('#${id} .b',{y:36,autoAlpha:0,duration:0.32,ease:'power1.out'},0.26);\n` +
        `tl.from('#${id} .wx',{scale:0,duration:0.22,ease:'power2.out'},0.66);`,
    ),
};

export type { Block };
