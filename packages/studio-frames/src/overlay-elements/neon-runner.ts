/**
 * 霓虹 Neon 的口播叠加件:HUD 贴片语言——面板自带夜绿底+荧光细边+扫描线纹理,
 * 角标括弧(4px accent L 形)、mono 状态微条(● 用 accent-2)、`>` 命令行前缀、
 * 闪烁光标块(steps(1) 有限次收在可见帧)、数据荧光绿带 glow、警报走洋红描边框。
 * 每件是仪表盘上撕下的一块 HUD,中心永远留给说话的人。
 */

import { mk, txt, type Block } from '../dialects/shared';

const SCAN =
  'background-color:var(--panel);background-image:repeating-linear-gradient(0deg,var(--grid) 0 2px,transparent 2px 8px);border:2px solid var(--line);';

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'nn_ttl',
      '标题条',
      (id) => `
<div class="w">
  <div class="bar"><span><b>●</b> REC</span><span data-edit="kick">SESSION_04</span></div>
  <div class="pl">
    <div class="ck tl"></div><div class="ck br"></div>
    <div class="p">&gt; <span data-edit="cmd">run night_mode --start</span></div>
    <div class="h"><span data-edit="title">${txt('标题一', 'Title 1')}</span><i class="cur"></i></div>
  </div>
</div>
<style>
#${id} .w{position:absolute;left:72px;bottom:88px;width:60%;color:var(--fg);font-family:var(--font-num);}
#${id} .bar{display:inline-flex;gap:34px;font-size:28px;letter-spacing:0.22em;color:var(--muted);${SCAN}padding:12px 26px;}
#${id} .bar b{color:var(--accent-2);}
#${id} .pl{position:relative;margin-top:14px;${SCAN}padding:30px 46px 36px;}
#${id} .ck{position:absolute;width:44px;height:44px;border:4px solid var(--accent);}
#${id} .ck.tl{left:-14px;top:-14px;border-right:none;border-bottom:none;}
#${id} .ck.br{right:-14px;bottom:-14px;border-left:none;border-top:none;}
#${id} .p{font-size:34px;color:var(--accent);letter-spacing:0.08em;}
#${id} .h{margin-top:16px;font-family:var(--font-head);font-size:84px;font-weight:900;line-height:1.1;text-shadow:var(--glow);}
#${id} .cur{display:inline-block;width:18px;height:66px;background:var(--accent);margin-left:22px;vertical-align:baseline;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .pl',{x:-90,autoAlpha:0,duration:0.24,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .p',{autoAlpha:0,x:-24,duration:0.2},0.24);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,duration:0.24},0.36);\n` +
        `tl.to('#${id} .cur',{autoAlpha:0,duration:0.1,yoyo:true,repeat:5,ease:'steps(1)'},0.55);`,
    ),
  大数字: () =>
    mk(
      'nn_num',
      '大数字',
      (id) => `
<div class="w">
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="lab" data-edit="label">PACE_MONITOR</div>
  <div class="v"><b data-edit="num">432</b><span data-edit="unit">/KM</span></div>
  <div class="tag" data-edit="tag">PB −0'11"</div>
</div>
<style>
#${id} .w{position:absolute;right:96px;top:110px;width:480px;${SCAN}padding:30px 40px 36px;color:var(--fg);font-family:var(--font-num);}
#${id} .ck{position:absolute;width:44px;height:44px;border:4px solid var(--accent);}
#${id} .ck.tl{left:-14px;top:-14px;border-right:none;border-bottom:none;}
#${id} .ck.br{right:-14px;bottom:-14px;border-left:none;border-top:none;}
#${id} .lab{font-size:28px;letter-spacing:0.24em;color:var(--muted);border-bottom:2px solid var(--line);padding-bottom:14px;}
#${id} .v{margin-top:18px;line-height:1;}
#${id} .v b{font-size:180px;font-weight:800;letter-spacing:-0.04em;color:var(--accent);text-shadow:var(--glow);}
#${id} .v span{font-size:44px;color:var(--muted);letter-spacing:0.12em;margin-left:16px;}
#${id} .tag{display:inline-block;margin-top:22px;border:3px solid var(--accent-2);color:var(--accent-2);font-size:32px;font-weight:700;letter-spacing:0.16em;padding:10px 22px;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:-90,autoAlpha:0,duration:0.24,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .v b',{innerText:0,snap:{innerText:1},duration:0.6,ease:'power1.out'},0.2);\n` +
        `tl.from('#${id} .tag',{autoAlpha:0,scale:1.3,duration:0.18,ease:'power3.in'},0.6);\n` +
        `tl.to('#${id} .tag',{autoAlpha:0.4,duration:0.12,yoyo:true,repeat:3},0.85);`,
    ),
  要点列表: () =>
    mk(
      'nn_list',
      '要点列表',
      (id) => `
<div class="w">
  <div class="hd">&gt; <span data-edit="title">checklist --run</span></div>
  <div class="r r1 done"><i>[✓]</i><span data-edit="p1">${txt('要点一', 'Point 1')}</span><em>DONE</em></div>
  <div class="r r2 done"><i>[✓]</i><span data-edit="p2">${txt('要点二', 'Point 2')}</span><em>DONE</em></div>
  <div class="r r3 act"><i>[▸]</i><span data-edit="p3">${txt('要点三', 'Point 3')}</span><em>RUNNING</em></div>
</div>
<style>
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:600px;color:var(--fg);font-family:var(--font-num);}
#${id} .hd{font-size:34px;color:var(--accent);letter-spacing:0.1em;margin-bottom:18px;}
#${id} .r{display:flex;align-items:center;gap:20px;${SCAN}padding:20px 26px;margin-top:14px;font-size:38px;font-weight:700;}
#${id} .r i{font-style:normal;color:var(--accent);flex:none;}
#${id} .r em{font-style:normal;margin-left:auto;font-size:26px;letter-spacing:0.2em;color:var(--muted);}
#${id} .done{opacity:0.62;}
#${id} .act{border:3px solid var(--accent);box-shadow:var(--glow);}
#${id} .act em{color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .hd',{autoAlpha:0,x:-24,duration:0.2},0);\n` +
        `tl.from('#${id} .r1',{x:-70,autoAlpha:0,duration:0.2,ease:'power3.out'},0.14);\n` +
        `tl.from('#${id} .r2',{x:-70,autoAlpha:0,duration:0.2,ease:'power3.out'},0.28);\n` +
        `tl.from('#${id} .r3',{x:-70,autoAlpha:0,duration:0.2,ease:'power3.out'},0.42);\n` +
        `tl.to('#${id} .r3 em',{autoAlpha:0,duration:0.1,yoyo:true,repeat:5,ease:'steps(1)'},0.7);`,
    ),
  关键词重击: () =>
    mk(
      'nn_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <div class="ck tl"></div><div class="ck br"></div>
  <span class="t" data-edit="word">${txt('关键词', 'Keyword')}</span><i class="cur"></i>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:52%;${SCAN}padding:36px 60px 44px;white-space:nowrap;}
