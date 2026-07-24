/* ================================================================
   Journal — newspaper-front-page dialect: double-rule masthead, faux columns, red-pen annotations
   ================================================================ */

import { type Block, mk } from './shared';

const jnFake = (n: number, w = 100): string =>
  Array.from({ length: n }, (_, i) => `<i style="width:${i === n - 1 ? 62 : w}%"></i>`).join('');

export const blocks: Record<string, () => Block> = {
  'title-card': () =>
    mk(
      'jn_ttl',
      'title-card',
      (id) => `
<div class="rt">
  <div class="mast"><span class="d">VOL.24</span><span class="m">视 频 日 报</span><span class="d">2026·07</span></div>
  <div class="h">把观点讲成画面</div>
  <div class="deck">本刊记者 · 三分钟看懂结构化表达</div>
  <div class="cols"><div class="col">${jnFake(6)}</div><div class="col">${jnFake(6)}</div><div class="col">${jnFake(6)}</div></div>
  <div class="stamp">头条</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:110px 150px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;gap:44px;}
#${id} .mast{display:flex;align-items:baseline;justify-content:space-between;border-bottom:6px double var(--fg);padding-bottom:26px;}
#${id} .m{font-size:60px;font-weight:900;letter-spacing:0.3em;}
#${id} .d{font-family:var(--font-num);font-size:30px;color:var(--muted);}
#${id} .h{font-size:150px;font-weight:900;line-height:1.05;text-align:center;}
#${id} .deck{text-align:center;font-size:40px;color:var(--muted);border-top:2px solid var(--line);border-bottom:2px solid var(--line);padding:20px 0;}
#${id} .cols{display:flex;gap:56px;flex:1;min-height:0;}
#${id} .col{flex:1;display:flex;flex-direction:column;gap:22px;border-right:2px solid var(--line);padding-right:56px;}
#${id} .col:last-child{border-right:none;padding-right:0;}
#${id} .col i{height:14px;background:var(--panel-2);display:block;}
#${id} .stamp{position:absolute;right:120px;top:280px;transform:rotate(9deg);border:6px solid var(--accent);color:var(--accent);font-size:56px;font-weight:900;padding:14px 34px;border-radius:8px;opacity:0.9;}
</style>`,
      (id) =>
        `tl.from('#${id} .mast',{autoAlpha:0,y:-24,duration:0.26},0);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,duration:0.32},0.12);\n` +
        `tl.from('#${id} .deck,#${id} .cols',{autoAlpha:0,duration:0.3},0.3);\n` +
        `tl.from('#${id} .stamp',{scale:1.7,autoAlpha:0,rotation:24,duration:0.3,ease:'power3.in'},0.5);`,
    ),
  'chapters': () =>
    mk(
      'jn_sec',
      'chapters',
      (id) => `
<div class="rt">
  <div class="nav">
    <div class="s"><b>要闻</b><i>P.01</i></div>
    <div class="s on"><b>深度</b><i>P.04</i><em class="ul"></em></div>
    <div class="s"><b>专栏</b><i>P.08</i></div>
  </div>
  <div class="h">完播率是设计出来的</div>
  <div class="cols"><div class="col">${jnFake(7)}</div><div class="col">${jnFake(7)}</div><div class="col">${jnFake(7)}</div></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:110px 150px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;gap:48px;}
#${id} .nav{display:flex;border-top:6px double var(--fg);border-bottom:2px solid var(--fg);}
#${id} .s{position:relative;flex:1;display:flex;align-items:baseline;justify-content:center;gap:26px;padding:36px 0 30px;border-right:2px solid var(--line);}
#${id} .s:last-child{border-right:none;}
#${id} .s b{font-size:54px;font-weight:900;letter-spacing:0.22em;padding-left:0.22em;color:var(--muted);}
#${id} .s i{font-style:normal;font-family:var(--font-num);font-size:30px;color:var(--muted);}
#${id} .s.on b{color:var(--fg);}
#${id} .s.on i{color:var(--accent);font-weight:700;}
#${id} .ul{position:absolute;left:22%;right:22%;bottom:0;height:10px;background:var(--accent);}
#${id} .h{font-size:120px;font-weight:900;line-height:1.1;text-align:center;}
#${id} .cols{display:flex;gap:56px;flex:1;min-height:0;}
#${id} .col{flex:1;display:flex;flex-direction:column;gap:22px;border-right:2px solid var(--line);padding-right:56px;}
#${id} .col:last-child{border-right:none;padding-right:0;}
#${id} .col i{height:14px;background:var(--panel-2);display:block;}
</style>`,
      (id) =>
        `tl.from('#${id} .nav',{autoAlpha:0,y:-24,duration:0.26},0);\n` +
        `tl.from('#${id} .s',{autoAlpha:0,duration:0.2,stagger:0.08},0.08);\n` +
        `tl.from('#${id} .ul',{scaleX:0,transformOrigin:'left center',duration:0.28,ease:'power2.out'},0.36);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,duration:0.32},0.46);\n` +
        `tl.from('#${id} .cols',{autoAlpha:0,duration:0.3},0.66);`,
    ),
  'list': () =>
    mk(
      'jn_lst',
      'list',
      (id) => `
<div class="rt">
  <div class="cap">本 期 要 目</div>
  <div class="r"><b>一</b><span>先说结论,再给理由</span><i>P.02</i></div>
  <div class="r"><b>二</b><span>每个论点配一张图</span><i>P.05</i></div>
  <div class="r"><b>三</b><span>结尾回扣开场钩子</span><i>P.09</i></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:170px 260px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;justify-content:center;gap:0;}
#${id} .cap{text-align:center;font-size:64px;font-weight:900;letter-spacing:0.4em;border-top:6px double var(--fg);border-bottom:2px solid var(--fg);padding:30px 0;margin-bottom:20px;}
#${id} .r{display:flex;align-items:baseline;gap:56px;padding:52px 10px;border-bottom:2px solid var(--line);font-size:64px;}
#${id} .r b{color:var(--accent);font-weight:900;}
#${id} .r span{flex:1;font-weight:600;}
#${id} .r i{font-style:normal;font-family:var(--font-num);font-size:38px;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .r',{autoAlpha:0,x:-40,duration:0.26,stagger:0.11},0.16);`,
    ),
  'compare': () =>
    mk(
      'jn_cmp',
      'compare',
      (id) => `
<div class="rt">
  <div class="cap">本报评测</div>
  <div class="tbl">
    <div class="tr th"><span></span><span>耗时</span><span>成本</span><span>结论</span></div>
    <div class="tr"><span>老办法</span><span>3 天</span><span>¥1200</span><span>—</span></div>
    <div class="tr win"><span>新办法</span><span>3 小时</span><span>¥90</span><span class="mark">推荐</span></div>
  </div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:150px 200px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;justify-content:center;gap:54px;}
#${id} .cap{font-size:76px;font-weight:900;border-left:none;text-align:center;letter-spacing:0.3em;}
#${id} .tbl{border-top:6px double var(--fg);border-bottom:6px double var(--fg);}
#${id} .tr{display:flex;border-bottom:2px solid var(--line);font-size:56px;}
#${id} .tr:last-child{border-bottom:none;}
#${id} .tr span{flex:1;padding:44px 30px;text-align:center;}
#${id} .tr span:first-child{text-align:left;font-weight:700;}
#${id} .th{font-size:40px;color:var(--muted);letter-spacing:0.2em;}
#${id} .th span{padding:26px 30px;}
#${id} .win{font-weight:700;}
#${id} .mark{position:relative;color:var(--accent);font-weight:900;}
#${id} .mark::after{content:'';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-4deg);width:170px;height:96px;border:5px solid var(--accent);border-radius:50%;}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.26},0);\n` +
        `tl.from('#${id} .tr',{autoAlpha:0,duration:0.24,stagger:0.1},0.14);\n` +
        `tl.from('#${id} .mark',{scale:1.4,duration:0.24,ease:'power3.in'},0.5);`,
    ),
  'quote': () =>
    mk(
      'jn_qte',
      'quote',
      (id) => `
<div class="rt">
  <div class="rule top"></div>
  <div class="dash">——</div>
  <div class="t">结构,是给观众的礼貌</div>
  <div class="a">摘自本期口播 · 02'14"</div>
  <div class="rule"></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:150px 240px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:44px;text-align:center;}
#${id} .rule{width:100%;height:10px;border-top:4px solid var(--fg);border-bottom:2px solid var(--fg);}
#${id} .dash{font-size:110px;font-weight:900;color:var(--accent);line-height:0.6;}
#${id} .t{font-size:128px;font-weight:800;line-height:1.3;}
#${id} .a{font-size:38px;color:var(--muted);font-family:var(--font-num);}
</style>`,
      (id) =>
        `tl.from('#${id} .rule',{scaleX:0,duration:0.34,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .dash',{autoAlpha:0,x:-40,duration:0.26},0.16);\n` +
        `tl.from('#${id} .t',{autoAlpha:0,duration:0.34},0.26);\n` +
        `tl.from('#${id} .a',{autoAlpha:0,duration:0.26},0.5);`,
    ),
  'qa': () =>
    mk(
      'jn_qa',
      'qa',
      (id) => `
<div class="rt">
  <div class="cap">读 者 来 信</div>
  <div class="q"><b class="m qm">问</b><div class="qt">「为什么我的视频总在三秒被划走?」</div></div>
  <div class="ans"><b class="m am">答</b>
    <div class="ab">
      <div class="at">开场第一句就把结论亮出来,画面跟着上证据</div>
      <div class="fk">${jnFake(3)}</div>
      <div class="sig">—— 本报编辑部</div>
    </div>
  </div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:120px 240px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;gap:56px;}
#${id} .cap{text-align:center;font-size:56px;font-weight:900;letter-spacing:0.4em;padding-left:0.4em;border-top:6px double var(--fg);border-bottom:2px solid var(--fg);padding-top:26px;padding-bottom:26px;}
#${id} .q{display:flex;align-items:flex-start;gap:44px;}
#${id} .m{flex:none;width:96px;height:96px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:46px;font-weight:900;}
#${id} .qm{border:5px solid var(--accent);color:var(--accent);transform:rotate(-6deg);}
#${id} .am{border:4px solid var(--fg);}
#${id} .qt{flex:1;font-size:64px;font-weight:800;line-height:1.4;padding-top:4px;}
#${id} .ans{display:flex;align-items:flex-start;gap:44px;border-top:2px solid var(--line);padding-top:52px;}
#${id} .ab{flex:1;display:flex;flex-direction:column;gap:34px;}
#${id} .at{font-size:50px;font-weight:600;line-height:1.5;}
#${id} .fk{display:flex;flex-direction:column;gap:20px;}
#${id} .fk i{height:14px;background:var(--panel-2);display:block;}
#${id} .sig{text-align:right;font-family:var(--font-num);font-size:34px;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.26},0);\n` +
        `tl.from('#${id} .qt',{autoAlpha:0,x:-40,duration:0.28},0.12);\n` +
        `tl.from('#${id} .qm',{scale:1.7,autoAlpha:0,rotation:18,duration:0.28,ease:'power3.in'},0.3);\n` +
        `tl.from('#${id} .ans',{autoAlpha:0,duration:0.26},0.5);\n` +
        `tl.from('#${id} .at,#${id} .fk,#${id} .sig',{autoAlpha:0,y:20,duration:0.26,stagger:0.08},0.6);`,
    ),
  'chart': () =>
    mk(
      'jn_bar',
      'chart',
      (id) => `
<div class="rt">
  <div class="cap">数 据 版</div>
  <div class="plot">
    <div class="b"><em>36</em><i style="height:160px"></i><span>周三</span></div>
    <div class="b"><em>52</em><i style="height:230px"></i><span>周四</span></div>
    <div class="b"><em>48</em><i style="height:210px"></i><span>周五</span></div>
    <div class="b key"><em>98</em><i style="height:400px"></i><span>周六</span></div>
    <div class="b"><em>61</em><i style="height:270px"></i><span>周日</span></div>
  </div>
  <div class="src">单位:万次播放 · 本报资料室制图</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:130px 240px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;justify-content:center;gap:54px;}
#${id} .cap{text-align:center;font-size:64px;font-weight:900;letter-spacing:0.4em;padding-left:0.4em;border-top:6px double var(--fg);border-bottom:2px solid var(--fg);padding-top:26px;padding-bottom:26px;}
#${id} .plot{display:flex;align-items:flex-end;justify-content:space-between;padding:0 90px;border-bottom:4px solid var(--fg);border-left:2px solid var(--line);height:450px;}
#${id} .b{position:relative;display:flex;flex-direction:column;align-items:center;gap:16px;width:120px;}
#${id} .b em{font-style:normal;font-family:var(--font-num);font-size:32px;color:var(--muted);}
#${id} .b i{width:44px;background:var(--fg);display:block;}
#${id} .b span{position:absolute;top:calc(100% + 22px);font-size:34px;color:var(--muted);}
#${id} .b.key em{color:var(--accent);font-weight:700;}
#${id} .b.key i{background:var(--accent);}
#${id} .src{margin-top:42px;border-top:6px double var(--fg);padding-top:26px;text-align:center;font-family:var(--font-num);font-size:32px;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,duration:0.26},0);\n` +
        `tl.from('#${id} .plot',{autoAlpha:0,duration:0.24},0.1);\n` +
        `tl.from('#${id} .b i',{scaleY:0,transformOrigin:'bottom',duration:0.3,stagger:0.07,ease:'power2.out'},0.16);\n` +
        `tl.from('#${id} .b em',{autoAlpha:0,duration:0.22,stagger:0.07},0.34);\n` +
        `tl.from('#${id} .src',{autoAlpha:0,duration:0.26},0.7);`,
    ),
  'lower-third': () =>
    mk(
      'jn_low',
      'lower-third',
      (id) => `
<div class="rt">
  <div class="ph"><span class="sec">人物专访</span><span class="no">A04</span></div>
  <div class="fk">${jnFake(4)}</div>
  <div class="by"><b>沈知行</b><span class="role">本报记者</span><i class="lead"></i><span class="desk">THE GROWTH DESK</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:100px 150px 130px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;}
#${id} .ph{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid var(--line);padding-bottom:22px;}
#${id} .sec{font-size:36px;font-weight:900;letter-spacing:0.3em;}
#${id} .no{font-family:var(--font-num);font-size:32px;font-weight:700;color:var(--accent);letter-spacing:0.2em;}
#${id} .fk{margin-top:36px;width:520px;display:flex;flex-direction:column;gap:22px;}
#${id} .fk i{height:14px;background:var(--panel-2);display:block;}
#${id} .by{margin-top:auto;display:flex;align-items:baseline;gap:44px;border-top:4px solid var(--fg);border-bottom:2px solid var(--fg);padding:42px 10px;}
#${id} .by b{font-size:76px;font-weight:900;letter-spacing:0.08em;}
#${id} .role{font-size:36px;color:var(--muted);letter-spacing:0.3em;}
#${id} .lead{flex:1;border-bottom:2px solid var(--line);transform:translateY(-14px);}
#${id} .desk{font-family:var(--font-num);font-size:30px;color:var(--muted);letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .ph',{autoAlpha:0,y:-16,duration:0.24},0);\n` +
        `tl.from('#${id} .fk i',{autoAlpha:0,duration:0.18,stagger:0.05},0.1);\n` +
        `tl.from('#${id} .by',{autoAlpha:0,y:26,duration:0.3,ease:'power2.out'},0.28);\n` +
        `tl.from('#${id} .by b,#${id} .role,#${id} .desk',{autoAlpha:0,duration:0.24,stagger:0.08},0.42);\n` +
        `tl.from('#${id} .lead',{scaleX:0,transformOrigin:'left center',duration:0.3},0.5);`,
    ),
  'cta': () =>
    mk(
      'jn_cta',
      'cta',
      (id) => `
<div class="rt">
  <div class="cap">读 者 服 务</div>
  <div class="ad">
    <div class="inner">
      <div class="h">订阅本刊</div>
      <div class="s">点下关注 · 每周更新 · 不错过下一期头版</div>
      <div class="m">广告部敬启 · 第 24 版</div>
    </div>
    <div class="stamp">免费</div>
  </div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:120px 300px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:56px;}
#${id} .cap{font-size:48px;font-weight:900;letter-spacing:0.5em;padding-left:0.5em;border-bottom:2px solid var(--line);padding-bottom:24px;}
#${id} .ad{position:relative;align-self:stretch;border:4px solid var(--fg);padding:16px;}
#${id} .inner{border:2px solid var(--line);padding:84px 80px;display:flex;flex-direction:column;align-items:center;gap:40px;text-align:center;}
#${id} .h{font-size:150px;font-weight:900;line-height:1.05;}
#${id} .s{font-size:42px;color:var(--muted);border-top:2px solid var(--line);border-bottom:2px solid var(--line);padding:20px 30px;}
#${id} .m{font-family:var(--font-num);font-size:30px;color:var(--muted);}
#${id} .stamp{position:absolute;right:-80px;top:-70px;transform:rotate(9deg);border:6px solid var(--accent);color:var(--accent);font-size:56px;font-weight:900;padding:14px 34px;border-radius:8px;opacity:0.9;}
</style>`,
      (id) =>
        `tl.from('#${id} .cap',{autoAlpha:0,y:-20,duration:0.26},0);\n` +
        `tl.from('#${id} .ad',{autoAlpha:0,y:30,duration:0.3},0.12);\n` +
        `tl.from('#${id} .s,#${id} .m',{autoAlpha:0,duration:0.26},0.34);\n` +
        `tl.from('#${id} .stamp',{scale:1.7,autoAlpha:0,rotation:24,duration:0.3,ease:'power3.in'},0.52);`,
    ),
};

