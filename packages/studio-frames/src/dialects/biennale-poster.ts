/**
 * Biennale Poster v2 preview dialect.
 * These samples show different argumentative relationships among type, footage, proof,
 * sequence, and public facts. They are visual-language examples, not production templates.
 */

import { type Block, mk } from './shared';

const root = (id: string) => `
#${id} .bi{position:absolute;inset:0;overflow:hidden;background:var(--paper);color:var(--fg);font-family:var(--font-body);}
#${id} .head{font-family:var(--font-head);font-weight:900;}
#${id} .num{font-family:var(--font-num);font-variant-numeric:tabular-nums;}
#${id} .micro{font-family:var(--font-num);font-size:25px;font-weight:700;letter-spacing:.19em;text-transform:uppercase;}
#${id} .rule{height:6px;background:var(--fg);transform-origin:left center;}
#${id} [data-edit]{outline:none;}`;

export const cover: () => Block = () =>
  mk(
    'cv_bi2',
    '封面',
    (id) => `
<div class="bi">
  <div class="issue micro">PIREEL FRAME / ISSUE 03</div>
  <div class="hero head" data-edit>双年展</div>
  <div class="claim head"><span data-edit>不是装饰</span><b data-edit>是立场</b></div>
  <div class="index num">BIENNALE<br/>POSTER<br/>SYSTEM</div>
</div>
<style>${root(id)}
#${id} .issue{position:absolute;left:108px;top:80px;}
#${id} .hero{position:absolute;left:92px;top:176px;font-size:410px;line-height:.92;letter-spacing:-.08em;white-space:nowrap;}
#${id} .claim{position:absolute;left:0;right:0;bottom:104px;height:206px;display:flex;align-items:center;font-size:106px;line-height:1;}
#${id} .claim span{padding-left:104px;flex:1;}
#${id} .claim b{align-self:stretch;display:flex;align-items:center;background:var(--fg);color:var(--paper);padding:0 112px;}
#${id} .index{position:absolute;right:74px;top:72px;font-size:24px;line-height:1.55;text-align:right;letter-spacing:.2em;writing-mode:vertical-rl;}
</style>`,
    (id) =>
      `tl.from('#${id} .hero',{x:-170,autoAlpha:0,duration:.34,ease:'power3.out'},0);\n` +
      `tl.from('#${id} .claim span',{x:-100,autoAlpha:0,duration:.3,ease:'power3.out'},.16);\n` +
      `tl.from('#${id} .claim b',{x:180,duration:.32,ease:'power3.out'},.2);\n` +
      `tl.from('#${id} .issue,#${id} .index',{autoAlpha:0,duration:.24},.46);`,
  );