#${id} .ck{position:absolute;width:52px;height:52px;border:4px solid var(--accent);}
#${id} .ck.tl{left:-16px;top:-16px;border-right:none;border-bottom:none;}
#${id} .ck.br{right:-16px;bottom:-16px;border-left:none;border-top:none;}
#${id} .t{color:var(--fg);font-family:var(--font-head);font-size:140px;font-weight:900;line-height:1;text-shadow:var(--glow);}
#${id} .cur{display:inline-block;width:22px;height:104px;background:var(--accent-2);margin-left:26px;vertical-align:baseline;}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{scale:1.5,autoAlpha:0,duration:0.2,ease:'power3.in'},0);\n` +
        `tl.from('#${id} .ck',{autoAlpha:0,duration:0.16},0.22);\n` +
        `tl.to('#${id} .cur',{autoAlpha:0,duration:0.1,yoyo:true,repeat:5,ease:'steps(1)'},0.44);`,
    ),
  标注: () =>
    mk(
      'nn_call',
      '标注',
      (id) => `
<div class="w">
  <div class="chip" data-edit="note">TARGET LOCKED</div>
  <div class="ln"></div>
  <div class="dot"></div>
</div>
<style>
#${id} .w{position:absolute;right:160px;top:26%;font-family:var(--font-num);text-align:center;}
#${id} .chip{border:3px solid var(--accent-2);color:var(--accent-2);${SCAN}border-color:var(--accent-2);font-size:36px;font-weight:700;letter-spacing:0.14em;padding:14px 28px;}
#${id} .ln{width:2px;height:110px;background:var(--accent);margin:0 auto;box-shadow:var(--glow);}
#${id} .dot{width:16px;height:16px;border:3px solid var(--accent);border-radius:999px;margin:0 auto;box-shadow:var(--glow);}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{y:-60,autoAlpha:0,duration:0.2,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .ln',{scaleY:0,transformOrigin:'top',duration:0.2,ease:'power2.out'},0.18);\n` +
        `tl.from('#${id} .dot',{scale:0,autoAlpha:0,duration:0.16,ease:'power3.out'},0.36);\n` +
        `tl.to('#${id} .chip',{autoAlpha:0.45,duration:0.12,yoyo:true,repeat:3},0.6);`,
    ),
  关注引导: () =>
    mk(
      'nn_cta',
      '关注引导',
      (id) => `
<div class="w">
  <div class="p">&gt; <span data-edit="cmd">exec follow --confirm</span></div>
  <div class="btn" data-edit="cta">${txt('+ 关注', '+ Follow')}</div>
  <div class="sub"><span data-edit="side">UPDATED WEEKLY</span><i class="cur"></i></div>
</div>
<style>
#${id} .w{position:absolute;right:96px;bottom:100px;text-align:left;font-family:var(--font-num);}
#${id} .p{font-size:30px;color:var(--accent);letter-spacing:0.08em;}
#${id} .btn{margin-top:16px;display:inline-block;border:4px solid var(--accent);color:var(--accent);${SCAN}border-color:var(--accent);box-shadow:var(--glow);font-family:var(--font-head);font-size:56px;font-weight:900;padding:16px 40px;text-shadow:var(--glow);}
#${id} .sub{margin-top:14px;font-size:26px;letter-spacing:0.22em;color:var(--muted);}
#${id} .cur{display:inline-block;width:14px;height:26px;background:var(--accent-2);margin-left:14px;vertical-align:middle;}
</style>`,
      (id) =>
        `tl.from('#${id} .p',{autoAlpha:0,x:-24,duration:0.2},0);\n` +
        `tl.from('#${id} .btn',{autoAlpha:0,y:40,duration:0.22,ease:'power3.out'},0.14);\n` +
        `tl.to('#${id} .btn',{scale:1.04,duration:0.16,yoyo:true,repeat:3,ease:'power1.inOut'},0.4);\n` +
        `tl.from('#${id} .sub',{autoAlpha:0,duration:0.18},0.4);\n` +
        `tl.to('#${id} .cur',{autoAlpha:0,duration:0.1,yoyo:true,repeat:5,ease:'steps(1)'},0.62);`,
    ),
  金句: () =>
    mk(
      'nn_quote',
      '金句',
      (id) => `
<div class="w">
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="p">&gt; <span data-edit="cmd">echo quote --stdout</span></div>
  <div class="t"><span data-edit="l1">${txt('金句上半句,', 'Quote line one,')}</span><b data-edit="l2">${txt('下半句。', 'and line two.')}</b></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);width:60%;${SCAN}padding:28px 46px 34px;color:var(--fg);font-family:var(--font-num);}
#${id} .ck{position:absolute;width:44px;height:44px;border:4px solid var(--accent);}
#${id} .ck.tl{left:-14px;top:-14px;border-right:none;border-bottom:none;}
#${id} .ck.br{right:-14px;bottom:-14px;border-left:none;border-top:none;}
#${id} .p{font-size:30px;color:var(--muted);letter-spacing:0.1em;}
#${id} .t{margin-top:14px;font-family:var(--font-head);font-size:58px;font-weight:800;line-height:1.35;}
#${id} .t b{color:var(--accent);text-shadow:var(--glow);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{y:100,autoAlpha:0,duration:0.24,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .p',{autoAlpha:0,x:-20,duration:0.18},0.2);\n` +
        `tl.from('#${id} .t b',{autoAlpha:0,duration:0.2},0.4);`,
    ),
  左右对比: () =>
    mk(
      'nn_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="s a"><i data-edit="lt">${txt('选项一', 'Option A')}</i><b data-edit="lv">${txt('数值一', 'Value A')}</b></div>
  <div class="vs">VS</div>
  <div class="s b"><i data-edit="rt">${txt('选项二', 'Option B')}</i><b data-edit="rv">${txt('数值二', 'Value B')}</b></div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:100px;transform:translateX(-50%);display:flex;align-items:center;gap:28px;color:var(--fg);font-family:var(--font-num);}
#${id} .s{width:360px;${SCAN}padding:24px 28px;text-align:center;}
#${id} .s i{display:block;font-style:normal;font-size:26px;letter-spacing:0.2em;color:var(--muted);}
#${id} .s b{display:block;margin-top:12px;font-size:64px;font-weight:800;line-height:1;}
#${id} .a{opacity:0.62;}
#${id} .b{border:3px solid var(--accent);box-shadow:var(--glow);}
#${id} .b b{color:var(--accent);text-shadow:var(--glow);}
#${id} .vs{font-size:38px;font-weight:700;color:var(--accent-2);letter-spacing:0.1em;}
</style>`,
      (id) =>
        `tl.from('#${id} .a',{x:-100,autoAlpha:0,duration:0.2,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .vs',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.16);\n` +
        `tl.from('#${id} .b',{x:100,autoAlpha:0,duration:0.2,ease:'power3.out'},0.22);\n` +
        `tl.to('#${id} .vs',{autoAlpha:0.4,duration:0.12,yoyo:true,repeat:3},0.5);`,
    ),
};

export type { Block };
