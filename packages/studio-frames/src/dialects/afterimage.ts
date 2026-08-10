/**
 * Afterimage v2 preview dialect.
 * Samples expose distinct temporal relationships in footage. They demonstrate a visual
 * capability space, not a set of content or Skill-specific templates.
 */

import { type Block, mk } from './shared';

const root = (id: string) => `
#${id} .af{position:absolute;inset:0;overflow:hidden;background:var(--paper);color:var(--fg);font-family:var(--font-body);}
#${id} .head{font-family:var(--font-head);font-weight:800;}
#${id} .num{font-family:var(--font-num);font-variant-numeric:tabular-nums;}
#${id} .micro{font-family:var(--font-num);font-size:23px;letter-spacing:.17em;text-transform:uppercase;}
#${id} .coral{color:var(--accent);}#${id} .cyan{color:var(--accent-2);}
#${id} [data-edit]{outline:none;}`;

export const cover: () => Block = () =>
  mk(
    'cv_af2',
    '封面',
    (id) => `
<div class="af cover">
  <div class="field"><div class="body past p1"></div><div class="body past p2"></div><div class="body now"></div></div>
  <div class="issue micro">FRAME 04 / TIME REMAINS VISIBLE</div>
  <div class="title head" data-edit>余像</div>
  <div class="thesis" data-edit>时间还在画面里</div>
  <div class="clock num">00:00:03.18<br/>→ 00:00:03.24</div>
</div>
<style>${root(id)}
#${id} .cover{background:#10121a;}
#${id} .field{position:absolute;left:0;top:0;width:1160px;height:1080px;background:#4e5561;overflow:hidden;}
#${id} .body{position:absolute;top:150px;width:310px;height:880px;clip-path:polygon(28% 0,72% 0,92% 22%,100% 100%,0 100%,8% 22%);}
#${id} .p1{left:260px;background:var(--accent);opacity:.48}#${id} .p2{left:390px;background:var(--accent-2);opacity:.48}#${id} .now{left:520px;background:#171920;}
#${id} .issue{position:absolute;left:1220px;top:82px;}
#${id} .title{position:absolute;left:1198px;top:226px;font-size:236px;line-height:.92;letter-spacing:.06em;writing-mode:vertical-rl;}
#${id} .thesis{position:absolute;left:1230px;bottom:128px;font-size:34px;letter-spacing:.12em;}
#${id} .clock{position:absolute;right:72px;bottom:72px;font-size:21px;line-height:1.6;color:var(--muted);text-align:right;}
</style>`,
    (id) =>
      `tl.from('#${id} .p1',{x:260,autoAlpha:0,duration:.3,ease:'power3.out'},0);\n` +
      `tl.from('#${id} .p2',{x:160,autoAlpha:0,duration:.3,ease:'power3.out'},.08);\n` +
      `tl.from('#${id} .now',{x:90,autoAlpha:0,duration:.3,ease:'power3.out'},.16);\n` +
      `tl.from('#${id} .issue,#${id} .title,#${id} .thesis,#${id} .clock',{autoAlpha:0,duration:.35},.34);`,
  );

