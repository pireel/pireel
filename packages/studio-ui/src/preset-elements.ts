'use client';

/**
 * Preset element library — the official seeds for the Assets · Elements section. Design constraints:
 *  - **One neutral element set, variants delegated to the theme**: everything uses only
 *    tokens (--panel/--fg/--accent…), so a different frame changes its look automatically;
 *    no 25×N theme-variant cards.
 *  - Every text node carries data-edit (click to edit in place after insert). Copy is
 *    generic placeholder text — the floating toolbar's "sync content" fills it from the
 *    block's time-window script in one tap; the placeholder clearly signals "shell to fill".
 *  - Selectors scoped to #seedId; on insert, replaceAll(seedId → new block id) re-scopes it, so it can be inserted repeatedly.
 *  - Sized against a 1080-wide canvas, cards self-centered (don't depend on canvas height,
 *    works for both 16:9 and 9:16); animation settles in ≤1.2s, no loop; min font size 28px.
 * Unrelated to the LLM generation path (compose doesn't wrap presets); this is the manual
 * path — once inserted it's just an ordinary custom block.
 */

import type { GenElementResult } from './element-history';
import { studioLocale, t } from './i18n';

export interface PresetElement {
  id: string;
  category: string;
  label: string;
  element: GenElementResult;
}

export const PRESET_CATEGORIES = ['数据', '结构', '强调', '标题', '社交'] as const;

const pe = (id: string, category: string, labelZh: string, innerHtml: string, timelineBody: string): PresetElement => ({
  id,
  category,
  label: t(labelZh),
  element: { seedId: id, innerHtml, timelineBody, label: t(labelZh), presetId: id },
});

/* Shared skeleton: each element ships its own <style>, no shared CSS (blocks must be self-contained; export/re-insert can't depend on anything external). */

