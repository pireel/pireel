/**
 * Cinema — film-subtitle dialect: top/bottom letterbox bars slide in, bilingual subtitles centered
 * at the bottom, slate/timecode tucked in a corner. Gold on a ration: only one emphasis word or one
 * thin gold line per card; motion is only slide-in and slow fade.
 */

import { type Block, mk } from './shared';

/* Shared base for letterbox bars + slate corner: bars always on top, content lives only in the middle band */
const cineRoot = (id: string) => `
#${id} .cn{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);overflow:hidden;}
#${id} .lb{position:absolute;left:0;right:0;height:150px;background:var(--panel-2);z-index:3;}
#${id} .lb.t{top:0;border-bottom:1px solid var(--line);}
#${id} .lb.b{bottom:0;border-top:1px solid var(--line);}
#${id} .sl{position:absolute;top:190px;font-family:var(--font-num);font-size:30px;letter-spacing:0.18em;color:var(--muted);}
#${id} .sl.l{left:80px;}
#${id} .sl.r{right:80px;}
#${id} .sl b{color:var(--accent-2);font-weight:400;}`;

const barsTl = (id: string): string =>
  `tl.from('#${id} .lb.t',{y:-150,duration:0.5,ease:'power2.out'},0);\n` +
  `tl.from('#${id} .lb.b',{y:150,duration:0.5,ease:'power2.out'},0);`;

export const cover: () => Block = () =>
  mk(
    'cv_cn',
    '封面',
    (id) => `
<div class="cn">
  <div class="lb t"></div><div class="lb b"></div>
  <div class="sl l"><b>●</b> SC.00 · COVER</div><div class="sl r">00:00:00:00</div>
  <div class="tc">
    <div class="rule"></div>
    <div class="h">影院</div>
    <div class="en">CINEMA · WIDESCREEN</div>
  </div>
</div>
<style>${cineRoot(id)}
#${id} .tc{position:absolute;left:0;right:0;top:290px;display:flex;flex-direction:column;align-items:center;gap:44px;}
#${id} .rule{width:220px;height:2px;background:var(--accent);}
#${id} .h{font-size:300px;font-weight:600;letter-spacing:0.1em;line-height:1;padding-left:0.1em;}
#${id} .en{font-size:30px;letter-spacing:0.3em;color:var(--muted);padding-left:0.3em;}
</style>`,
    (id) =>
      `${barsTl(id)}\n` +
      `tl.from('#${id} .rule',{scaleX:0,duration:0.45,ease:'power2.inOut'},0.3);\n` +
      `tl.from('#${id} .h',{autoAlpha:0,y:20,duration:0.6,ease:'power1.out'},0.45);\n` +
      `tl.from('#${id} .en',{autoAlpha:0,duration:0.5},0.75);\n` +
      `tl.from('#${id} .sl',{autoAlpha:0,duration:0.4},0.8);`,
  );

