/**
 * Flipboard dialect — a Solari split-flap departure board: each flap has a panel top half, panel-2
 * bottom half, and a 4px paper split; departure info rows (flight/destination/time/status), amber
 * destinations, on-time green chip. Motion is flips only: rotationX -90→0 in a per-flap wave,
 * rows cascading top-to-bottom, innerText rolling numbers inside a flap.
 */

import { type Block, mk } from './shared';

const FLIP = `transformPerspective:900,transformOrigin:'center center'`;

const fbRoot = (id: string) => `
#${id} .fb{position:absolute;inset:0;color:var(--fg);font-family:var(--font-num);
  background-image:linear-gradient(var(--grid) 2px,transparent 2px);background-size:100% 108px;}
#${id} .top{position:absolute;left:90px;right:90px;top:64px;display:flex;justify-content:space-between;align-items:baseline;font-size:36px;font-weight:700;letter-spacing:0.22em;color:var(--muted);border-bottom:3px solid var(--line);padding-bottom:26px;}
#${id} .top b{color:var(--accent);}
#${id} .tiles{display:flex;justify-content:center;gap:16px;}
#${id} .tiles i{display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:700;letter-spacing:0.04em;white-space:nowrap;border-radius:var(--radius);box-shadow:var(--shadow);background:linear-gradient(180deg,var(--panel) 0,var(--panel) calc(50% - 2px),var(--paper) calc(50% - 2px),var(--paper) calc(50% + 2px),var(--panel-2) calc(50% + 2px),var(--panel-2) 100%);}
#${id} .tiles.amber i{color:var(--accent);}
#${id} .chip{display:inline-flex;align-items:center;justify-content:center;padding:12px 32px;border:3px solid var(--accent-2);border-radius:var(--radius);color:var(--accent-2);font-size:34px;font-weight:700;letter-spacing:0.14em;white-space:nowrap;}
#${id} .chip.amber{border-color:var(--accent);color:var(--accent);}
#${id} .cap{position:absolute;left:0;right:0;text-align:center;font-size:36px;font-weight:700;letter-spacing:0.3em;color:var(--muted);}
#${id} .cols{display:grid;grid-template-columns:300px 1fr 260px 340px;gap:40px;font-size:32px;font-weight:700;letter-spacing:0.24em;color:var(--muted);padding-bottom:24px;border-bottom:3px solid var(--line);}
#${id} .row{display:grid;grid-template-columns:300px 1fr 260px 340px;align-items:center;gap:40px;font-size:48px;font-weight:700;letter-spacing:0.06em;padding:38px 0;border-bottom:3px solid var(--line);}
#${id} .row .dst{color:var(--accent);}
#${id} .row .st{font-size:34px;letter-spacing:0.14em;color:var(--muted);}
#${id} .ft{position:absolute;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:44px;}
#${id} .note{font-size:36px;font-weight:700;letter-spacing:0.14em;color:var(--muted);}`;

export const cover: () => Block = () =>
  mk(
    'cv_fb',
    '封面',
    (id) => `
<div class="fb">
  <div class="top"><span>出发 DEPARTURES</span><b>18:42</b></div>
  <div class="tiles hero amber"><i>翻</i><i>牌</i></div>
  <div class="mech">SOLARI SPLIT-FLAP SYSTEM</div>
  <div class="brd">
    <div class="cols"><span>航班 FLIGHT</span><span>目的地 DEST</span><span>时间 TIME</span><span>状态 STATUS</span></div>
    <div class="row rw"><span>PR-001</span><span class="dst">每周三更 · 全程直达</span><span>20:00</span><span><span class="chip">准点 ON TIME</span></span></div>
  </div>
</div>
<style>${fbRoot(id)}
#${id} .hero{position:absolute;left:0;right:0;top:240px;}
#${id} .hero i{min-width:340px;height:430px;padding:0 50px;font-size:240px;}
#${id} .mech{position:absolute;left:0;right:0;top:724px;text-align:center;font-size:32px;font-weight:700;letter-spacing:0.32em;color:var(--muted);}
#${id} .brd{position:absolute;left:90px;right:90px;bottom:84px;}
</style>`,
    (id) =>
      `tl.from('#${id} .top',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0);\n` +
      `tl.from('#${id} .hero i',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out',stagger:0.07},0.1);\n` +
      `tl.from('#${id} .mech',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0.4);\n` +
      `tl.from('#${id} .cols',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0.5);\n` +
      `tl.from('#${id} .rw',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0.62);\n` +
      `tl.to('#${id} .chip',{autoAlpha:0,duration:0.08,yoyo:true,repeat:3,ease:'steps(1)'},0.85);`,
  );

