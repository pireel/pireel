/**
 * 简报 Boardroom —— 商务咨询方言:顶部通栏蓝条、章节页眉、结论先行标题、
 * KPI 卡组、平涂柱图、SOURCE 脚注。版式逻辑:左对齐网格精密排布,零旋转零装饰。
 */

import { type Block, mk } from './shared';

const bdRoot = (id: string) => `
#${id} .bd{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);}
#${id} .top{position:absolute;left:0;right:0;top:0;height:10px;background:var(--accent);}
#${id} .hd{position:absolute;left:120px;right:120px;top:92px;display:flex;align-items:baseline;gap:34px;border-bottom:2px solid var(--line);padding-bottom:26px;}
#${id} .hd .no{font-family:var(--font-num);font-size:34px;font-weight:700;color:var(--accent);}
#${id} .hd .sec{font-size:38px;font-weight:700;border-left:2px solid var(--line);padding-left:34px;}
#${id} .hd .sp{flex:1;}
#${id} .hd .pg{font-family:var(--font-num);font-size:28px;color:var(--muted);letter-spacing:0.06em;}
#${id} .ft{position:absolute;left:120px;right:120px;bottom:76px;border-top:1px solid var(--line);padding-top:22px;display:flex;justify-content:space-between;font-family:var(--font-num);font-size:28px;color:var(--muted);letter-spacing:0.06em;}`;

export const cover: () => Block = () =>
  mk(
    'cv_bd',
    '封面',
    (id) => `
<div class="bd"><div class="top"></div>
  <div class="hd"><span class="no">00</span><span class="sec">FRAME</span><span class="sp"></span><span class="pg">P.00 / 12</span></div>
  <div class="c">
    <div class="h">简报</div>
    <div class="s">BOARDROOM · 结论先行</div>
  </div>
  <div class="ft"><span>PIREEL ADVISORY</span><span>CONFIDENTIAL</span></div>
</div>
<style>${bdRoot(id)}
#${id} .c{position:absolute;left:120px;top:330px;right:120px;display:flex;flex-direction:column;gap:48px;}
#${id} .h{font-size:290px;font-weight:800;line-height:1;letter-spacing:0.02em;}
#${id} .s{font-family:var(--font-num);font-size:36px;font-weight:700;letter-spacing:0.28em;color:var(--accent);}
</style>`,
    (id) =>
      `tl.from('#${id} .top',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.out'},0);\n` +
      `tl.from('#${id} .hd',{autoAlpha:0,duration:0.24},0.14);\n` +
      `tl.from('#${id} .h',{y:30,autoAlpha:0,duration:0.3,ease:'power2.out'},0.22);\n` +
      `tl.from('#${id} .s,#${id} .ft',{autoAlpha:0,duration:0.26},0.5);`,
  );

