/* ================================================================
   Cream — sticker-candy dialect: tilted stickers, pills, dot accents
   ================================================================ */

import { type Block, mk } from './shared';

export const blocks: Record<string, () => Block> = {
  'title-card': () =>
    mk(
      'cr_ttl',
      'title-card',
      (id) => `
<div class="rt">
  <div class="stick">
    <div class="h">外脆里糯的秘密</div>
    <div class="dots"><i></i><i></i><i></i></div>
  </div>
  <div class="badge">今日菜谱</div>
  <div class="pearl p1"></div><div class="pearl p2"></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
#${id} .stick{position:absolute;left:180px;right:220px;top:50%;transform:translateY(-52%) rotate(-2deg);background:var(--panel);border-radius:56px;box-shadow:var(--shadow);padding:120px 110px;display:flex;flex-direction:column;gap:54px;}
#${id} .h{font-size:150px;font-weight:800;letter-spacing:0.01em;}
#${id} .dots{display:flex;gap:26px;}
#${id} .dots i{width:26px;height:26px;border-radius:999px;background:var(--accent);}
#${id} .dots i:nth-child(2){background:var(--accent-2);}
#${id} .dots i:nth-child(3){background:var(--panel-2);}
#${id} .badge{position:absolute;right:150px;top:190px;transform:rotate(6deg);background:var(--accent);color:#fff;font-size:48px;font-weight:800;padding:30px 56px;border-radius:999px;box-shadow:var(--glow);}
#${id} .pearl{position:absolute;border-radius:999px;background:var(--panel-2);}
#${id} .pearl.p1{width:120px;height:120px;left:90px;bottom:120px;}
#${id} .pearl.p2{width:64px;height:64px;right:130px;bottom:230px;background:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .stick',{y:70,autoAlpha:0,rotation:-6,duration:0.36,ease:'back.out(1.6)'},0);\n` +
        `tl.from('#${id} .badge',{scale:0,duration:0.3,ease:'back.out(2)'},0.24);\n` +
        `tl.from('#${id} .pearl',{scale:0,duration:0.25,stagger:0.08,ease:'back.out(2)'},0.3);`,
    ),
  'steps': () =>
    mk(
      'cr_stp',
      'steps',
      (id) => `
<div class="rt">
  <div class="c c1"><b>1</b><span>备料</span></div>
  <div class="c c2"><b>2</b><span>下锅</span></div>
  <div class="c c3"><b>3</b><span>出餐</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);font-family:var(--font-head);color:var(--fg);}
#${id} .c{position:absolute;top:50%;width:430px;padding:90px 0 70px;background:var(--panel);border-radius:48px;box-shadow:var(--shadow);display:flex;flex-direction:column;align-items:center;gap:30px;}
#${id} .c b{width:150px;height:150px;border-radius:999px;background:var(--panel-2);display:flex;align-items:center;justify-content:center;font-size:76px;font-weight:800;color:var(--accent);}
#${id} .c1 b{background:var(--accent);color:#fff;box-shadow:var(--glow);}
#${id} .c span{font-size:60px;font-weight:700;}
#${id} .c1{left:170px;transform:translateY(-50%) rotate(-5deg);}
#${id} .c2{left:50%;transform:translate(-50%,-56%);z-index:2;}
#${id} .c3{right:170px;transform:translateY(-50%) rotate(5deg);}
</style>`,
      (id) => `tl.from('#${id} .c',{y:90,autoAlpha:0,duration:0.34,stagger:0.12,ease:'back.out(1.7)'},0);`,
    ),
  'list': () =>
    mk(
      'cr_lst',
      'list',
      (id) => `
<div class="rt">
  <div class="h">食材清单</div>
  <div class="chips">
    <span class="chip a">糯米粉 200g</span><span class="chip">牛奶 150ml</span><span class="chip b">黄油 30g</span>
    <span class="chip">白糖 40g</span><span class="chip a">芝士碎 一把</span><span class="chip">盐 一撮</span>
  </div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);padding:170px 180px;font-family:var(--font-head);color:var(--fg);display:flex;flex-direction:column;justify-content:center;gap:70px;}
#${id} .h{font-size:96px;font-weight:800;}
#${id} .chips{display:flex;flex-wrap:wrap;gap:34px;}
#${id} .chip{padding:34px 58px;border-radius:999px;background:var(--panel);box-shadow:var(--shadow);font-size:54px;font-weight:700;}
#${id} .chip.a{background:var(--accent);color:#fff;}
#${id} .chip.b{background:var(--accent-2);color:#fff;}
</style>`,
      (id) =>
        `tl.from('#${id} .h',{autoAlpha:0,y:30,duration:0.26},0);\n` +
        `tl.from('#${id} .chip',{scale:0,duration:0.26,stagger:0.07,ease:'back.out(1.8)'},0.12);`,
    ),
  'big-number': () =>
    mk(
      'cr_num',
      'big-number',
      (id) => `
<div class="rt">
  <div class="blob"><b>180°C</b><span>· 12 分钟 ·</span></div>
  <div class="spr s1"></div><div class="spr s2"></div><div class="spr s3"></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);font-family:var(--font-head);color:var(--fg);}
#${id} .blob{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-2deg);background:var(--panel);border-radius:44% 56% 52% 48% / 55% 46% 54% 45%;box-shadow:var(--shadow);width:1120px;height:660px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;}
#${id} .blob b{font-family:var(--font-num);font-size:230px;font-weight:800;color:var(--accent);letter-spacing:-0.03em;}
#${id} .blob span{font-size:56px;font-weight:700;color:var(--muted);}
#${id} .spr{position:absolute;border-radius:999px;}
#${id} .spr.s1{width:70px;height:70px;left:250px;top:200px;background:var(--accent-2);}
#${id} .spr.s2{width:44px;height:44px;right:290px;top:260px;background:var(--accent);}
#${id} .spr.s3{width:94px;height:94px;right:210px;bottom:170px;background:var(--panel-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .blob',{scale:0.6,autoAlpha:0,duration:0.38,ease:'back.out(1.5)'},0);\n` +
        `tl.from('#${id} .spr',{scale:0,duration:0.26,stagger:0.09,ease:'back.out(2)'},0.24);`,
    ),
  'count-up': () =>
    mk(
      'cr_prc',
      'count-up',
      (id) => `
<div class="rt">
  <div class="old"><span class="tag">原价</span><b>¥29.9</b><i class="strike"></i></div>
  <div class="save">立省 ¥10</div>
  <div class="blob">
    <div class="row"><i class="cur">¥</i><b class="v">19</b><i class="dec">.9</i></div>
    <span class="cap">今日到手价</span>
  </div>
  <div class="spr s1"></div><div class="spr s2"></div><div class="spr s3"></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);font-family:var(--font-head);color:var(--fg);}
#${id} .old{position:absolute;left:230px;top:150px;z-index:2;transform:rotate(-6deg);background:var(--panel);border-radius:36px;box-shadow:var(--shadow);padding:34px 52px;display:flex;align-items:baseline;gap:24px;}
#${id} .tag{font-size:34px;font-weight:700;color:var(--muted);}
#${id} .old b{font-family:var(--font-num);font-size:76px;font-weight:800;color:var(--muted);}
#${id} .strike{position:absolute;left:26px;right:26px;top:54%;height:12px;border-radius:999px;background:var(--fg);transform:rotate(-7deg);}
#${id} .save{position:absolute;right:210px;top:190px;z-index:2;transform:rotate(7deg);background:var(--accent-2);color:#fff;font-size:46px;font-weight:800;padding:28px 52px;border-radius:999px;box-shadow:var(--shadow);}
#${id} .blob{position:absolute;left:50%;top:55%;transform:translate(-50%,-50%) rotate(-2deg);background:var(--panel);border-radius:44% 56% 52% 48% / 55% 46% 54% 45%;box-shadow:var(--shadow);width:1120px;height:640px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;}
#${id} .row{display:flex;align-items:baseline;font-family:var(--font-num);color:var(--accent);}
#${id} .cur{font-style:normal;font-size:120px;font-weight:800;margin-right:16px;}
#${id} .v{font-size:250px;font-weight:800;line-height:1;letter-spacing:-0.03em;}
#${id} .dec{font-style:normal;font-size:150px;font-weight:800;}
#${id} .cap{font-size:52px;font-weight:700;color:var(--muted);}
#${id} .spr{position:absolute;border-radius:999px;}
#${id} .spr.s1{width:70px;height:70px;left:220px;bottom:200px;background:var(--accent-2);}
#${id} .spr.s2{width:44px;height:44px;right:300px;top:340px;background:var(--accent);}
#${id} .spr.s3{width:94px;height:94px;right:230px;bottom:160px;background:var(--panel-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .old',{y:-40,autoAlpha:0,rotation:-14,duration:0.3,ease:'back.out(1.7)'},0);\n` +
        `tl.from('#${id} .blob',{scale:0.6,autoAlpha:0,duration:0.38,ease:'back.out(1.5)'},0.08);\n` +
        `tl.from('#${id} .v',{innerText:29,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15);\n` +
        `tl.from('#${id} .strike',{scaleX:0,transformOrigin:'left center',duration:0.26,ease:'power2.out'},0.48);\n` +
        `tl.from('#${id} .save',{scale:0,duration:0.3,ease:'back.out(2)'},0.6);\n` +
        `tl.from('#${id} .spr',{scale:0,duration:0.26,stagger:0.09,ease:'back.out(2)'},0.66);`,
    ),
  'cta': () =>
    mk(
      'cr_cta',
      'cta',
      (id) => `
<div class="rt">
  <div class="t">收藏防丢 · 配方在评论区</div>
  <div class="btn">＋ 关注</div>
  <div class="hearts"><i>🧡</i><i>💛</i><i>🧡</i></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:64px;font-family:var(--font-head);color:var(--fg);}
#${id} .t{font-size:76px;font-weight:800;}
#${id} .btn{padding:48px 130px;border-radius:999px;background:var(--accent);color:#fff;font-size:80px;font-weight:800;box-shadow:var(--glow);transform:rotate(-1.5deg);}
#${id} .hearts{display:flex;gap:44px;font-size:64px;}
#${id} .hearts i{font-style:normal;display:inline-block;}
#${id} .hearts i:nth-child(1){transform:rotate(-12deg);}
#${id} .hearts i:nth-child(3){transform:rotate(12deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .t',{y:34,autoAlpha:0,duration:0.28},0);\n` +
        `tl.from('#${id} .btn',{scale:0.4,autoAlpha:0,duration:0.32,ease:'back.out(1.8)'},0.14);\n` +
        `tl.from('#${id} .hearts i',{y:40,autoAlpha:0,duration:0.26,stagger:0.08,ease:'back.out(2)'},0.34);`,
    ),
  'quote': () =>
    mk(
      'cr_qte',
      'quote',
      (id) => `
<div class="rt">
  <div class="stick">
    <div class="q">“外脆里糯,<b>一口上瘾</b>”</div>
    <div class="a">—— 今日试吃结论</div>
    <div class="dots"><i></i><i></i><i></i></div>
  </div>
  <div class="pearl p1"></div><div class="pearl p2"></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);color:var(--fg);font-family:var(--font-head);}
#${id} .stick{position:absolute;left:210px;right:210px;top:50%;transform:translateY(-52%) rotate(2deg);background:var(--panel);border-radius:56px;box-shadow:var(--shadow);padding:110px 100px;display:flex;flex-direction:column;gap:48px;}
#${id} .q{font-size:108px;font-weight:800;line-height:1.35;}
#${id} .q b{color:var(--accent);}
#${id} .a{font-size:44px;font-weight:700;color:var(--muted);}
#${id} .dots{display:flex;gap:26px;}
#${id} .dots i{width:26px;height:26px;border-radius:999px;background:var(--accent);}
#${id} .dots i:nth-child(2){background:var(--accent-2);}
#${id} .dots i:nth-child(3){background:var(--panel-2);}
#${id} .pearl{position:absolute;border-radius:999px;background:var(--panel-2);}
#${id} .pearl.p1{width:100px;height:100px;left:110px;top:170px;}
#${id} .pearl.p2{width:70px;height:70px;right:130px;bottom:160px;background:var(--accent-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .stick',{y:70,autoAlpha:0,rotation:7,duration:0.36,ease:'back.out(1.6)'},0);\n` +
        `tl.from('#${id} .q b',{autoAlpha:0,duration:0.24},0.28);\n` +
        `tl.from('#${id} .dots i,#${id} .pearl',{scale:0,duration:0.25,stagger:0.07,ease:'back.out(2)'},0.32);`,
    ),
  'comments': () =>
    mk(
      'cr_cmt',
      'comments',
      (id) => `
<div class="rt">
  <div class="h">评论区炸了</div>
  <div class="cm c1"><span class="av a1">🍚</span><div class="tx"><b>干饭魁首</b><span class="say">拉丝那一下我直接空腹开冲</span></div><span class="lk hot">🧡 3.2k</span></div>
  <div class="cm c2"><span class="av a2">🧀</span><div class="tx"><b>芝士就是力量</b><span class="say">照着做了,出锅十分钟就被抢光</span></div><span class="lk">🧡 1.8k</span></div>
  <div class="cm c3"><span class="av a3">🌙</span><div class="tx"><b>深夜放毒署</b><span class="say">半夜刷到这个真的会饿哭</span></div><span class="lk">🧡 996</span></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);font-family:var(--font-head);color:var(--fg);}
#${id} .h{position:absolute;left:180px;top:120px;font-size:92px;font-weight:800;}
#${id} .cm{position:absolute;width:1240px;background:var(--panel);border-radius:44px;box-shadow:var(--shadow);padding:40px 52px;display:flex;align-items:center;gap:36px;}
#${id} .c1{left:200px;top:290px;transform:rotate(-3deg);}
#${id} .c2{left:440px;top:540px;transform:rotate(1.5deg);z-index:2;}
#${id} .c3{left:250px;top:790px;transform:rotate(-2deg);}
#${id} .av{width:110px;height:110px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:56px;flex:none;}
#${id} .a1{background:var(--accent-2);}
#${id} .a2{background:var(--panel-2);}
#${id} .a3{background:var(--accent-2);}
#${id} .tx{display:flex;flex-direction:column;gap:12px;flex:1;}
#${id} .tx b{font-size:38px;font-weight:800;color:var(--muted);}
#${id} .say{font-size:50px;font-weight:700;}
#${id} .lk{flex:none;background:var(--panel-2);border-radius:999px;padding:20px 36px;font-size:38px;font-weight:800;}
#${id} .lk.hot{background:var(--accent);color:#fff;box-shadow:var(--glow);}
</style>`,
      (id) =>
        `tl.from('#${id} .h',{autoAlpha:0,y:30,duration:0.26},0);\n` +
        `tl.from('#${id} .cm',{y:80,autoAlpha:0,rotation:5,duration:0.34,stagger:0.12,ease:'back.out(1.7)'},0.1);\n` +
        `tl.from('#${id} .lk',{scale:0,duration:0.26,stagger:0.1,ease:'back.out(2)'},0.5);`,
    ),
  'chart': () =>
    mk(
      'cr_bar',
      'chart',
      (id) => `
<div class="rt">
  <div class="h">全网人气打分</div>
  <div class="plot">
    <div class="b"><i class="top">7.8</i><i class="stem" style="height:200px"></i><span>原味</span></div>
    <div class="b"><i class="top">8.5</i><i class="stem" style="height:300px"></i><span>芝士</span></div>
    <div class="b hot"><i class="top">9.6</i><i class="stem" style="height:430px"></i><span>麻薯</span></div>
    <div class="b"><i class="top">8.1</i><i class="stem" style="height:250px"></i><span>抹茶</span></div>
  </div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;background:var(--paper);font-family:var(--font-head);color:var(--fg);}
#${id} .h{position:absolute;left:180px;top:140px;font-size:92px;font-weight:800;}
#${id} .plot{position:absolute;left:180px;right:180px;bottom:130px;display:flex;align-items:flex-end;justify-content:center;gap:150px;}
#${id} .b{display:flex;flex-direction:column;align-items:center;}
#${id} .top{font-style:normal;width:136px;height:136px;border-radius:999px;background:var(--panel-2);box-shadow:var(--shadow);display:flex;align-items:center;justify-content:center;font-family:var(--font-num);font-size:52px;font-weight:800;margin-bottom:-18px;position:relative;z-index:2;}
#${id} .stem{width:58px;border-radius:999px;background:var(--panel);box-shadow:var(--shadow);}
#${id} .b span{margin-top:28px;font-size:46px;font-weight:700;color:var(--muted);}
#${id} .b.hot .top{background:var(--accent);color:var(--paper);box-shadow:var(--glow);}
#${id} .b.hot .stem{background:var(--accent-2);}
#${id} .b.hot span{color:var(--fg);}
</style>`,
      (id) =>
        `tl.from('#${id} .h',{autoAlpha:0,y:30,duration:0.26},0);\n` +
        `tl.from('#${id} .stem',{scaleY:0,transformOrigin:'bottom',duration:0.32,stagger:0.09,ease:'power2.out'},0.1);\n` +
        `tl.from('#${id} .top',{scale:0,duration:0.28,stagger:0.09,ease:'back.out(1.8)'},0.28);\n` +
        `tl.from('#${id} .b span',{autoAlpha:0,duration:0.24},0.66);`,
    ),
};

