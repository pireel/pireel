/**
 * 剪纸 Paper-cut —— 国潮红金方言:层叠切角红纸板、金角标、金章、竖排对句、云弧。
 * 版式逻辑:居中对称的仪式感;金色是贵重物,每卡至多一章 + 一处鎏金。
 */

import { type Block, mk } from './shared';

const CUT =
  'polygon(44px 0,calc(100% - 44px) 0,100% 44px,100% calc(100% - 44px),calc(100% - 44px) 100%,44px 100%,0 calc(100% - 44px),0 44px)';

const pcRoot = (id: string) => `
#${id} .pc{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);}
#${id} .plate2{position:absolute;inset:88px 140px;background:var(--panel-2);clip-path:${CUT};transform:translate(18px,18px);}
#${id} .plate{position:absolute;inset:88px 140px;background:var(--panel);clip-path:${CUT};}
#${id} .cm{position:absolute;width:64px;height:64px;border:0 solid var(--accent);}
#${id} .cm.tl{left:176px;top:124px;border-left-width:5px;border-top-width:5px;}
#${id} .cm.tr{right:176px;top:124px;border-right-width:5px;border-top-width:5px;}
#${id} .cm.bl{left:176px;bottom:124px;border-left-width:5px;border-bottom-width:5px;}
#${id} .cm.br{right:176px;bottom:124px;border-right-width:5px;border-bottom-width:5px;}
#${id} .cloud{display:flex;align-items:flex-end;justify-content:center;gap:14px;}
#${id} .cloud i{width:96px;height:48px;border:5px solid var(--accent);border-bottom:none;border-radius:96px 96px 0 0;}
#${id} .cloud i:first-child,#${id} .cloud i:last-child{width:60px;height:30px;opacity:0.7;}
#${id} .seal{border:6px solid var(--accent);border-radius:999px;color:var(--accent);display:flex;align-items:center;justify-content:center;box-shadow:var(--glow);}
#${id} .cpl{position:absolute;top:50%;transform:translateY(-50%);writing-mode:vertical-rl;background:var(--panel-2);border:2px solid var(--line);padding:40px 20px;font-size:42px;font-weight:600;letter-spacing:0.18em;}
#${id} .cpl.l{left:236px;}
#${id} .cpl.r{right:236px;}`;

export const cover: () => Block = () =>
  mk(
    'cv_pc',
    '封面',
    (id) => `
<div class="pc"><div class="plate2"></div><div class="plate"></div>
  <div class="cm tl"></div><div class="cm tr"></div><div class="cm bl"></div><div class="cm br"></div>
  <div class="c">
    <div class="k">PAPER-CUT · FRAME</div>
    <div class="h">剪纸</div>
    <div class="cloud"><i></i><i></i><i></i></div>
  </div>
  <div class="seal cs">印</div>
</div>
<style>${pcRoot(id)}
#${id} .c{position:absolute;left:240px;right:240px;top:50%;transform:translateY(-52%);display:flex;flex-direction:column;align-items:center;gap:52px;}
#${id} .k{font-size:34px;letter-spacing:0.5em;color:var(--accent);padding-left:0.5em;}
#${id} .h{font-size:300px;font-weight:900;letter-spacing:0.1em;line-height:1;}
#${id} .cs{position:absolute;right:250px;top:180px;width:180px;height:180px;font-size:92px;font-weight:700;transform:rotate(6deg);}
</style>`,
    (id) =>
      `tl.from('#${id} .plate2,#${id} .plate',{autoAlpha:0,scale:0.97,duration:0.3,ease:'power2.out'},0);\n` +
      `tl.from('#${id} .cm',{autoAlpha:0,duration:0.24},0.18);\n` +
      `tl.from('#${id} .c',{y:40,autoAlpha:0,duration:0.3},0.24);\n` +
      `tl.from('#${id} .cs',{scale:1.7,autoAlpha:0,rotation:26,duration:0.28,ease:'power3.in'},0.6);`,
  );

