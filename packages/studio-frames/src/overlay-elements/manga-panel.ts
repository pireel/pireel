/**
 * 漫画 Manga 的口播叠加件:浮动分格/对话泡语言——白纸墨框(6px 墨线+硬偏移影+
 * 微倾斜)、速度线三角裁进格角、网点补丁、白椭圆对话泡+旋转方块尾巴、拟声词
 * SFX(纸色填充+粗墨描边)、反白格当最响的强调、红色每件至多一处(红章)。
 * 动效硬切:格子对撞滑入、SFX power3.in 砸落,禁柔光渐变。根透明贴在画面上。
 */

import { mk, txt, type Block } from '../dialects/shared';

/** 墨线格:白纸底 + 6px 墨框 + 硬影 */
const PANEL =
  'background:var(--panel);border:6px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);';
/** 速度线 + 网点补丁 */
const TONES = (id: string) => `
#${id} .spd{position:absolute;background:repeating-linear-gradient(65deg,var(--fg) 0 3px,transparent 3px 26px);clip-path:polygon(0 0,100% 0,0 100%);}
#${id} .ht{position:absolute;background-image:radial-gradient(var(--fg) 2.4px,transparent 2.4px);background-size:18px 18px;}`;

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'mp_ttl',
      '标题条',
      (id) => `
<div class="w">
  <i class="spd"></i>
  <div class="k" data-edit="kick">${txt('第 1 格 · 开场', 'PANEL 1 · OPENING')}</div>
  <div class="h" data-edit="title">${txt('标题一', 'Title 1')}</div>
</div>
<style>
#${id} .w{position:absolute;left:76px;bottom:96px;width:58%;${PANEL}transform:rotate(-0.8deg);padding:26px 40px 32px;color:var(--fg);font-family:var(--font-head);overflow:hidden;}
${TONES(id)}
#${id} .spd{right:-2px;top:-2px;width:240px;height:150px;transform:scaleX(-1);}
#${id} .k{display:inline-block;background:var(--fg);color:var(--paper);font-size:30px;font-weight:800;letter-spacing:0.12em;padding:10px 24px;}
#${id} .h{margin-top:16px;font-size:78px;font-weight:900;line-height:1.18;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{x:-140,autoAlpha:0,duration:0.26,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .spd',{xPercent:40,autoAlpha:0,duration:0.22,ease:'power2.out'},0.16);\n` +
        `tl.from('#${id} .k',{x:-40,autoAlpha:0,duration:0.2},0.2);\n` +
        `tl.from('#${id} .h',{y:34,autoAlpha:0,duration:0.24,ease:'power2.out'},0.28);`,
    ),
  大数字: () =>
    mk(
      'mp_num',
      '大数字',
      (id) => `
<div class="w">
  <i class="ht"></i>
  <div class="v"><b data-edit="num">38</b><span data-edit="unit">%</span></div>
  <div class="k" data-edit="label">${txt('数据说明', 'Data label')}</div>
</div>
<style>
#${id} .w{position:absolute;right:96px;top:110px;width:460px;height:380px;color:var(--fg);font-family:var(--font-head);}
${TONES(id)}
#${id} .ht{right:0;top:20px;width:380px;height:280px;}
#${id} .v{position:absolute;left:0;top:30px;transform:rotate(-4deg);line-height:1;white-space:nowrap;}
#${id} .v b{font-size:280px;font-weight:900;color:var(--paper);-webkit-text-stroke:14px var(--fg);}
#${id} .v span{font-size:120px;font-weight:900;color:var(--paper);-webkit-text-stroke:9px var(--fg);margin-left:6px;}
#${id} .k{position:absolute;right:10px;bottom:0;background:var(--fg);color:var(--paper);font-size:34px;font-weight:800;letter-spacing:0.12em;padding:12px 28px;transform:rotate(1.5deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .ht',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .v',{scale:1.8,autoAlpha:0,rotation:-14,duration:0.28,ease:'power3.in'},0.12);\n` +
        `tl.from('#${id} .k',{x:60,autoAlpha:0,duration:0.22,ease:'power3.out'},0.44);`,
    ),
  要点列表: () =>
    mk(
      'mp_list',
      '要点列表',
      (id) => `
<div class="w">
  <i class="spd"></i>
  <div class="k" data-edit="title">${txt('列表标题', 'LIST TITLE')}</div>
  <div class="r r1"><i>①</i><span data-edit="p1">${txt('要点一', 'Point 1')}</span></div>
  <div class="r r2"><i>②</i><span data-edit="p2">${txt('要点二', 'Point 2')}</span></div>
  <div class="r r3 on"><i>③</i><span data-edit="p3">${txt('要点三', 'Point 3')}</span></div>
</div>
<style>
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%) rotate(-1deg);width:540px;${PANEL}padding:24px 32px 28px;color:var(--fg);font-family:var(--font-head);overflow:hidden;}
${TONES(id)}
#${id} .spd{right:-2px;top:-2px;width:190px;height:130px;transform:scaleX(-1);}
#${id} .k{display:inline-block;background:var(--fg);color:var(--paper);font-size:30px;font-weight:800;letter-spacing:0.12em;padding:10px 24px;}
#${id} .r{display:flex;align-items:center;gap:20px;margin-top:22px;font-size:42px;font-weight:900;}
#${id} .r i{font-style:normal;font-size:46px;flex:none;}
#${id} .on{background:var(--fg);color:var(--paper);margin-left:-32px;margin-right:-32px;padding:14px 32px;transform:rotate(0.6deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{x:-140,autoAlpha:0,duration:0.26,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .spd',{xPercent:40,autoAlpha:0,duration:0.2},0.14);\n` +
        `tl.from('#${id} .r1',{x:-60,autoAlpha:0,duration:0.2,ease:'power3.out'},0.2);\n` +
        `tl.from('#${id} .r2',{x:-60,autoAlpha:0,duration:0.2,ease:'power3.out'},0.32);\n` +
        `tl.from('#${id} .r3',{scale:1.4,autoAlpha:0,duration:0.22,ease:'power3.in'},0.46);`,
    ),
  关键词重击: () =>
    mk(
      'mp_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <i class="ht"></i>
  <span class="t" data-edit="word">${txt('关键词', 'Keyword')}</span>
  <b class="tag" data-edit="stamp">${txt('注意', 'LOOK!')}</b>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:var(--fg);font-family:var(--font-head);}
