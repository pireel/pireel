/**
 * Kawaii dialect — candy stickers: white bubbles always with a 5px deep-plum outline + pink soft
 * shadow, tilted 2-6°; speech bubbles have little tails; ✦✧ stars + blush dots as confetti;
 * everything enters with a back.out bounce.
 */

import { type Block, mk } from './shared';

const kwRoot = (id: string) => `
#${id} .kw{position:absolute;inset:0;color:var(--fg);font-family:var(--font-head);overflow:hidden;}
#${id} .star{position:absolute;font-style:normal;font-size:72px;line-height:1;color:var(--accent-2);}
#${id} .star.g{color:var(--accent);}
#${id} .blush{display:flex;gap:22px;}
#${id} .blush i{width:34px;height:34px;border-radius:999px;background:var(--accent);opacity:0.5;}`;

export const cover: () => Block = () =>
  mk(
    'cv_kw',
    '封面',
    (id) => `
<div class="kw">
  <div class="bub">
    <div class="h">泡泡</div>
    <div class="blush"><i></i><i></i></div>
    <div class="pill">KAWAII · BUBBLE</div>
  </div>
  <div class="sat s1"></div><div class="sat s2"></div>
  <i class="star" style="left:220px;top:150px;transform:rotate(-14deg)">✦</i>
  <i class="star g" style="right:260px;top:190px;font-size:100px;transform:rotate(10deg)">✧</i>
  <i class="star" style="right:180px;bottom:190px;font-size:56px;transform:rotate(-8deg)">✦</i>
</div>
<style>${kwRoot(id)}
#${id} .bub{position:absolute;left:50%;top:50%;width:1120px;height:640px;transform:translate(-50%,-52%) rotate(-3deg);background:var(--panel);border:5px solid var(--fg);border-radius:999px;box-shadow:var(--shadow);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;}
#${id} .h{font-size:280px;font-weight:800;line-height:1;}
#${id} .pill{background:var(--accent);color:var(--paper);font-size:44px;font-weight:800;letter-spacing:0.14em;padding:22px 54px;border-radius:999px;box-shadow:var(--glow);transform:rotate(2deg);}
#${id} .sat{position:absolute;border-radius:999px;background:var(--panel);border:5px solid var(--fg);}
#${id} .sat.s1{width:130px;height:130px;left:170px;bottom:170px;}
#${id} .sat.s2{width:80px;height:80px;right:230px;bottom:300px;background:var(--panel-2);}
</style>`,
    (id) =>
      `tl.from('#${id} .bub',{scale:0.5,autoAlpha:0,rotation:-12,duration:0.38,ease:'back.out(1.6)'},0);\n` +
      `tl.from('#${id} .sat',{scale:0,duration:0.26,stagger:0.08,ease:'back.out(2)'},0.24);\n` +
      `tl.from('#${id} .star',{scale:0,autoAlpha:0,duration:0.24,stagger:0.09,ease:'back.out(2)'},0.4);`,
  );

