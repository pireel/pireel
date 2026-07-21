/**
 * 电路 Circuit 方言 —— 通电电路板:铜金走线(横平竖直 + 45° 折角)+ 过孔 + 芯片引脚 +
 * 丝印位号;签名动效=电流脉冲(同路径 accent-2 副本,pathLength=100,dasharray 14 200,
 * offset 14 → -114 跑一趟)沿线奔跑后 LED 常亮。三态:没电=灰,有电=金,激活=青。
 */

import { type Block, mk } from './shared';

const cbRoot = (id: string) => `
#${id} .cb{position:absolute;inset:0;color:var(--fg);font-family:var(--font-num);
  background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);
  background-size:80px 80px;}
#${id} .strip{position:absolute;left:90px;right:90px;top:70px;display:flex;justify-content:space-between;align-items:center;font-size:34px;font-weight:700;letter-spacing:0.24em;color:var(--muted);border-bottom:2px solid var(--line);padding-bottom:26px;}
#${id} .strip em{font-style:normal;color:var(--accent);}
#${id} .net{position:absolute;inset:0;width:100%;height:100%;}
#${id} .net .tr{fill:none;stroke:var(--accent);stroke-width:6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:100;}
#${id} .net .tr.dim{stroke:var(--line);}
#${id} .net .pu{fill:none;stroke:var(--accent-2);stroke-width:6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:14 200;stroke-dashoffset:14;filter:drop-shadow(0 0 8px var(--accent-2));}
#${id} .net .via{fill:var(--paper);stroke:var(--accent);stroke-width:5;}
#${id} .net .via.dimv{stroke:var(--line);}
#${id} .chip{position:absolute;background:var(--panel);border:2px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;}
#${id} .chip::before,#${id} .chip::after{content:'';position:absolute;top:26px;bottom:26px;width:16px;background:repeating-linear-gradient(180deg,var(--accent) 0 12px,transparent 12px 40px);}
#${id} .chip::before{left:-18px;}
#${id} .chip::after{right:-18px;}
#${id} .chip b{font-size:32px;font-weight:700;letter-spacing:0.24em;color:var(--accent);}
#${id} .chip span{font-family:var(--font-head);font-weight:900;line-height:1.15;}
#${id} .chip.act{border-color:var(--accent-2);box-shadow:var(--shadow),var(--glow);}
#${id} .chip.act b{color:var(--accent-2);}
#${id} .chip.dim{opacity:0.55;}
#${id} .chip.mut b,#${id} .chip.mut span{color:var(--muted);}
#${id} .led{position:absolute;width:26px;height:26px;border-radius:50%;background:var(--accent-2);box-shadow:var(--glow);}
#${id} .silk{position:absolute;font-size:34px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;color:var(--muted);}
#${id} .silk em{font-style:normal;color:var(--accent);}`;

export const cover: () => Block = () =>
  mk(
    'cv_cb',
    '封面',
    (id) => `
<div class="cb">
  <div class="strip"><span><em>PCB-00</em> · COVER</span><span>VCC 3V3 · GND</span></div>
  <svg class="net" viewBox="0 0 1920 1080">
    <path class="tr" pathLength="100" d="M0 880 H420 L500 800 H1620 L1700 720 V340 L1760 280 H1800"/>
    <path class="tr" pathLength="100" d="M0 1000 H240 L300 1060 H760"/>
    <path class="tr" pathLength="100" d="M140 0 V160 L220 240 H440"/>
    <path class="pu" pathLength="100" d="M0 880 H420 L500 800 H1620 L1700 720 V340 L1760 280 H1800"/>
    <circle class="via" cx="500" cy="800" r="10"/>
    <circle class="via" cx="1700" cy="720" r="10"/>
    <circle class="via" cx="440" cy="240" r="10"/>
    <circle class="via" cx="760" cy="1060" r="10"/>
  </svg>
  <div class="h">电路</div>
  <div class="sub silk">POWER ON · SELF-TEST OK</div>
  <div class="tag">通电,开讲</div>
  <div class="led" style="left:1787px;top:267px;"></div>
</div>
<style>${cbRoot(id)}
#${id} .h{position:absolute;left:0;right:0;top:250px;text-align:center;font-family:var(--font-head);font-size:320px;font-weight:900;letter-spacing:0.05em;line-height:1.05;}
#${id} .sub{left:0;right:0;top:680px;text-align:center;}
#${id} .tag{position:absolute;left:0;right:0;top:764px;text-align:center;font-family:var(--font-head);font-size:56px;font-weight:900;}
</style>`,
    (id) =>
      `tl.from('#${id} .strip',{autoAlpha:0,duration:0.18},0);\n` +
      `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.45,ease:'power2.out',stagger:0.08},0.05);\n` +
      `tl.from('#${id} .via',{autoAlpha:0,duration:0.15},0.35);\n` +
      `tl.from('#${id} .h',{y:-20,autoAlpha:0,duration:0.24,ease:'power3.out'},0.15);\n` +
      `tl.from('#${id} .sub',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.42);\n` +
      `tl.from('#${id} .tag',{y:16,autoAlpha:0,duration:0.2,ease:'power3.out'},0.5);\n` +
      `tl.to('#${id} .pu',{strokeDashoffset:-114,duration:0.5,ease:'power1.inOut'},0.55);\n` +
      `tl.from('#${id} .led',{autoAlpha:0,duration:0.12,ease:'steps(1)'},1.02);`,
  );