${TONES(id)}
#${id} .ht{left:-70px;bottom:-56px;width:360px;height:220px;}
#${id} .t{position:relative;display:block;transform:rotate(-5deg);font-size:230px;font-weight:900;line-height:1;color:var(--paper);-webkit-text-stroke:14px var(--fg);white-space:nowrap;}
#${id} .tag{position:absolute;right:-70px;top:-64px;border:5px solid var(--accent);color:var(--accent);background:var(--panel);font-size:42px;font-weight:900;padding:10px 26px;transform:rotate(8deg);border-radius:var(--radius);}
</style>`,
      (id) =>
        `tl.from('#${id} .ht',{autoAlpha:0,duration:0.18},0);\n` +
        `tl.from('#${id} .t',{scale:1.8,autoAlpha:0,rotation:-14,duration:0.26,ease:'power3.in'},0.08);\n` +
        `tl.from('#${id} .tag',{scale:1.8,autoAlpha:0,rotation:22,duration:0.24,ease:'power3.in'},0.4);`,
    ),
  标注: () =>
    mk(
      'mp_call',
      '标注',
      (id) => `
<div class="w">
  <i class="spd"></i>
  <div class="bub"><span data-edit="note">${txt('标注一!', 'Note 1!')}</span></div>
  <i class="tail"></i>