export const blocks: Record<string, () => Block> = {
  'motion-memory': () =>
    mk(
      'af2_mem',
      'motion-memory',
      (id) => `
<div class="af memory">
  <div class="scene"><div class="window"></div><div class="arm a1"></div><div class="arm a2"></div><div class="arm current"></div><div class="object"></div></div>
  <div class="anchor"><span class="micro">MOTION MEMORY / 01</span><h2 class="head" data-edit>动作留下<br/>方向</h2><p data-edit>只保留三个真实位置：进入、接触、结果。</p></div>
  <div class="vector num">t−08&nbsp;&nbsp; t−03&nbsp;&nbsp; NOW →</div>
</div>
<style>${root(id)}
#${id} .scene{position:absolute;inset:0 650px 0 0;background:#5d626b;overflow:hidden;}
#${id} .window{position:absolute;left:0;top:0;width:390px;height:1080px;background:#d8d4ca;}
#${id} .arm{position:absolute;left:330px;top:350px;width:690px;height:160px;transform-origin:left center;clip-path:polygon(0 22%,88% 0,100% 50%,88% 100%,0 78%);}
#${id} .a1{background:var(--accent);opacity:.42;transform:rotate(-18deg)}#${id} .a2{background:var(--accent-2);opacity:.44;transform:rotate(-7deg)}#${id} .current{background:#171920;transform:rotate(5deg)}
#${id} .object{position:absolute;right:116px;bottom:134px;width:250px;height:360px;background:#ece8de;border:8px solid #171920;}
#${id} .anchor{position:absolute;right:0;top:0;width:650px;height:1080px;padding:82px 76px;box-sizing:border-box;}
#${id} .anchor h2{margin:190px 0 0;font-size:126px;line-height:1.08;letter-spacing:.025em;}
#${id} .anchor p{position:absolute;left:78px;right:76px;bottom:132px;border-top:2px solid var(--line);padding-top:28px;font-size:28px;line-height:1.55;color:var(--muted);}
#${id} .vector{position:absolute;left:84px;bottom:64px;font-size:22px;letter-spacing:.15em;color:#fff;}
</style>`,
      (id) =>
        `tl.from('#${id} .a1',{rotation:-34,autoAlpha:0,duration:.28,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .a2',{rotation:-22,autoAlpha:0,duration:.28,ease:'power2.out'},.1);\n` +
        `tl.from('#${id} .current',{rotation:-10,autoAlpha:0,duration:.28,ease:'power2.out'},.2);\n` +
        `tl.from('#${id} .anchor h2,#${id} .anchor p,#${id} .vector',{autoAlpha:0,duration:.3},.38);`,
    ),

  'shutter-slice': () =>
    mk(
      'af2_sht',
      'shutter-slice',
      (id) => `
<div class="af shutter">
  <div class="slice s1"><i></i></div><div class="slice s2"><i></i></div><div class="slice s3"><i></i></div><div class="slice s4"><i></i></div><div class="slice s5"><i></i></div>
  <div class="stable micro">ONE PASS / FIVE NEARBY MOMENTS</div>
  <div class="line head" data-edit>穿过这一刻</div>
  <div class="read num">03.08 — 03.12 — 03.16 — 03.20 — NOW</div>
</div>
<style>${root(id)}
#${id} .shutter{display:flex;background:#343943;}
#${id} .slice{height:1080px;position:relative;overflow:hidden;border-right:3px solid #10121a;}
#${id} .s1{width:15%}#${id} .s2{width:18%}#${id} .s3{width:26%}#${id} .s4{width:22%}#${id} .s5{width:19%;border-right:0}
#${id} .slice i{position:absolute;top:156px;width:300px;height:850px;background:#11131a;clip-path:polygon(24% 0,76% 0,100% 32%,90% 100%,10% 100%,0 32%);}
#${id} .s1 i{left:150px;background:var(--accent);opacity:.52}#${id} .s2 i{left:110px;background:#252832}#${id} .s3 i{left:80px;background:var(--accent-2);opacity:.55}#${id} .s4 i{left:40px;background:#161820}#${id} .s5 i{left:-10px;background:#ece8de}
#${id} .stable{position:absolute;left:78px;top:62px;background:#10121a;padding:15px 20px;}
#${id} .line{position:absolute;left:70px;bottom:125px;font-size:142px;letter-spacing:.04em;}
#${id} .read{position:absolute;right:68px;bottom:62px;font-size:20px;letter-spacing:.15em;}
</style>`,
      (id) =>
        `tl.from('#${id} .slice',{scaleX:0,transformOrigin:'left',duration:.3,stagger:.055,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .slice i',{x:160,autoAlpha:0,duration:.28,stagger:.055,ease:'power3.out'},.12);\n` +
        `tl.from('#${id} .stable,#${id} .line,#${id} .read',{autoAlpha:0,duration:.26},.5);`,
    ),

  'temporal-stack': () =>
    mk(
      'af2_stk',
      'temporal-stack',
      (id) => `
<div class="af stack">
  <div class="plane past"><span class="num">01 / INPUT</span><div class="shape"></div></div>
  <div class="plane middle"><span class="num">02 / ACTION</span><div class="shape"></div></div>
  <div class="plane present"><span class="num">03 / RESULT</span><div class="shape"></div></div>
  <div class="anchor"><span class="micro">TEMPORAL STACK / VERIFIED STATES</span><h2 class="head" data-edit>三段时间<br/>一个结果</h2><p data-edit>层叠用来比较状态，不是摆三张卡。</p></div>
</div>
<style>${root(id)}
#${id} .stack{background:#10121a;}
#${id} .plane{position:absolute;width:720px;height:720px;top:180px;border:4px solid var(--fg);overflow:hidden;background:#555b65;}
#${id} .plane span{position:absolute;left:26px;top:24px;font-size:21px;letter-spacing:.13em;z-index:2;}
#${id} .plane .shape{position:absolute;left:180px;top:150px;width:380px;height:470px;background:#e7e3d9;clip-path:polygon(18% 0,82% 0,100% 100%,0 100%);}
#${id} .past{left:90px;transform:rotate(-4deg);opacity:.52}#${id} .past .shape{background:var(--accent)}
#${id} .middle{left:330px;top:130px;transform:rotate(2deg);opacity:.7}#${id} .middle .shape{background:var(--accent-2)}
#${id} .present{left:580px;top:100px;box-shadow:18px 18px 0 #ff5e7d88}#${id} .present .shape{background:#eeeae1}
#${id} .anchor{position:absolute;right:70px;top:82px;width:520px;}
#${id} .anchor h2{margin:170px 0 0;font-size:112px;line-height:1.08;letter-spacing:.035em;}
#${id} .anchor p{margin-top:80px;font-size:28px;line-height:1.55;color:var(--muted);border-top:2px solid var(--line);padding-top:24px;}
</style>`,
      (id) =>
        `tl.from('#${id} .past',{x:260,rotation:0,autoAlpha:0,duration:.32,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .middle',{x:200,rotation:0,autoAlpha:0,duration:.32,ease:'power3.out'},.1);\n` +
        `tl.from('#${id} .present',{x:130,rotation:0,autoAlpha:0,duration:.32,ease:'power3.out'},.2);\n` +
        `tl.from('#${id} .anchor',{autoAlpha:0,duration:.3},.42);`,
    ),

  'focus-transfer': () =>
    mk(
      'af2_fcs',
      'focus-transfer',
      (id) => `
<div class="af focus">
  <div class="source"><div class="person"></div><div class="object"></div><div class="aperture"></div></div>
  <div class="fixed"><span class="micro">FOCUS TRANSFER / SPEAKER → EVIDENCE</span><h2 class="head" data-edit>判断不动<br/>焦点移动</h2><p data-edit>从说话的人，移向能验证这句话的物体。</p></div>
  <div class="focusline"><i></i><b></b><span class="num">NEAR</span><span class="num">FAR</span></div>
</div>
<style>${root(id)}
#${id} .source{position:absolute;inset:0;background:#777b82;overflow:hidden;}
#${id} .person{position:absolute;left:180px;top:180px;width:420px;height:900px;background:#252831;clip-path:polygon(25% 0,75% 0,96% 26%,100% 100%,0 100%,4% 26%);opacity:.42;}
#${id} .object{position:absolute;right:180px;top:290px;width:470px;height:520px;background:#e8e4db;border:8px solid #15171e;}
#${id} .aperture{position:absolute;right:80px;top:160px;width:720px;height:720px;border:8px solid var(--accent-2);border-radius:50%;box-shadow:0 0 0 999px #10121ad1;}
#${id} .fixed{position:absolute;left:84px;top:72px;width:720px;z-index:2;}
#${id} .fixed h2{margin:140px 0 0;font-size:120px;line-height:1.08;letter-spacing:.035em;}
#${id} .fixed p{margin-top:58px;width:520px;font-size:29px;line-height:1.55;color:#f4f0e8cc;}
#${id} .focusline{position:absolute;left:90px;right:90px;bottom:68px;height:30px;z-index:2;border-top:2px solid #f4f0e866;}
#${id} .focusline i,#${id} .focusline b{position:absolute;top:-7px;width:13px;height:13px;border-radius:50%;}#${id} .focusline i{left:23%;background:var(--accent)}#${id} .focusline b{left:78%;background:var(--accent-2)}
#${id} .focusline span{position:absolute;top:18px;font-size:18px;letter-spacing:.14em}#${id} .focusline span:nth-of-type(1){left:20%}#${id} .focusline span:nth-of-type(2){left:75%}
</style>`,
      (id) =>
        `tl.from('#${id} .aperture',{x:-720,scale:.4,duration:.55,ease:'power2.inOut'},0);\n` +
        `tl.from('#${id} .object',{autoAlpha:0,duration:.28},.28);\n` +
        `tl.from('#${id} .fixed,#${id} .focusline',{autoAlpha:0,duration:.3},.42);`,
    ),

  'chroma-echo': () =>
    mk(
      'af2_chr',
      'chroma-echo',
      (id) => `
<div class="af chroma">
  <div class="land"><div class="horizon"></div><div class="figure c1"></div><div class="figure c2"></div><div class="figure now"></div></div>
  <div class="label micro">CHROMA ECHO / DEPARTING — ARRIVING</div>
  <div class="statement head" data-edit>颜色记住<br/>离开的方向</div>
  <div class="note" data-edit>珊瑚属于上一刻，青色属于即将抵达的位置。</div>
  <div class="channels num"><span>R / −06</span><span>G / NOW</span><span>B / +03</span></div>
</div>
<style>${root(id)}
#${id} .land{position:absolute;inset:0;background:#b7b2aa;overflow:hidden;}
#${id} .horizon{position:absolute;left:0;right:0;bottom:0;height:370px;background:#484d55;clip-path:polygon(0 28%,30% 8%,55% 24%,76% 0,100% 18%,100% 100%,0 100%);}
#${id} .figure{position:absolute;top:170px;width:330px;height:830px;clip-path:polygon(22% 0,78% 0,100% 27%,90% 100%,10% 100%,0 27%);}
#${id} .c1{left:690px;background:var(--accent);opacity:.62}#${id} .c2{left:820px;background:var(--accent-2);opacity:.62}#${id} .now{left:755px;background:#161820;mix-blend-mode:multiply;}
#${id} .label{position:absolute;left:74px;top:68px;background:#10121a;padding:16px 20px;}
#${id} .statement{position:absolute;left:70px;top:240px;font-size:120px;line-height:1.08;letter-spacing:.035em;color:#10121a;}
#${id} .note{position:absolute;right:76px;top:92px;width:460px;font-size:29px;line-height:1.5;color:#10121a;font-weight:700;}
#${id} .channels{position:absolute;left:72px;right:72px;bottom:60px;display:flex;justify-content:space-between;font-size:20px;letter-spacing:.15em;color:#fff;}
</style>`,
      (id) =>
        `tl.from('#${id} .c1',{x:160,autoAlpha:0,duration:.32,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .c2',{x:80,autoAlpha:0,duration:.32,ease:'power2.out'},.1);\n` +
        `tl.from('#${id} .now',{autoAlpha:0,duration:.3},.22);\n` +
        `tl.from('#${id} .label,#${id} .statement,#${id} .note,#${id} .channels',{autoAlpha:0,duration:.28},.4);`,
    ),

  'clean-return': () =>
    mk(
      'af2_ret',
      'clean-return',
      (id) => `
<div class="af return">
  <div class="clean"><div class="light"></div><div class="person"></div><div class="table"></div></div>
  <div class="state micro">CLEAN RETURN / CURRENT SOURCE ONLY</div>
  <div class="statement head" data-edit>现在，<br/>只看真实画面</div>
  <div class="reason" data-edit>所有残影都已对齐，给结论留下完整的一帧。</div>
  <div class="time num">NOW / 00:24:16</div>
</div>
<style>${root(id)}
#${id} .return{background:#f1eee8;color:#10121a;}
#${id} .clean{position:absolute;right:0;top:0;width:1180px;height:1080px;background:#9a978f;overflow:hidden;}
#${id} .light{position:absolute;left:0;top:0;width:520px;height:1080px;background:#d8d3c8;}
#${id} .person{position:absolute;left:420px;top:180px;width:360px;height:900px;background:#292b30;clip-path:polygon(24% 0,76% 0,96% 25%,100% 100%,0 100%,4% 25%);}
#${id} .table{position:absolute;left:60px;right:0;bottom:0;height:190px;background:#5e5c57;}
#${id} .state{position:absolute;left:78px;top:72px;}
#${id} .statement{position:absolute;left:72px;top:286px;width:680px;font-size:104px;line-height:1.16;letter-spacing:.04em;}
#${id} .reason{position:absolute;left:76px;bottom:150px;width:560px;border-top:2px solid #10121a55;padding-top:26px;font-size:28px;line-height:1.55;}
#${id} .time{position:absolute;left:76px;bottom:68px;font-size:20px;letter-spacing:.15em;}
</style>`,
      (id) =>
        `tl.from('#${id} .clean',{autoAlpha:0,duration:.6,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .statement',{autoAlpha:0,y:14,duration:.45,ease:'power1.out'},.18);\n` +
        `tl.from('#${id} .state,#${id} .reason,#${id} .time',{autoAlpha:0,duration:.36},.42);`,
    ),
};
