/**
 * 像素 Arcade 方言 —— 8-bit 街机屏:零圆角、同色十字外扩阴影做像素阶梯角、
 * 8px 硬偏移压印影;HUD 金币/血条/LEVEL 关卡牌;steps(1) 有限次闪烁。
 */

import { type Block, mk } from './shared';

const pxRoot = (id: string) => `
#${id} .px{position:absolute;inset:0;color:var(--fg);font-family:var(--font-num);
  background-image:linear-gradient(var(--grid) 2px,transparent 2px),linear-gradient(90deg,var(--grid) 2px,transparent 2px);
  background-size:64px 64px;}
#${id} .hud{position:absolute;left:90px;right:90px;top:70px;display:flex;justify-content:space-between;align-items:center;font-size:40px;font-weight:700;letter-spacing:0.16em;color:var(--muted);border-bottom:4px solid var(--line);padding-bottom:28px;}
#${id} .coin{display:flex;align-items:center;gap:30px;color:var(--accent);}
#${id} .coin i{width:40px;height:40px;margin:8px;background:var(--accent);box-shadow:0 8px 0 var(--accent),0 -8px 0 var(--accent),8px 0 0 var(--accent),-8px 0 0 var(--accent);}
#${id} .plate{position:relative;background:var(--panel);box-shadow:0 14px 0 var(--panel),0 -14px 0 var(--panel),14px 0 0 var(--panel),-14px 0 0 var(--panel);}
#${id} .bar{display:flex;align-items:center;gap:30px;}
#${id} .bar em{font-style:normal;font-size:36px;font-weight:700;letter-spacing:0.2em;color:var(--accent-2);}
#${id} .bar .cells{display:flex;gap:10px;border:4px solid var(--fg);padding:12px;}
#${id} .bar .cells i{width:54px;height:40px;background:var(--accent-2);}
#${id} .bar .cells i.off{background:var(--panel-2);}
#${id} .ps{position:absolute;left:0;right:0;text-align:center;font-size:56px;font-weight:700;letter-spacing:0.3em;color:var(--accent);}`;

export const cover: () => Block = () =>
  mk(
    'cv_px',
    '封面',
    (id) => `
<div class="px">
  <div class="hud"><span class="coin"><i></i>× 38</span><span>HI-SCORE 999900</span></div>
  <div class="h">像素</div>
  <div class="ps" style="top:718px;">PRESS START ▶</div>
  <div class="bar" style="position:absolute;left:90px;bottom:90px;"><em>HP</em><div class="cells"><i></i><i></i><i></i><i></i><i class="off"></i><i class="off"></i></div></div>
</div>
<style>${pxRoot(id)}
#${id} .h{position:absolute;left:0;right:0;top:270px;text-align:center;font-size:300px;font-weight:800;letter-spacing:0.06em;line-height:1.1;text-shadow:var(--shadow);}
</style>`,
    (id) =>
      `tl.from('#${id} .hud',{autoAlpha:0,duration:0.2},0);\n` +
      `tl.from('#${id} .h',{y:-40,autoAlpha:0,duration:0.22,ease:'power3.out'},0.08);\n` +
      `tl.from('#${id} .ps',{autoAlpha:0,duration:0.14},0.3);\n` +
      `tl.to('#${id} .ps',{autoAlpha:0,duration:0.12,yoyo:true,repeat:5,ease:'steps(1)'},0.45);\n` +
      `tl.from('#${id} .cells i',{autoAlpha:0,duration:0.06,stagger:0.06,ease:'steps(1)'},0.4);`,
  );