export const blocks: Record<string, () => Block> = {
  标题卡: () =>
    mk(
      'cn_ttl',
      '标题卡',
      (id) => `
<div class="cn">
  <div class="lb t"></div><div class="lb b"></div>
  <div class="sl l"><b>●</b> SC.01 · TAKE 01</div><div class="sl r">00:00:02:12</div>
  <div class="tc">
    <div class="rule"></div>
    <div class="h">路灯下的第七年</div>
    <div class="cr"><span>出品 PIREEL PICTURES</span><span>导演 频道主</span><span>剪辑 STUDIO</span></div>
  </div>
</div>
<style>${cineRoot(id)}
#${id} .tc{position:absolute;left:0;right:0;top:328px;display:flex;flex-direction:column;align-items:center;gap:56px;}
#${id} .rule{width:220px;height:2px;background:var(--accent);}
#${id} .h{font-size:165px;font-weight:600;letter-spacing:0.08em;line-height:1;padding-left:0.08em;}
#${id} .cr{display:flex;gap:90px;font-size:30px;letter-spacing:0.22em;color:var(--muted);}
</style>`,
      (id) =>
        `${barsTl(id)}\n` +
        `tl.from('#${id} .rule',{scaleX:0,duration:0.45,ease:'power2.inOut'},0.3);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,y:20,duration:0.6,ease:'power1.out'},0.45);\n` +
        `tl.from('#${id} .cr span',{autoAlpha:0,duration:0.4,stagger:0.08},0.75);\n` +
        `tl.from('#${id} .sl',{autoAlpha:0,duration:0.4},0.85);`,
    ),
  章节: () =>
    mk(
      'cn_chp',
      '章节',
      (id) => `
<div class="cn">
  <div class="lb t"></div><div class="lb b"></div>
  <div class="sl l"><b>●</b> SC.02 · CHAPTER</div><div class="sl r">00:01:26:09</div>
  <div class="tc">
    <div class="tabs">
      <span class="tab">SCENE 01</span>
      <span class="tab on">SCENE 02<i class="gu"></i></span>
      <span class="tab">SCENE 03</span>
    </div>
    <div class="h">巷口的修表匠</div>
    <div class="en">CHAPTER TWO · FORTY YEARS OF TICKING</div>
  </div>
</div>
<style>${cineRoot(id)}
#${id} .tc{position:absolute;left:0;right:0;top:322px;display:flex;flex-direction:column;align-items:center;gap:58px;}
#${id} .tabs{display:flex;gap:110px;}
#${id} .tab{position:relative;font-family:var(--font-num);font-size:32px;letter-spacing:0.18em;color:var(--muted);padding-bottom:20px;}
#${id} .tab.on{color:var(--fg);}
#${id} .gu{position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--accent);}
#${id} .h{font-size:150px;font-weight:600;letter-spacing:0.08em;line-height:1;padding-left:0.08em;}
#${id} .en{font-size:30px;letter-spacing:0.3em;color:var(--muted);padding-left:0.3em;}
</style>`,
      (id) =>
        `${barsTl(id)}\n` +
        `tl.from('#${id} .tab',{autoAlpha:0,duration:0.4,stagger:0.08},0.35);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,y:20,duration:0.6,ease:'power1.out'},0.5);\n` +
        `tl.from('#${id} .gu',{scaleX:0,transformOrigin:'left center',duration:0.45,ease:'power2.inOut'},0.7);\n` +
        `tl.from('#${id} .en,#${id} .sl',{autoAlpha:0,duration:0.4},0.8);`,
    ),
  金句: () =>
    mk(
      'cn_qte',
      '金句',
      (id) => `
<div class="cn">
  <div class="lb t"></div><div class="lb b"></div>
  <div class="sl l"><b>●</b> SC.04 · TAKE 02</div><div class="sl r">00:02:14:07</div>
  <div class="sub">
    <div class="zh">后来才懂,平凡才是唯一的<b>答案</b></div>
    <div class="en">ORDINARY DAYS WERE THE ANSWER ALL ALONG</div>
  </div>
</div>
<style>${cineRoot(id)}
#${id} .sub{position:absolute;left:0;right:0;bottom:190px;display:flex;flex-direction:column;align-items:center;gap:34px;text-align:center;}
#${id} .zh{font-size:76px;font-weight:600;letter-spacing:0.06em;}
#${id} .zh b{color:var(--accent);font-weight:600;}
#${id} .en{font-size:30px;letter-spacing:0.3em;color:var(--muted);padding-left:0.3em;}
</style>`,
      (id) =>
        `${barsTl(id)}\n` +
        `tl.from('#${id} .sl',{autoAlpha:0,duration:0.4},0.35);\n` +
        `tl.from('#${id} .zh',{autoAlpha:0,y:20,duration:0.6,ease:'power1.out'},0.45);\n` +
        `tl.from('#${id} .en',{autoAlpha:0,y:20,duration:0.5,ease:'power1.out'},0.65);`,
    ),
  引导: () =>
    mk(
      'cn_cta',
      '引导',
      (id) => `
<div class="cn">
  <div class="lb t"></div><div class="lb b"></div>
  <div class="sl l"><b>●</b> SC.12 · FINAL</div><div class="sl r">00:07:59:23</div>
  <div class="tc">
    <div class="k">NEXT EPISODE</div>
    <div class="h">关注,别错过下一幕</div>
    <div class="rule"></div>
    <div class="w">每周五 20:00 · 首映</div>
  </div>
</div>
<style>${cineRoot(id)}
#${id} .tc{position:absolute;left:0;right:0;top:330px;display:flex;flex-direction:column;align-items:center;gap:52px;}
#${id} .k{font-size:30px;letter-spacing:0.3em;color:var(--muted);padding-left:0.3em;}
#${id} .h{font-size:112px;font-weight:600;letter-spacing:0.08em;line-height:1;padding-left:0.08em;}
#${id} .rule{width:220px;height:2px;background:var(--accent);}
#${id} .w{font-family:var(--font-num);font-size:32px;letter-spacing:0.18em;color:var(--muted);}
</style>`,
      (id) =>
        `${barsTl(id)}\n` +
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.4},0.35);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,y:20,duration:0.6,ease:'power1.out'},0.45);\n` +
        `tl.from('#${id} .rule',{scaleX:0,duration:0.45,ease:'power2.inOut'},0.6);\n` +
        `tl.from('#${id} .w,#${id} .sl',{autoAlpha:0,duration:0.4},0.8);`,
    ),
  大数字: () =>
    mk(
      'cn_num',
      '大数字',
      (id) => `