export const blocks: Record<string, () => Block> = {
  标题卡: () =>
    mk(
      'fb_ttl',
      '标题卡',
      (id) => `
<div class="fb">
  <div class="top"><span>出发 DEPARTURES</span><b>FLIGHT PR-101</b></div>
  <div class="cap" style="top:242px;">目的地 DEST</div>
  <div class="tiles hl amber"><i>冰岛</i><i>七日漫游</i></div>
  <div class="sub">一张机票的预算,玩出商务舱的体验</div>
  <div class="ft" style="bottom:120px;"><span class="gate">GATE 24 · 20:00</span><span class="chip">准点 ON TIME</span></div>
</div>
<style>${fbRoot(id)}
#${id} .fb{background-color:var(--paper);}
#${id} .hl{position:absolute;left:0;right:0;top:340px;}
#${id} .hl i{min-width:240px;height:260px;padding:0 44px;font-size:150px;}
#${id} .sub{position:absolute;left:0;right:0;top:690px;text-align:center;font-size:44px;font-weight:700;letter-spacing:0.1em;}
#${id} .gate{font-size:38px;font-weight:700;letter-spacing:0.2em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cap',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.18,ease:'power2.out'},0.1);\n` +
        `tl.from('#${id} .hl i',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out',stagger:0.07},0.18);\n` +
        `tl.from('#${id} .sub',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0.5);\n` +
        `tl.from('#${id} .ft',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0.62);\n` +
        `tl.to('#${id} .chip',{autoAlpha:0,duration:0.08,yoyo:true,repeat:3,ease:'steps(1)'},0.85);`,
    ),
  大数字: () =>
    mk(
      'fb_num',
      '大数字',
      (id) => `
<div class="fb">
  <div class="top"><span>到达 ARRIVALS</span><b>DATA BOARD</b></div>
  <div class="cap" style="top:252px;">本月新增粉丝 NEW FOLLOWERS</div>
  <div class="tiles digits amber"><i>1</i><i>2</i><i>8</i><i>6</i><i>0</i></div>
  <div class="ft" style="bottom:130px;"><span class="chip">创新高 RECORD</span><span class="note">环比上月 +42%</span></div>
</div>
<style>${fbRoot(id)}
#${id} .fb{background-color:var(--paper);}
#${id} .digits{position:absolute;left:0;right:0;top:340px;}
#${id} .digits i{width:250px;height:400px;font-size:280px;}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cap',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.18,ease:'power2.out'},0.1);\n` +
        `tl.from('#${id} .digits i',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out',stagger:0.06},0.18);\n` +
        `tl.from('#${id} .ft',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0.66);\n` +
        `tl.to('#${id} .chip',{autoAlpha:0,duration:0.08,yoyo:true,repeat:3,ease:'steps(1)'},0.88);`,
    ),
  数字变化: () =>
    mk(
      'fb_chg',
      '数字变化',
      (id) => `
<div class="fb">
  <div class="top"><span>出发 DEPARTURES</span><b>LIVE COUNT</b></div>
  <div class="cap" style="top:252px;">本周播放 VIEWS</div>
  <div class="tiles one amber"><i class="v">86400</i></div>
  <div class="ft" style="bottom:130px;"><span class="chip">+240%</span><span class="note">昨日 25200 · 每小时刷新</span></div>
</div>
<style>${fbRoot(id)}
#${id} .fb{background-color:var(--paper);}
#${id} .one{position:absolute;left:0;right:0;top:340px;}
#${id} .one i{padding:0 70px;height:400px;font-size:260px;}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cap',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.18,ease:'power2.out'},0.1);\n` +
        `tl.from('#${id} .v',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out'},0.18);\n` +
        `tl.from('#${id} .v',{innerText:0,snap:{innerText:1},duration:0.7,ease:'power1.out'},0.25);\n` +
        `tl.to('#${id} .v',{rotationX:-14,duration:0.07,yoyo:true,repeat:1,ease:'power1.inOut'},0.55);\n` +
        `tl.from('#${id} .ft',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0.98);`,
    ),
  倒计时: () =>
    mk(
      'fb_cnt',
      '倒计时',
      (id) => `
<div class="fb">
  <div class="top"><span>最后登机 FINAL CALL</span><b>GATE 24</b></div>
  <div class="cap" style="top:236px;">时间 TIME</div>
  <div class="tiles one amber"><i class="v">10</i></div>
  <div class="unit">SEC</div>
  <div class="ft" style="bottom:118px;"><span class="chip amber">即将关闭 CLOSING</span><span class="note">新品预售今晚 24:00 截单</span></div>
</div>
<style>${fbRoot(id)}
#${id} .fb{background-color:var(--paper);}
#${id} .one{position:absolute;left:0;right:0;top:316px;}
#${id} .one i{padding:0 80px;height:430px;font-size:320px;}
#${id} .unit{position:absolute;left:0;right:0;top:790px;text-align:center;font-size:34px;font-weight:700;letter-spacing:0.34em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cap',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.18,ease:'power2.out'},0.1);\n` +
        `tl.from('#${id} .v',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out'},0.18);\n` +
        `tl.from('#${id} .v',{innerText:60,snap:{innerText:1},duration:0.7,ease:'power1.out'},0.25);\n` +
        `tl.from('#${id} .unit',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.18,ease:'power2.out'},0.45);\n` +
        `tl.from('#${id} .ft',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0.62);\n` +
        `tl.to('#${id} .chip',{autoAlpha:0,duration:0.08,yoyo:true,repeat:3,ease:'steps(1)'},0.88);`,
    ),
  步骤: () =>
    mk(
      'fb_stp',
      '步骤',
      (id) => `
<div class="fb">
  <div class="top"><span>行程 ITINERARY</span><b>3 LEGS</b></div>
  <div class="brd">
    <div class="cols"><span>航班 FLIGHT</span><span>目的地 DEST</span><span>时间 TIME</span><span>状态 STATUS</span></div>
    <div class="row r done"><span>LEG 1</span><span class="dst">选题定方向</span><span>09:00</span><span class="st">已完成 DONE</span></div>
    <div class="row r act"><span>LEG 2</span><span class="dst">拍摄一条过</span><span>14:30</span><span><span class="chip">进行中 GO</span></span></div>
    <div class="row r hold"><span>LEG 3</span><span class="dst">剪辑加字幕</span><span>20:00</span><span class="st">候机 HOLD</span></div>
  </div>
</div>
<style>${fbRoot(id)}
#${id} .fb{background-color:var(--paper);}
#${id} .brd{position:absolute;left:90px;right:90px;top:300px;}
#${id} .row{padding:52px 0;}
#${id} .done{opacity:0.55;}
#${id} .hold .dst{color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cols',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.18,ease:'power2.out'},0.12);\n` +
        `tl.from('#${id} .r',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out',stagger:0.12},0.24);\n` +
        `tl.to('#${id} .chip',{autoAlpha:0,duration:0.08,yoyo:true,repeat:3,ease:'steps(1)'},0.85);`,
    ),
  对比: () =>
    mk(
      'fb_cmp',
      '对比',
      (id) => `
<div class="fb">
  <div class="top"><span>同一目的地 SAME DEST</span><b>VS</b></div>
  <div class="brd">
    <div class="cols"><span>方案 PLAN</span><span>目的地 DEST</span><span>耗时 TIME</span><span>状态 STATUS</span></div>
    <div class="row r lose"><span>PLAN A</span><span class="dst">破万粉 · 日更猛肝</span><span>90 天</span><span><span class="chip amber">延误 DELAYED</span></span></div>
    <div class="row r win"><span>PLAN B</span><span class="dst">破万粉 · 周更打磨</span><span>30 天</span><span><span class="chip">准点 ON TIME</span></span></div>
  </div>
  <div class="vd">同样的目的地,准点的那班先到</div>
</div>
<style>${fbRoot(id)}
#${id} .fb{background-color:var(--paper);}
#${id} .brd{position:absolute;left:90px;right:90px;top:310px;}
#${id} .row{padding:58px 0;font-size:46px;}
#${id} .lose{opacity:0.6;}
#${id} .win .dst{color:var(--accent-2);}
#${id} .vd{position:absolute;left:0;right:0;bottom:120px;text-align:center;font-size:40px;font-weight:700;letter-spacing:0.12em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cols',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.18,ease:'power2.out'},0.12);\n` +
        `tl.from('#${id} .r',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out',stagger:0.14},0.24);\n` +
        `tl.from('#${id} .vd',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0.65);\n` +
        `tl.to('#${id} .win .chip',{autoAlpha:0,duration:0.08,yoyo:true,repeat:3,ease:'steps(1)'},0.85);`,
    ),
  金句: () =>
    mk(
      'fb_qte',
      '金句',
      (id) => `
<div class="fb">
  <div class="top"><span>广播 ANNOUNCEMENT</span><b>PA SYSTEM</b></div>
  <div class="q">
    <div class="tiles qt"><i class="l1">没有延误的航班</i></div>
    <div class="tiles qt"><i class="l2">只有没定的日期</i></div>
  </div>
  <div class="who">—— 候机厅广播,循环第 3 遍</div>
</div>
<style>${fbRoot(id)}
#${id} .fb{background-color:var(--paper);}
#${id} .q{position:absolute;left:90px;right:90px;top:330px;display:flex;flex-direction:column;gap:28px;}
#${id} .qt i{width:100%;height:230px;font-family:var(--font-head);font-size:88px;font-weight:900;letter-spacing:0.02em;}
#${id} .who{position:absolute;left:0;right:0;bottom:140px;text-align:center;font-size:36px;font-weight:700;letter-spacing:0.2em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .l1',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.26,ease:'power2.out'},0.15);\n` +
        `tl.from('#${id} .l2',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.26,ease:'power2.out'},0.42);\n` +
        `tl.from('#${id} .who',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0.75);`,
    ),
  引导: () =>
    mk(
      'fb_cta',
      '引导',
      (id) => `
<div class="fb">
  <div class="top"><span>登机广播 BOARDING</span><b>LAST CALL</b></div>
  <div class="cap" style="top:250px;">现在登机 NOW BOARDING</div>
  <div class="tiles hl amber"><i>关注</i><i>不迷路</i></div>
  <div class="ft" style="bottom:190px;"><span class="gate">GATE ❤ · SEAT 常驻前排</span><span class="chip">立即登机 BOARD NOW</span></div>
  <div class="sched">每周三班 · 周一 / 三 / 五更新</div>
</div>
<style>${fbRoot(id)}
#${id} .fb{background-color:var(--paper);}
#${id} .hl{position:absolute;left:0;right:0;top:350px;}
#${id} .hl i{min-width:240px;height:260px;padding:0 44px;font-size:150px;}
#${id} .gate{font-size:38px;font-weight:700;letter-spacing:0.2em;color:var(--muted);}
#${id} .sched{position:absolute;left:0;right:0;bottom:100px;text-align:center;font-size:34px;font-weight:700;letter-spacing:0.18em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .top',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cap',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.18,ease:'power2.out'},0.12);\n` +
        `tl.from('#${id} .hl i',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.22,ease:'power2.out',stagger:0.07},0.2);\n` +
        `tl.from('#${id} .ft',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0.55);\n` +
        `tl.from('#${id} .sched',{rotationX:-90,${FLIP},autoAlpha:0,duration:0.2,ease:'power2.out'},0.68);\n` +
        `tl.to('#${id} .chip',{autoAlpha:0,duration:0.08,yoyo:true,repeat:3,ease:'steps(1)'},0.88);`,
    ),
};