export const blocks: Record<string, () => Block> = {
  标题卡: () =>
    mk(
      'px_ttl',
      '标题卡',
      (id) => `
<div class="px">
  <div class="hud"><span class="coin"><i></i>× 12</span><span>STAGE 1-1</span></div>
  <div class="plate pl">
    <div class="cap">NEW GAME</div>
    <div class="h">新手也能装的主机</div>
  </div>
  <div class="ps" style="bottom:240px;">PRESS START ▶</div>
  <div class="bar" style="position:absolute;left:90px;bottom:90px;"><em>HP</em><div class="cells"><i></i><i></i><i></i><i class="off"></i><i class="off"></i></div></div>
</div>
<style>${pxRoot(id)}
#${id} .px{background-color:var(--paper);}
#${id} .pl{position:absolute;left:170px;right:170px;top:330px;padding:80px 90px;}
#${id} .cap{font-size:38px;font-weight:700;letter-spacing:0.26em;color:var(--accent);margin-bottom:44px;}
#${id} .h{font-family:var(--font-head);font-size:116px;font-weight:900;line-height:1.15;text-shadow:var(--shadow);}
</style>`,
      (id) =>
        `tl.from('#${id} .hud',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .pl',{y:-30,autoAlpha:0,duration:0.22,ease:'power3.out'},0.1);\n` +
        `tl.from('#${id} .bar',{autoAlpha:0,duration:0.18},0.3);\n` +
        `tl.from('#${id} .ps',{autoAlpha:0,duration:0.14},0.34);\n` +
        `tl.to('#${id} .ps',{autoAlpha:0,duration:0.12,yoyo:true,repeat:5,ease:'steps(1)'},0.46);`,
    ),
  大数字: () =>
    mk(
      'px_num',
      '大数字',
      (id) => `
<div class="px">
  <div class="hud"><span class="coin"><i></i>× 38</span><span>REVIEW MODE</span></div>
  <div class="lab">总评分 SCORE</div>
  <div class="v">9.8</div>
  <div class="bar" style="position:absolute;left:150px;bottom:140px;"><em>XP</em><div class="cells big"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i class="off"></i></div></div>
</div>
<style>${pxRoot(id)}
#${id} .px{background-color:var(--paper);}
#${id} .lab{position:absolute;left:160px;top:270px;font-size:44px;font-weight:700;letter-spacing:0.22em;color:var(--muted);}
#${id} .v{position:absolute;left:140px;top:300px;font-size:460px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;color:var(--accent);text-shadow:var(--shadow);}
#${id} .cells.big i{width:110px;height:60px;}
</style>`,
      (id) =>
        `tl.from('#${id} .hud',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .lab',{autoAlpha:0,duration:0.16},0.08);\n` +
        `tl.from('#${id} .v',{y:50,autoAlpha:0,duration:0.24,ease:'power3.out'},0.14);\n` +
        `tl.from('#${id} .bar em,#${id} .cells',{autoAlpha:0,duration:0.14},0.4);\n` +
        `tl.from('#${id} .cells i',{autoAlpha:0,duration:0.06,stagger:0.05,ease:'steps(1)'},0.5);`,
    ),
  数字变化: () =>
    mk(
      'px_scr',
      '数字变化',
      (id) => `
<div class="px">
  <div class="hud"><span class="coin"><i></i>× 52</span><span>STAGE 2-2</span></div>
  <div class="lab">本局得分 SCORE</div>
  <div class="v">128500</div>
  <div class="pop">+1000</div>
  <div class="plate hs"><span>HI-SCORE</span><b>999900</b><em>距离榜一,还差三把</em></div>
</div>
<style>${pxRoot(id)}
#${id} .px{background-color:var(--paper);}
#${id} .lab{position:absolute;left:160px;top:250px;font-size:44px;font-weight:700;letter-spacing:0.22em;color:var(--muted);}
#${id} .v{position:absolute;left:150px;top:290px;font-size:310px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;color:var(--accent);text-shadow:var(--shadow);}
#${id} .pop{position:absolute;left:1370px;top:330px;font-size:100px;font-weight:800;color:var(--accent-2);}
#${id} .hs{position:absolute;left:150px;right:150px;bottom:140px;padding:44px 70px;display:flex;align-items:center;gap:50px;}
#${id} .hs span{font-size:40px;font-weight:700;letter-spacing:0.2em;color:var(--muted);}
#${id} .hs b{font-size:72px;font-weight:800;}
#${id} .hs em{font-style:normal;font-family:var(--font-head);font-size:44px;font-weight:900;color:var(--muted);margin-left:auto;}
</style>`,
      (id) =>
        `tl.from('#${id} .hud',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .lab',{autoAlpha:0,duration:0.16},0.08);\n` +
        `tl.from('#${id} .v',{innerText:0,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .hs',{y:30,autoAlpha:0,duration:0.22,ease:'power3.out'},0.3);\n` +
        `tl.from('#${id} .pop',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.55);\n` +
        `tl.to('#${id} .pop',{autoAlpha:0,duration:0.12,yoyo:true,repeat:3,ease:'steps(1)'},0.7);`,
    ),
  倒计时: () =>
    mk(
      'px_cnt',
      '倒计时',
      (id) => `
<div class="px">
  <div class="hud"><span class="coin"><i></i>× 38</span><span>STAGE 3-4</span></div>
  <div class="lab">TIME</div>
  <div class="v">10</div>
  <div class="cd">新服零点开,别睡过头</div>
  <div class="ps" style="bottom:130px;">HURRY UP!</div>
</div>
<style>${pxRoot(id)}
#${id} .px{background-color:var(--paper);}
#${id} .lab{position:absolute;left:0;right:0;top:240px;text-align:center;font-size:48px;font-weight:700;letter-spacing:0.3em;color:var(--muted);}
#${id} .v{position:absolute;left:0;right:0;top:290px;text-align:center;font-size:400px;font-weight:800;line-height:1.1;color:var(--accent);text-shadow:var(--shadow);}
#${id} .cd{position:absolute;left:0;right:0;top:780px;text-align:center;font-family:var(--font-head);font-size:54px;font-weight:900;}
</style>`,
      (id) =>
        `tl.from('#${id} .hud',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .lab',{autoAlpha:0,duration:0.14},0.06);\n` +
        `tl.from('#${id} .v',{innerText:60,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .cd',{y:30,autoAlpha:0,duration:0.22,ease:'power3.out'},0.3);\n` +
        `tl.from('#${id} .ps',{autoAlpha:0,duration:0.14},0.34);\n` +
        `tl.to('#${id} .ps',{autoAlpha:0,duration:0.12,yoyo:true,repeat:5,ease:'steps(1)'},0.46);`,
    ),
  步骤: () =>
    mk(
      'px_stp',
      '步骤',
      (id) => `
<div class="px">
  <div class="hud"><span class="coin"><i></i>× 07</span><span>WORLD MAP</span></div>
  <div class="row">
    <div class="plate lv done"><b>LEVEL 1</b><span>开箱</span><em>CLEAR</em></div>
    <i class="ar">▶▶</i>
    <div class="plate lv act"><b>LEVEL 2</b><span>实测</span><em>▸ PLAY</em></div>
    <i class="ar">▶▶</i>
    <div class="plate lv lock"><b>LEVEL 3</b><span>结论</span><em>???</em></div>
  </div>
</div>
<style>${pxRoot(id)}
#${id} .px{background-color:var(--paper);}
#${id} .row{position:absolute;left:170px;right:170px;top:56%;transform:translateY(-50%);display:flex;align-items:center;justify-content:space-between;gap:40px;}
#${id} .lv{width:400px;padding:70px 40px;display:flex;flex-direction:column;align-items:center;gap:34px;}
#${id} .lv b{font-size:40px;font-weight:700;letter-spacing:0.22em;color:var(--accent);}
#${id} .lv span{font-family:var(--font-head);font-size:78px;font-weight:900;}
#${id} .lv em{font-style:normal;font-size:38px;font-weight:700;letter-spacing:0.18em;color:var(--accent-2);}
#${id} .lv.done{opacity:0.55;}
#${id} .lv.done em{color:var(--muted);}
#${id} .lv.act{box-shadow:0 14px 0 var(--accent-2),0 -14px 0 var(--accent-2),14px 0 0 var(--accent-2),-14px 0 0 var(--accent-2),var(--glow);}
#${id} .lv.lock span{color:var(--muted);}
#${id} .lv.lock em{color:var(--muted);}
#${id} .ar{font-style:normal;font-size:60px;color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .hud',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .lv',{x:-60,autoAlpha:0,duration:0.22,stagger:0.12,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .ar',{autoAlpha:0,duration:0.12,stagger:0.1,ease:'steps(1)'},0.34);\n` +
        `tl.to('#${id} .act em',{autoAlpha:0,duration:0.12,yoyo:true,repeat:5,ease:'steps(1)'},0.45);`,
    ),
  代码: () =>
    mk(
      'px_cod',
      '代码',
      (id) => `
<div class="px">
  <div class="hud"><span class="coin"><i></i>× 07</span><span>DEBUG MODE</span></div>
  <div class="plate trm">
    <div class="cap">ENTER CODE 输入秘籍</div>
    <div class="keys"><i>↑</i><i>↑</i><i>↓</i><i>↓</i><i>←</i><i>→</i><i>←</i><i>→</i><i>B</i><i>A</i></div>
    <div class="ok"><i>&gt;</i><span>秘籍生效,隐藏画质档已解锁<em class="cur">▌</em></span></div>
  </div>
  <div class="bar" style="position:absolute;left:90px;bottom:90px;"><em>HP</em><div class="cells"><i></i><i></i><i></i><i></i><i class="off"></i></div></div>
</div>
<style>${pxRoot(id)}
#${id} .px{background-color:var(--paper);}
#${id} .trm{position:absolute;left:170px;right:170px;top:280px;padding:70px 90px;display:flex;flex-direction:column;gap:54px;}
#${id} .cap{font-size:38px;font-weight:700;letter-spacing:0.26em;color:var(--accent);}
#${id} .keys{display:flex;gap:24px;}
#${id} .keys i{width:96px;height:96px;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:52px;font-weight:700;background:var(--accent-2);color:var(--paper);}
#${id} .ok{display:flex;align-items:baseline;gap:30px;font-family:var(--font-head);font-size:64px;font-weight:900;text-shadow:var(--shadow);}
#${id} .ok i{font-style:normal;font-family:var(--font-num);font-size:48px;font-weight:700;color:var(--accent-2);text-shadow:none;}
#${id} .cur{font-style:normal;color:var(--accent-2);margin-left:14px;text-shadow:none;}
</style>`,
      (id) =>
        `tl.from('#${id} .hud',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .trm',{y:-30,autoAlpha:0,duration:0.22,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.26);\n` +
        `tl.from('#${id} .keys i',{autoAlpha:0,duration:0.06,stagger:0.04,ease:'steps(1)'},0.3);\n` +
        `tl.from('#${id} .cells i',{autoAlpha:0,duration:0.06,stagger:0.05,ease:'steps(1)'},0.4);\n` +
        `tl.from('#${id} .ok',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.76);\n` +
        `tl.to('#${id} .cur',{autoAlpha:0,duration:0.07,yoyo:true,repeat:3,ease:'steps(1)'},0.9);`,
    ),
  金句: () =>
    mk(
      'px_qte',
      '金句',
      (id) => `
<div class="px">
  <div class="hud"><span class="coin"><i></i>× 24</span><span>STAGE 2-1</span></div>
  <div class="plate dlg">
    <div class="who">NPC · 通关的老玩家</div>
    <div class="ln"><i>&gt;</i><span>打不过的关卡</span></div>
    <div class="ln"><i>&gt;</i><span>就练到能打过<em class="cur">▌</em></span></div>
  </div>
</div>
<style>${pxRoot(id)}
#${id} .px{background-color:var(--paper);}
#${id} .dlg{position:absolute;left:170px;right:170px;bottom:170px;padding:70px 90px;display:flex;flex-direction:column;gap:40px;}
#${id} .who{font-size:38px;font-weight:700;letter-spacing:0.22em;color:var(--accent);margin-bottom:10px;}
#${id} .ln{display:flex;align-items:baseline;gap:34px;font-family:var(--font-head);font-size:92px;font-weight:900;text-shadow:var(--shadow);}
#${id} .ln i{font-style:normal;font-family:var(--font-num);font-size:64px;font-weight:700;color:var(--accent-2);text-shadow:none;}
#${id} .cur{font-style:normal;color:var(--accent-2);margin-left:18px;text-shadow:none;}
</style>`,
      (id) =>
        `tl.from('#${id} .hud',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .dlg',{y:30,autoAlpha:0,duration:0.22,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .who',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.3);\n` +
        `tl.from('#${id} .ln',{autoAlpha:0,duration:0.12,stagger:0.14,ease:'steps(1)'},0.34);\n` +
        `tl.to('#${id} .cur',{autoAlpha:0,duration:0.12,yoyo:true,repeat:3,ease:'steps(1)'},0.62);`,
    ),
  对比: () =>
    mk(
      'px_cmp',
      '对比',
      (id) => `
<div class="px">
  <div class="hud"><span class="coin"><i></i>× 24</span><span>VS MODE</span></div>
  <div class="plate fighter p1"><b>1P · 原装风扇</b><span>裸机直跑</span><div class="bar"><em>HP</em><div class="cells"><i></i><i></i><i class="off"></i><i class="off"></i><i class="off"></i></div></div></div>
  <div class="vs">VS</div>
  <div class="plate fighter p2 act"><b>2P · 加装风冷</b><span>满帧起飞</span><div class="bar"><em>HP</em><div class="cells"><i></i><i></i><i></i><i></i><i class="off"></i></div></div></div>
</div>
<style>${pxRoot(id)}
#${id} .px{background-color:var(--paper);}
#${id} .fighter{position:absolute;top:54%;transform:translateY(-50%);width:560px;padding:64px 40px;display:flex;flex-direction:column;align-items:center;gap:38px;}
#${id} .p1{left:170px;}
#${id} .p2{right:170px;}
#${id} .fighter b{font-size:40px;font-weight:700;letter-spacing:0.14em;color:var(--accent);}
#${id} .p2 b{color:var(--fg);}
#${id} .fighter span{font-family:var(--font-head);font-size:76px;font-weight:900;}
#${id} .act{box-shadow:0 14px 0 var(--accent-2),0 -14px 0 var(--accent-2),14px 0 0 var(--accent-2),-14px 0 0 var(--accent-2),var(--glow);}
#${id} .vs{position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);font-size:170px;font-weight:800;letter-spacing:0.04em;color:var(--accent);text-shadow:var(--shadow);}
</style>`,
      (id) =>
        `tl.from('#${id} .hud',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .p1',{x:-60,autoAlpha:0,duration:0.22,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .p2',{x:60,autoAlpha:0,duration:0.22,ease:'power3.out'},0.16);\n` +
        `tl.from('#${id} .vs',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.42);\n` +
        `tl.from('#${id} .cells i',{autoAlpha:0,duration:0.06,stagger:0.05,ease:'steps(1)'},0.5);\n` +
        `tl.to('#${id} .vs',{autoAlpha:0,duration:0.12,yoyo:true,repeat:3,ease:'steps(1)'},0.7);`,
    ),
  引导: () =>
    mk(
      'px_cta',
      '引导',
      (id) => `
<div class="px">
  <div class="hud"><span class="coin"><i></i>× 99</span><span>CREDIT 00</span></div>
  <div class="bigcoin"></div>
  <div class="ps big" style="top:640px;">PRESS ❤ TO FOLLOW</div>
  <div class="sub">CONTINUE? 9</div>
</div>
<style>${pxRoot(id)}
#${id} .px{background-color:var(--paper);}
#${id} .bigcoin{position:absolute;left:50%;top:330px;width:170px;height:170px;margin-left:-85px;background:var(--accent);box-shadow:0 34px 0 var(--accent),0 -34px 0 var(--accent),34px 0 0 var(--accent),-34px 0 0 var(--accent);}
#${id} .ps.big{font-size:76px;font-weight:700;}
#${id} .sub{position:absolute;left:0;right:0;top:790px;text-align:center;font-size:44px;font-weight:700;letter-spacing:0.3em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .hud',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .bigcoin',{y:-40,autoAlpha:0,duration:0.22,ease:'power3.out'},0.1);\n` +
        `tl.from('#${id} .sub',{autoAlpha:0,duration:0.14},0.3);\n` +
        `tl.from('#${id} .ps',{autoAlpha:0,duration:0.14},0.36);\n` +
        `tl.to('#${id} .ps',{autoAlpha:0,duration:0.12,yoyo:true,repeat:5,ease:'steps(1)'},0.46);`,
    ),
};