/** Cover — list thumbnail: the theme name is the hero (see showcase-blocks.ts). */
export const cover: () => Block = () =>
    mk(
      'cv_jn',
      '封面',
      (id) => `
<div class="rt">
  <div class="mast"><span class="d">VOL.01</span><span class="m">视 频 日 报</span><span class="d">FRAME</span></div>
  <div class="h">报刊</div>
  <div class="deck">JOURNAL · 纸墨与一枚红章</div>
  <div class="stamp">创刊</div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;padding:120px 170px;color:var(--fg);font-family:var(--font-head);display:flex;flex-direction:column;align-items:center;gap:40px;}
#${id} .mast{width:100%;display:flex;align-items:baseline;justify-content:space-between;border-bottom:6px double var(--fg);padding-bottom:28px;}
#${id} .m{font-size:56px;font-weight:900;letter-spacing:0.3em;}
#${id} .d{font-family:var(--font-num);font-size:30px;color:var(--muted);}
#${id} .h{font-size:330px;font-weight:900;line-height:1.05;}
#${id} .deck{width:100%;text-align:center;font-size:42px;color:var(--muted);border-top:2px solid var(--line);border-bottom:2px solid var(--line);padding:22px 0;}
#${id} .stamp{position:absolute;right:200px;top:300px;transform:rotate(10deg);border:6px solid var(--accent);color:var(--accent);font-size:60px;font-weight:900;padding:16px 36px;border-radius:8px;}
</style>`,
      (id) => `tl.from('#${id} .mast',{autoAlpha:0,y:-20,duration:0.26},0);\ntl.from('#${id} .h',{autoAlpha:0,duration:0.32},0.12);\ntl.from('#${id} .deck',{autoAlpha:0,duration:0.26},0.3);\ntl.from('#${id} .stamp',{scale:1.8,autoAlpha:0,rotation:26,duration:0.3,ease:'power3.in'},0.44);`,
    );