export const blocks: Record<string, () => Block> = {
  标题卡: () =>
    mk(
      'cb_ttl',
      '标题卡',
      (id) => `
<div class="cb">
  <div class="strip"><span><em>SCH-01</em> · INTRO</span><span>VCC 3V3 · GND</span></div>
  <svg class="net" viewBox="0 0 1920 1080">
    <path class="tr" pathLength="100" d="M0 620 H180 L260 540 H284"/>
    <path class="tr" pathLength="100" d="M1636 540 H1680 L1740 600 H1920"/>
    <path class="pu" pathLength="100" d="M0 620 H180 L260 540 H284"/>
    <circle class="via" cx="260" cy="540" r="10"/>
    <circle class="via" cx="1740" cy="600" r="10"/>
  </svg>
  <div class="chip main"><b>U1 · MAIN</b><span>三分钟看懂一块主板</span></div>
  <div class="led" style="left:1548px;top:392px;"></div>
  <div class="foot silk" style="left:90px;bottom:90px;">TP1 <em>●</em> SELF-TEST OK</div>
  <div class="foot silk" style="right:90px;bottom:90px;">GND</div>
</div>
<style>${cbRoot(id)}
#${id} .cb{background-color:var(--paper);}
#${id} .main{left:300px;top:360px;width:1320px;height:360px;padding:0 70px;gap:40px;}
#${id} .main span{font-size:96px;}
</style>`,
      (id) =>
        `tl.from('#${id} .strip',{autoAlpha:0,duration:0.18},0);\n` +
        `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.4,ease:'power2.out'},0.05);\n` +
        `tl.from('#${id} .via',{autoAlpha:0,duration:0.15},0.32);\n` +
        `tl.from('#${id} .chip',{y:-20,autoAlpha:0,duration:0.24,ease:'power3.out'},0.12);\n` +
        `tl.from('#${id} .chip b',{autoAlpha:0,duration:0.1,ease:'steps(1)'},0.4);\n` +
        `tl.from('#${id} .foot',{autoAlpha:0,duration:0.15},0.55);\n` +
        `tl.to('#${id} .pu',{strokeDashoffset:-114,duration:0.3,ease:'power1.inOut'},0.5);\n` +
        `tl.from('#${id} .led',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.78);`,
    ),
  大数字: () =>
    mk(
      'cb_num',
      '大数字',
      (id) => `
<div class="cb">
  <div class="strip"><span><em>MEAS-02</em> · LAB</span><span>AVG OF 100 RUNS</span></div>
  <svg class="net" viewBox="0 0 1920 1080">
    <path class="tr" pathLength="100" d="M608 560 H720 L800 480 H1000"/>
    <path class="pu" pathLength="100" d="M608 560 H720 L800 480 H1000"/>
    <circle class="via" cx="800" cy="480" r="10"/>
  </svg>
  <div class="chip src"><b>U7 · SENSOR</b><span>实测延迟</span></div>
  <div class="led" style="left:987px;top:467px;"></div>
  <div class="v">16<i>ms</i></div>
  <div class="cap2">一帧不落</div>
</div>
<style>${cbRoot(id)}
#${id} .cb{background-color:var(--paper);}
#${id} .src{left:150px;top:420px;width:440px;height:280px;padding:0 30px;}
#${id} .src span{font-size:60px;}
#${id} .v{position:absolute;left:1040px;top:300px;font-size:420px;font-weight:800;line-height:1;color:var(--accent);}
#${id} .v i{font-style:normal;font-size:120px;font-weight:700;color:var(--muted);margin-left:24px;}
#${id} .cap2{position:absolute;left:1040px;top:800px;font-family:var(--font-head);font-size:52px;font-weight:900;}
</style>`,
      (id) =>
        `tl.from('#${id} .strip',{autoAlpha:0,duration:0.18},0);\n` +
        `tl.from('#${id} .chip',{y:-20,autoAlpha:0,duration:0.22,ease:'power3.out'},0.08);\n` +
        `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.35,ease:'power2.out'},0.15);\n` +
        `tl.from('#${id} .via',{autoAlpha:0,duration:0.12},0.4);\n` +
        `tl.to('#${id} .pu',{strokeDashoffset:-114,duration:0.35,ease:'power1.inOut'},0.45);\n` +
        `tl.from('#${id} .led',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.78);\n` +
        `tl.from('#${id} .v',{y:30,autoAlpha:0,duration:0.22,ease:'power3.out'},0.8);\n` +
        `tl.from('#${id} .cap2',{autoAlpha:0,duration:0.18},0.95);`,
    ),
  步骤: () =>
    mk(
      'cb_stp',
      '步骤',
      (id) => `
<div class="cb">
  <div class="strip"><span><em>SEQ-03</em> · PIPELINE</span><span>STEP 2 / 3</span></div>
  <svg class="net" viewBox="0 0 1920 1080">
    <path class="tr" pathLength="100" d="M0 550 H1920"/>
    <path class="pu" pathLength="100" d="M0 550 H1920"/>
  </svg>
  <div class="chip s1 dim"><b>S1 · DONE</b><span>拆解</span></div>
  <div class="chip s2 act"><b>S2 · ACTIVE</b><span>换硅脂</span></div>
  <div class="chip s3 mut"><b>S3 · QUEUED</b><span>装回</span></div>
  <div class="led" style="left:1110px;top:412px;"></div>
</div>
<style>${cbRoot(id)}
#${id} .cb{background-color:var(--paper);}
#${id} .s1,#${id} .s2,#${id} .s3{top:400px;width:420px;height:300px;padding:0 30px;}
#${id} .s1{left:150px;}
#${id} .s2{left:750px;}
#${id} .s3{left:1350px;}
#${id} .s1 span,#${id} .s2 span,#${id} .s3 span{font-size:68px;}
</style>`,
      (id) =>
        `tl.from('#${id} .strip',{autoAlpha:0,duration:0.18},0);\n` +
        `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.4,ease:'power2.out'},0.05);\n` +
        `tl.from('#${id} .chip',{y:-20,autoAlpha:0,duration:0.22,stagger:0.12,ease:'power3.out'},0.15);\n` +
        `tl.to('#${id} .pu',{strokeDashoffset:-114,duration:0.45,ease:'power1.inOut'},0.55);\n` +
        `tl.from('#${id} .led',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.95);`,
    ),
  走势: () =>
    mk(
      'cb_trd',
      '走势',
      (id) => `
<div class="cb">
  <div class="strip"><span><em>SCOPE-04</em> · CH1</span><span>20MS / DIV</span></div>
  <div class="scope">
    <svg class="net" viewBox="0 0 1620 640">
      <path class="tr" pathLength="100" d="M60 480 H240 L300 420 H460 L520 480 H700 L780 400 H940 L1000 460 H1160 L1240 380 H1400 L1460 320 H1560"/>
      <path class="pu" pathLength="100" d="M60 480 H240 L300 420 H460 L520 480 H700 L780 400 H940 L1000 460 H1160 L1240 380 H1400 L1460 320 H1560"/>
    </svg>
    <div class="hd silk" style="left:40px;top:34px;">CH1 · 帧率曲线</div>
    <div class="hd silk" style="right:40px;top:34px;color:var(--accent);">PEAK 144 FPS</div>
    <div class="led" style="left:1547px;top:307px;"></div>
  </div>
  <div class="cap2">高负载也稳住</div>
  <div class="silk" style="left:0;right:0;bottom:60px;text-align:center;">DIP &lt; 5% · NO THROTTLE</div>
</div>
<style>${cbRoot(id)}
#${id} .cb{background-color:var(--paper);}
#${id} .scope{position:absolute;left:150px;top:240px;width:1620px;height:640px;background:var(--panel-2);border:2px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:81px 80px;}
#${id} .cap2{position:absolute;left:0;right:0;top:905px;text-align:center;font-family:var(--font-head);font-size:50px;font-weight:900;}
</style>`,
      (id) =>
        `tl.from('#${id} .strip',{autoAlpha:0,duration:0.18},0);\n` +
        `tl.from('#${id} .scope',{y:-20,autoAlpha:0,duration:0.24,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .hd',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.3);\n` +
        `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.5,ease:'power2.out'},0.35);\n` +
        `tl.to('#${id} .pu',{strokeDashoffset:-114,duration:0.4,ease:'power1.inOut'},0.6);\n` +
        `tl.from('#${id} .led',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.98);\n` +
        `tl.from('#${id} .cap2',{y:16,autoAlpha:0,duration:0.2},0.75);`,
    ),
  代码: () =>
    mk(
      'cb_cod',
      '代码',
      (id) => `
<div class="cb">
  <div class="strip"><span><em>UART-05</em> · 115200</span><span>FIRMWARE.LOG</span></div>
  <svg class="net" viewBox="0 0 1920 1080">
    <path class="tr" pathLength="100" d="M0 560 H148"/>
    <path class="pu" pathLength="100" d="M0 560 H148"/>
  </svg>
  <div class="term">
    <div class="thead silk" style="position:static;">TX ▸ RX · CONNECTED</div>
    <div class="ln"><i>&gt;</i> POWER RAIL <em>3.30V</em> · OK</div>
    <div class="ln"><i>&gt;</i> 风扇转速 <em>1800 RPM</em></div>
    <div class="ln"><i>&gt;</i> 温度墙 <em>83°C</em></div>
    <div class="ln"><i>&gt;</i> 系统就绪 <b class="cur">▌</b></div>
    <div class="led" style="left:1490px;top:52px;"></div>
  </div>
</div>
<style>${cbRoot(id)}
#${id} .cb{background-color:var(--paper);}
#${id} .term{position:absolute;left:150px;top:260px;width:1620px;height:620px;background:var(--panel-2);border:2px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:52px 70px;display:flex;flex-direction:column;gap:42px;}
#${id} .thead{border-bottom:2px solid var(--line);padding-bottom:30px;margin-bottom:8px;}
#${id} .ln{font-size:46px;font-weight:700;letter-spacing:0.04em;}
#${id} .ln i{font-style:normal;color:var(--accent-2);margin-right:20px;}
#${id} .ln em{font-style:normal;color:var(--accent);}
#${id} .cur{color:var(--accent-2);margin-left:14px;}
</style>`,
      (id) =>
        `tl.from('#${id} .strip',{autoAlpha:0,duration:0.18},0);\n` +
        `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.25,ease:'power2.out'},0.05);\n` +
        `tl.from('#${id} .term',{y:-20,autoAlpha:0,duration:0.22,ease:'power3.out'},0.12);\n` +
        `tl.to('#${id} .pu',{strokeDashoffset:-114,duration:0.25,ease:'power1.inOut'},0.3);\n` +
        `tl.from('#${id} .led',{autoAlpha:0,duration:0.1,ease:'steps(1)'},0.53);\n` +
        `tl.from('#${id} .ln',{autoAlpha:0,duration:0.1,stagger:0.09,ease:'steps(1)'},0.55);\n` +
        `tl.to('#${id} .cur',{autoAlpha:0,duration:0.07,yoyo:true,repeat:3,ease:'steps(1)'},0.9);`,
    ),
  对比: () =>
    mk(
      'cb_cmp',
      '对比',
      (id) => `
<div class="cb">
  <div class="strip"><span><em>AB-06</em> · THERMAL TEST</span><span>ΔT 32°C</span></div>
  <svg class="net" viewBox="0 0 1920 1080">
    <path class="tr dim" pathLength="100" d="M348 470 H520 L640 350 H882"/>
    <path class="tr" pathLength="100" d="M348 610 H520 L640 730 H882"/>
    <path class="pu" pathLength="100" d="M348 610 H520 L640 730 H882"/>
    <circle class="via dimv" cx="640" cy="350" r="10"/>
    <circle class="via" cx="640" cy="730" r="10"/>
  </svg>
  <div class="chip src"><b>PSU</b><span>VCC</span></div>
  <div class="chip p1 dim"><b>U2 · 94°C</b><span>原装散热</span></div>
  <div class="chip p2 act"><b>U3 · 62°C</b><span>加装风扇</span></div>
  <div class="led" style="left:1420px;top:635px;"></div>
  <div class="verdict">十块钱,降三十度</div>
</div>
<style>${cbRoot(id)}
#${id} .cb{background-color:var(--paper);}
#${id} .src{left:90px;top:440px;width:240px;height:200px;gap:22px;}
#${id} .src span{font-size:56px;}
#${id} .p1,#${id} .p2{width:600px;height:220px;padding:0 40px;gap:24px;}
#${id} .p1{left:900px;top:240px;}
#${id} .p2{left:900px;top:620px;}
#${id} .p1 span,#${id} .p2 span{font-size:56px;}
#${id} .verdict{position:absolute;left:0;right:0;top:940px;text-align:center;font-family:var(--font-head);font-size:54px;font-weight:900;}
</style>`,
      (id) =>
        `tl.from('#${id} .strip',{autoAlpha:0,duration:0.18},0);\n` +
        `tl.from('#${id} .src',{y:-20,autoAlpha:0,duration:0.2,ease:'power3.out'},0.06);\n` +
        `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.4,ease:'power2.out',stagger:0.06},0.12);\n` +
        `tl.from('#${id} .via',{autoAlpha:0,duration:0.12},0.4);\n` +
        `tl.from('#${id} .p1',{y:-20,autoAlpha:0,duration:0.22,ease:'power3.out'},0.28);\n` +
        `tl.from('#${id} .p2',{y:-20,autoAlpha:0,duration:0.22,ease:'power3.out'},0.38);\n` +
        `tl.to('#${id} .pu',{strokeDashoffset:-114,duration:0.4,ease:'power1.inOut'},0.6);\n` +
        `tl.from('#${id} .led',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.98);\n` +
        `tl.from('#${id} .verdict',{y:16,autoAlpha:0,duration:0.2},0.75);`,
    ),
  金句: () =>
    mk(
      'cb_qte',
      '金句',
      (id) => `
<div class="cb">
  <div class="strip"><span><em>NOTE-07</em> · SILKSCREEN</span><span>TP1</span></div>
  <svg class="net" viewBox="0 0 1920 1080">
    <path class="tr" pathLength="100" d="M1920 180 H1720 L1640 100 V0"/>
    <path class="tr" pathLength="100" d="M150 810 H1200 L1270 880 H1520"/>
    <path class="pu" pathLength="100" d="M150 810 H1200 L1270 880 H1520"/>
    <circle class="via" cx="1270" cy="880" r="10"/>
  </svg>
  <div class="who silk" style="left:150px;top:330px;">TP1 · 装机十年的老师傅</div>
  <div class="qln q1">性能不是买出来的</div>
  <div class="qln q2">是调出来的</div>
  <div class="led" style="left:1507px;top:867px;"></div>
</div>
<style>${cbRoot(id)}
#${id} .cb{background-color:var(--paper);}
#${id} .qln{position:absolute;left:150px;font-family:var(--font-head);font-size:96px;font-weight:900;line-height:1.15;}
#${id} .q1{top:420px;}
#${id} .q2{top:580px;}
</style>`,
      (id) =>
        `tl.from('#${id} .strip',{autoAlpha:0,duration:0.18},0);\n` +
        `tl.from('#${id} .who',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.08);\n` +
        `tl.from('#${id} .qln',{y:24,autoAlpha:0,duration:0.24,stagger:0.14,ease:'power3.out'},0.15);\n` +
        `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.35,ease:'power2.out'},0.4);\n` +
        `tl.from('#${id} .via',{autoAlpha:0,duration:0.12},0.65);\n` +
        `tl.to('#${id} .pu',{strokeDashoffset:-114,duration:0.35,ease:'power1.inOut'},0.65);\n` +
        `tl.from('#${id} .led',{autoAlpha:0,duration:0.12,ease:'steps(1)'},0.98);`,
    ),
  引导: () =>
    mk(
      'cb_cta',
      '引导',
      (id) => `
<div class="cb">
  <div class="strip"><span><em>SW-08</em> · OUTPUT</span><span>CLOSE THE LOOP</span></div>
  <svg class="net" viewBox="0 0 1920 1080">
    <path class="tr" pathLength="100" d="M0 560 H370"/>
    <path class="tr" pathLength="100" d="M515 560 H642"/>
    <path class="tr" pathLength="100" d="M1278 560 H1450 L1530 480 H1700"/>
    <line class="lever" x1="380" y1="560" x2="505" y2="560"/>
    <path class="pu pu1" pathLength="100" d="M0 560 H370"/>
    <path class="pu pu2" pathLength="100" d="M515 560 H1450 L1530 480 H1700"/>
    <circle class="via" cx="380" cy="560" r="10"/>
    <circle class="via" cx="510" cy="560" r="10"/>
    <circle class="via" cx="1530" cy="480" r="10"/>
  </svg>
  <div class="chip btn"><b>SW1 · MOMENTARY</b><span>关注</span><i class="ring"></i></div>
  <div class="led" style="left:1687px;top:467px;"></div>
  <div class="tag">点一下,回路就通了</div>
</div>
<style>${cbRoot(id)}
#${id} .cb{background-color:var(--paper);}
#${id} .lever{stroke:var(--accent);stroke-width:6;stroke-linecap:round;}
#${id} .btn{left:660px;top:430px;width:600px;height:260px;gap:26px;}
#${id} .btn span{font-size:110px;}
#${id} .ring{position:absolute;inset:-10px;border:4px solid var(--accent-2);border-radius:var(--radius);box-shadow:var(--glow);}
#${id} .tag{position:absolute;left:0;right:0;top:860px;text-align:center;font-family:var(--font-head);font-size:50px;font-weight:900;}
</style>`,
      (id) =>
        `tl.set('#${id} .lever',{rotation:-30,transformOrigin:'left center'},0);\n` +
        `tl.from('#${id} .strip',{autoAlpha:0,duration:0.18},0);\n` +
        `tl.to('#${id} .tr',{strokeDashoffset:0,duration:0.35,ease:'power2.out'},0.06);\n` +
        `tl.from('#${id} .via',{autoAlpha:0,duration:0.15},0.3);\n` +
        `tl.from('#${id} .chip',{y:-20,autoAlpha:0,duration:0.22,ease:'power3.out'},0.12);\n` +
        `tl.to('#${id} .pu1',{strokeDashoffset:-114,duration:0.25,ease:'power1.inOut'},0.35);\n` +
        `tl.to('#${id} .lever',{rotation:0,duration:0.15,ease:'power3.out'},0.58);\n` +
        `tl.from('#${id} .ring',{autoAlpha:0,duration:0.1,ease:'steps(1)'},0.72);\n` +
        `tl.to('#${id} .pu2',{strokeDashoffset:-114,duration:0.28,ease:'power1.inOut'},0.76);\n` +
        `tl.from('#${id} .led',{autoAlpha:0,duration:0.12,ease:'steps(1)'},1.02);\n` +
        `tl.from('#${id} .tag',{y:16,autoAlpha:0,duration:0.2},0.7);`,
    ),
};