export const blocks: Record<string, () => Block> = {
  标题卡: () =>
    mk(
      'bd_ttl',
      '标题卡',
      (id) => `
<div class="bd"><div class="top"></div>
  <div class="hd"><span class="no">01</span><span class="sec">执行摘要</span><span class="sp"></span><span class="pg">P.01 / 12</span></div>
  <div class="ttl">获客成本翻倍,<br/>复购把这笔账拉平了</div>
  <div class="kpis">
    <div class="kpi"><span>获客成本 CAC</span><b>¥86</b><i class="bad">▲ 102%</i></div>
    <div class="kpi"><span>90 天复购率</span><b>41%</b><i class="good">▲ 9.4pt</i></div>
    <div class="kpi"><span>回本周期</span><b>4.2<em>月</em></b><i class="good">▼ 1.1月</i></div>
  </div>
  <div class="ft"><span>SOURCE: 经营月报 2026-06</span><span>PIREEL ADVISORY</span></div>
</div>
<style>${bdRoot(id)}
#${id} .bd{background-color:var(--paper);}
#${id} .ttl{position:absolute;left:120px;right:120px;top:246px;font-size:84px;font-weight:700;line-height:1.32;letter-spacing:0.01em;}
#${id} .kpis{position:absolute;left:120px;right:120px;top:566px;display:flex;gap:32px;}
#${id} .kpi{flex:1;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:44px 48px;display:flex;flex-direction:column;gap:20px;}
#${id} .kpi span{font-size:29px;color:var(--muted);letter-spacing:0.08em;}
#${id} .kpi b{font-family:var(--font-num);font-size:92px;font-weight:700;line-height:1;}
#${id} .kpi b em{font-style:normal;font-size:44px;color:var(--muted);margin-left:8px;}
#${id} .kpi i{font-style:normal;font-family:var(--font-num);font-size:32px;font-weight:700;}
#${id} .kpi i.good{color:var(--accent);}
#${id} .kpi i.bad{color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .hd',{autoAlpha:0,duration:0.24},0.12);\n` +
        `tl.from('#${id} .ttl',{y:30,autoAlpha:0,duration:0.3,ease:'power2.out'},0.2);\n` +
        `tl.from('#${id} .kpi',{y:26,autoAlpha:0,duration:0.26,stagger:0.09,ease:'power2.out'},0.42);\n` +
        `tl.from('#${id} .ft',{autoAlpha:0,duration:0.24},0.78);`,
    ),
  章节: () =>
    mk(
      'bd_agd',
      '章节',
      (id) => `
<div class="bd"><div class="top"></div>
  <div class="hd"><span class="no">02</span><span class="sec">议程</span><span class="sp"></span><span class="pg">P.03 / 12</span></div>
  <div class="bc"><span class="tag">AGENDA</span>
    <div class="it"><span>01</span><b>复盘</b></div><i>/</i>
    <div class="it cur"><span>02</span><b>目标</b></div><i>/</i>
    <div class="it"><span>03</span><b>打法</b></div>
  </div>
  <div class="big">目标</div>
  <div class="sub">明年增长从哪里来,靠什么守住</div>
  <div class="ft"><span>SOURCE: 年度经营会 2026-07</span><span>PIREEL ADVISORY</span></div>
</div>
<style>${bdRoot(id)}
#${id} .bd{background-color:var(--paper);}
#${id} .bc{position:absolute;left:120px;right:120px;top:280px;display:flex;align-items:baseline;gap:40px;}
#${id} .bc .tag{font-family:var(--font-num);font-size:30px;font-weight:700;color:var(--muted);letter-spacing:0.2em;margin-right:16px;}
#${id} .bc i{font-style:normal;font-family:var(--font-num);font-size:38px;color:var(--muted);opacity:0.5;}
#${id} .it{display:flex;align-items:baseline;gap:18px;padding-bottom:16px;color:var(--muted);}
#${id} .it span{font-family:var(--font-num);font-size:32px;font-weight:700;}
#${id} .it b{font-size:44px;font-weight:600;}
#${id} .it.cur{color:var(--fg);border-bottom:6px solid var(--accent);}
#${id} .it.cur span{color:var(--accent);}
#${id} .it.cur b{font-weight:700;}
#${id} .big{position:absolute;left:120px;top:436px;font-size:280px;font-weight:800;line-height:1;letter-spacing:0.02em;}
#${id} .sub{position:absolute;left:120px;top:790px;font-size:40px;color:var(--muted);letter-spacing:0.04em;}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .hd',{autoAlpha:0,duration:0.24},0.12);\n` +
        `tl.from('#${id} .bc .tag',{autoAlpha:0,duration:0.22},0.2);\n` +
        `tl.from('#${id} .it,#${id} .bc i',{x:-20,autoAlpha:0,duration:0.24,stagger:0.07,ease:'power2.out'},0.26);\n` +
        `tl.from('#${id} .big',{y:30,autoAlpha:0,duration:0.3,ease:'power2.out'},0.56);\n` +
        `tl.from('#${id} .sub',{autoAlpha:0,duration:0.24},0.76);\n` +
        `tl.from('#${id} .ft',{autoAlpha:0,duration:0.24},0.88);`,
    ),
  图表: () =>
    mk(
      'bd_bar',
      '图表',
      (id) => `
<div class="bd"><div class="top"></div>
  <div class="hd"><span class="no">03</span><span class="sec">季度营收</span><span class="sp"></span><span class="pg">P.07 / 12</span></div>
  <div class="ttl2">Q4 冲到 3.6 亿,只有 Q3 掉过队</div>
  <div class="plot">
    <div class="gl"><i></i><i></i><i></i><i></i></div>
    <div class="base"></div>
    <div class="bars">
      <div class="bg"><b>1.8亿</b><i style="height:200px"></i><span>Q1</span></div>
      <div class="bg"><b>2.4亿</b><i style="height:267px"></i><span>Q2</span></div>
      <div class="bg dim"><b>2.1亿 ▼</b><i style="height:233px"></i><span>Q3</span></div>
      <div class="bg"><b>3.6亿</b><i style="height:400px"></i><span>Q4</span></div>
    </div>
  </div>
  <div class="ft"><span>SOURCE: 财务系统 · 未经审计</span><span>单位: 人民币</span></div>
</div>
<style>${bdRoot(id)}
#${id} .bd{background-color:var(--paper);}
#${id} .ttl2{position:absolute;left:120px;right:120px;top:238px;font-size:64px;font-weight:700;letter-spacing:0.01em;}
#${id} .plot{position:absolute;left:120px;right:120px;top:396px;bottom:200px;}
#${id} .gl{position:absolute;left:0;right:0;top:0;bottom:70px;display:flex;flex-direction:column;justify-content:space-between;}
#${id} .gl i{height:1px;background:var(--line);}
#${id} .base{position:absolute;left:0;right:0;bottom:70px;height:2px;background:var(--fg);}
#${id} .bars{position:absolute;left:90px;right:90px;bottom:72px;display:flex;align-items:flex-end;justify-content:space-between;}
#${id} .bg{position:relative;width:230px;display:flex;flex-direction:column;align-items:center;gap:18px;}
#${id} .bg i{width:100%;background:var(--accent);display:block;}
#${id} .bg.dim i{background:var(--panel-2);border:2px solid var(--line);}
#${id} .bg b{font-family:var(--font-num);font-size:36px;font-weight:700;}
#${id} .bg.dim b{color:var(--accent-2);}
#${id} .bg span{position:absolute;bottom:-56px;font-family:var(--font-num);font-size:30px;color:var(--muted);letter-spacing:0.1em;}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .hd,#${id} .ttl2',{autoAlpha:0,duration:0.26},0.12);\n` +
        `tl.from('#${id} .gl,#${id} .base',{autoAlpha:0,duration:0.24},0.24);\n` +
        `tl.from('#${id} .bg i',{scaleY:0,transformOrigin:'bottom',duration:0.32,stagger:0.1,ease:'power2.out'},0.32);\n` +
        `tl.from('#${id} .bg b,#${id} .bg span',{autoAlpha:0,duration:0.22},0.78);\n` +
        `tl.from('#${id} .ft',{autoAlpha:0,duration:0.22},0.9);`,
    ),
  列表: () =>
    mk(
      'bd_lst',
      '列表',
      (id) => `
<div class="bd"><div class="top"></div>
  <div class="hd"><span class="no">02</span><span class="sec">三项行动</span><span class="sp"></span><span class="pg">P.04 / 12</span></div>
  <div class="ttl2">先止血,再提效,最后才谈扩张</div>
  <div class="rows">
    <div class="r"><span class="n">01</span><div class="t"><b>暂停回报不到 1 的投流计划</b><span>本周内 · 市场部</span></div><i class="st on">进行中</i></div>
    <div class="r"><span class="n">02</span><div class="t"><b>会员券替代全站折扣</b><span>两周内 · 增长组</span></div><i class="st">待启动</i></div>
    <div class="r"><span class="n">03</span><div class="t"><b>新城市仓配试点缓半年</b><span>Q4 复议 · 管理层</span></div><i class="st hold">已冻结</i></div>
  </div>
  <div class="ft"><span>SOURCE: 经营例会决议 2026-07</span><span>OWNERS CONFIRMED</span></div>
</div>
<style>${bdRoot(id)}
#${id} .bd{background-color:var(--paper);}
#${id} .ttl2{position:absolute;left:120px;right:120px;top:238px;font-size:64px;font-weight:700;letter-spacing:0.01em;}
#${id} .rows{position:absolute;left:120px;right:120px;top:392px;display:flex;flex-direction:column;}
#${id} .r{display:flex;align-items:center;gap:48px;padding:44px 8px;border-bottom:1px solid var(--line);}
#${id} .r .n{font-family:var(--font-num);font-size:40px;font-weight:700;color:var(--accent);}
#${id} .r .t{flex:1;display:flex;flex-direction:column;gap:14px;}
#${id} .r .t b{font-size:52px;font-weight:600;}
#${id} .r .t span{font-family:var(--font-num);font-size:29px;color:var(--muted);letter-spacing:0.06em;}
#${id} .r .st{font-style:normal;font-family:var(--font-num);font-size:30px;font-weight:700;color:var(--muted);letter-spacing:0.1em;}
#${id} .r .st.on{color:var(--accent);}
#${id} .r .st.hold{color:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .hd,#${id} .ttl2',{autoAlpha:0,duration:0.26},0.12);\n` +
        `tl.from('#${id} .r',{x:-24,autoAlpha:0,duration:0.26,stagger:0.11,ease:'power2.out'},0.3);\n` +
        `tl.from('#${id} .ft',{autoAlpha:0,duration:0.22},0.78);`,
    ),
  大数字: () =>
    mk(
      'bd_num',
      '大数字',
      (id) => `
<div class="bd"><div class="top"></div>
  <div class="hd"><span class="no">04</span><span class="sec">核心指标</span><span class="sp"></span><span class="pg">P.09 / 12</span></div>
  <div class="lab">月度经常性收入 MRR</div>
  <div class="giant">¥2,400<em>万</em></div>
  <div class="row"><i class="chip">▲ 18.6%</i><span>环比上月 · 连续六个月正增长</span></div>
  <div class="ft"><span>SOURCE: 订阅系统 2026-06</span><span>PIREEL ADVISORY</span></div>
</div>
<style>${bdRoot(id)}
#${id} .bd{background-color:var(--paper);}
#${id} .lab{position:absolute;left:120px;top:270px;font-size:36px;color:var(--muted);letter-spacing:0.08em;}
#${id} .giant{position:absolute;left:120px;top:366px;font-family:var(--font-num);font-size:300px;font-weight:700;line-height:1;letter-spacing:-0.01em;}
#${id} .giant em{font-style:normal;font-size:120px;color:var(--muted);margin-left:16px;}
#${id} .row{position:absolute;left:120px;top:756px;display:flex;align-items:center;gap:40px;}
#${id} .chip{font-style:normal;font-family:var(--font-num);font-size:40px;font-weight:700;background:var(--accent);color:var(--paper);border-radius:999px;padding:18px 44px;}
#${id} .row span{font-size:32px;color:var(--muted);letter-spacing:0.06em;}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .hd',{autoAlpha:0,duration:0.24},0.12);\n` +
        `tl.from('#${id} .lab',{autoAlpha:0,duration:0.24},0.2);\n` +
        `tl.from('#${id} .giant',{y:30,autoAlpha:0,duration:0.32,ease:'power2.out'},0.26);\n` +
        `tl.from('#${id} .row',{y:20,autoAlpha:0,duration:0.26,ease:'power2.out'},0.52);\n` +
        `tl.from('#${id} .ft',{autoAlpha:0,duration:0.24},0.72);`,
    ),
  数字变化: () =>
    mk(
      'bd_cnt',
      '数字变化',
      (id) => `
<div class="bd"><div class="top"></div>
  <div class="hd"><span class="no">06</span><span class="sec">年度盘点</span><span class="sp"></span><span class="pg">P.11 / 12</span></div>
  <div class="lab">全国门店数 STORE COUNT</div>
  <div class="giant"><b class="v">1268</b><em>家</em></div>
  <div class="yoy"><i>▲ 12.8%</i><span>同比去年 · 净新开 144 家</span></div>
  <div class="ft"><span>SOURCE: 门店运营台账 2026-06</span><span>PIREEL ADVISORY</span></div>
</div>
<style>${bdRoot(id)}
#${id} .bd{background-color:var(--paper);}
#${id} .lab{position:absolute;left:120px;top:270px;font-size:36px;color:var(--muted);letter-spacing:0.08em;}
#${id} .giant{position:absolute;left:120px;top:366px;display:flex;align-items:baseline;}
#${id} .giant .v{font-family:var(--font-num);font-size:300px;font-weight:700;line-height:1;letter-spacing:-0.01em;}
#${id} .giant em{font-style:normal;font-family:var(--font-num);font-size:120px;font-weight:700;color:var(--muted);margin-left:20px;}
#${id} .yoy{position:absolute;left:120px;top:760px;display:flex;align-items:baseline;gap:44px;}
#${id} .yoy i{font-style:normal;font-family:var(--font-num);font-size:64px;font-weight:700;color:var(--accent);}
#${id} .yoy span{font-size:32px;color:var(--muted);letter-spacing:0.06em;}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .hd',{autoAlpha:0,duration:0.24},0.12);\n` +
        `tl.from('#${id} .lab',{autoAlpha:0,duration:0.24},0.2);\n` +
        `tl.from('#${id} .giant',{y:30,autoAlpha:0,duration:0.32,ease:'power2.out'},0.2);\n` +
        `tl.from('#${id} .v',{innerText:1124,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .yoy',{y:20,autoAlpha:0,duration:0.26,ease:'power2.out'},0.62);\n` +
        `tl.from('#${id} .ft',{autoAlpha:0,duration:0.24},0.86);`,
    ),
  对比: () =>
    mk(
      'bd_cmp',
      '对比',
      (id) => `
<div class="bd"><div class="top"></div>
  <div class="hd"><span class="no">05</span><span class="sec">方案对比</span><span class="sp"></span><span class="pg">P.10 / 12</span></div>
  <div class="ttl2">同样的目标,方案 B 只花一半的钱</div>
  <div class="tbl">
    <div class="col">
      <div class="ch">方案 A · 自建团队</div>
      <div class="tr"><i class="ok">✓</i><span>节奏完全可控</span></div>
      <div class="tr"><i class="nx">✕</i><span>成本 ¥120万 / 年</span></div>
      <div class="tr"><i class="nx">✕</i><span>6 个月才能就位</span></div>
    </div>
    <div class="col">
      <div class="ch rec">方案 B · 代运营<em>推荐</em></div>
      <div class="tr"><i class="ok">✓</i><span>成本 ¥58万 / 年</span></div>
      <div class="tr"><i class="ok">✓</i><span>两周内启动</span></div>
      <div class="tr"><i class="nx">✕</i><span>知识沉淀在外部</span></div>
    </div>
  </div>
  <div class="ft"><span>SOURCE: 供应商询价 2026-06</span><span>DECISION PENDING</span></div>
</div>
<style>${bdRoot(id)}
#${id} .bd{background-color:var(--paper);}
#${id} .ttl2{position:absolute;left:120px;right:120px;top:238px;font-size:64px;font-weight:700;letter-spacing:0.01em;}
#${id} .tbl{position:absolute;left:120px;right:120px;top:392px;display:flex;gap:40px;}
#${id} .col{flex:1;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
#${id} .ch{padding:34px 48px;font-size:44px;font-weight:700;border-bottom:1px solid var(--line);}
#${id} .ch.rec{background:var(--accent);color:var(--paper);}
#${id} .ch em{font-style:normal;font-size:29px;font-weight:700;border:2px solid var(--paper);border-radius:999px;padding:6px 22px;margin-left:26px;vertical-align:middle;}
#${id} .tr{display:flex;align-items:center;gap:34px;padding:30px 48px;border-bottom:1px solid var(--line);font-size:40px;}
#${id} .tr:last-child{border-bottom:none;}
#${id} .tr i{font-style:normal;font-family:var(--font-num);font-size:40px;font-weight:700;}
#${id} .tr .ok{color:var(--accent);}
#${id} .tr .nx{color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .hd,#${id} .ttl2',{autoAlpha:0,duration:0.26},0.12);\n` +
        `tl.from('#${id} .col',{y:26,autoAlpha:0,duration:0.28,stagger:0.12,ease:'power2.out'},0.3);\n` +
        `tl.from('#${id} .ft',{autoAlpha:0,duration:0.22},0.74);`,
    ),
  走势: () =>
    mk(
      'bd_trd',
      '走势',
      (id) => `
<div class="bd"><div class="top"></div>
  <div class="hd"><span class="no">03</span><span class="sec">增长走势</span><span class="sp"></span><span class="pg">P.08 / 12</span></div>
  <div class="ttl2">连续四个季度抬头,年底看到 4 亿</div>
  <div class="plot">
    <div class="gl"><i></i><i></i><i></i><i></i></div>
    <div class="base"></div>
    <svg class="crv" viewBox="0 0 1560 420" preserveAspectRatio="none">
      <polyline class="ln" points="20,360 400,300 780,320 1160,150"/>
      <polyline class="proj" points="1160,150 1520,60"/>
      <g class="nd"><circle cx="20" cy="360" r="10"/><circle cx="400" cy="300" r="10"/><circle cx="780" cy="320" r="10"/><circle cx="1160" cy="150" r="14"/></g>
    </svg>
    <div class="xs"><span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span><span>Q1E</span></div>
    <div class="co"><b>4.0亿</b><span>2027 Q1 预测</span></div>
  </div>
  <div class="ft"><span>SOURCE: 财务系统 · 线性外推</span><span>单位: 人民币</span></div>
</div>
<style>${bdRoot(id)}
#${id} .bd{background-color:var(--paper);}
#${id} .ttl2{position:absolute;left:120px;right:120px;top:238px;font-size:64px;font-weight:700;letter-spacing:0.01em;}
#${id} .plot{position:absolute;left:120px;right:120px;top:396px;bottom:200px;}
#${id} .gl{position:absolute;left:0;right:0;top:0;bottom:70px;display:flex;flex-direction:column;justify-content:space-between;}
#${id} .gl i{height:1px;background:var(--line);}
#${id} .base{position:absolute;left:0;right:0;bottom:70px;height:2px;background:var(--fg);}
#${id} .crv{position:absolute;left:0;right:0;top:0;bottom:74px;width:100%;height:calc(100% - 74px);}
#${id} .ln{fill:none;stroke:var(--accent);stroke-width:6;stroke-dasharray:2000;stroke-dashoffset:2000;}
#${id} .proj{fill:none;stroke:var(--muted);stroke-width:4;stroke-dasharray:24 20;}
#${id} .nd circle{fill:var(--paper);stroke:var(--accent);stroke-width:5;}
#${id} .xs{position:absolute;left:20px;right:20px;bottom:0;display:flex;justify-content:space-between;font-family:var(--font-num);font-size:30px;color:var(--muted);letter-spacing:0.1em;}
#${id} .co{position:absolute;right:0;top:0;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:26px 38px;display:flex;flex-direction:column;gap:10px;}
#${id} .co b{font-family:var(--font-num);font-size:44px;font-weight:700;color:var(--accent);}
#${id} .co span{font-family:var(--font-num);font-size:28px;color:var(--muted);letter-spacing:0.06em;}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .hd,#${id} .ttl2',{autoAlpha:0,duration:0.26},0.12);\n` +
        `tl.from('#${id} .gl,#${id} .base,#${id} .xs',{autoAlpha:0,duration:0.24},0.22);\n` +
        `tl.to('#${id} .ln',{strokeDashoffset:0,duration:0.55,ease:'power2.inOut'},0.3);\n` +
        `tl.from('#${id} .nd circle',{autoAlpha:0,duration:0.2,stagger:0.08},0.4);\n` +
        `tl.from('#${id} .proj',{autoAlpha:0,duration:0.3},0.85);\n` +
        `tl.from('#${id} .co',{autoAlpha:0,y:16,duration:0.26,ease:'power2.out'},0.9);\n` +
        `tl.from('#${id} .ft',{autoAlpha:0,duration:0.22},0.94);`,
    ),
  时间线: () =>
    mk(
      'bd_rmp',
      '时间线',
      (id) => `
<div class="bd"><div class="top"></div>
  <div class="hd"><span class="no">05</span><span class="sec">路线图</span><span class="sp"></span><span class="pg">P.06 / 12</span></div>
  <div class="ttl2">上半年打地基,Q3 才踩油门</div>
  <div class="map">
    <div class="axis"></div>
    <div class="nd done"><b>Q1</b><i></i><span>跑通供应链</span></div>
    <div class="nd done"><b>Q2</b><i></i><span>上线会员体系</span></div>
    <div class="nd cur"><b>Q3</b><i></i><span>全渠道投放</span><em>NOW</em></div>
    <div class="nd"><b>Q4</b><i></i><span>出海首站</span></div>
  </div>
  <div class="ft"><span>SOURCE: 年度经营计划 2026</span><span>OWNERS CONFIRMED</span></div>
</div>
<style>${bdRoot(id)}
#${id} .bd{background-color:var(--paper);}
#${id} .ttl2{position:absolute;left:120px;right:120px;top:238px;font-size:64px;font-weight:700;letter-spacing:0.01em;}
#${id} .map{position:absolute;left:120px;right:120px;top:440px;height:400px;display:flex;justify-content:space-between;}
#${id} .axis{position:absolute;left:0;right:0;top:130px;height:2px;background:var(--fg);}
#${id} .nd{position:relative;width:330px;text-align:center;}
#${id} .nd b{position:absolute;left:0;right:0;top:34px;font-family:var(--font-num);font-size:38px;font-weight:700;color:var(--muted);}
#${id} .nd i{position:absolute;left:calc(50% - 13px);top:118px;width:26px;height:26px;border-radius:999px;background:var(--paper);border:5px solid var(--line);}
#${id} .nd span{position:absolute;left:0;right:0;top:190px;font-size:32px;line-height:1.35;color:var(--muted);}
#${id} .nd.done b{color:var(--fg);}
#${id} .nd.done i{border-color:var(--accent);}
#${id} .nd.cur b{color:var(--accent);}
#${id} .nd.cur i{left:calc(50% - 20px);top:111px;width:40px;height:40px;background:var(--accent);border-color:var(--accent);}
#${id} .nd.cur span{color:var(--fg);font-weight:700;font-size:36px;}
#${id} .nd.cur em{position:absolute;left:0;right:0;top:302px;font-style:normal;font-family:var(--font-num);font-size:28px;font-weight:700;color:var(--accent);letter-spacing:0.2em;}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .hd,#${id} .ttl2',{autoAlpha:0,duration:0.26},0.12);\n` +
        `tl.from('#${id} .axis',{scaleX:0,transformOrigin:'left center',duration:0.35,ease:'power2.inOut'},0.26);\n` +
        `tl.from('#${id} .nd i',{scale:0,autoAlpha:0,duration:0.22,stagger:0.09,ease:'power2.out'},0.36);\n` +
        `tl.from('#${id} .nd b',{autoAlpha:0,y:-14,duration:0.22,stagger:0.09},0.42);\n` +
        `tl.from('#${id} .nd span',{autoAlpha:0,y:14,duration:0.24,stagger:0.07},0.6);\n` +
        `tl.from('#${id} .nd.cur em',{autoAlpha:0,duration:0.22},0.9);\n` +
        `tl.from('#${id} .ft',{autoAlpha:0,duration:0.22},0.94);`,
    ),
  人名条: () =>
    mk(
      'bd_spk',
      '人名条',
      (id) => `
<div class="bd"><div class="top"></div>
  <div class="hd"><span class="no">01</span><span class="sec">发言人</span><span class="sp"></span><span class="pg">P.02 / 12</span></div>
  <div class="ghost"><span>01</span>复盘</div>
  <div class="lt">
    <div class="tag">CFO</div>
    <div class="who"><b>林亦舟</b><span>首席财务官 · 财务与经营分析部</span></div>
    <div class="mt">发言 12 MIN</div>
  </div>
  <div class="ft"><span>SOURCE: 会议手册 2026-07</span><span>PIREEL ADVISORY</span></div>
</div>
<style>${bdRoot(id)}
#${id} .bd{background-color:var(--paper);}
#${id} .ghost{position:absolute;left:120px;top:300px;font-size:300px;font-weight:800;line-height:1;color:var(--panel-2);letter-spacing:0.02em;}
#${id} .ghost span{font-family:var(--font-num);margin-right:40px;}
#${id} .lt{position:absolute;left:120px;bottom:200px;display:flex;align-items:center;gap:44px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:36px 56px 36px 36px;}
#${id} .tag{font-family:var(--font-num);font-size:34px;font-weight:700;background:var(--accent);color:var(--paper);border-radius:var(--radius);padding:22px 30px;letter-spacing:0.08em;}
#${id} .who{display:flex;flex-direction:column;gap:12px;}
#${id} .who b{font-size:56px;font-weight:700;}
#${id} .who span{font-size:30px;color:var(--muted);letter-spacing:0.06em;}
#${id} .mt{align-self:stretch;display:flex;align-items:center;margin-left:24px;border-left:1px solid var(--line);padding-left:44px;font-family:var(--font-num);font-size:28px;color:var(--muted);letter-spacing:0.1em;}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .hd',{autoAlpha:0,duration:0.24},0.12);\n` +
        `tl.from('#${id} .ghost',{autoAlpha:0,duration:0.3},0.2);\n` +
        `tl.from('#${id} .lt',{x:-80,autoAlpha:0,duration:0.32,ease:'power2.out'},0.5);\n` +
        `tl.from('#${id} .tag',{autoAlpha:0,scale:0.8,duration:0.22,ease:'power2.out'},0.78);\n` +
        `tl.from('#${id} .ft',{autoAlpha:0,duration:0.24},0.9);`,
    ),
};