export const blocks: Record<string, () => Block> = {
  'poster-manifesto': () =>
    mk(
      'bi2_man',
      'poster-manifesto',
      (id) => `
<div class="bi manifesto">
  <div class="issue micro">POSITION / 01</div>
  <div class="verb head" data-edit>先亮出</div>
  <div class="verdict head" data-edit>判断</div>
  <div class="support" data-edit>观点必须改变观众理解证据的方式。</div>
  <div class="footer micro"><span>编辑立场</span><span class="num">00:17:08</span></div>
</div>
<style>${root(id)}
#${id} .issue{position:absolute;left:106px;top:76px;}
#${id} .verb{position:absolute;left:96px;top:188px;font-size:214px;line-height:.9;letter-spacing:-.055em;}
#${id} .verdict{position:absolute;left:-18px;top:438px;background:var(--fg);color:var(--paper);font-size:330px;line-height:.98;letter-spacing:-.06em;padding:8px 160px 28px 116px;}
#${id} .support{position:absolute;right:104px;top:205px;width:500px;font-size:34px;line-height:1.55;font-weight:700;}
#${id} .footer{position:absolute;left:106px;right:106px;bottom:68px;border-top:6px solid var(--fg);padding-top:22px;display:flex;justify-content:space-between;}
</style>`,
      (id) =>
        `tl.from('#${id} .verb',{x:-140,autoAlpha:0,duration:.3,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .verdict',{x:240,duration:.32,ease:'power3.out'},.1);\n` +
        `tl.from('#${id} .support',{autoAlpha:0,duration:.24},.32);\n` +
        `tl.from('#${id} .footer',{scaleX:0,duration:.3,ease:'power3.out'},.38);`,
    ),

  'footage-collision': () =>
    mk(
      'bi2_ftg',
      'footage-collision',
      (id) => `
<div class="bi collision">
  <div class="footage"><div class="window"></div><div class="person"></div><div class="table"></div><span class="micro">原始画面 / 16:40</span></div>
  <div class="field">
    <div class="micro">SOURCE COLLISION / 02</div>
    <div class="claim head" data-edit>让证据<br/>撞进来</div>
    <div class="note" data-edit>排版只占据真实画面没有说清的那部分。</div>
  </div>
  <div class="source num">杭州 · 工作室 · TAKE 07</div>
</div>
<style>${root(id)}
#${id} .footage{position:absolute;left:0;top:0;width:1250px;height:1080px;background:#8b8c86;overflow:hidden;}
#${id} .window{position:absolute;left:80px;top:0;width:520px;height:670px;background:#d9d6ca;}
#${id} .person{position:absolute;left:510px;top:176px;width:330px;height:760px;background:#292a27;clip-path:polygon(18% 0,82% 0,100% 30%,88% 100%,6% 100%,0 30%);}
#${id} .table{position:absolute;left:150px;right:-100px;bottom:0;height:220px;background:#55564f;transform:skewX(-12deg);}
#${id} .footage>span{position:absolute;left:68px;bottom:58px;color:#fff;}
#${id} .field{position:absolute;right:0;top:0;width:780px;height:1080px;background:var(--paper);padding:82px 92px;box-sizing:border-box;}
#${id} .field .claim{position:absolute;left:92px;top:258px;font-size:142px;line-height:1.06;letter-spacing:-.035em;}
#${id} .field .note{position:absolute;left:96px;right:78px;bottom:128px;border-top:6px solid var(--fg);padding-top:28px;font-size:29px;line-height:1.55;font-weight:700;}
#${id} .source{position:absolute;left:1160px;top:54px;background:var(--fg);color:var(--paper);padding:18px 28px;font-size:24px;letter-spacing:.1em;}
</style>`,
      (id) =>
        `tl.from('#${id} .footage',{autoAlpha:0,duration:.3},0);\n` +
        `tl.from('#${id} .field',{x:240,duration:.34,ease:'power3.out'},.05);\n` +
        `tl.from('#${id} .claim',{x:100,autoAlpha:0,duration:.28,ease:'power3.out'},.22);\n` +
        `tl.from('#${id} .note,#${id} .source',{autoAlpha:0,duration:.24},.42);`,
    ),

  'proof-broadsheet': () =>
    mk(
      'bi2_prf',
      'proof-broadsheet',
      (id) => `
<div class="bi broadsheet">
  <div class="poster head" data-edit>不是更忙<br/><b>是少一次切换</b></div>
  <div class="proof">
    <div class="micro">OBSERVED RESULT / 30 DAYS</div>
    <div class="metric"><span class="num">38</span><i>%</i><b>→</b><span class="num">61</span><i>%</i></div>
    <div class="axis"><span></span><span></span><span></span><span></span><strong></strong></div>
    <div class="caption" data-edit>完成率 · 试行 30 天 · n=42</div>
    <div class="source num">数据来源 / 项目回访记录</div>
  </div>
  <div class="annotation head" data-edit>证据先于风格 ↗</div>
</div>
<style>${root(id)}
#${id} .poster{position:absolute;left:80px;top:76px;font-size:102px;line-height:1.06;letter-spacing:-.035em;}
#${id} .poster b{display:inline-block;margin-top:18px;background:var(--fg);color:var(--paper);padding:12px 24px 20px;}
#${id} .proof{position:absolute;left:520px;right:104px;top:300px;bottom:92px;background:var(--panel);border:6px solid var(--fg);box-shadow:var(--shadow);padding:58px 70px;box-sizing:border-box;}
#${id} .metric{display:flex;align-items:baseline;gap:16px;margin-top:62px;}
#${id} .metric span{font-size:182px;line-height:.8;font-weight:800;}
#${id} .metric i{font-style:normal;font-size:44px;font-weight:800;}
#${id} .metric b{font-family:var(--font-head);font-size:90px;margin:0 38px;}
#${id} .axis{position:absolute;left:70px;right:70px;bottom:178px;height:112px;border-bottom:4px solid var(--fg);display:flex;align-items:flex-end;gap:42px;}
#${id} .axis span{width:170px;background:#b8b8b2;height:28px;}#${id} .axis span:nth-child(2){height:45px}#${id} .axis span:nth-child(3){height:62px}#${id} .axis span:nth-child(4){height:78px}
#${id} .axis strong{width:270px;height:108px;background:var(--fg);}
#${id} .caption{position:absolute;left:70px;bottom:106px;font-size:28px;font-weight:700;letter-spacing:.05em;}
#${id} .source{position:absolute;right:70px;bottom:48px;font-size:22px;letter-spacing:.12em;}
#${id} .annotation{position:absolute;left:106px;bottom:108px;font-size:48px;line-height:1.2;writing-mode:vertical-rl;}
</style>`,
      (id) =>
        `tl.from('#${id} .poster',{x:-120,autoAlpha:0,duration:.3,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .proof',{x:180,autoAlpha:0,duration:.34,ease:'power3.out'},.12);\n` +
        `tl.from('#${id} .axis span,#${id} .axis strong',{scaleY:0,transformOrigin:'bottom',duration:.28,stagger:.06},.34);\n` +
        `tl.from('#${id} .annotation',{autoAlpha:0,duration:.2},.58);`,
    ),

  'counterforce-split': () =>
    mk(
      'bi2_ctr',
      'counterforce-split',
      (id) => `
<div class="bi counter">
  <section class="claim"><span class="micro">ASSUMPTION / 04</span><h2 class="head" data-edit>所有人<br/>都需要<br/>更多功能</h2></section>
  <section class="answer"><span class="micro">实际访谈 / 12 人</span><h2 class="head" data-edit>用户只想<br/><b>少走一步</b></h2><p data-edit>冲突不是平均分屏，证据需要更大的阅读面积。</p></section>
  <div class="seam num">CLAIM → PROOF</div>
</div>
<style>${root(id)}
#${id} .counter{display:flex;}
#${id} section{height:1080px;box-sizing:border-box;position:relative;}
#${id} .claim{width:39%;padding:78px 88px;background:var(--paper);}
#${id} .answer{width:61%;padding:78px 104px;background:var(--fg);color:var(--paper);}
#${id} section h2{margin:150px 0 0;font-size:116px;line-height:1.08;letter-spacing:-.04em;}
#${id} .answer h2{font-size:138px;margin-top:120px;}
#${id} .answer h2 b{display:inline-block;margin-top:24px;background:var(--paper);color:var(--fg);padding:8px 24px 18px;}
#${id} .answer p{position:absolute;left:108px;right:100px;bottom:92px;border-top:5px solid var(--paper);padding-top:24px;font-size:29px;line-height:1.5;font-weight:700;}
#${id} .seam{position:absolute;left:39%;top:50%;transform:translate(-50%,-50%) rotate(-90deg);background:var(--panel);border:6px solid var(--fg);padding:16px 32px;font-size:22px;font-weight:800;letter-spacing:.16em;white-space:nowrap;}
</style>`,
      (id) =>
        `tl.from('#${id} .claim',{x:-150,duration:.3,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .answer',{x:220,duration:.32,ease:'power3.out'},.08);\n` +
        `tl.from('#${id} section h2',{autoAlpha:0,y:35,duration:.28,stagger:.1},.28);\n` +
        `tl.from('#${id} .seam,#${id} .answer p',{autoAlpha:0,duration:.22},.5);`,
    ),

  'catalogue-sequence': () =>
    mk(
      'bi2_seq',
      'catalogue-sequence',
      (id) => `
<div class="bi catalogue">
  <div class="top micro">A REAL PROGRESSION / NOT A NUMBERED LIST</div>
  <div class="phase p1"><i class="num">01</i><b class="head" data-edit>看见问题</b><span data-edit>让原始画面先出现</span></div>
  <div class="phase p2"><i class="num">02</i><b class="head" data-edit>拆开<br/>机制</b><span data-edit>用一次图形冲突解释变化</span></div>
  <div class="phase p3"><i class="num">03</i><b class="head" data-edit>改变结果</b><span data-edit>回到人和可验证的结果</span></div>
  <div class="progress"><span></span><span></span><span></span></div>
</div>
<style>${root(id)}
#${id} .top{position:absolute;left:98px;top:70px;}
#${id} .phase{position:absolute;box-sizing:border-box;}
#${id} .phase i{font-style:normal;font-size:42px;font-weight:800;}
#${id} .phase b{display:block;letter-spacing:-.035em;}
#${id} .phase span{display:block;font-size:26px;line-height:1.45;font-weight:700;}
#${id} .p1{left:98px;top:230px;width:470px;}#${id} .p1 b{margin-top:42px;font-size:82px}#${id} .p1 span{margin-top:64px;width:330px}
#${id} .p2{left:650px;top:154px;width:660px;height:780px;background:var(--fg);color:var(--paper);padding:64px 68px;}#${id} .p2 b{margin-top:58px;font-size:158px;line-height:1.02}#${id} .p2 span{position:absolute;left:70px;bottom:62px;width:470px}
#${id} .p3{right:88px;bottom:118px;width:440px;}#${id} .p3 b{margin-top:38px;font-size:98px;line-height:1.04}#${id} .p3 span{margin-top:48px}
#${id} .progress{position:absolute;left:98px;right:88px;bottom:68px;display:grid;grid-template-columns:1fr 1.45fr .8fr;gap:12px;}
#${id} .progress span{height:7px;background:var(--fg);}
</style>`,
      (id) =>
        `tl.from('#${id} .p1',{x:-100,autoAlpha:0,duration:.28,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .p2',{y:130,autoAlpha:0,duration:.32,ease:'power3.out'},.13);\n` +
        `tl.from('#${id} .p3',{x:110,autoAlpha:0,duration:.28,ease:'power3.out'},.28);\n` +
        `tl.from('#${id} .progress span',{scaleX:0,transformOrigin:'left',duration:.22,stagger:.08},.5);`,
    ),

  'release-poster': () =>
    mk(
      'bi2_rel',
      'release-poster',
      (id) => `
<div class="bi release">
  <div class="edition micro">PUBLIC RELEASE / FACT CHECK</div>
  <div class="statement head" data-edit>发布之前<br/><b>先补齐事实</b></div>
  <div class="facts">
    <div><span class="micro">日期</span><strong data-edit>需用户确认</strong></div>
    <div><span class="micro">地点</span><strong data-edit>需用户确认</strong></div>
    <div><span class="micro">行动</span><strong data-edit>需用户确认</strong></div>
  </div>
  <div class="hold head" data-edit>暂不生成假海报</div>
  <div class="issue num">ISSUE 06 / VERIFIED FACTS ONLY</div>
</div>
<style>${root(id)}
#${id} .release{background:var(--fg);color:var(--paper);}
#${id} .edition{position:absolute;left:98px;top:72px;}
#${id} .statement{position:absolute;left:90px;top:180px;font-size:142px;line-height:1.08;letter-spacing:-.04em;}
#${id} .statement b{color:var(--accent-2);}
#${id} .facts{position:absolute;left:1030px;right:90px;top:116px;bottom:116px;border-left:6px solid var(--paper);padding-left:72px;display:flex;flex-direction:column;justify-content:center;gap:62px;}
#${id} .facts div{border-bottom:3px solid #ffffff77;padding-bottom:22px;}
#${id} .facts span{display:block;color:var(--accent-2);}
#${id} .facts strong{display:block;margin-top:18px;font-size:34px;letter-spacing:.06em;}
#${id} .hold{position:absolute;left:90px;bottom:136px;background:var(--paper);color:var(--fg);font-size:53px;padding:18px 28px 23px;}
#${id} .issue{position:absolute;left:94px;bottom:70px;font-size:22px;letter-spacing:.15em;}
</style>`,
      (id) =>
        `tl.from('#${id} .statement',{x:-140,autoAlpha:0,duration:.32,ease:'power3.out'},0);\n` +
        `tl.from('#${id} .facts',{x:150,autoAlpha:0,duration:.32,ease:'power3.out'},.12);\n` +
        `tl.from('#${id} .facts div',{autoAlpha:0,y:18,duration:.2,stagger:.08},.34);\n` +
        `tl.from('#${id} .hold',{y:80,autoAlpha:0,duration:.25,ease:'power3.out'},.55);`,
    ),
};
