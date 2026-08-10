/**
 * Zen White v2 preview dialect.
 * The samples deliberately demonstrate different relationships among footage, evidence,
 * typography, and silence. They are visual-language examples, not production templates.
 */

import { type Block, mk } from './shared';

const root = (id: string) => `
#${id} .zn{position:absolute;inset:0;overflow:hidden;background:var(--paper);color:var(--fg);font-family:var(--font-body);}
#${id} .serif{font-family:var(--font-head);font-weight:500;}
#${id} .num{font-family:var(--font-num);font-variant-numeric:tabular-nums;}
#${id} .micro{font-size:25px;line-height:1.35;letter-spacing:.18em;color:var(--accent-2);text-transform:uppercase;}
#${id} .rule{position:absolute;height:1px;background:var(--line);transform-origin:left center;}
#${id} .seal{position:absolute;width:13px;height:13px;border-radius:999px;background:var(--accent);}
#${id} [data-edit]{outline:none;}`;

export const cover: () => Block = () =>
  mk(
    'cv_zn2',
    '封面',
    (id) => `
<div class="zn">
  <div class="edition micro">FRAME 02 · OBSERVE BEFORE DESIGN</div>
  <div class="hero serif" data-edit>留白<br/>不是空白</div>
  <div class="note" data-edit>让人物、证据和停顿<br/>各自拥有呼吸的位置</div>
  <div class="field"><div class="grain"></div><div class="horizon"></div><span>真实画面</span></div>
  <div class="seal"></div>
</div>
<style>${root(id)}
#${id} .edition{position:absolute;left:118px;top:94px;}
#${id} .hero{position:absolute;left:118px;top:286px;font-size:150px;line-height:1.14;letter-spacing:.08em;}
#${id} .note{position:absolute;left:126px;bottom:116px;font-size:30px;line-height:1.75;letter-spacing:.08em;color:var(--muted);}
#${id} .field{position:absolute;right:0;top:0;width:760px;height:1080px;background:linear-gradient(155deg,#d8d8d1 0%,#a9aaa5 46%,#6e716c 100%);overflow:hidden;}
#${id} .grain{position:absolute;inset:0;opacity:.24;background:repeating-radial-gradient(circle at 30% 40%,#fff 0 1px,transparent 1px 5px);}
#${id} .horizon{position:absolute;left:-80px;right:-80px;bottom:210px;height:300px;background:linear-gradient(165deg,transparent 0 42%,#4b4e49 43% 100%);filter:blur(2px);}
#${id} .field span{position:absolute;right:52px;bottom:54px;color:#fff;font-size:25px;letter-spacing:.28em;}
#${id} .seal{left:820px;top:648px;}
</style>`,
    (id) =>
      `tl.from('#${id} .field',{autoAlpha:0,duration:.8,ease:'power1.out'},0);\n` +
      `tl.from('#${id} .hero',{autoAlpha:0,y:12,duration:.8,ease:'power1.out'},.08);\n` +
      `tl.from('#${id} .edition,#${id} .note',{autoAlpha:0,duration:.6},.35);\n` +
      `tl.from('#${id} .seal',{autoAlpha:0,duration:.35},.8);`,
  );