<div class="cn">
  <div class="lb t"></div><div class="lb b"></div>
  <div class="sl l"><b>●</b> SC.07 · TAKE 01</div><div class="sl r">00:04:36:18</div>
  <div class="tc">
    <div class="k">BOX OFFICE · DAY 07</div>
    <div class="h">1.7<span>亿</span></div>
    <div class="cr"><span>零宣发</span><span>零流量</span><span>全靠口碑</span></div>
  </div>
</div>
<style>${cineRoot(id)}
#${id} .tc{position:absolute;left:0;right:0;top:300px;display:flex;flex-direction:column;align-items:center;gap:48px;}
#${id} .k{font-size:30px;letter-spacing:0.3em;color:var(--muted);padding-left:0.3em;}
#${id} .h{font-size:280px;font-weight:600;line-height:1;letter-spacing:0.04em;color:var(--accent);}
#${id} .h span{font-size:120px;color:var(--fg);margin-left:22px;}
#${id} .cr{display:flex;gap:90px;font-size:30px;letter-spacing:0.22em;color:var(--muted);}
</style>`,
      (id) =>
        `${barsTl(id)}\n` +
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.4},0.35);\n` +
        `tl.from('#${id} .h',{autoAlpha:0,y:20,duration:0.6,ease:'power1.out'},0.45);\n` +
        `tl.from('#${id} .cr span',{autoAlpha:0,duration:0.4,stagger:0.08},0.75);\n` +
        `tl.from('#${id} .sl',{autoAlpha:0,duration:0.4},0.85);`,
    ),
  对比: () =>
    mk(
      'cn_cmp',
      '对比',
      (id) => `
<div class="cn">
  <div class="lb t"></div><div class="lb b"></div>
  <div class="sl l"><b>●</b> SC.04 · A/B</div><div class="sl r">00:03:08:11</div>
  <div class="cmp">
    <div class="band"><span class="sc">SC.04A</span><div class="tx"><b>按时间顺序平铺直叙</b><span>SAFE TAKE · 弃用</span></div><span class="vd">NG</span></div>
    <div class="band"><span class="sc">SC.04B</span><div class="tx"><b class="pick">从结局倒着讲<i class="gu"></i></b><span>BOLD TAKE · 采用</span></div><span class="vd ok">OK</span></div>
  </div>
</div>
<style>${cineRoot(id)}
#${id} .cmp{position:absolute;left:80px;right:80px;top:280px;display:flex;flex-direction:column;gap:40px;}
#${id} .band{display:flex;align-items:center;gap:70px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:50px 70px;}
#${id} .sc{font-family:var(--font-num);font-size:32px;letter-spacing:0.18em;color:var(--muted);}
#${id} .tx{flex:1;display:flex;flex-direction:column;gap:22px;}
#${id} .tx b{font-size:64px;font-weight:600;letter-spacing:0.04em;}
#${id} .tx span{font-size:30px;letter-spacing:0.22em;color:var(--muted);}
#${id} .pick{position:relative;display:inline-block;align-self:flex-start;}
#${id} .gu{position:absolute;left:0;right:0;bottom:-14px;height:2px;background:var(--accent);}
#${id} .vd{font-family:var(--font-num);font-size:32px;letter-spacing:0.18em;color:var(--muted);}
#${id} .vd.ok{color:var(--accent-2);}
</style>`,
      (id) =>
        `${barsTl(id)}\n` +
        `tl.from('#${id} .sl',{autoAlpha:0,duration:0.4},0.35);\n` +
        `tl.from('#${id} .band',{autoAlpha:0,y:20,duration:0.5,ease:'power1.out',stagger:0.12},0.4);\n` +
        `tl.from('#${id} .gu',{scaleX:0,transformOrigin:'left center',duration:0.45,ease:'power2.inOut'},0.75);`,
    ),
  列表: () =>
    mk(
      'cn_lst',
      '列表',
      (id) => `
<div class="cn">
  <div class="lb t"></div><div class="lb b"></div>
  <div class="sl l"><b>●</b> SC.09 · CREDITS</div><div class="sl r">00:05:52:03</div>
  <div class="crd">
    <div class="rule"></div>
    <div class="hdr">CAST · 成片三要素</div>
    <div class="row"><span class="lft">开场钩子</span><i class="dl"></i><span class="rgt">前三秒定去留</span></div>
    <div class="row"><span class="lft">中段节奏</span><i class="dl"></i><span class="rgt">每二十秒一个转折</span></div>
    <div class="row"><span class="lft">结尾回扣</span><i class="dl"></i><span class="rgt">留半句话下集说</span></div>
  </div>
</div>
<style>${cineRoot(id)}
#${id} .crd{position:absolute;left:0;right:0;top:268px;display:flex;flex-direction:column;align-items:center;gap:44px;}
#${id} .rule{width:220px;height:2px;background:var(--accent);}
#${id} .hdr{font-size:30px;letter-spacing:0.3em;color:var(--muted);padding-left:0.3em;}
#${id} .row{width:1180px;display:flex;align-items:center;gap:44px;}
#${id} .row .lft,#${id} .row .rgt{font-size:54px;font-weight:600;letter-spacing:0.06em;}
#${id} .row .rgt{color:var(--muted);}
#${id} .dl{flex:1;border-bottom:3px dotted var(--line);transform:translateY(10px);}
</style>`,
      (id) =>
        `${barsTl(id)}\n` +
        `tl.from('#${id} .rule',{scaleX:0,duration:0.45,ease:'power2.inOut'},0.3);\n` +
        `tl.from('#${id} .hdr',{autoAlpha:0,duration:0.4},0.45);\n` +
        `tl.from('#${id} .row',{autoAlpha:0,y:20,duration:0.45,ease:'power1.out',stagger:0.12},0.5);\n` +
        `tl.from('#${id} .sl',{autoAlpha:0,duration:0.4},0.85);`,
    ),
  人名条: () =>
    mk(
      'cn_cst',
      '人名条',
      (id) => `
<div class="cn">
  <div class="lb t"></div><div class="lb b"></div>
  <div class="sl l"><b>●</b> SC.05 · CAST</div><div class="sl r">00:03:41:15</div>
  <div class="lt">
    <div class="rl"></div>
    <div class="k">CAST · 特别出演</div>
    <div class="nm">陈默</div>
    <div class="ro">修表匠 · 守了巷口四十年</div>
  </div>
</div>
<style>${cineRoot(id)}
#${id} .lt{position:absolute;left:80px;bottom:210px;display:flex;flex-direction:column;align-items:flex-start;gap:24px;}
#${id} .rl{width:120px;height:2px;background:var(--accent);}
#${id} .k{font-size:28px;letter-spacing:0.3em;color:var(--muted);}
#${id} .nm{font-size:96px;font-weight:600;letter-spacing:0.08em;line-height:1;}
#${id} .ro{font-family:var(--font-num);font-size:32px;letter-spacing:0.18em;color:var(--muted);}
</style>`,
      (id) =>
        `${barsTl(id)}\n` +
        `tl.from('#${id} .sl',{autoAlpha:0,duration:0.4},0.35);\n` +
        `tl.from('#${id} .lt',{x:-60,autoAlpha:0,duration:0.55,ease:'power2.out'},0.4);\n` +
        `tl.from('#${id} .rl',{scaleX:0,transformOrigin:'left center',duration:0.45,ease:'power2.inOut'},0.6);\n` +
        `tl.from('#${id} .k,#${id} .ro',{autoAlpha:0,duration:0.4},0.75);`,
    ),
};