</div>
<style>
#${id} .w{position:absolute;right:150px;top:26%;color:var(--fg);font-family:var(--font-head);}
${TONES(id)}
#${id} .spd{right:-60px;top:-50px;width:170px;height:120px;transform:scaleX(-1);}
#${id} .bub{position:relative;width:340px;height:190px;background:var(--panel);border:5px solid var(--fg);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow);transform:rotate(-2deg);}
#${id} .bub span{font-size:52px;font-weight:900;}
#${id} .tail{position:absolute;left:60px;bottom:-18px;width:52px;height:52px;background:var(--panel);border-right:5px solid var(--fg);border-bottom:5px solid var(--fg);transform:rotate(35deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .bub',{scale:0.4,autoAlpha:0,duration:0.26,ease:'back.out(1.5)'},0);\n` +
        `tl.from('#${id} .tail',{scale:0,autoAlpha:0,duration:0.16,ease:'back.out(2)'},0.2);\n` +
        `tl.from('#${id} .spd',{autoAlpha:0,duration:0.2},0.3);`,
    ),
  关注引导: () =>
    mk(
      'mp_cta',
      '关注引导',
      (id) => `
<div class="w">
  <div class="bub"><span data-edit="cta">${txt('+ 关注', '+ Follow')}</span></div>
  <i class="tail"></i>
  <div class="tsz" data-edit="side">${txt('下回预告', 'NEXT TIME')}</div>
</div>
<style>
#${id} .w{position:absolute;right:96px;bottom:110px;width:480px;color:var(--fg);font-family:var(--font-head);}
#${id} .bub{position:relative;width:480px;height:230px;background:var(--panel);border:5px solid var(--fg);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow);transform:rotate(-1.5deg);}
#${id} .bub span{font-size:58px;font-weight:900;}
#${id} .tail{position:absolute;left:86px;bottom:26px;width:56px;height:56px;background:var(--panel);border-right:5px solid var(--fg);border-bottom:5px solid var(--fg);transform:rotate(35deg);}
#${id} .tsz{position:absolute;right:-14px;bottom:-24px;background:var(--fg);color:var(--paper);font-size:30px;font-weight:800;letter-spacing:0.2em;padding:12px 26px;transform:rotate(2deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .bub',{scale:0.4,autoAlpha:0,duration:0.28,ease:'back.out(1.5)'},0);\n` +
        `tl.from('#${id} .tail',{scale:0,autoAlpha:0,duration:0.16,ease:'back.out(2)'},0.22);\n` +
        `tl.from('#${id} .tsz',{scale:1.6,autoAlpha:0,rotation:14,duration:0.22,ease:'power3.in'},0.4);`,
    ),
  金句: () =>
    mk(
      'mp_quote',
      '金句',
      (id) => `
<div class="w">
  <i class="ht"></i>
  <div class="bub"><div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b data-edit="l2">${txt('下半句。', 'and line two.')}</b></div></div>
  <i class="tail"></i>
  <div class="a" data-edit="from">${txt('—— 署名', '— Attribution')}</div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:100px;transform:translateX(-50%);width:58%;color:var(--fg);font-family:var(--font-head);}
${TONES(id)}
#${id} .ht{left:-60px;bottom:10px;width:300px;height:200px;}
#${id} .bub{position:relative;width:100%;height:300px;background:var(--panel);border:5px solid var(--fg);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow);}
#${id} .t{font-size:58px;font-weight:900;line-height:1.4;text-align:center;padding:0 90px;}
#${id} .t b{background:var(--fg);color:var(--paper);padding:0 12px;}
#${id} .tail{position:absolute;left:22%;top:-20px;width:52px;height:52px;background:var(--panel);border-left:5px solid var(--fg);border-top:5px solid var(--fg);transform:rotate(35deg);}
#${id} .a{margin-top:14px;text-align:right;font-size:32px;font-weight:700;color:var(--muted);letter-spacing:0.12em;}
</style>`,
      (id) =>
        `tl.from('#${id} .bub',{scale:0.5,autoAlpha:0,duration:0.3,ease:'back.out(1.5)'},0);\n` +
        `tl.from('#${id} .tail',{scale:0,autoAlpha:0,duration:0.18,ease:'back.out(2)'},0.22);\n` +
        `tl.from('#${id} .t',{y:24,autoAlpha:0,duration:0.24},0.26);\n` +
        `tl.from('#${id} .ht,#${id} .a',{autoAlpha:0,duration:0.22},0.44);`,
    ),
  左右对比: () =>
    mk(
      'mp_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="s a"><i data-edit="lt">${txt('选项一', 'Option A')}</i><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <div class="s b"><i data-edit="rt">${txt('选项二', 'Option B')}</i><b data-edit="rv">${txt('数值二', 'Value B')}</b></div>
  <span class="vs">VS</span>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:104px;transform:translateX(-50%);display:flex;gap:30px;color:var(--fg);font-family:var(--font-head);}
#${id} .s{width:360px;${PANEL}padding:26px 30px;text-align:center;}
#${id} .a{transform:rotate(-1.2deg);}
#${id} .b{transform:rotate(1.2deg);background:var(--fg);color:var(--paper);}
#${id} .s i{display:block;font-style:normal;font-size:30px;font-weight:800;letter-spacing:0.12em;opacity:0.7;}
#${id} .s b{display:block;margin-top:8px;font-size:70px;font-weight:900;line-height:1;}
#${id} .vs{position:absolute;left:50%;top:-58px;transform:translateX(-50%) rotate(-6deg);font-size:110px;font-weight:900;line-height:1;color:var(--paper);-webkit-text-stroke:9px var(--fg);}
</style>`,
      (id) =>
        `tl.from('#${id} .a',{x:-140,autoAlpha:0,duration:0.24,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .b',{x:140,autoAlpha:0,duration:0.24,ease:'power3.out'},0.1);\n` +
        `tl.from('#${id} .vs',{scale:1.8,autoAlpha:0,rotation:-16,duration:0.24,ease:'power3.in'},0.34);`,
    ),
};

export type { Block };