export const blocks: Record<string, () => Block> = {
  标题卡: () =>
    mk(
      'pc_ttl',
      '标题卡',
      (id) => `
<div class="pc"><div class="plate2"></div><div class="plate"></div>
  <div class="cm tl"></div><div class="cm tr"></div><div class="cm bl"></div><div class="cm br"></div>
  <div class="cpl l">窗花裁出旧时光</div>
  <div class="cpl r">金章盖住新念想</div>
  <div class="c">
    <div class="k">国潮 · 开场</div>
    <div class="h">老手艺,过新年</div>
    <div class="cloud"><i></i><i></i><i></i></div>
  </div>
  <div class="seal ss">囍</div>
</div>
<style>${pcRoot(id)}
#${id} .pc{background-color:var(--paper);}
#${id} .c{position:absolute;left:340px;right:340px;top:50%;transform:translateY(-52%);display:flex;flex-direction:column;align-items:center;gap:50px;}
#${id} .k{font-size:36px;letter-spacing:0.46em;color:var(--accent);padding-left:0.46em;}
#${id} .h{font-size:142px;font-weight:900;letter-spacing:0.04em;line-height:1.1;text-align:center;}
#${id} .ss{position:absolute;right:262px;top:158px;width:164px;height:164px;font-size:86px;font-weight:700;transform:rotate(8deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .plate2,#${id} .plate',{autoAlpha:0,scale:0.97,duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cm',{autoAlpha:0,duration:0.22},0.16);\n` +
        `tl.from('#${id} .cpl.l',{x:-50,autoAlpha:0,duration:0.28,ease:'power2.out'},0.2);\n` +
        `tl.from('#${id} .cpl.r',{x:50,autoAlpha:0,duration:0.28,ease:'power2.out'},0.2);\n` +
        `tl.from('#${id} .k,#${id} .h',{y:44,autoAlpha:0,duration:0.3,stagger:0.08,ease:'power2.out'},0.3);\n` +
        `tl.from('#${id} .cloud i',{autoAlpha:0,y:20,duration:0.22,stagger:0.06},0.52);\n` +
        `tl.from('#${id} .ss',{scale:1.6,autoAlpha:0,rotation:28,duration:0.26,ease:'power3.in'},0.72);`,
    ),
  章节: () =>
    mk(
      'pc_chp',
      '章节',
      (id) => `
<div class="pc"><div class="plate2"></div><div class="plate"></div>
  <div class="cm tl"></div><div class="cm tr"></div><div class="cm bl"></div><div class="cm br"></div>
  <div class="cap">章 回 目 录</div>
  <div class="tabs">
    <div class="tab">第一回</div>
    <div class="tab cur">第二回</div>
    <div class="tab">第三回</div>
  </div>
  <div class="h">红纸开新岁,金剪裁春风</div>
  <div class="cloud hc"><i></i><i></i><i></i></div>
  <div class="seal ss">回</div>
</div>
<style>${pcRoot(id)}
#${id} .pc{background-color:var(--paper);}
#${id} .cap{position:absolute;left:0;right:0;top:158px;text-align:center;font-size:36px;letter-spacing:0.46em;color:var(--accent);padding-left:0.46em;}
#${id} .tabs{position:absolute;left:0;right:0;top:262px;display:flex;justify-content:center;align-items:flex-start;gap:64px;}
#${id} .tab{writing-mode:vertical-rl;border:2px solid var(--line);padding:36px 20px;font-size:40px;font-weight:600;letter-spacing:0.18em;color:var(--muted);}
#${id} .tab.cur{background:var(--panel-2);border:none;clip-path:polygon(18px 0,calc(100% - 18px) 0,100% 18px,100% calc(100% - 18px),calc(100% - 18px) 100%,18px 100%,0 calc(100% - 18px),0 18px);padding:38px 22px;font-weight:700;color:var(--accent);}
#${id} .h{position:absolute;left:0;right:0;top:646px;text-align:center;font-size:110px;font-weight:900;letter-spacing:0.04em;line-height:1.1;}
#${id} .hc{position:absolute;left:0;right:0;bottom:132px;}
#${id} .ss{position:absolute;right:262px;bottom:170px;width:150px;height:150px;font-size:78px;font-weight:700;transform:rotate(8deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .plate2,#${id} .plate',{autoAlpha:0,scale:0.97,duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cm',{autoAlpha:0,duration:0.22},0.16);\n` +
        `tl.from('#${id} .cap',{y:30,autoAlpha:0,duration:0.26,ease:'power2.out'},0.2);\n` +
        `tl.from('#${id} .tab',{y:-50,autoAlpha:0,duration:0.28,stagger:0.1,ease:'power2.out'},0.28);\n` +
        `tl.from('#${id} .h',{y:44,autoAlpha:0,duration:0.3,ease:'power2.out'},0.6);\n` +
        `tl.from('#${id} .hc i',{autoAlpha:0,y:18,duration:0.2,stagger:0.06},0.76);\n` +
        `tl.from('#${id} .ss',{scale:1.6,autoAlpha:0,rotation:28,duration:0.26,ease:'power3.in'},0.9);`,
    ),
  大数字: () =>
    mk(
      'pc_num',
      '大数字',
      (id) => `
<div class="pc"><div class="plate2"></div><div class="plate"></div>
  <div class="cm tl"></div><div class="cm tr"></div><div class="cm bl"></div><div class="cm br"></div>
  <div class="num"><b>600</b><span>年</span></div>
  <div class="cloud nc"><i></i><i></i><i></i></div>
  <div class="cpl r">一把剪刀传六百年</div>
  <div class="seal ss">传</div>
</div>
<style>${pcRoot(id)}
#${id} .pc{background-color:var(--paper);}
#${id} .num{position:absolute;left:300px;top:44%;transform:translateY(-50%);display:flex;align-items:baseline;gap:34px;}
#${id} .num b{font-family:var(--font-num);font-size:430px;font-weight:700;line-height:1;letter-spacing:-0.02em;color:var(--accent);}
#${id} .num span{font-size:150px;font-weight:700;}
#${id} .nc{position:absolute;left:330px;bottom:210px;justify-content:flex-start;}
#${id} .ss{position:absolute;left:1180px;bottom:190px;width:150px;height:150px;font-size:78px;font-weight:700;transform:rotate(-6deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .plate2,#${id} .plate',{autoAlpha:0,scale:0.97,duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cm',{autoAlpha:0,duration:0.22},0.16);\n` +
        `tl.from('#${id} .num',{y:60,autoAlpha:0,duration:0.34,ease:'power3.out'},0.22);\n` +
        `tl.from('#${id} .nc i',{autoAlpha:0,y:18,duration:0.2,stagger:0.06},0.46);\n` +
        `tl.from('#${id} .cpl.r',{x:50,autoAlpha:0,duration:0.28,ease:'power2.out'},0.4);\n` +
        `tl.from('#${id} .ss',{scale:1.6,autoAlpha:0,rotation:-24,duration:0.26,ease:'power3.in'},0.72);`,
    ),
  数字变化: () =>
    mk(
      'pc_cnt',
      '数字变化',
      (id) => `
<div class="pc"><div class="plate2"></div><div class="plate"></div>
  <div class="cm tl"></div><div class="cm tr"></div><div class="cm bl"></div><div class="cm br"></div>
  <div class="cap">窗 花 记 数</div>
  <div class="med"><i class="ring"></i><b class="v">216</b><span>刀</span></div>
  <div class="cpl r">一幅团花二百一十六刀</div>
  <div class="cloud mc"><i></i><i></i><i></i></div>
</div>
<style>${pcRoot(id)}
#${id} .pc{background-color:var(--paper);}
#${id} .cap{position:absolute;left:0;right:0;top:158px;text-align:center;font-size:36px;letter-spacing:0.46em;color:var(--accent);padding-left:0.46em;}
#${id} .med{position:absolute;left:50%;top:272px;transform:translateX(-50%);width:560px;height:560px;border-radius:999px;background:var(--panel-2);border:2px solid var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;}
#${id} .ring{position:absolute;inset:26px;border:2px dashed var(--line);border-radius:999px;}
#${id} .med .v{font-family:var(--font-num);font-size:210px;font-weight:700;line-height:1;color:var(--accent);}
#${id} .med span{font-size:56px;font-weight:700;letter-spacing:0.2em;padding-left:0.2em;}
#${id} .mc{position:absolute;left:0;right:0;bottom:132px;}
</style>`,
      (id) =>
        `tl.from('#${id} .plate2,#${id} .plate',{autoAlpha:0,scale:0.97,duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cm',{autoAlpha:0,duration:0.22},0.16);\n` +
        `tl.from('#${id} .med',{scale:0.94,autoAlpha:0,duration:0.3,ease:'power2.out'},0.12);\n` +
        `tl.from('#${id} .v',{innerText:0,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .cap',{y:30,autoAlpha:0,duration:0.26,ease:'power2.out'},0.24);\n` +
        `tl.from('#${id} .cpl.r',{x:50,autoAlpha:0,duration:0.28,ease:'power2.out'},0.44);\n` +
        `tl.from('#${id} .mc i',{autoAlpha:0,y:18,duration:0.2,stagger:0.06},0.62);`,
    ),
  引导: () =>
    mk(
      'pc_cta',
      '引导',
      (id) => `
<div class="pc"><div class="plate2"></div><div class="plate"></div>
  <div class="cm tl"></div><div class="cm tr"></div><div class="cm bl"></div><div class="cm br"></div>
  <div class="cpl l">点个关注</div>
  <div class="cpl r">好运常来</div>
  <div class="seal big"><span>关</span><span>注</span></div>
  <div class="f">大年初一 · 下集开新篇</div>
</div>
<style>${pcRoot(id)}
#${id} .pc{background-color:var(--paper);}
#${id} .big{position:absolute;left:50%;top:45%;transform:translate(-50%,-50%) rotate(-4deg);width:330px;height:330px;flex-direction:column;gap:2px;font-size:112px;font-weight:700;line-height:1.1;}
#${id} .f{position:absolute;left:0;right:0;bottom:172px;text-align:center;font-size:36px;letter-spacing:0.24em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .plate2,#${id} .plate',{autoAlpha:0,scale:0.97,duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cm',{autoAlpha:0,duration:0.22},0.16);\n` +
        `tl.from('#${id} .cpl.l',{x:-60,autoAlpha:0,duration:0.28,ease:'power2.out'},0.24);\n` +
        `tl.from('#${id} .cpl.r',{x:60,autoAlpha:0,duration:0.28,ease:'power2.out'},0.24);\n` +
        `tl.from('#${id} .big',{scale:1.6,autoAlpha:0,rotation:-22,duration:0.3,ease:'power3.in'},0.48);\n` +
        `tl.from('#${id} .f',{autoAlpha:0,duration:0.26},0.86);`,
    ),
  金句: () =>
    mk(
      'pc_qte',
      '金句',
      (id) => `
<div class="pc"><div class="plate2"></div><div class="plate"></div>
  <div class="cm tl"></div><div class="cm tr"></div><div class="cm bl"></div><div class="cm br"></div>
  <div class="qs a">年味不在日历上</div>
  <div class="qs b">在手艺人的手里</div>
  <div class="k">剪 纸 手 记 · 冬</div>
  <div class="seal ss">语</div>
</div>
<style>${pcRoot(id)}
#${id} .pc{background-color:var(--paper);}
#${id} .qs{position:absolute;writing-mode:vertical-rl;background:var(--panel-2);border:2px solid var(--line);padding:46px 26px;font-size:60px;font-weight:700;letter-spacing:0.2em;}
#${id} .qs.a{right:760px;top:200px;}
#${id} .qs.b{left:760px;top:272px;}
#${id} .k{position:absolute;left:0;right:0;bottom:150px;text-align:center;font-size:34px;letter-spacing:0.46em;color:var(--accent);padding-left:0.46em;}
#${id} .ss{position:absolute;right:262px;bottom:200px;width:150px;height:150px;font-size:78px;font-weight:700;transform:rotate(-6deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .plate2,#${id} .plate',{autoAlpha:0,scale:0.97,duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cm',{autoAlpha:0,duration:0.22},0.16);\n` +
        `tl.from('#${id} .qs.a',{y:-50,autoAlpha:0,duration:0.3,ease:'power2.out'},0.22);\n` +
        `tl.from('#${id} .qs.b',{y:-50,autoAlpha:0,duration:0.3,ease:'power2.out'},0.34);\n` +
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.26},0.56);\n` +
        `tl.from('#${id} .ss',{scale:1.6,autoAlpha:0,rotation:-24,duration:0.26,ease:'power3.in'},0.72);`,
    ),
  列表: () =>
    mk(
      'pc_lst',
      '列表',
      (id) => `