/** Cover — list thumbnail: the theme name is the hero (see showcase-blocks.ts). */
export const cover: () => Block = () =>
    mk(
      'cv_cr',
      '封面',
      (id) => `
<div class="rt">
  <div class="stick"><div class="h">奶油</div><div class="s">CREAM · 好吃的排版</div></div>
  <div class="badge">FRAME</div>
  <div class="pearl p1"></div><div class="pearl p2"></div><div class="pearl p3"></div>
</div>
<style>
#${id} .rt{position:absolute;inset:0;font-family:var(--font-head);color:var(--fg);}
#${id} .stick{position:absolute;left:50%;top:50%;transform:translate(-50%,-52%) rotate(-2deg);background:var(--panel);border-radius:64px;box-shadow:var(--shadow);padding:100px 180px;display:flex;flex-direction:column;align-items:center;gap:30px;}
#${id} .h{font-size:260px;font-weight:800;line-height:1;}
#${id} .s{font-size:44px;font-weight:700;color:var(--accent);letter-spacing:0.18em;}
#${id} .badge{position:absolute;right:220px;top:150px;transform:rotate(8deg);background:var(--accent);color:#fff;font-size:44px;font-weight:800;padding:26px 52px;border-radius:999px;box-shadow:var(--glow);}
#${id} .pearl{position:absolute;border-radius:999px;background:var(--panel-2);}
#${id} .pearl.p1{width:110px;height:110px;left:150px;bottom:150px;}
#${id} .pearl.p2{width:60px;height:60px;left:280px;top:170px;background:var(--accent-2);}
#${id} .pearl.p3{width:80px;height:80px;right:180px;bottom:240px;background:var(--accent-2);}
</style>`,
      (id) => `tl.from('#${id} .stick',{scale:0.7,autoAlpha:0,rotation:-8,duration:0.34,ease:'back.out(1.6)'},0);\ntl.from('#${id} .badge,#${id} .pearl',{scale:0,duration:0.26,stagger:0.06,ease:'back.out(2)'},0.2);`,
    );
