/* ================================================================
   Neon — HUD-terminal dialect: status bar, corner brackets, mono readouts, cursor
   ================================================================ */

import { type Block, mk } from './shared';

const neonChrome = (id: string) => `
#${id} .hud{position:absolute;inset:0;color:var(--fg);font-family:var(--font-num);
  background-color:var(--paper);/* 页面底:纸色垫在网格纹之下 */
  background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);
  background-size:120px 120px;}
#${id} .bar{position:absolute;left:70px;right:70px;top:60px;display:flex;justify-content:space-between;font-size:32px;letter-spacing:0.22em;color:var(--muted);border-bottom:2px solid var(--line);padding-bottom:22px;}
#${id} .bar b{color:var(--accent-2);font-weight:700;}
#${id} .ck{position:absolute;width:70px;height:70px;border:4px solid var(--accent);}
#${id} .ck.tl{left:70px;top:150px;border-right:none;border-bottom:none;}
#${id} .ck.br{right:70px;bottom:70px;border-left:none;border-top:none;}`;

export const blocks: Record<string, () => Block> = {
  'title-card': () =>
    mk(
      'ne_ttl',
      'title-card',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● REC</b>&nbsp; SESSION_04</span><span>00:03 / FPS 60</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="body">
    <div class="p">&gt; run night_mode --start</div>
    <div class="h">夜跑配速拆解<span class="cur"></span></div>
    <div class="sub">LOADING MODULES ▓▓▓▓▓▓▓▓░░ 82%</div>
  </div>
</div>
<style>${neonChrome(id)}
#${id} .body{position:absolute;left:150px;top:330px;right:150px;display:flex;flex-direction:column;gap:52px;}
#${id} .p{font-size:42px;color:var(--accent);letter-spacing:0.08em;}
#${id} .h{font-family:var(--font-head);font-size:158px;font-weight:900;letter-spacing:0.01em;text-shadow:var(--glow);}
#${id} .cur{display:inline-block;width:26px;height:120px;background:var(--accent);margin-left:30px;vertical-align:baseline;}
#${id} .sub{font-size:38px;color:var(--muted);letter-spacing:0.14em;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .p',{autoAlpha:0,x:-30,duration:0.22},0.1);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,duration:0.3},0.22);\n` +
        `tl.to('#${id} .cur',{autoAlpha:0,duration:0.12,yoyo:true,repeat:5,ease:'steps(1)'},0.4);\n` +
        `tl.from('#${id} .sub',{autoAlpha:0,duration:0.24},0.4);`,
    ),
  'big-number': () =>
    mk(
      'ne_num',
      'big-number',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● LIVE</b>&nbsp; PACE_MONITOR</span><span>GPS LOCKED</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="v">4'32"<span>/KM</span></div>
  <div class="alert">PB −0'11"</div>
</div>
<style>${neonChrome(id)}
#${id} .v{position:absolute;left:150px;top:50%;transform:translateY(-46%);font-size:440px;font-weight:800;letter-spacing:-0.04em;color:var(--accent);text-shadow:var(--glow);}
#${id} .v span{font-size:90px;color:var(--muted);text-shadow:none;margin-left:30px;letter-spacing:0.1em;}
#${id} .alert{position:absolute;right:150px;top:250px;border:3px solid var(--accent-2);color:var(--accent-2);font-size:48px;font-weight:700;letter-spacing:0.16em;padding:24px 42px;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .v',{autoAlpha:0,y:60,duration:0.32,ease:'power3.out'},0.1);\n` +
        `tl.from('#${id} .alert',{autoAlpha:0,scale:1.3,duration:0.22,ease:'power3.in'},0.4);\n` +
        `tl.to('#${id} .alert',{autoAlpha:0.4,duration:0.14,yoyo:true,repeat:3},0.66);`,
    ),
  'count-up': () =>
    mk(
      'ne_bch',
      'count-up',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● SYS</b>&nbsp; BENCH_SCORE</span><span>RUN 03/03</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="col">
    <div class="p">&gt; bench --final --gpu</div>
    <div class="h">新装备跑分</div>
    <div class="ro"><b class="v">18450</b><span>PTS</span></div>
    <div class="sub">PREV 16140 · GPU 97% · 60FPS STABLE</div>
  </div>
  <div class="tag">NEW BEST</div>
</div>
<style>${neonChrome(id)}
#${id} .col{position:absolute;left:150px;top:270px;display:flex;flex-direction:column;gap:44px;}
#${id} .p{font-size:42px;color:var(--accent);letter-spacing:0.08em;}
#${id} .h{font-family:var(--font-head);font-size:96px;font-weight:900;}
#${id} .ro{display:flex;align-items:baseline;gap:36px;}
#${id} .v{font-size:330px;font-weight:800;letter-spacing:-0.02em;line-height:1;color:var(--accent);text-shadow:var(--glow);}
#${id} .ro span{font-size:64px;color:var(--muted);letter-spacing:0.2em;}
#${id} .sub{font-size:34px;color:var(--muted);letter-spacing:0.14em;}
#${id} .tag{position:absolute;right:150px;top:250px;border:3px solid var(--accent-2);color:var(--accent-2);font-size:48px;font-weight:700;letter-spacing:0.16em;padding:24px 42px;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .p',{autoAlpha:0,x:-30,duration:0.22},0.08);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,duration:0.26},0.16);\n` +
        `tl.from('#${id} .ro',{autoAlpha:0,y:50,duration:0.3,ease:'power3.out'},0.2);\n` +
        `tl.from('#${id} .v',{innerText:0,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .sub',{autoAlpha:0,duration:0.24},0.5);\n` +
        `tl.from('#${id} .tag',{autoAlpha:0,scale:1.3,duration:0.22,ease:'power3.in'},0.4);\n` +
        `tl.to('#${id} .tag',{autoAlpha:0.4,duration:0.14,yoyo:true,repeat:3},0.64);`,
    ),
  'countdown': () =>
    mk(
      'ne_cdn',
      'countdown',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● SYS</b>&nbsp; T_MINUS</span><span>GATE B · ARMED</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="lab">起跑窗口关闭前</div>
  <div class="cd"><b>00</b><i>:</i><b class="v">59</b></div>
  <div class="warn">最后召集 · LANE 04</div>
</div>
<style>${neonChrome(id)}
#${id} .lab{position:absolute;left:150px;top:300px;font-family:var(--font-head);font-size:72px;font-weight:900;letter-spacing:0.06em;}
#${id} .cd{position:absolute;left:150px;top:50%;transform:translateY(-38%);display:flex;align-items:baseline;color:var(--accent);text-shadow:var(--glow);}
#${id} .cd b{font-size:400px;font-weight:800;letter-spacing:-0.02em;line-height:1;}
#${id} .cd i{font-style:normal;font-size:300px;font-weight:800;padding:0 28px;}
#${id} .warn{position:absolute;right:150px;top:250px;border:3px solid var(--accent-2);color:var(--accent-2);font-size:44px;font-weight:700;letter-spacing:0.16em;padding:24px 40px;text-shadow:none;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .lab',{autoAlpha:0,x:-30,duration:0.24},0.1);\n` +
        `tl.from('#${id} .cd',{autoAlpha:0,y:60,duration:0.3,ease:'power3.out'},0.12);\n` +
        `tl.from('#${id} .v',{innerText:90,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .warn',{autoAlpha:0,scale:1.3,duration:0.22,ease:'power3.in'},0.4);\n` +
        `tl.to('#${id} .warn',{autoAlpha:0.4,duration:0.14,yoyo:true,repeat:3},0.64);`,
    ),
  'trend': () =>
    mk(
      'ne_trd',
      'trend',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● LIVE</b>&nbsp; HEART_RATE</span><span>ZONE 4</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <svg viewBox="0 0 1500 520" class="tr">
    <polyline class="ln" points="0,300 150,300 210,180 280,420 350,260 520,300 610,140 700,430 790,250 960,300 1050,170 1140,410 1230,240 1400,290 1500,260"/>
  </svg>
  <div class="ro"><b>162</b><span>BPM</span></div>
</div>
<style>${neonChrome(id)}
#${id} .tr{position:absolute;left:110px;top:260px;width:1500px;height:520px;}
#${id} .ln{fill:none;stroke:var(--accent);stroke-width:6;filter:drop-shadow(0 0 14px var(--accent));stroke-dasharray:4200;stroke-dashoffset:4200;}
#${id} .ro{position:absolute;right:150px;bottom:170px;display:flex;align-items:baseline;gap:24px;}
#${id} .ro b{font-size:170px;font-weight:800;color:var(--accent-2);}
#${id} .ro span{font-size:50px;color:var(--muted);letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.to('#${id} .ln',{strokeDashoffset:0,duration:0.9,ease:'none'},0.1);\n` +
        `tl.from('#${id} .ro',{autoAlpha:0,duration:0.26},0.5);`,
    ),
  'steps': () =>
    mk(
      'ne_stp',
      'steps',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● TASK</b>&nbsp; WARMUP_SEQ</span><span>2/3 DONE</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="ls">
    <div class="r done"><i>[✓]</i><span>动态拉伸 5min</span><em>DONE</em></div>
    <div class="r done"><i>[✓]</i><span>配速热身 1km</span><em>DONE</em></div>
    <div class="r act"><i>[▸]</i><span>间歇冲刺 6×400m</span><em>RUNNING<b class="cur"></b></em></div>
  </div>
</div>
<style>${neonChrome(id)}
#${id} .ls{position:absolute;left:150px;right:150px;top:300px;display:flex;flex-direction:column;gap:38px;}
#${id} .r{display:flex;align-items:center;gap:52px;font-size:64px;padding:34px 46px;border:2px solid var(--line);}
#${id} .r i{font-style:normal;color:var(--accent);}
#${id} .r span{flex:1;font-family:var(--font-head);font-weight:700;}
#${id} .r em{font-style:normal;font-size:36px;letter-spacing:0.2em;color:var(--muted);}
#${id} .r.done{opacity:0.62;}
#${id} .r.act{border-color:var(--accent);box-shadow:var(--glow);}
#${id} .r.act em{color:var(--accent-2);}
#${id} .cur{display:inline-block;width:16px;height:40px;background:var(--accent-2);margin-left:16px;vertical-align:middle;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .r',{x:-60,autoAlpha:0,duration:0.26,stagger:0.12,ease:'power2.out'},0.1);\n` +
        `tl.to('#${id} .cur',{autoAlpha:0,duration:0.14,yoyo:true,repeat:5,ease:'steps(1)'},0.5);`,
    ),
  'code': () =>
    mk(
      'ne_cod',
      'code',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● SRC</b>&nbsp; NIGHT_RUN.SH</span><span>TTY 04 · BASH</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="win">
    <div class="r"><i>$</i><em><b>load</b> plan --week <u>08</u></em></div>
    <div class="r cm"><em># 目标 · 周末破 5km PB</em></div>
    <div class="r"><i>$</i><em><b>set</b> pace <u>4'40"</u> --zone <u>4</u></em></div>
    <div class="r ex"><i>&gt;</i><em><b>exec</b> night_run --go</em><b class="cur"></b></div>
    <div class="r"><i>✓</i><em class="ok">SESSION ARMED · 21:30</em></div>
  </div>
</div>
<style>${neonChrome(id)}
#${id} .win{position:absolute;left:150px;right:150px;top:300px;border:2px solid var(--line);padding:34px 0;display:flex;flex-direction:column;}
#${id} .r{display:flex;align-items:baseline;gap:36px;padding:26px 56px;font-size:44px;letter-spacing:0.04em;}
#${id} .r i{font-style:normal;color:var(--accent);flex:none;}
#${id} .r em{font-style:normal;}
#${id} .r em b{color:var(--accent);font-weight:700;}
#${id} .r em u{text-decoration:none;color:var(--accent-2);}
#${id} .cm em{color:var(--muted);}
#${id} .ok{color:var(--muted);letter-spacing:0.14em;}
#${id} .ex{outline:2px solid var(--accent);outline-offset:-2px;box-shadow:var(--glow);}
#${id} .cur{display:inline-block;width:16px;height:40px;background:var(--accent-2);margin-left:20px;vertical-align:middle;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .win',{autoAlpha:0,y:30,duration:0.26,ease:'power2.out'},0.08);\n` +
        `tl.from('#${id} .r',{autoAlpha:0,x:-40,duration:0.2,stagger:0.08},0.18);\n` +
        `tl.to('#${id} .cur',{autoAlpha:0,duration:0.12,yoyo:true,repeat:5,ease:'steps(1)'},0.45);`,
    ),
  'chart': () =>
    mk(
      'ne_eq',
      'chart',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● LIVE</b>&nbsp; AUDIO_LEVELS</span><span>CH 06 / 48kHz</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="eq">
    <div class="c" style="height:220px"></div>
    <div class="c" style="height:340px"></div>
    <div class="c" style="height:280px"></div>
    <div class="c pk" style="height:560px"><i></i></div>
    <div class="c" style="height:430px"></div>
    <div class="c" style="height:250px"></div>
  </div>
  <div class="scale"><span>100</span><span>75</span><span>50</span><span>25</span><span>00</span></div>
</div>
<style>${neonChrome(id)}
#${id} .eq{position:absolute;left:150px;right:360px;bottom:170px;display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid var(--line);padding:0 30px;}
#${id} .c{width:120px;background:repeating-linear-gradient(to top,var(--accent) 0 30px,transparent 30px 44px);opacity:0.92;}
#${id} .c.pk{position:relative;}
#${id} .c.pk i{position:absolute;left:0;right:0;top:0;height:30px;background:var(--accent-2);box-shadow:0 0 18px var(--accent-2);}
#${id} .scale{position:absolute;right:170px;bottom:170px;height:590px;display:flex;flex-direction:column;justify-content:space-between;border-left:2px solid var(--line);padding-left:26px;font-size:30px;color:var(--muted);letter-spacing:0.14em;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .scale',{autoAlpha:0,duration:0.24},0.1);\n` +
        `tl.from('#${id} .c',{scaleY:0,transformOrigin:'bottom',duration:0.3,stagger:0.06,ease:'power3.out'},0.16);\n` +
        `tl.from('#${id} .pk i',{autoAlpha:0,duration:0.16},0.6);\n` +
        `tl.to('#${id} .pk i',{autoAlpha:0.3,duration:0.1,yoyo:true,repeat:3},0.8);`,
    ),
  'cta': () =>
    mk(
      'ne_cta',
      'cta',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● SYS</b>&nbsp; CTA_MODULE</span><span>LOADED</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="c">
    <div class="p">&gt; exec follow --confirm</div>
    <div class="btn">+ FOLLOW</div>
    <div class="sub">NEXT_SESSION 已排期<span class="cur"></span></div>
  </div>
</div>
<style>${neonChrome(id)}
#${id} .c{position:absolute;left:0;right:0;top:50%;transform:translateY(-46%);display:flex;flex-direction:column;align-items:center;gap:64px;}
#${id} .p{font-size:42px;color:var(--accent);letter-spacing:0.08em;}
#${id} .btn{border:4px solid var(--accent);color:var(--accent);font-size:110px;font-weight:700;letter-spacing:0.18em;padding:44px 110px 44px calc(110px + 0.18em);box-shadow:var(--glow);}
#${id} .sub{font-size:36px;color:var(--muted);letter-spacing:0.2em;}
#${id} .cur{display:inline-block;width:18px;height:44px;background:var(--accent-2);margin-left:20px;vertical-align:middle;}
</style>`,
      (id) =>
        `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\n` +
        `tl.from('#${id} .p',{autoAlpha:0,x:-30,duration:0.22},0.1);\n` +
        `tl.from('#${id} .btn',{autoAlpha:0,scale:0.9,duration:0.26,ease:'power3.out'},0.24);\n` +
        `tl.to('#${id} .btn',{scale:1.04,duration:0.15,yoyo:true,repeat:3,ease:'power1.inOut'},0.56);\n` +
        `tl.from('#${id} .sub',{autoAlpha:0,duration:0.24},0.4);\n` +
        `tl.to('#${id} .cur',{autoAlpha:0,duration:0.12,yoyo:true,repeat:5,ease:'steps(1)'},0.45);`,
    ),
};

/** Cover — list thumbnail: the theme name is the hero (see showcase-blocks.ts). */
export const cover: () => Block = () =>
    mk(
      'cv_ne',
      '封面',
      (id) => `
<div class="hud">
  <div class="bar"><span><b>● SYS</b>&nbsp; FRAME_BOOT</span><span>OK</span></div>
  <div class="ck tl"></div><div class="ck br"></div>
  <div class="c"><div class="p">&gt; load neon.frame</div><div class="h">霓虹<span class="cur"></span></div><div class="s">NEON · TERMINAL GLOW</div></div>
</div>
<style>${neonChrome(id)}
#${id} .c{position:absolute;left:150px;top:320px;display:flex;flex-direction:column;gap:48px;}
#${id} .p{font-size:44px;color:var(--accent);letter-spacing:0.08em;}
#${id} .h{font-family:var(--font-head);font-size:300px;font-weight:900;line-height:1;text-shadow:var(--glow);}
#${id} .cur{display:inline-block;width:30px;height:200px;background:var(--accent);margin-left:40px;}
#${id} .s{font-size:40px;color:var(--muted);letter-spacing:0.3em;}
</style>`,
      (id) => `tl.from('#${id} .bar,#${id} .ck',{autoAlpha:0,duration:0.24},0);\ntl.from('#${id} .c',{autoAlpha:0,duration:0.3},0.12);\ntl.to('#${id} .cur',{autoAlpha:0,duration:0.14,yoyo:true,repeat:5,ease:'steps(1)'},0.4);`,
    );
