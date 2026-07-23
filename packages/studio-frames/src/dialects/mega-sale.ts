/**
 * Mega Sale dialect — bare red promo base; gold only for burst badges/diagonal banners/CTA,
 * gold-on-text always deep wine. Giant price tags in white with deep-wine stroke;
 * countdown on dark-red tiles; motion slams in (power4.in landing + one pulse).
 */

import { type Block, mk } from './shared';

const msBurstClip =
  'polygon(50% 0%,59% 15%,75% 7%,76% 25%,93% 25%,85% 41%,100% 50%,85% 59%,93% 75%,76% 76%,75% 93%,59% 85%,50% 100%,41% 85%,25% 93%,24% 76%,7% 75%,15% 59%,0% 50%,15% 41%,7% 25%,24% 24%,25% 7%,41% 15%)';

const msRoot = (id: string) => `
#${id} .ms{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);overflow:hidden;}
#${id} .burst{position:absolute;clip-path:${msBurstClip};background:var(--panel);color:var(--accent-2);display:flex;align-items:center;justify-content:center;text-align:center;font-weight:900;line-height:1.1;}
#${id} .strip{position:absolute;left:-80px;right:-80px;background:var(--panel);color:var(--accent-2);font-weight:900;font-size:50px;letter-spacing:0.24em;padding:26px 0;text-align:center;white-space:nowrap;box-shadow:var(--shadow);}`;

export const cover: () => Block = () =>
  mk(
    'cv_ms',
    '封面',
    (id) => `
<div class="ms">
  <div class="h">爆炸</div>
  <div class="sub">MEGA SALE · 全场狂欢</div>
  <div class="burst" style="width:460px;height:460px;right:170px;top:110px;transform:rotate(10deg);font-size:130px;">5折</div>
  <div class="strip" style="bottom:180px;transform:rotate(-4deg);">限时开抢 — MEGA SALE — 限时开抢 — MEGA SALE</div>
</div>
<style>${msRoot(id)}
#${id} .h{position:absolute;left:150px;top:250px;font-size:330px;font-weight:900;line-height:1;transform:rotate(-3deg);-webkit-text-stroke:8px var(--accent-2);}
#${id} .sub{position:absolute;left:170px;top:670px;font-size:54px;font-weight:800;letter-spacing:0.24em;color:var(--muted);}
</style>`,
    (id) =>
      `tl.from('#${id} .h',{scale:2.2,autoAlpha:0,duration:0.24,ease:'power4.in'},0);\n` +
      `tl.from('#${id} .sub',{autoAlpha:0,x:-40,duration:0.24},0.26);\n` +
      `tl.from('#${id} .burst',{scale:0,rotation:60,duration:0.3,ease:'back.out(2)'},0.3);\n` +
      `tl.from('#${id} .strip',{x:-320,autoAlpha:0,duration:0.28,ease:'power3.out'},0.42);`,
  );