export const blocks: Record<string, () => Block> = {
  'source-led': () =>
    mk(
      'zn2_src',
      'source-led',
      (id) => `
<div class="zn">
  <div class="footage"><div class="light"></div><div class="figure"></div><div class="desk"></div></div>
  <div class="margin">
    <div class="micro">SOURCE-LED · 01</div>
    <div class="title serif" data-edit>画面已经<br/>说清楚了</div>
    <div class="rule"></div>
    <div class="caption" data-edit>只补充场景无法独自交代的名字、时间与判断。</div>
    <div class="source">杭州 · 工作室 · 16:40</div>
  </div>
</div>
<style>${root(id)}
#${id} .footage{position:absolute;left:0;top:0;width:1245px;height:1080px;background:linear-gradient(145deg,#d6d3ca,#85867f);overflow:hidden;}
#${id} .light{position:absolute;left:80px;top:-130px;width:680px;height:900px;background:radial-gradient(ellipse,#f8f6eeaa 0%,transparent 68%);transform:rotate(-12deg);}
#${id} .figure{position:absolute;left:460px;top:188px;width:355px;height:760px;border-radius:48% 48% 18% 18%;background:linear-gradient(160deg,#4f504c,#272825);opacity:.92;}
#${id} .desk{position:absolute;left:180px;right:0;bottom:0;height:210px;background:#5d5b54;transform:skewX(-10deg);}
#${id} .margin{position:absolute;right:0;top:0;width:675px;height:1080px;padding:92px 82px;box-sizing:border-box;}
#${id} .title{position:absolute;left:82px;top:292px;font-size:82px;line-height:1.36;letter-spacing:.09em;}
#${id} .rule{left:82px;right:82px;top:584px;}
#${id} .caption{position:absolute;left:82px;right:82px;top:635px;font-size:30px;line-height:1.8;letter-spacing:.04em;color:var(--muted);}
#${id} .source{position:absolute;left:82px;bottom:86px;font-size:24px;letter-spacing:.16em;color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .footage',{autoAlpha:0,duration:.65},0);\n` +
        `tl.from('#${id} .title',{autoAlpha:0,y:10,duration:.75,ease:'power1.out'},.12);\n` +
        `tl.from('#${id} .rule',{scaleX:0,duration:.7,ease:'power1.inOut'},.25);\n` +
        `tl.from('#${id} .caption,#${id} .source',{autoAlpha:0,duration:.55},.48);`,
    ),

  'evidence-plane': () =>
    mk(
      'zn2_evd',
      'evidence-plane',
      (id) => `
<div class="zn">
  <div class="micro kicker">EVIDENCE · OBSERVED RESULT</div>
  <div class="claim serif" data-edit>真正改变结果的，<br/>是每天多留出的这一小时。</div>
  <div class="metric"><span class="num" data-edit>+61</span><i>%</i></div>
  <div class="basis">完成率 · 试行 30 天 · n=42</div>
  <div class="axis"><span class="before"></span><span class="after"></span><b class="seal"></b></div>
  <div class="legend"><span>调整前 38%</span><span>调整后 61%</span></div>
</div>
<style>${root(id)}
#${id} .kicker{position:absolute;left:120px;top:92px;}
#${id} .claim{position:absolute;left:120px;top:214px;width:850px;font-size:66px;line-height:1.55;letter-spacing:.05em;}
#${id} .metric{position:absolute;right:128px;top:230px;display:flex;align-items:flex-start;}
#${id} .metric .num{font-size:250px;line-height:.9;font-weight:400;}
#${id} .metric i{font-style:normal;font-size:58px;margin:18px 0 0 16px;color:var(--muted);}
#${id} .basis{position:absolute;right:140px;top:485px;font-size:26px;letter-spacing:.12em;color:var(--muted);}
#${id} .axis{position:absolute;left:120px;right:128px;bottom:250px;height:2px;background:var(--line);}
#${id} .axis .before,#${id} .axis .after{position:absolute;bottom:0;width:2px;background:var(--fg);}
#${id} .axis .before{left:38%;height:86px;opacity:.35;}
#${id} .axis .after{left:61%;height:160px;}
#${id} .axis .seal{left:calc(61% - 6px);top:-166px;}
#${id} .legend{position:absolute;left:120px;right:128px;bottom:140px;display:flex;justify-content:space-between;font-size:27px;letter-spacing:.08em;color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .claim',{autoAlpha:0,y:10,duration:.7,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .metric',{autoAlpha:0,duration:.65},.12);\n` +
        `tl.from('#${id} .axis',{scaleX:0,transformOrigin:'left',duration:.8,ease:'power1.inOut'},.2);\n` +
        `tl.from('#${id} .axis span',{scaleY:0,transformOrigin:'bottom',duration:.65,stagger:.12},.42);\n` +
        `tl.from('#${id} .seal,#${id} .legend,#${id} .basis',{autoAlpha:0,duration:.4},.75);`,
    ),

  'distillation': () =>
    mk(
      'zn2_dst',
      'distillation',
      (id) => `
<div class="zn">
  <div class="index num">07</div>
  <div class="statement serif" data-edit>慢下来，<br/>不是为了停下。</div>
  <div class="rule"></div>
  <div class="after" data-edit>是为了看见哪一步真正重要。</div>
  <div class="micro note">A PAUSE WITH A PURPOSE</div>
</div>
<style>${root(id)}
#${id} .index{position:absolute;left:118px;top:86px;font-size:48px;color:var(--accent-2);}
#${id} .statement{position:absolute;left:430px;top:250px;font-size:126px;line-height:1.3;letter-spacing:.08em;}
#${id} .rule{left:430px;width:880px;top:652px;}
#${id} .after{position:absolute;left:430px;top:710px;font-size:35px;letter-spacing:.11em;color:var(--muted);}
#${id} .note{position:absolute;right:106px;bottom:86px;writing-mode:vertical-rl;}
</style>`,
      (id) =>
        `tl.from('#${id} .statement',{autoAlpha:0,y:12,duration:.85,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .rule',{scaleX:0,duration:.8,ease:'power1.inOut'},.2);\n` +
        `tl.from('#${id} .after,#${id} .index,#${id} .note',{autoAlpha:0,duration:.55},.55);`,
    ),

  'measured-sequence': () =>
    mk(
      'zn2_seq',
      'measured-sequence',
      (id) => `
<div class="zn">
  <div class="micro top">STATE CHANGE · THREE OBSERVATIONS</div>
  <div class="title serif" data-edit>从动作，到反馈，再到结果</div>
  <div class="track"></div>
  <div class="step s1"><i>01</i><b data-edit>放入原料</b><span>输入保持可见</span></div>
  <div class="step s2"><i>02</i><b data-edit>温度稳定</b><span>反馈解释变化</span></div>
  <div class="step s3"><i>03</i><b data-edit>香气释放</b><span>结果回到画面</span></div>
  <div class="seal"></div>
</div>
<style>${root(id)}
#${id} .top{position:absolute;left:120px;top:88px;}
#${id} .title{position:absolute;left:120px;top:220px;font-size:76px;letter-spacing:.07em;}
#${id} .track{position:absolute;left:120px;right:120px;top:590px;height:1px;background:var(--line);transform-origin:left;}
#${id} .step{position:absolute;top:518px;width:430px;}
#${id} .s1{left:135px}.s2{left:745px}.s3{left:1355px}
#${id} .step i{display:block;font-family:var(--font-num);font-style:normal;font-size:38px;color:var(--accent-2);}
#${id} .step b{display:block;margin-top:96px;font-family:var(--font-head);font-size:48px;font-weight:500;letter-spacing:.08em;}
#${id} .step span{display:block;margin-top:24px;font-size:27px;letter-spacing:.06em;color:var(--muted);}
#${id} .seal{left:1338px;top:584px;}
</style>`,
      (id) =>
        `tl.from('#${id} .title',{autoAlpha:0,y:10,duration:.7},0);\n` +
        `tl.from('#${id} .track',{scaleX:0,duration:.9,ease:'power1.inOut'},.08);\n` +
        `tl.from('#${id} .step',{autoAlpha:0,y:10,duration:.6,stagger:.16,ease:'power1.out'},.25);\n` +
        `tl.from('#${id} .seal',{autoAlpha:0,duration:.35},.82);`,
    ),

  'quiet-comparison': () =>
    mk(
      'zn2_cmp',
      'quiet-comparison',
      (id) => `
<div class="zn">
  <div class="micro top">ONE DIMENSION · TWO STATES</div>
  <div class="question serif" data-edit>同样的一天，注意力去了哪里？</div>
  <div class="divider"></div>
  <section class="left"><small>BEFORE</small><strong class="num">4h 18m</strong><p data-edit>被通知和切换打断</p></section>
  <section class="right"><small>AFTER</small><strong class="num">1h 42m</strong><p data-edit>留给完整而连续的工作</p></section>
  <div class="basis">同一设备 · 同一周内 · 屏幕时间记录</div>
</div>
<style>${root(id)}
#${id} .top{position:absolute;left:120px;top:88px;}
#${id} .question{position:absolute;left:120px;top:190px;font-size:72px;letter-spacing:.06em;}
#${id} .divider{position:absolute;left:960px;top:425px;width:1px;height:390px;background:var(--line);}
#${id} section{position:absolute;top:438px;width:650px;}
#${id} .left{left:150px}.right{left:1120px}
#${id} section small{font-size:25px;letter-spacing:.22em;color:var(--accent-2);}
#${id} section strong{display:block;margin-top:32px;font-size:136px;font-weight:400;letter-spacing:.02em;}
#${id} section p{margin:30px 0 0;font-size:31px;letter-spacing:.08em;color:var(--muted);}
#${id} .basis{position:absolute;left:120px;bottom:84px;font-size:24px;letter-spacing:.14em;color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .question',{autoAlpha:0,y:10,duration:.7},0);\n` +
        `tl.from('#${id} .divider',{scaleY:0,transformOrigin:'top',duration:.75,ease:'power1.inOut'},.15);\n` +
        `tl.from('#${id} section',{autoAlpha:0,y:10,duration:.65,stagger:.16},.3);\n` +
        `tl.from('#${id} .basis',{autoAlpha:0,duration:.45},.72);`,
    ),

  'human-pause': () =>
    mk(
      'zn2_hmn',
      'human-pause',
      (id) => `
<div class="zn dark">
  <div class="portrait"><div class="window"></div><div class="face"></div><div class="shoulder"></div></div>
  <div class="name serif" data-edit>林岚</div>
  <div class="role">陶艺师 · 景德镇</div>
  <div class="line" data-edit>“这一刻，不需要再加一句解释。”</div>
  <div class="micro edge">LET THE PERSON HOLD THE FRAME</div>
</div>
<style>${root(id)}
#${id} .dark{background:#22231f;color:#f3f1e9;}
#${id} .portrait{position:absolute;left:0;top:0;width:1320px;height:1080px;overflow:hidden;background:linear-gradient(140deg,#77786f,#32332f);}
#${id} .window{position:absolute;left:80px;top:-100px;width:600px;height:930px;background:radial-gradient(ellipse,#f4ead399,transparent 66%);transform:rotate(-9deg);}
#${id} .face{position:absolute;left:548px;top:205px;width:280px;height:330px;border-radius:48%;background:linear-gradient(145deg,#b8aa95,#6f665b);}
#${id} .shoulder{position:absolute;left:410px;top:490px;width:620px;height:700px;border-radius:48% 48% 0 0;background:#373934;}
#${id} .name{position:absolute;left:1400px;top:180px;font-size:70px;letter-spacing:.12em;}
#${id} .role{position:absolute;left:1404px;top:292px;font-size:26px;letter-spacing:.18em;color:#f3f1e988;}
#${id} .line{position:absolute;left:1400px;right:86px;top:540px;font-family:var(--font-head);font-size:40px;line-height:1.8;letter-spacing:.06em;}
#${id} .edge{position:absolute;right:52px;bottom:62px;color:#f3f1e966;writing-mode:vertical-rl;}
</style>`,
      (id) =>
        `tl.from('#${id} .portrait',{autoAlpha:0,duration:.8},0);\n` +
        `tl.from('#${id} .name,#${id} .role',{autoAlpha:0,y:8,duration:.65},.2);\n` +
        `tl.from('#${id} .line,#${id} .edge',{autoAlpha:0,duration:.6},.48);`,
    ),
};