export const blocks: Record<string, () => Block> = {
  标题卡: () =>
    mk(
      'kw_ttl',
      '标题卡',
      (id) => `
<div class="kw">
  <div class="bub">
    <div class="h">今天也要可可爱爱</div>
    <div class="blush"><i></i><i></i></div>
  </div>
  <div class="pill">日常 VLOG</div>
  <i class="star" style="left:180px;top:170px;transform:rotate(-12deg)">✦</i>
  <i class="star g" style="left:290px;bottom:180px;font-size:56px;transform:rotate(8deg)">✧</i>
  <i class="star" style="right:210px;bottom:200px;font-size:90px;transform:rotate(12deg)">✧</i>
</div>
<style>${kwRoot(id)}
#${id} .bub{position:absolute;left:230px;right:230px;top:50%;transform:translateY(-52%) rotate(-2deg);background:var(--panel);border:5px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);padding:120px 100px;display:flex;flex-direction:column;align-items:center;gap:46px;}
#${id} .h{font-size:128px;font-weight:800;letter-spacing:0.01em;}
#${id} .pill{position:absolute;right:280px;top:230px;transform:rotate(6deg);background:var(--accent);color:var(--paper);font-size:46px;font-weight:800;letter-spacing:0.08em;padding:24px 52px;border-radius:999px;box-shadow:var(--glow);}
</style>`,
      (id) =>
        `tl.from('#${id} .bub',{scale:0.55,autoAlpha:0,rotation:-10,duration:0.38,ease:'back.out(1.7)'},0);\n` +
        `tl.from('#${id} .pill',{scale:0,duration:0.28,ease:'back.out(2)'},0.28);\n` +
        `tl.from('#${id} .star',{scale:0,autoAlpha:0,duration:0.24,stagger:0.09,ease:'back.out(2)'},0.42);`,
    ),
  金句: () =>
    mk(
      'kw_qte',
      '金句',
      (id) => `
<div class="kw">
  <div class="bal">
    <div class="q">可爱就是生产力</div>
    <div class="who">—— 今日碎碎念</div>
    <div class="blush"><i></i><i></i></div>
    <div class="tail"></div>
  </div>
  <i class="star" style="left:250px;top:200px;transform:rotate(-10deg)">✦</i>
  <i class="star g" style="right:240px;top:260px;font-size:60px;transform:rotate(14deg)">✧</i>
  <i class="star" style="left:330px;bottom:170px;font-size:56px;transform:rotate(6deg)">✧</i>
</div>
<style>${kwRoot(id)}
#${id} .bal{position:absolute;left:50%;top:47%;width:1260px;transform:translate(-50%,-50%) rotate(-1.5deg);background:var(--panel);border:5px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);padding:110px 120px 100px;display:flex;flex-direction:column;align-items:center;gap:44px;}
#${id} .q{font-size:104px;font-weight:800;line-height:1.35;}
#${id} .who{font-size:36px;font-weight:700;color:var(--muted);}
#${id} .bal .blush{position:absolute;right:100px;top:70px;}
#${id} .tail{position:absolute;bottom:-36px;left:200px;width:64px;height:64px;background:var(--panel);border-right:5px solid var(--fg);border-bottom:5px solid var(--fg);transform:rotate(45deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .bal',{y:80,autoAlpha:0,duration:0.4,ease:'back.out(1.6)'},0);\n` +
        `tl.from('#${id} .who',{autoAlpha:0,duration:0.24},0.34);\n` +
        `tl.from('#${id} .star',{scale:0,autoAlpha:0,duration:0.24,stagger:0.1,ease:'back.out(2)'},0.44);`,
    ),
  问答: () =>
    mk(
      'kw_qa',
      '问答',
      (id) => `
<div class="kw">
  <div class="t">粉丝问箱</div>
  <div class="qb"><b>Q</b><span>蝴蝶结在哪买的呀?</span><div class="tail"></div></div>
  <div class="ab">
    <div class="ans"><b>A</b><span>置顶链接给你们啦</span></div>
    <div class="who">—— 本周翻牌回复</div>
    <div class="blush"><i></i><i></i></div>
    <div class="tail"></div>
  </div>
  <i class="star" style="right:250px;top:270px;transform:rotate(12deg)">✦</i>
  <i class="star g" style="left:230px;bottom:230px;font-size:60px;transform:rotate(-8deg)">✧</i>
  <i class="star" style="right:310px;bottom:190px;font-size:56px;transform:rotate(6deg)">✧</i>
</div>
<style>${kwRoot(id)}
#${id} .t{position:absolute;left:50%;top:110px;transform:translateX(-50%) rotate(-2deg);background:var(--panel);border:5px solid var(--fg);border-radius:999px;box-shadow:var(--shadow);font-size:48px;font-weight:800;padding:24px 66px;}
#${id} .qb{position:absolute;left:300px;top:290px;transform:rotate(-3deg);background:var(--accent);color:var(--paper);border-radius:999px;box-shadow:var(--glow);padding:28px 56px;display:flex;align-items:center;gap:26px;}
#${id} .qb b{font-size:46px;font-weight:800;}
#${id} .qb span{font-size:44px;font-weight:700;white-space:nowrap;}
#${id} .qb .tail{position:absolute;bottom:-22px;left:96px;width:44px;height:44px;background:var(--accent);transform:rotate(45deg);}
#${id} .ab{position:absolute;left:50%;top:63%;width:1240px;transform:translate(-50%,-50%) rotate(1.5deg);background:var(--panel);border:5px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);padding:84px 100px 72px;display:flex;flex-direction:column;align-items:center;gap:34px;}
#${id} .ans{display:flex;align-items:center;gap:36px;}
#${id} .ans b{font-size:84px;font-weight:800;color:var(--accent);}
#${id} .ans span{font-size:92px;font-weight:800;white-space:nowrap;}
#${id} .who{font-size:34px;font-weight:700;color:var(--muted);}
#${id} .ab .blush{position:absolute;right:96px;top:60px;}
#${id} .ab .tail{position:absolute;bottom:-36px;left:210px;width:64px;height:64px;background:var(--panel);border-right:5px solid var(--fg);border-bottom:5px solid var(--fg);transform:rotate(45deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .t',{scale:0,autoAlpha:0,duration:0.3,ease:'back.out(2)'},0);\n` +
        `tl.from('#${id} .qb',{scale:0,autoAlpha:0,rotation:-14,duration:0.3,ease:'back.out(2)'},0.16);\n` +
        `tl.from('#${id} .ab',{y:80,autoAlpha:0,duration:0.4,ease:'back.out(1.6)'},0.38);\n` +
        `tl.from('#${id} .who',{autoAlpha:0,duration:0.24},0.7);\n` +
        `tl.from('#${id} .star',{scale:0,autoAlpha:0,duration:0.24,stagger:0.09,ease:'back.out(2)'},0.76);`,
    ),
  评论: () =>
    mk(
      'kw_cmt',
      '评论',
      (id) => `
<div class="kw">
  <div class="t">评论区可爱发言</div>
  <div class="cm c1"><b>@奶糖酱</b><span>被可爱到循环三遍</span><em>♥ 328</em><div class="tail"></div></div>
  <div class="cm c2 hot"><b>@小熊软糖</b><span>蝴蝶结教程快出呀</span><em>♥ 512</em><div class="tail"></div></div>
  <div class="cm c3"><b>@云朵朵</b><span>已存图当壁纸啦</span><em>♥ 96</em><div class="tail"></div></div>
  <i class="star" style="right:300px;top:310px;transform:rotate(12deg)">✦</i>
  <i class="star g" style="right:240px;bottom:260px;font-size:60px;transform:rotate(-8deg)">✧</i>
</div>
<style>${kwRoot(id)}
#${id} .t{position:absolute;left:50%;top:120px;transform:translateX(-50%) rotate(-2deg);background:var(--panel);border:5px solid var(--fg);border-radius:999px;box-shadow:var(--shadow);font-size:48px;font-weight:800;padding:24px 66px;}
#${id} .cm{position:absolute;background:var(--panel);border:5px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);padding:36px 210px 40px 64px;display:flex;flex-direction:column;gap:14px;}
#${id} .cm b{font-size:34px;font-weight:800;color:var(--accent);}
#${id} .cm span{font-size:54px;font-weight:700;white-space:nowrap;}
#${id} .cm em{position:absolute;right:52px;top:50%;transform:translateY(-50%);font-style:normal;font-size:36px;font-weight:800;color:var(--accent);}
#${id} .cm .tail{position:absolute;bottom:-28px;left:110px;width:48px;height:48px;background:var(--panel);border-right:5px solid var(--fg);border-bottom:5px solid var(--fg);transform:rotate(45deg);}
#${id} .cm.hot{background:var(--accent);color:var(--paper);box-shadow:var(--glow);}
#${id} .cm.hot b,#${id} .cm.hot em{color:var(--paper);}
#${id} .cm.hot .tail{background:var(--accent);}
#${id} .c1{left:400px;top:290px;transform:rotate(-2deg);}
#${id} .c2{left:560px;top:500px;transform:rotate(2.5deg);}
#${id} .c3{left:440px;top:710px;transform:rotate(-3deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .t',{scale:0,autoAlpha:0,duration:0.3,ease:'back.out(2)'},0);\n` +
        `tl.from('#${id} .cm',{scale:0,autoAlpha:0,duration:0.32,stagger:0.14,ease:'back.out(2)'},0.14);\n` +
        `tl.from('#${id} .cm em',{scale:0,duration:0.22,stagger:0.14,ease:'back.out(2)'},0.5);\n` +
        `tl.from('#${id} .star',{scale:0,autoAlpha:0,duration:0.24,stagger:0.1,ease:'back.out(2)'},0.8);`,
    ),
  步骤: () =>
    mk(
      'kw_stp',
      '步骤',
      (id) => `
<div class="kw">
  <svg class="trail" viewBox="0 0 1920 1080"><path d="M430 600 Q695 400 960 450 Q1225 500 1490 600"/></svg>
  <div class="st s1"><b>1</b><span>梳妆出门</span></div>
  <div class="st s2"><b>2</b><span>街角觅食</span></div>
  <div class="st s3"><b>3</b><span>回家躺平</span></div>
  <i class="star" style="left:200px;top:180px;transform:rotate(-12deg)">✦</i>
  <i class="star g" style="right:230px;top:170px;font-size:60px;transform:rotate(10deg)">✧</i>
</div>
<style>${kwRoot(id)}
#${id} .trail{position:absolute;inset:0;width:1920px;height:1080px;}
#${id} .trail path{fill:none;stroke:var(--accent);stroke-width:10;stroke-linecap:round;stroke-dasharray:1 44;}
#${id} .st{position:absolute;width:200px;display:flex;flex-direction:column;align-items:center;gap:36px;}
#${id} .st b{width:200px;height:200px;border-radius:999px;background:var(--panel);border:5px solid var(--fg);box-shadow:var(--shadow);display:flex;align-items:center;justify-content:center;font-size:84px;font-weight:800;color:var(--accent);}
#${id} .st.s1 b{background:var(--accent);color:var(--paper);box-shadow:var(--glow);transform:rotate(-4deg);}
#${id} .st.s2 b{transform:rotate(3deg);}
#${id} .st.s3 b{transform:rotate(-3deg);}
#${id} .st span{font-size:52px;font-weight:700;white-space:nowrap;}
#${id} .st.s1{left:330px;top:500px;}
#${id} .st.s2{left:860px;top:350px;}
#${id} .st.s3{left:1390px;top:500px;}
</style>`,
      (id) =>
        `tl.from('#${id} .trail',{autoAlpha:0,duration:0.3},0);\n` +
        `tl.from('#${id} .st',{scale:0,autoAlpha:0,duration:0.32,stagger:0.14,ease:'back.out(2)'},0.12);\n` +
        `tl.from('#${id} .star',{scale:0,autoAlpha:0,duration:0.24,stagger:0.1,ease:'back.out(2)'},0.62);`,
    ),
  大数字: () =>
    mk(
      'kw_num',
      '大数字',
      (id) => `
<div class="kw">
  <div class="bub">
    <div class="n">30</div>
    <div class="w">连续打卡天数</div>
    <div class="blush"><i></i><i></i></div>
  </div>
  <div class="mini">天</div>
  <i class="star" style="left:250px;top:210px;transform:rotate(-12deg)">✦</i>
  <i class="star g" style="right:250px;bottom:230px;font-size:64px;transform:rotate(10deg)">✧</i>
  <i class="star" style="left:340px;bottom:210px;font-size:56px;transform:rotate(6deg)">✧</i>
</div>
<style>${kwRoot(id)}
#${id} .bub{position:absolute;left:50%;top:50%;width:780px;height:780px;transform:translate(-50%,-52%) rotate(-3deg);background:var(--panel);border:5px solid var(--fg);border-radius:999px;box-shadow:var(--shadow);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;}
#${id} .n{font-size:340px;font-weight:800;line-height:1;}
#${id} .w{font-size:38px;font-weight:700;color:var(--muted);}
#${id} .mini{position:absolute;left:1210px;top:160px;transform:rotate(8deg);width:190px;height:190px;border-radius:999px;background:var(--accent);color:var(--paper);box-shadow:var(--glow);display:flex;align-items:center;justify-content:center;font-size:84px;font-weight:800;}
</style>`,
      (id) =>
        `tl.from('#${id} .bub',{scale:0.5,autoAlpha:0,rotation:-12,duration:0.38,ease:'back.out(1.6)'},0);\n` +
        `tl.from('#${id} .n',{scale:0.4,autoAlpha:0,duration:0.3,ease:'back.out(2)'},0.2);\n` +
        `tl.from('#${id} .mini',{scale:0,duration:0.28,ease:'back.out(2)'},0.4);\n` +
        `tl.from('#${id} .star',{scale:0,autoAlpha:0,duration:0.24,stagger:0.09,ease:'back.out(2)'},0.56);`,
    ),
  列表: () =>
    mk(
      'kw_lst',
      '列表',
      (id) => `
<div class="kw">
  <div class="t">今日小事清单</div>
  <div class="row r1"><i>♥</i><span>给猫咪梳毛</span></div>
  <div class="row r2 hot"><i>✦</i><span>写完可爱周报</span></div>
  <div class="row r3"><i>♥</i><span>奶茶只点半糖</span></div>
  <i class="star" style="right:280px;top:330px;transform:rotate(12deg)">✦</i>
  <i class="star g" style="right:340px;bottom:250px;font-size:60px;transform:rotate(-8deg)">✧</i>
</div>
<style>${kwRoot(id)}
#${id} .t{position:absolute;left:50%;top:130px;transform:translateX(-50%) rotate(-2deg);background:var(--panel);border:5px solid var(--fg);border-radius:999px;box-shadow:var(--shadow);font-size:48px;font-weight:800;padding:24px 66px;}
#${id} .row{position:absolute;display:flex;align-items:center;gap:36px;background:var(--panel);border:5px solid var(--fg);border-radius:999px;box-shadow:var(--shadow);font-size:58px;font-weight:700;padding:30px 76px;}
#${id} .row i{font-style:normal;font-size:54px;line-height:1;color:var(--accent);}
#${id} .row.hot{background:var(--accent);color:var(--paper);box-shadow:var(--glow);}
#${id} .row.hot i{color:var(--paper);}
#${id} .r1{left:440px;top:320px;transform:rotate(-2deg);}
#${id} .r2{left:570px;top:520px;transform:rotate(2.5deg);}
#${id} .r3{left:480px;top:720px;transform:rotate(-3deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .t',{scale:0,autoAlpha:0,duration:0.3,ease:'back.out(2)'},0);\n` +
        `tl.from('#${id} .row',{y:60,autoAlpha:0,duration:0.3,stagger:0.12,ease:'back.out(1.7)'},0.16);\n` +
        `tl.from('#${id} .row i',{scale:0,duration:0.22,stagger:0.12,ease:'back.out(2)'},0.34);\n` +
        `tl.from('#${id} .star',{scale:0,autoAlpha:0,duration:0.24,stagger:0.1,ease:'back.out(2)'},0.72);`,
    ),
  引导: () =>
    mk(
      'kw_cta',
      '引导',
      (id) => `
<div class="kw">
  <div class="bal">
    <div class="q">喜欢的话就常来玩呀</div>
    <div class="blush"><i></i><i></i></div>
    <div class="tail"></div>
  </div>
  <div class="cta">＋ 关注</div>
  <i class="star" style="left:240px;top:190px;transform:rotate(-10deg)">✦</i>
  <i class="star g" style="right:230px;top:250px;font-size:60px;transform:rotate(14deg)">✧</i>
  <i class="star" style="left:330px;bottom:180px;font-size:56px;transform:rotate(6deg)">✧</i>
</div>
<style>${kwRoot(id)}
#${id} .bal{position:absolute;left:50%;top:40%;width:1240px;transform:translate(-50%,-50%) rotate(-1.5deg);background:var(--panel);border:5px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);padding:100px 110px;display:flex;flex-direction:column;align-items:center;gap:40px;}
#${id} .q{font-size:104px;font-weight:800;line-height:1.35;}
#${id} .bal .blush{position:absolute;right:100px;top:64px;}
#${id} .tail{position:absolute;bottom:-36px;left:210px;width:64px;height:64px;background:var(--panel);border-right:5px solid var(--fg);border-bottom:5px solid var(--fg);transform:rotate(45deg);}
#${id} .cta{position:absolute;left:56%;bottom:160px;transform:rotate(-4deg);background:var(--accent);color:var(--paper);font-size:92px;font-weight:800;padding:38px 108px;border-radius:999px;box-shadow:var(--glow);}
</style>`,
      (id) =>
        `tl.from('#${id} .bal',{y:80,autoAlpha:0,duration:0.4,ease:'back.out(1.6)'},0);\n` +
        `tl.from('#${id} .cta',{scale:0,autoAlpha:0,duration:0.3,ease:'back.out(2)'},0.34);\n` +
        `tl.to('#${id} .cta',{y:-20,duration:0.14,yoyo:true,repeat:1,ease:'power1.inOut'},0.7);\n` +
        `tl.from('#${id} .star',{scale:0,autoAlpha:0,duration:0.24,stagger:0.09,ease:'back.out(2)'},0.74);`,
    ),
};