export const blocks: Record<string, () => Block> = {
  'title-card': () =>
    mk(
      'ms_ttl',
      'title-card',
      (id) => `
<div class="ms">
  <div class="strip" style="top:130px;transform:rotate(-4deg);">今日爆款 — 全场直降 — 今日爆款 — 全场直降</div>
  <div class="h">全场直降<br/>五折起</div>
  <div class="burst" style="width:430px;height:430px;right:160px;bottom:170px;transform:rotate(-8deg);font-size:100px;">立减</div>
  <div class="fine">数量有限 · 抢完即止 · FINAL CALL</div>
</div>
<style>${msRoot(id)}
#${id} .ms{background-color:var(--paper);}
#${id} .h{position:absolute;left:160px;top:340px;font-size:150px;font-weight:900;line-height:1.18;transform:rotate(-2deg);}
#${id} .fine{position:absolute;left:160px;right:660px;bottom:110px;font-size:34px;font-weight:700;letter-spacing:0.3em;color:var(--muted);border-top:2px solid var(--line);padding-top:26px;}
</style>`,
      (id) =>
        `tl.from('#${id} .h',{scale:2.2,autoAlpha:0,duration:0.24,ease:'power4.in'},0);\n` +
        `tl.from('#${id} .strip',{x:-320,autoAlpha:0,duration:0.26,ease:'power3.out'},0.26);\n` +
        `tl.from('#${id} .burst',{scale:0,rotation:-70,duration:0.3,ease:'back.out(2)'},0.38);\n` +
        `tl.from('#${id} .fine',{autoAlpha:0,duration:0.24},0.6);`,
    ),
  'big-number': () =>
    mk(
      'ms_num',
      'big-number',
      (id) => `
<div class="ms">
  <div class="old">日常价 ¥399</div>
  <div class="price"><i>¥</i>199</div>
  <div class="burst" style="width:390px;height:390px;right:200px;top:120px;transform:rotate(12deg);font-size:96px;">-50%</div>
  <div class="strip" style="bottom:130px;transform:rotate(-3deg);">今晚 20:00 开抢 — TONIGHT ONLY — 今晚 20:00 开抢</div>
</div>
<style>${msRoot(id)}
#${id} .ms{background-color:var(--paper);}
#${id} .old{position:absolute;left:180px;top:190px;font-size:80px;font-weight:700;color:var(--muted);text-decoration:line-through;}
#${id} .price{position:absolute;left:150px;top:270px;font-size:460px;font-weight:900;line-height:1.05;letter-spacing:-0.02em;-webkit-text-stroke:6px var(--accent-2);}
#${id} .price i{font-style:normal;font-size:180px;color:var(--accent);-webkit-text-stroke:2px var(--accent-2);margin-right:16px;}
</style>`,
      (id) =>
        `tl.from('#${id} .old',{autoAlpha:0,y:-24,duration:0.2},0);\n` +
        `tl.from('#${id} .price',{scale:2.4,autoAlpha:0,duration:0.22,ease:'power4.in'},0.12);\n` +
        `tl.to('#${id} .price',{scale:1.06,duration:0.12,yoyo:true,repeat:1},0.42);\n` +
        `tl.from('#${id} .burst',{scale:0,rotation:80,duration:0.28,ease:'back.out(2)'},0.6);\n` +
        `tl.from('#${id} .strip',{x:320,autoAlpha:0,duration:0.26,ease:'power3.out'},0.72);`,
    ),
  'count-up': () =>
    mk(
      'ms_prc',
      'count-up',
      (id) => `
<div class="ms">
  <div class="k">价 格 崩 了</div>
  <div class="old"><span>原价 ¥1299</span><i class="cut"></i></div>
  <div class="price"><i>¥</i><b class="v">899</b></div>
  <div class="burst" style="width:380px;height:380px;right:200px;top:330px;transform:rotate(12deg);font-size:84px;">省400</div>
  <div class="fine">今夜恢复原价 · 仅此一批 · 手慢无</div>
</div>
<style>${msRoot(id)}
#${id} .ms{background-color:var(--paper);}
#${id} .k{position:absolute;left:0;right:0;top:150px;text-align:center;font-size:46px;font-weight:800;letter-spacing:0.4em;color:var(--muted);}
#${id} .old{position:absolute;left:180px;top:300px;font-size:72px;font-weight:700;color:var(--muted);}
#${id} .cut{position:absolute;left:-26px;right:-26px;top:50%;height:12px;background:var(--panel);transform:rotate(-5deg);box-shadow:var(--shadow);}
#${id} .price{position:absolute;left:160px;top:390px;font-size:440px;font-weight:900;line-height:1.05;letter-spacing:-0.02em;-webkit-text-stroke:6px var(--accent-2);}
#${id} .price i{font-style:normal;font-size:170px;color:var(--accent);-webkit-text-stroke:2px var(--accent-2);margin-right:16px;}
#${id} .fine{position:absolute;left:180px;right:700px;bottom:110px;font-size:34px;font-weight:700;letter-spacing:0.3em;color:var(--muted);border-top:2px solid var(--line);padding-top:26px;}
</style>`,
      (id) =>
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .old',{autoAlpha:0,y:-24,duration:0.2},0.04);\n` +
        `tl.from('#${id} .price',{scale:2.4,autoAlpha:0,duration:0.22,ease:'power4.in'},0.08);\n` +
        `tl.from('#${id} .v',{innerText:1299,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .cut',{scaleX:0,transformOrigin:'left center',duration:0.22,ease:'power3.out'},0.36);\n` +
        `tl.from('#${id} .burst',{scale:0,rotation:70,duration:0.28,ease:'back.out(2)'},0.66);\n` +
        `tl.from('#${id} .fine',{autoAlpha:0,duration:0.24},0.9);\n` +
        `tl.to('#${id} .price',{scale:1.06,duration:0.1,yoyo:true,repeat:1},0.96);`,
    ),
  'cta': () =>
    mk(
      'ms_cta',
      'cta',
      (id) => `
<div class="ms">
  <div class="k">距 结 束 仅 剩</div>
  <div class="cd"><div class="t">00</div><i>:</i><div class="t">12</div><i>:</i><div class="t">45</div></div>
  <div class="cta">马上抢购 ▶</div>
  <div class="burst" style="width:340px;height:340px;right:140px;top:110px;transform:rotate(10deg);font-size:76px;">仅限<br/>今天</div>
</div>
<style>${msRoot(id)}
#${id} .ms{background-color:var(--paper);}
#${id} .k{position:absolute;left:0;right:0;top:170px;text-align:center;font-size:46px;font-weight:800;letter-spacing:0.4em;color:var(--muted);}
#${id} .cd{position:absolute;left:0;right:0;top:280px;display:flex;align-items:center;justify-content:center;gap:34px;}
#${id} .t{background:var(--panel-2);border-radius:var(--radius);padding:26px 46px;font-family:var(--font-num);font-size:150px;font-weight:800;box-shadow:var(--shadow);}
#${id} .cd i{font-style:normal;font-size:120px;font-weight:900;color:var(--accent);}
#${id} .cta{position:absolute;left:50%;bottom:190px;transform:translateX(-50%) rotate(-2deg);background:var(--panel);color:var(--accent-2);font-size:104px;font-weight:900;letter-spacing:0.06em;padding:44px 120px;border-radius:var(--radius);box-shadow:var(--glow);}
</style>`,
      (id) =>
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .t',{y:-90,autoAlpha:0,duration:0.24,stagger:0.1,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .cd i',{autoAlpha:0,duration:0.18},0.4);\n` +
        `tl.from('#${id} .cta',{scale:2,autoAlpha:0,duration:0.22,ease:'power4.in'},0.5);\n` +
        `tl.to('#${id} .cta',{scale:1.05,duration:0.12,yoyo:true,repeat:1},0.8);\n` +
        `tl.from('#${id} .burst',{scale:0,rotation:70,duration:0.26,ease:'back.out(2)'},0.7);`,
    ),
  'countdown': () =>
    mk(
      'ms_cdt',
      'countdown',
      (id) => `
<div class="ms">
  <div class="k">距 开 抢 仅 剩</div>
  <div class="cd">
    <div class="u"><div class="t">00</div><span>时</span></div>
    <i>:</i>
    <div class="u"><div class="t">59</div><span>分</span></div>
    <i>:</i>
    <div class="u"><div class="t sec">59</div><span>秒</span></div>
  </div>
  <div class="burst" style="width:300px;height:300px;right:150px;top:80px;transform:rotate(10deg);font-size:72px;">秒杀</div>
  <div class="strip" style="bottom:150px;transform:rotate(-3deg);">今晚 8 点开抢 — 8PM TONIGHT — 今晚 8 点开抢 — 8PM TONIGHT</div>
</div>
<style>${msRoot(id)}
#${id} .ms{background-color:var(--paper);}
#${id} .k{position:absolute;left:0;right:0;top:160px;text-align:center;font-size:46px;font-weight:800;letter-spacing:0.4em;color:var(--muted);}
#${id} .cd{position:absolute;left:0;right:0;top:330px;display:flex;justify-content:center;gap:44px;}
#${id} .u{display:flex;flex-direction:column;align-items:center;gap:26px;}
#${id} .t{background:var(--panel-2);border-radius:var(--radius);padding:26px 50px;font-family:var(--font-num);font-size:180px;font-weight:800;line-height:1;box-shadow:var(--shadow);}
#${id} .u span{font-size:38px;font-weight:800;letter-spacing:0.3em;color:var(--muted);}
#${id} .cd i{font-style:normal;font-size:140px;font-weight:900;color:var(--accent);margin-top:46px;}
</style>`,
      (id) =>
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .u',{y:-90,autoAlpha:0,duration:0.24,stagger:0.1,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .cd i',{autoAlpha:0,duration:0.18},0.44);\n` +
        `tl.from('#${id} .sec',{innerText:53,snap:{innerText:1},duration:0.5,ease:'power1.out'},0.5);\n` +
        `tl.from('#${id} .burst',{scale:0,rotation:70,duration:0.26,ease:'back.out(2)'},0.62);\n` +
        `tl.from('#${id} .strip',{x:-320,autoAlpha:0,duration:0.26,ease:'power3.out'},0.78);`,
    ),
  'compare': () =>
    mk(
      'ms_cmp',
      'compare',
      (id) => `
<div class="ms">
  <div class="k">别 再 花 冤 枉 钱</div>
  <div class="slab"><span>日常价</span><b>¥399</b></div>
  <div class="burst" style="width:620px;height:620px;right:180px;top:230px;transform:rotate(10deg);font-size:110px;">现价<br/>¥199</div>
  <div class="fine">同款同源 · 直降 200 · 仅此一批</div>
</div>
<style>${msRoot(id)}
#${id} .ms{background-color:var(--paper);}
#${id} .k{position:absolute;left:0;right:0;top:150px;text-align:center;font-size:46px;font-weight:800;letter-spacing:0.4em;color:var(--muted);}
#${id} .slab{position:absolute;left:180px;top:400px;transform:rotate(-3deg);background:var(--panel-2);border-radius:var(--radius);box-shadow:var(--shadow);padding:56px 90px;display:flex;flex-direction:column;gap:20px;}
#${id} .slab span{font-size:40px;font-weight:800;letter-spacing:0.2em;color:var(--muted);}
#${id} .slab b{font-family:var(--font-num);font-size:150px;font-weight:800;color:var(--muted);text-decoration:line-through;}
#${id} .fine{position:absolute;left:180px;right:860px;bottom:110px;font-size:34px;font-weight:700;letter-spacing:0.3em;color:var(--muted);border-top:2px solid var(--line);padding-top:26px;}
</style>`,
      (id) =>
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .slab',{x:-320,autoAlpha:0,duration:0.24,ease:'power3.out'},0.1);\n` +
        `tl.from('#${id} .burst',{scale:0,rotation:70,duration:0.3,ease:'back.out(2)'},0.4);\n` +
        `tl.to('#${id} .burst',{scale:1.06,duration:0.12,yoyo:true,repeat:1},0.76);\n` +
        `tl.from('#${id} .fine',{autoAlpha:0,duration:0.24},0.9);`,
    ),
  'list': () =>
    mk(
      'ms_lst',
      'list',
      (id) => `
<div class="ms">
  <div class="h">今日爆款清单</div>
  <div class="row r1"><b>1</b><span>无线吸尘器</span><em>¥199</em></div>
  <div class="row r2"><b>2</b><span>速干吹风机</span><em>¥99</em></div>
  <div class="row r3"><b>3</b><span>迷你破壁机</span><em>¥159</em></div>
  <div class="fine">前 100 名下单再减 10 元 · 抢完恢复原价</div>
</div>
<style>${msRoot(id)}
#${id} .ms{background-color:var(--paper);}
#${id} .h{position:absolute;left:160px;top:110px;font-size:110px;font-weight:900;transform:rotate(-2deg);}
#${id} .row{position:absolute;left:160px;display:flex;align-items:center;gap:44px;background:var(--panel);color:var(--accent-2);border-radius:var(--radius);box-shadow:var(--shadow);padding:26px 64px;font-weight:900;}
#${id} .row b{font-size:64px;}
#${id} .row span{font-size:64px;flex:1;}
#${id} .row em{font-style:normal;font-family:var(--font-num);font-size:76px;font-weight:800;}
#${id} .r1{top:320px;right:520px;transform:rotate(-1.5deg);}
#${id} .r2{top:500px;right:440px;transform:rotate(1deg);}
#${id} .r3{top:680px;right:560px;transform:rotate(-1deg);}
#${id} .fine{position:absolute;left:160px;right:660px;bottom:100px;font-size:34px;font-weight:700;letter-spacing:0.3em;color:var(--muted);border-top:2px solid var(--line);padding-top:26px;}
</style>`,
      (id) =>
        `tl.from('#${id} .h',{scale:2.2,autoAlpha:0,duration:0.24,ease:'power4.in'},0);\n` +
        `tl.from('#${id} .r1',{x:-320,autoAlpha:0,duration:0.24,ease:'power3.out'},0.28);\n` +
        `tl.from('#${id} .r2',{x:320,autoAlpha:0,duration:0.24,ease:'power3.out'},0.4);\n` +
        `tl.from('#${id} .r3',{x:-320,autoAlpha:0,duration:0.24,ease:'power3.out'},0.52);\n` +
        `tl.from('#${id} .fine',{autoAlpha:0,duration:0.24},0.8);`,
    ),
  'steps': () =>
    mk(
      'ms_stp',
      'steps',
      (id) => `
<div class="ms">
  <div class="k">三 步 抢 到 手</div>
  <div class="tiles">
    <div class="tile"><i>领券</i><b>1</b><span>先领 200 券</span></div>
    <div class="tile"><i>下单</i><b>2</b><span>整点拍下</span></div>
    <div class="tile"><i>付款</i><b>3</b><span>立省一半</span></div>
  </div>
  <div class="strip" style="bottom:130px;transform:rotate(-3deg);">零点截单 — 手慢无 — 零点截单 — 手慢无</div>
</div>
<style>${msRoot(id)}
#${id} .ms{background-color:var(--paper);}
#${id} .k{position:absolute;left:0;right:0;top:140px;text-align:center;font-size:46px;font-weight:800;letter-spacing:0.4em;color:var(--muted);}
#${id} .tiles{position:absolute;left:170px;right:170px;top:290px;display:flex;gap:60px;}
#${id} .tile{position:relative;flex:1;background:var(--panel-2);border-radius:var(--radius);box-shadow:var(--shadow);padding:80px 40px 60px;display:flex;flex-direction:column;align-items:center;gap:24px;}
#${id} .tile b{font-family:var(--font-num);font-size:170px;font-weight:800;line-height:1;}
#${id} .tile span{font-size:44px;font-weight:800;}
#${id} .tile i{position:absolute;left:-24px;top:-26px;transform:rotate(-6deg);font-style:normal;background:var(--panel);color:var(--accent-2);font-size:38px;font-weight:900;letter-spacing:0.1em;padding:14px 34px;box-shadow:var(--shadow);}
</style>`,
      (id) =>
        `tl.from('#${id} .k',{autoAlpha:0,duration:0.2},0);\n` +
        `tl.from('#${id} .tile',{y:-90,autoAlpha:0,duration:0.24,stagger:0.1,ease:'power3.out'},0.08);\n` +
        `tl.from('#${id} .tile i',{scale:0,rotation:-60,duration:0.26,stagger:0.1,ease:'back.out(2)'},0.44);\n` +
        `tl.from('#${id} .strip',{x:-320,autoAlpha:0,duration:0.26,ease:'power3.out'},0.84);`,
    ),
};