const buildPresets = (): PresetElement[] => [
  /* ---------------- Data ---------------- */
  pe(
    'pe_num',
    '数据',
    '大数字',
    `<div class="w"><div class="card">
  <div class="lab" data-edit="label">${t('标题')}</div>
  <div class="row"><b class="n" data-edit="num">100</b><i class="u" data-edit="unit">%</i></div>
  <div class="sub" data-edit="sub">${t('补充说明')}</div>
</div></div>
<style>
#pe_num .w{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
#pe_num .card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:64px 96px;text-align:center;font-family:var(--font-head);color:var(--fg);}
#pe_num .lab{font-size:34px;font-weight:700;letter-spacing:0.12em;color:var(--muted);}
#pe_num .row{display:flex;align-items:baseline;justify-content:center;gap:12px;margin:18px 0 10px;}
#pe_num .n{font-size:230px;font-weight:900;line-height:1;letter-spacing:-0.02em;font-family:var(--font-num,var(--font-head));}
#pe_num .u{font-style:normal;font-size:72px;font-weight:800;color:var(--accent);}
#pe_num .sub{font-size:30px;color:var(--muted);}
</style>`,
    `tl.from('#pe_num .card',{y:60,autoAlpha:0,duration:0.35,ease:'power3.out'},0);
tl.to({v:0},{v:100,duration:0.7,ease:'power2.out',onUpdate:function(){var el=document.querySelector('#pe_num .n');if(el)el.textContent=String(Math.round(this.targets()[0].v));}},0.2);
tl.from('#pe_num .u',{autoAlpha:0,scale:0.6,duration:0.25,ease:'back.out(1.7)'},0.75);
tl.from('#pe_num .sub',{autoAlpha:0,y:16,duration:0.25,ease:'power2.out'},0.85);`,
  ),
  pe(
    'pe_cmp',
    '数据',
    '左右对比',
    `<div class="w">
  <div class="side a"><div class="t" data-edit="lt">${t('选项一')}</div><b class="v" data-edit="lv">${t('数值一')}</b><div class="d" data-edit="ld">${t('说明一')}</div></div>
  <div class="vs">VS</div>
  <div class="side b"><div class="t" data-edit="rt">${t('选项二')}</div><b class="v" data-edit="rv">${t('数值二')}</b><div class="d" data-edit="rd">${t('说明二')}</div></div>
</div>
<style>
#pe_cmp .w{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:36px;font-family:var(--font-head);}
#pe_cmp .side{width:380px;padding:56px 30px;text-align:center;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);color:var(--fg);}
#pe_cmp .side.b{border:3px solid var(--accent);}
#pe_cmp .t{font-size:32px;font-weight:700;color:var(--muted);letter-spacing:0.08em;}
#pe_cmp .v{display:block;font-size:110px;font-weight:900;margin:22px 0 14px;font-family:var(--font-num,var(--font-head));}
#pe_cmp .side.b .v{color:var(--accent);}
#pe_cmp .d{font-size:28px;color:var(--muted);}
#pe_cmp .vs{font-size:44px;font-weight:900;color:var(--muted);}
</style>`,
    `tl.from('#pe_cmp .a',{x:-70,autoAlpha:0,duration:0.32,ease:'power3.out'},0);
tl.from('#pe_cmp .vs',{scale:0,autoAlpha:0,duration:0.24,ease:'back.out(2)'},0.22);
tl.from('#pe_cmp .b',{x:70,autoAlpha:0,duration:0.32,ease:'power3.out'},0.34);
tl.from('#pe_cmp .b .v',{scale:0.7,duration:0.28,ease:'back.out(1.7)'},0.62);`,
  ),
  pe(
    'pe_ring',
    '数据',
    '环形占比',
    `<div class="w"><div class="card">
  <svg viewBox="0 0 200 200" class="g"><circle class="bg" cx="100" cy="100" r="84"/><circle class="fg" cx="100" cy="100" r="84" pathLength="100"/></svg>
  <div class="c"><b class="p" data-edit="pct">73</b><i>%</i></div>
  <div class="lab" data-edit="label">${t('标题')}</div>
</div></div>
<style>
#pe_ring .w{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
#pe_ring .card{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:56px 72px 48px;text-align:center;font-family:var(--font-head);color:var(--fg);}
#pe_ring .g{width:340px;height:340px;transform:rotate(-90deg);}
#pe_ring circle{fill:none;stroke-width:20;stroke-linecap:round;}
#pe_ring .bg{stroke:var(--grid);}
#pe_ring .fg{stroke:var(--accent);stroke-dasharray:73 27;}
#pe_ring .c{position:absolute;left:0;right:0;top:170px;font-weight:900;}
#pe_ring .p{font-size:96px;font-family:var(--font-num,var(--font-head));}
#pe_ring .c i{font-style:normal;font-size:44px;color:var(--muted);}
#pe_ring .lab{margin-top:10px;font-size:32px;font-weight:700;color:var(--muted);}
</style>`,
    `tl.from('#pe_ring .card',{y:50,autoAlpha:0,duration:0.32,ease:'power3.out'},0);
tl.from('#pe_ring .fg',{strokeDasharray:'0 100',duration:0.8,ease:'power2.inOut'},0.2);
tl.to({v:0},{v:73,duration:0.8,ease:'power2.inOut',onUpdate:function(){var el=document.querySelector('#pe_ring .p');if(el)el.textContent=String(Math.round(this.targets()[0].v));}},0.2);
tl.from('#pe_ring .lab',{autoAlpha:0,y:14,duration:0.24},1.0);`,
  ),
  pe(
    'pe_bars',
    '数据',
    '条形图',
    `<div class="w"><div class="card">
  <div class="ttl" data-edit="title">${t('标题')}</div>
  <div class="row r1"><span class="k" data-edit="k1">${t('条目一')}</span><div class="tr"><div class="bar b1"></div></div><b class="v" data-edit="v1">60%</b></div>
  <div class="row r2"><span class="k" data-edit="k2">${t('条目二')}</span><div class="tr"><div class="bar b2"></div></div><b class="v" data-edit="v2">40%</b></div>
  <div class="row r3"><span class="k" data-edit="k3">${t('条目三')}</span><div class="tr"><div class="bar b3"></div></div><b class="v" data-edit="v3">20%</b></div>
</div></div>
<style>
#pe_bars .w{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
#pe_bars .card{width:860px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:56px 64px;font-family:var(--font-head);color:var(--fg);}
#pe_bars .ttl{font-size:40px;font-weight:800;margin-bottom:36px;}
#pe_bars .row{display:flex;align-items:center;gap:24px;margin:26px 0;}
#pe_bars .k{width:150px;font-size:30px;font-weight:700;color:var(--muted);}
#pe_bars .tr{flex:1;height:44px;background:var(--grid);border-radius:12px;overflow:hidden;}
#pe_bars .bar{height:100%;background:var(--accent);border-radius:12px;transform-origin:left center;}
#pe_bars .b1{width:60%;}
#pe_bars .b2{width:40%;}
#pe_bars .b3{width:20%;opacity:0.65;}
#pe_bars .v{width:110px;text-align:right;font-size:34px;font-weight:900;font-family:var(--font-num,var(--font-head));}
</style>`,
    `tl.from('#pe_bars .card',{y:50,autoAlpha:0,duration:0.32,ease:'power3.out'},0);
tl.from('#pe_bars .ttl',{autoAlpha:0,y:14,duration:0.24},0.16);
tl.from('#pe_bars .bar',{scaleX:0,duration:0.5,stagger:0.12,ease:'power3.out'},0.3);
tl.from('#pe_bars .v',{autoAlpha:0,duration:0.2,stagger:0.12},0.5);`,
  ),
  /* ---------------- Structure ---------------- */
  pe(
    'pe_list',
    '结构',
    '要点列表',
    `<div class="w"><div class="card">
  <div class="ttl" data-edit="title">${t('标题')}</div>
  <div class="it it1"><span class="ix">1</span><b data-edit="i1">${t('要点一')}</b></div>
  <div class="it it2"><span class="ix">2</span><b data-edit="i2">${t('要点二')}</b></div>
  <div class="it it3"><span class="ix">3</span><b data-edit="i3">${t('要点三')}</b></div>
</div></div>
<style>
#pe_list .w{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
#pe_list .card{width:840px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:56px 64px;font-family:var(--font-head);color:var(--fg);}
#pe_list .ttl{font-size:42px;font-weight:900;margin-bottom:34px;}
#pe_list .it{display:flex;align-items:center;gap:26px;padding:22px 0;border-top:1px solid var(--line);font-size:38px;font-weight:700;}
#pe_list .ix{flex:none;width:56px;height:56px;display:flex;align-items:center;justify-content:center;border-radius:999px;background:var(--accent);color:var(--panel);font-size:30px;font-weight:900;}
</style>`,
    `tl.from('#pe_list .card',{y:50,autoAlpha:0,duration:0.32,ease:'power3.out'},0);
tl.from('#pe_list .ttl',{autoAlpha:0,y:14,duration:0.24},0.14);
tl.from('#pe_list .it',{x:-60,autoAlpha:0,duration:0.3,stagger:0.14,ease:'power3.out'},0.28);
tl.from('#pe_list .ix',{scale:0,duration:0.24,stagger:0.14,ease:'back.out(2)'},0.34);`,
  ),
  pe(
    'pe_steps',
    '结构',
    '三步流程',
    `<div class="w">
  <div class="st s1"><em>STEP 1</em><b data-edit="s1">${t('步骤一')}</b></div>
  <svg class="ar" viewBox="0 0 60 24"><path d="M4,12 H48 M40,4 L50,12 L40,20"/></svg>
  <div class="st s2"><em>STEP 2</em><b data-edit="s2">${t('步骤二')}</b></div>
  <svg class="ar" viewBox="0 0 60 24"><path d="M4,12 H48 M40,4 L50,12 L40,20"/></svg>
  <div class="st s3"><em>STEP 3</em><b data-edit="s3">${t('步骤三')}</b></div>
</div>
<style>
#pe_steps .w{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:20px;font-family:var(--font-head);}
#pe_steps .st{width:280px;padding:44px 20px;text-align:center;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);color:var(--fg);display:flex;flex-direction:column;gap:16px;}
#pe_steps .st em{font-style:normal;font-size:28px;font-weight:700;letter-spacing:0.18em;color:var(--accent);}
#pe_steps .st b{font-size:40px;font-weight:900;}
#pe_steps .ar{width:64px;height:28px;}
#pe_steps .ar path{fill:none;stroke:var(--muted);stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round;}
</style>`,
    `tl.from('#pe_steps .s1',{y:46,autoAlpha:0,duration:0.3,ease:'back.out(1.5)'},0);
tl.from('#pe_steps .ar',{autoAlpha:0,x:-14,duration:0.22,stagger:0.3},0.24);
tl.from('#pe_steps .s2',{y:46,autoAlpha:0,duration:0.3,ease:'back.out(1.5)'},0.3);
tl.from('#pe_steps .s3',{y:46,autoAlpha:0,duration:0.3,ease:'back.out(1.5)'},0.6);`,
  ),
  pe(
    'pe_tline',
    '结构',
    '时间轴',
    `<div class="w"><div class="card">
  <div class="line"></div>
  <div class="nd n1"><i class="p"></i><em data-edit="t1">${t('时点一')}</em><b data-edit="d1">${t('事件一')}</b></div>
  <div class="nd n2"><i class="p"></i><em data-edit="t2">${t('时点二')}</em><b data-edit="d2">${t('事件二')}</b></div>
  <div class="nd n3"><i class="p"></i><em data-edit="t3">${t('时点三')}</em><b data-edit="d3">${t('事件三')}</b></div>
</div></div>
<style>
#pe_tline .w{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
#pe_tline .card{position:relative;width:900px;height:300px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);font-family:var(--font-head);color:var(--fg);}
#pe_tline .line{position:absolute;left:70px;right:70px;top:120px;height:6px;background:var(--grid);border-radius:3px;}
#pe_tline .nd{position:absolute;top:96px;width:240px;text-align:center;}
#pe_tline .n1{left:40px;}#pe_tline .n2{left:330px;}#pe_tline .n3{left:620px;}
#pe_tline .p{display:block;width:30px;height:30px;margin:0 auto;border-radius:999px;background:var(--accent);border:6px solid var(--panel);box-shadow:0 0 0 2px var(--accent);}
#pe_tline .nd em{display:block;font-style:normal;font-size:28px;color:var(--muted);margin-top:16px;}
#pe_tline .nd b{display:block;font-size:34px;font-weight:900;margin-top:6px;}
</style>`,
    `tl.from('#pe_tline .card',{y:50,autoAlpha:0,duration:0.3,ease:'power3.out'},0);
tl.from('#pe_tline .line',{scaleX:0,transformOrigin:'left center',duration:0.5,ease:'power2.out'},0.2);
tl.from('#pe_tline .nd',{y:26,autoAlpha:0,duration:0.28,stagger:0.16,ease:'back.out(1.6)'},0.4);`,
  ),
  /* ---------------- Emphasis ---------------- */
  pe(
    'pe_quote',
    '强调',
    '金句',
    `<div class="w"><div class="card">
  <div class="qm">“</div>
  <div class="ln l1" data-edit="l1">${t('金句上半句,')}</div>
  <div class="ln l2"><b class="hi" data-edit="l2">${t('下半句。')}</b></div>
  <div class="who" data-edit="who">${t('—— 署名')}</div>
</div></div>
<style>
#pe_quote .w{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
#pe_quote .card{position:relative;width:860px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:88px 80px 64px;font-family:var(--font-head);color:var(--fg);}
#pe_quote .qm{position:absolute;left:56px;top:6px;font-size:150px;font-weight:900;color:var(--accent);line-height:1;}
#pe_quote .ln{font-size:76px;font-weight:900;line-height:1.35;}
#pe_quote .hi{background:linear-gradient(transparent 62%,var(--accent) 62%);padding:0 6px;}
#pe_quote .who{margin-top:30px;font-size:30px;color:var(--muted);text-align:right;}
</style>`,
    `tl.from('#pe_quote .card',{y:60,autoAlpha:0,duration:0.34,ease:'power3.out'},0);
tl.from('#pe_quote .qm',{scale:0,rotation:-20,autoAlpha:0,duration:0.3,ease:'back.out(1.8)'},0.18);
tl.from('#pe_quote .ln',{autoAlpha:0,y:26,duration:0.28,stagger:0.16,ease:'power3.out'},0.3);
tl.from('#pe_quote .who',{autoAlpha:0,duration:0.24},0.8);`,
  ),
  pe(
    'pe_slam',
    '强调',
    '关键词重击',
    `<div class="w"><div class="k" data-edit="word">${t('关键词')}</div><div class="s" data-edit="sub">${t('一句补充说明')}</div></div>
<style>
#pe_slam .w{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font-family:var(--font-head);}
#pe_slam .k{font-size:240px;font-weight:900;letter-spacing:0.04em;color:var(--fg);background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);padding:10px 70px;border-bottom:14px solid var(--accent);}
#pe_slam .s{font-size:44px;font-weight:800;color:var(--panel);background:var(--panel-2,var(--fg));padding:10px 34px;border-radius:999px;}
</style>`,
    `tl.from('#pe_slam .k',{scale:2.2,autoAlpha:0,duration:0.28,ease:'power4.in'},0);
tl.to('#pe_slam .k',{scale:1,duration:0.12,ease:'power2.out'},0.28);
tl.from('#pe_slam .s',{y:30,autoAlpha:0,duration:0.26,ease:'back.out(1.6)'},0.5);`,
  ),
  pe(
    'pe_callout',
    '强调',
    '标注',
    `<div class="w"><div class="box">
  <svg class="ar" viewBox="0 0 80 90"><path d="M64,82 C30,70 18,44 22,10 M22,10 L10,26 M22,10 L38,20"/></svg>
  <div class="pill" data-edit="note">${t('标注说明写在这里')}</div>
</div></div>
<style>
#pe_callout .w{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:flex-end;padding:0 90px 130px 0;font-family:var(--font-head);}
#pe_callout .box{position:relative;}
#pe_callout .ar{position:absolute;right:40px;top:-104px;width:92px;height:100px;}
#pe_callout .ar path{fill:none;stroke:var(--accent);stroke-width:7;stroke-linecap:round;stroke-linejoin:round;}
#pe_callout .pill{background:var(--panel);border:3px solid var(--accent);border-radius:999px;box-shadow:var(--shadow);padding:22px 44px;font-size:38px;font-weight:800;color:var(--fg);transform:rotate(-2deg);}
</style>`,
    `tl.from('#pe_callout .pill',{scale:0.6,autoAlpha:0,rotation:-10,duration:0.3,ease:'back.out(1.7)'},0);
tl.from('#pe_callout .ar path',{strokeDasharray:260,strokeDashoffset:260,duration:0.45,ease:'power2.out'},0.24);`,
  ),
  /* ---------------- Title ---------------- */
  pe(
    'pe_title',
    '标题',
    '标题卡',
    `<div class="w"><div class="card">
  <div class="tag" data-edit="tag">${t('标签')}</div>
  <div class="h" data-edit="title">${t('主标题写这里')}</div>
  <div class="sub" data-edit="sub">${t('副标题写这里')}</div>
</div></div>
<style>
#pe_title .w{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
#pe_title .card{width:880px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:72px 80px;font-family:var(--font-head);color:var(--fg);}
#pe_title .tag{display:inline-block;font-size:28px;font-weight:800;letter-spacing:0.16em;color:var(--accent);border:2px solid var(--accent);border-radius:999px;padding:8px 26px;}
#pe_title .h{font-size:84px;font-weight:900;line-height:1.2;margin:30px 0 16px;}
#pe_title .sub{font-size:36px;color:var(--muted);}
</style>`,
    `tl.from('#pe_title .card',{y:60,autoAlpha:0,duration:0.34,ease:'power3.out'},0);
tl.from('#pe_title .tag',{autoAlpha:0,x:-24,duration:0.24},0.2);
tl.from('#pe_title .h',{autoAlpha:0,y:30,duration:0.3,ease:'power3.out'},0.32);
tl.from('#pe_title .sub',{autoAlpha:0,y:18,duration:0.24},0.52);`,
  ),
  pe(
    'pe_chap',
    '标题',
    '章节页',
    `<div class="w">
  <div class="no" data-edit="no">02</div>
  <div class="tx"><b data-edit="title">${t('章节标题')}</b><div class="rule"></div><span data-edit="sub">${t('副标题写这里')}</span></div>
</div>
<style>
#pe_chap .w{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:44px;font-family:var(--font-head);}
#pe_chap .no{font-size:260px;font-weight:900;color:var(--accent);line-height:1;font-family:var(--font-num,var(--font-head));text-shadow:var(--shadow);}
#pe_chap .tx b{display:block;font-size:84px;font-weight:900;color:var(--fg);background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px 36px;}
#pe_chap .rule{height:6px;background:var(--accent);border-radius:3px;margin:20px 0 14px;transform-origin:left center;}
#pe_chap .tx span{font-size:34px;color:var(--muted);padding-left:8px;}
</style>`,
    `tl.from('#pe_chap .no',{x:-70,autoAlpha:0,duration:0.32,ease:'power3.out'},0);
tl.from('#pe_chap .tx b',{y:40,autoAlpha:0,duration:0.3,ease:'back.out(1.5)'},0.18);
tl.from('#pe_chap .rule',{scaleX:0,duration:0.3,ease:'power2.out'},0.42);
tl.from('#pe_chap .tx span',{autoAlpha:0,duration:0.22},0.58);`,
  ),
  pe(
    'pe_cta',
    '标题',
    '关注引导',
    `<div class="w"><div class="card">
  <div class="btn" data-edit="btn">${t('+ 关注')}</div>
  <div class="tx"><b data-edit="t">${t('标题')}</b><span data-edit="s">${t('副标题写这里')}</span></div>
</div></div>
<style>
#pe_cta .w{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:140px;font-family:var(--font-head);}
#pe_cta .card{display:flex;align-items:center;gap:34px;background:var(--panel);border:1px solid var(--line);border-radius:999px;box-shadow:var(--shadow);padding:26px 46px 26px 30px;}
#pe_cta .btn{background:var(--accent);color:var(--panel);font-size:44px;font-weight:900;border-radius:999px;padding:16px 42px;}
#pe_cta .tx b{display:block;font-size:36px;font-weight:900;color:var(--fg);}
#pe_cta .tx span{font-size:28px;color:var(--muted);}
</style>`,
    `tl.from('#pe_cta .card',{y:60,autoAlpha:0,duration:0.32,ease:'back.out(1.4)'},0);
tl.from('#pe_cta .btn',{scale:0.6,duration:0.28,ease:'back.out(2)'},0.24);
tl.to('#pe_cta .btn',{scale:1.06,duration:0.12,yoyo:true,repeat:1,ease:'power2.inOut'},0.9);`,
  ),
  /* ---------------- Social ---------------- */
  pe(
    'pe_cmt',
    '社交',
    '评论气泡',
    `<div class="w">
  <div class="bub b1"><i class="av">A</i><div class="tx"><em data-edit="n1">${t('@用户一')}</em><b data-edit="c1">${t('评论内容一')}</b></div></div>
  <div class="bub b2"><i class="av v2">L</i><div class="tx"><em data-edit="n2">${t('@用户二')}</em><b data-edit="c2">${t('评论内容二')}</b></div></div>
</div>
<style>
#pe_cmt .w{position:absolute;inset:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:30px;padding-left:110px;font-family:var(--font-head);}
#pe_cmt .bub{display:flex;align-items:center;gap:22px;background:var(--panel);border:1px solid var(--line);border-radius:28px;border-bottom-left-radius:8px;box-shadow:var(--shadow);padding:24px 40px 24px 24px;}
#pe_cmt .b2{margin-left:90px;}
#pe_cmt .av{flex:none;width:64px;height:64px;display:flex;align-items:center;justify-content:center;border-radius:999px;background:var(--accent);color:var(--panel);font-style:normal;font-size:32px;font-weight:900;}
#pe_cmt .av.v2{background:var(--panel-2,var(--fg));}
#pe_cmt .tx em{display:block;font-style:normal;font-size:26px;color:var(--muted);margin-bottom:4px;}
#pe_cmt .tx b{font-size:36px;font-weight:800;color:var(--fg);}
</style>`,
    `tl.from('#pe_cmt .b1',{x:-70,autoAlpha:0,duration:0.3,ease:'back.out(1.5)'},0);
tl.from('#pe_cmt .b2',{x:-70,autoAlpha:0,duration:0.3,ease:'back.out(1.5)'},0.22);
tl.from('#pe_cmt .av',{scale:0,duration:0.24,stagger:0.2,ease:'back.out(2)'},0.1);`,
  ),
  pe(
    'pe_link',
    '社交',
    '蹲链接条',
    `<div class="w"><div class="bar">
  <span class="chip c1" data-edit="c1">${t('弹幕一')}</span>
  <span class="chip c2" data-edit="c2">${t('弹幕二')}</span>
  <span class="chip c3" data-edit="c3">${t('弹幕三')}</span>
  <b class="ans" data-edit="ans">${t('回复内容')}</b>
</div></div>
<style>
#pe_link .w{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:150px;font-family:var(--font-head);}
#pe_link .bar{display:flex;align-items:center;gap:20px;background:var(--panel);border:1px solid var(--line);border-radius:999px;box-shadow:var(--shadow);padding:22px 34px;}
#pe_link .chip{font-size:30px;font-weight:800;color:var(--fg);background:var(--grid);border-radius:999px;padding:12px 26px;}
#pe_link .ans{font-size:32px;font-weight:900;color:var(--panel);background:var(--accent);border-radius:999px;padding:14px 32px;}
</style>`,
    `tl.from('#pe_link .bar',{y:60,autoAlpha:0,duration:0.3,ease:'power3.out'},0);
tl.from('#pe_link .chip',{scale:0,autoAlpha:0,duration:0.24,stagger:0.12,ease:'back.out(1.8)'},0.2);
tl.from('#pe_link .ans',{scale:0.6,autoAlpha:0,duration:0.28,ease:'back.out(1.7)'},0.68);`,
  ),
];

/** Preset elements (lazily built + cached per locale): placeholder copy/labels go through
 *  t() to follow the UI language; must be called after the shell injects locale (naturally
 *  true at render time), don't fall back to a module-level constant. */
let peCache: { locale: string; list: PresetElement[] } | null = null;
export function presetElements(): PresetElement[] {
  const loc = studioLocale();
  if (peCache?.locale !== loc) peCache = { locale: loc, list: buildPresets() };
  return peCache.list;
}