<div class="pc"><div class="plate2"></div><div class="plate"></div>
  <div class="cm tl"></div><div class="cm tr"></div><div class="cm bl"></div><div class="cm br"></div>
  <div class="cap">年 俗 清 单</div>
  <div class="ls">
    <div class="r"><i class="cb"></i><b>扫尘</b><span>腊月二十四 · 除旧迎新</span></div>
    <div class="r"><i class="cb"></i><b>贴窗花</b><span>红纸金剪 · 一刀一景</span></div>
    <div class="r"><i class="cb"></i><b>守岁</b><span>灯火不熄 · 团圆到天明</span></div>
  </div>
  <div class="seal ss">俗</div>
</div>
<style>${pcRoot(id)}
#${id} .pc{background-color:var(--paper);}
#${id} .cap{position:absolute;left:0;right:0;top:170px;text-align:center;font-size:36px;letter-spacing:0.46em;color:var(--accent);padding-left:0.46em;}
#${id} .ls{position:absolute;left:320px;right:320px;top:288px;display:flex;flex-direction:column;}
#${id} .r{display:flex;align-items:center;gap:44px;padding:44px 10px;border-bottom:2px solid var(--line);}
#${id} .r:last-child{border-bottom:none;}
#${id} .cb{width:72px;height:36px;border:5px solid var(--accent);border-bottom:none;border-radius:96px 96px 0 0;flex:none;}
#${id} .r b{font-size:58px;font-weight:700;letter-spacing:0.06em;}
#${id} .r span{margin-left:auto;font-size:34px;color:var(--muted);letter-spacing:0.08em;}
#${id} .ss{position:absolute;right:262px;bottom:170px;width:150px;height:150px;font-size:78px;font-weight:700;transform:rotate(8deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .plate2,#${id} .plate',{autoAlpha:0,scale:0.97,duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cm',{autoAlpha:0,duration:0.22},0.16);\n` +
        `tl.from('#${id} .cap',{y:30,autoAlpha:0,duration:0.26,ease:'power2.out'},0.22);\n` +
        `tl.from('#${id} .r',{x:-50,autoAlpha:0,duration:0.28,stagger:0.12,ease:'power2.out'},0.32);\n` +
        `tl.from('#${id} .ss',{scale:1.6,autoAlpha:0,rotation:28,duration:0.26,ease:'power3.in'},0.76);`,
    ),
  步骤: () =>
    mk(
      'pc_stp',
      '步骤',
      (id) => `
<div class="pc"><div class="plate2"></div><div class="plate"></div>
  <div class="cm tl"></div><div class="cm tr"></div><div class="cm bl"></div><div class="cm br"></div>
  <div class="cap">剪 纸 三 步</div>
  <div class="steps">
    <div class="sp"><i class="seal sn">一</i><b>折</b><span>对折三回成扇</span></div>
    <div class="arc"><i></i></div>
    <div class="sp"><i class="seal sn">二</i><b>描</b><span>白线勾出纹样</span></div>
    <div class="arc"><i></i></div>
    <div class="sp"><i class="seal sn">三</i><b>剪</b><span>先内后外一气成</span></div>
  </div>
</div>
<style>${pcRoot(id)}
#${id} .pc{background-color:var(--paper);}
#${id} .cap{position:absolute;left:0;right:0;top:180px;text-align:center;font-size:36px;letter-spacing:0.46em;color:var(--accent);padding-left:0.46em;}
#${id} .steps{position:absolute;left:250px;right:250px;top:330px;display:flex;align-items:center;justify-content:space-between;}
#${id} .sp{width:380px;background:var(--panel-2);clip-path:polygon(24px 0,calc(100% - 24px) 0,100% 24px,100% calc(100% - 24px),calc(100% - 24px) 100%,24px 100%,0 calc(100% - 24px),0 24px);padding:56px 0;display:flex;flex-direction:column;align-items:center;gap:30px;}
#${id} .sn{width:96px;height:96px;font-size:48px;font-weight:700;}
#${id} .sp b{font-size:72px;font-weight:800;letter-spacing:0.08em;}
#${id} .sp span{font-size:32px;color:var(--muted);letter-spacing:0.06em;}
#${id} .arc i{display:block;width:96px;height:48px;border:5px solid var(--accent);border-bottom:none;border-radius:96px 96px 0 0;}
</style>`,
      (id) =>
        `tl.from('#${id} .plate2,#${id} .plate',{autoAlpha:0,scale:0.97,duration:0.3,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cm',{autoAlpha:0,duration:0.22},0.16);\n` +
        `tl.from('#${id} .cap',{y:30,autoAlpha:0,duration:0.26,ease:'power2.out'},0.2);\n` +
        `tl.from('#${id} .sp',{y:44,autoAlpha:0,duration:0.28,stagger:0.14,ease:'power2.out'},0.3);\n` +
        `tl.from('#${id} .arc i',{autoAlpha:0,y:16,duration:0.22,stagger:0.1},0.72);`,
    ),
};
