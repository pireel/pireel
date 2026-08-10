/**
 * Available Light preview dialect.
 * These CSS-composed studies contain no hosted footage or official assets. They show how
 * real light, photographic depth, quiet type, and source-led timing form a visual world.
 */

import { type Block, mk } from './shared';

const root = (id: string) => `
#${id} .al{position:absolute;inset:0;overflow:hidden;background:var(--paper);color:var(--fg);font-family:var(--font-body);}
#${id} .head{font-family:var(--font-head);font-weight:500;}
#${id} .num{font-family:var(--font-num);font-variant-numeric:tabular-nums;}
#${id} .micro{font-family:var(--font-num);font-size:20px;line-height:1.4;letter-spacing:.16em;text-transform:uppercase;}
#${id} .soft{color:var(--muted);}
#${id} [data-edit]{outline:none;}`;

export const cover: () => Block = () =>
  mk(
    'cv_al2',
    '封面',
    (id) => `
<div class="al cover">
  <div class="image"><div class="window"><i></i><i></i><i></i></div><div class="curtain"></div><div class="person"><b></b><i></i></div><div class="table"></div><div class="cup"></div></div>
  <div class="edition micro">FRAME 05 / PHOTOGRAPHIC PRESENCE</div>
  <div class="title head" data-edit>自然光</div>
  <div class="english">AVAILABLE LIGHT</div>
  <div class="thesis" data-edit>让现场自己发亮</div>
  <div class="read num">WINDOW · SKIN · ROOM TONE<br/>OBSERVE BEFORE STYLING</div>
</div>
<style>${root(id)}
#${id} .cover{background:var(--panel);}
#${id} .image{position:absolute;inset:0 650px 0 0;background:#8b8a7f;overflow:hidden;}
#${id} .window{position:absolute;left:0;top:0;width:620px;height:1080px;background:#e8e4d9;box-shadow:130px 0 180px #f7edcf99;}
#${id} .window i{position:absolute;top:0;width:8px;height:1080px;background:#b7b5aa;}#${id} .window i:nth-child(1){left:204px;}#${id} .window i:nth-child(2){left:410px;}#${id} .window i:nth-child(3){left:0;top:492px;width:620px;height:8px;}
#${id} .curtain{position:absolute;left:570px;top:-80px;width:310px;height:1220px;background:#d1cbbb;clip-path:polygon(0 0,100% 0,69% 100%,18% 100%);opacity:.72;}
#${id} .person{position:absolute;left:630px;top:160px;width:410px;height:880px;background:#4b4f48;clip-path:polygon(29% 0,69% 0,78% 15%,93% 28%,100% 100%,0 100%,7% 28%,20% 15%);box-shadow:-55px 0 100px #e8c99577;}
#${id} .person b{position:absolute;left:94px;top:22px;width:210px;height:250px;border-radius:48% 48% 44% 46%;background:linear-gradient(90deg,#d7a974 0 48%,#84694f 49% 100%);}
#${id} .person i{position:absolute;left:185px;top:84px;width:18px;height:9px;border-radius:50%;background:#38342e;}
#${id} .table{position:absolute;left:120px;right:0;bottom:0;height:190px;background:#665744;transform:skewX(-9deg);transform-origin:bottom;}
#${id} .cup{position:absolute;left:465px;bottom:150px;width:105px;height:132px;border-radius:4px 4px 26px 26px;background:#e8e1d2;box-shadow:22px 18px 42px #322b22aa;}
#${id} .edition{position:absolute;left:1334px;top:76px;color:var(--muted);}
#${id} .title{position:absolute;left:1310px;top:230px;font-size:142px;line-height:.98;letter-spacing:.08em;writing-mode:vertical-rl;}
#${id} .english{position:absolute;right:68px;top:245px;font-size:25px;letter-spacing:.2em;writing-mode:vertical-rl;}
#${id} .thesis{position:absolute;left:1332px;bottom:182px;font-size:31px;letter-spacing:.12em;}
#${id} .read{position:absolute;right:68px;bottom:64px;font-size:17px;line-height:1.65;letter-spacing:.12em;text-align:right;color:var(--muted);}
</style>`,
    (id) =>
      `tl.from('#${id} .window',{autoAlpha:0,duration:.7,ease:'power1.out'},0);\n` +
      `tl.from('#${id} .person',{x:28,autoAlpha:0,duration:.55,ease:'power1.out'},.12);\n` +
      `tl.from('#${id} .edition,#${id} .title,#${id} .english,#${id} .thesis,#${id} .read',{autoAlpha:0,y:8,duration:.45,stagger:.04},.34);`,
  );

export const blocks: Record<string, () => Block> = {
  'window-light': () =>
    mk(
      'al2_win',
      'window-light',
      (id) => `
<div class="al windowlight">
  <div class="room"><div class="window"><i></i><i></i></div><div class="wall"></div><div class="portrait"><b></b><i></i></div><div class="chair"></div></div>
  <div class="copy"><span class="micro">WINDOW LIGHT / 08:42</span><h2 class="head" data-edit>先让眼睛<br/>找到这个人</h2><p data-edit>文字留在阴影里，脸留在真实的光里。</p></div>
  <div class="source num">NORTH WINDOW · ROOM TONE 42s</div>
</div>
<style>${root(id)}
#${id} .windowlight{background:#5b5d56;color:#f4efe5;}
#${id} .room{position:absolute;inset:0;overflow:hidden;background:#62645c;}
#${id} .window{position:absolute;right:0;top:0;width:750px;height:1080px;background:#e9e5da;box-shadow:-190px 0 250px #e5d7b399;}
#${id} .window i{position:absolute;top:0;width:12px;height:1080px;background:#a6a79f;}#${id} .window i:first-child{left:245px;}#${id} .window i:last-child{left:500px;}
#${id} .wall{position:absolute;left:0;top:0;width:1090px;height:1080px;background:linear-gradient(90deg,#4c504a 0%,#66675e 68%,#aaa38e 100%);}
#${id} .portrait{position:absolute;right:510px;top:110px;width:500px;height:970px;background:linear-gradient(90deg,#343a34 0 55%,#6e6b5c 56%);clip-path:polygon(27% 0,70% 0,79% 13%,94% 28%,100% 100%,0 100%,5% 28%,20% 13%);}
#${id} .portrait b{position:absolute;left:120px;top:25px;width:255px;height:285px;border-radius:48% 48% 44% 46%;background:linear-gradient(90deg,#795e49 0 52%,#d6a77a 53% 100%);box-shadow:52px 0 80px #efd4a26b;}
#${id} .portrait i{position:absolute;left:271px;top:99px;width:18px;height:9px;border-radius:50%;background:#3c342d;}
#${id} .chair{position:absolute;right:350px;bottom:-90px;width:660px;height:260px;background:#333731;border-radius:48% 48% 0 0;}
#${id} .copy{position:absolute;left:80px;top:68px;width:620px;}
#${id} .copy h2{margin:182px 0 0;font-size:94px;line-height:1.13;letter-spacing:.035em;}
#${id} .copy p{margin-top:82px;width:490px;border-top:1px solid #f4efe56e;padding-top:24px;font-size:28px;line-height:1.55;color:#f4efe5c7;}
#${id} .source{position:absolute;left:80px;bottom:62px;font-size:17px;letter-spacing:.13em;color:#f4efe59c;}
</style>`,
      (id) =>
        `tl.from('#${id} .window',{autoAlpha:0,duration:.62,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .portrait',{x:22,autoAlpha:0,duration:.5,ease:'power1.out'},.12);\n` +
        `tl.from('#${id} .copy,#${id} .source',{autoAlpha:0,y:9,duration:.4},.34);`,
    ),

  'open-shade': () =>
    mk(
      'al2_shd',
      'open-shade',
      (id) => `
<div class="al openshade">
  <div class="sky"></div><div class="building"><i></i><i></i><i></i></div><div class="street"></div><div class="tree"><i></i></div><div class="walker"><b></b></div>
  <div class="place micro">OPEN SHADE / CORNER 03</div>
  <div class="statement head" data-edit>地点不是背景</div>
  <div class="note" data-edit>保留街道、天气和人物之间的距离。</div>
  <div class="weather num">18°C · OVERCAST · NW 7 KM/H</div>
</div>
<style>${root(id)}
#${id} .openshade{background:#aeb7b5;color:#27302d;}
#${id} .sky{position:absolute;inset:0 0 500px 0;background:#d9dfdb;}
#${id} .building{position:absolute;left:0;top:150px;width:1130px;height:690px;background:#aaa99f;clip-path:polygon(0 4%,81% 0,100% 14%,100% 100%,0 100%);}
#${id} .building i{position:absolute;top:130px;width:210px;height:330px;background:#66716e;box-shadow:inset 20px 0 50px #35403e66;}#${id} .building i:nth-child(1){left:90px;}#${id} .building i:nth-child(2){left:410px;}#${id} .building i:nth-child(3){left:730px;}
#${id} .street{position:absolute;left:0;right:0;bottom:0;height:390px;background:#6f7773;clip-path:polygon(0 31%,100% 0,100% 100%,0 100%);}
#${id} .tree{position:absolute;right:80px;top:-80px;width:700px;height:820px;background:#536558;clip-path:polygon(51% 0,61% 10%,76% 5%,82% 18%,100% 22%,88% 38%,98% 55%,76% 58%,67% 78%,51% 66%,38% 86%,25% 63%,3% 57%,14% 38%,0 22%,25% 18%,33% 6%);opacity:.9;}
#${id} .tree i{position:absolute;left:355px;top:420px;width:72px;height:620px;background:#4a4539;transform:rotate(7deg);}
#${id} .walker{position:absolute;left:1190px;top:250px;width:280px;height:770px;background:#343b37;clip-path:polygon(28% 0,72% 0,82% 17%,95% 33%,100% 100%,0 100%,5% 33%,18% 17%);box-shadow:36px 0 64px #2c312d55;}
#${id} .walker b{position:absolute;left:61px;top:18px;width:160px;height:190px;border-radius:50% 48% 46% 45%;background:#a97758;}
#${id} .place{position:absolute;left:68px;top:64px;}
#${id} .statement{position:absolute;left:64px;bottom:160px;font-size:100px;line-height:1.05;letter-spacing:.045em;}
#${id} .note{position:absolute;right:70px;top:78px;width:390px;font-size:27px;line-height:1.55;font-weight:600;}
#${id} .weather{position:absolute;left:70px;bottom:62px;font-size:17px;letter-spacing:.14em;color:#e7ece8;}
</style>`,
      (id) =>
        `tl.from('#${id} .sky',{autoAlpha:0,duration:.55},0);\n` +
        `tl.from('#${id} .walker',{x:-34,autoAlpha:0,duration:.58,ease:'power1.out'},.1);\n` +
        `tl.from('#${id} .place,#${id} .statement,#${id} .note,#${id} .weather',{autoAlpha:0,y:8,duration:.4},.32);`,
    ),

  'material-closeup': () =>
    mk(
      'al2_mat',
      'material-closeup',
      (id) => `
<div class="al material">
  <div class="surface"><div class="light"></div><div class="object"><i></i><b></b></div><div class="hand"><i></i><b></b></div></div>
  <div class="index micro">MATERIAL STUDY / 02</div>
  <div class="statement head" data-edit>光要说明质地</div>
  <div class="note" data-edit>先看边缘、重量与使用痕迹，再决定靠近多少。</div>
  <div class="measure num"><span>EDGE / 12 mm</span><span>SURFACE / MATTE</span><span>USE / VERIFIED</span></div>
</div>
<style>${root(id)}
#${id} .material{background:#403b32;color:#f1ecdf;}
#${id} .surface{position:absolute;inset:0;background:linear-gradient(122deg,#292720 0%,#4c4335 43%,#8f7456 70%,#c2a57c 100%);overflow:hidden;}
#${id} .light{position:absolute;left:720px;top:-370px;width:900px;height:1550px;background:#e8cc9b66;filter:blur(18px);transform:rotate(19deg);}
#${id} .object{position:absolute;right:210px;top:135px;width:730px;height:750px;background:linear-gradient(120deg,#b6a080 0%,#5f5545 43%,#d0b894 44%,#8c7558 100%);clip-path:polygon(7% 9%,86% 0,100% 82%,15% 100%,0 30%);box-shadow:-90px 100px 110px #171711aa;}
#${id} .object i{position:absolute;left:120px;top:122px;width:480px;height:430px;border:4px solid #efe1c275;transform:rotate(-7deg);}
#${id} .object b{position:absolute;right:58px;top:70px;width:18px;height:560px;background:#f3ddb49c;transform:rotate(-8deg);}
#${id} .hand{position:absolute;right:-80px;bottom:-90px;width:790px;height:360px;background:#b77f5c;clip-path:polygon(0 40%,72% 0,100% 27%,100% 100%,0 100%);box-shadow:-30px -34px 70px #3a2b2299;}
#${id} .hand i,#${id} .hand b{position:absolute;top:35px;width:300px;height:82px;border-radius:55px;background:#c88e68;transform:rotate(-13deg);}#${id} .hand i{left:120px;}#${id} .hand b{left:360px;top:68px;}
#${id} .index{position:absolute;left:72px;top:66px;}
#${id} .statement{position:absolute;left:68px;top:260px;width:570px;font-size:98px;line-height:1.12;letter-spacing:.04em;}
#${id} .note{position:absolute;left:72px;bottom:190px;width:490px;border-top:1px solid #f1ecdf73;padding-top:25px;font-size:28px;line-height:1.56;}
#${id} .measure{position:absolute;left:72px;right:72px;bottom:62px;display:flex;justify-content:space-between;font-size:17px;letter-spacing:.13em;color:#f1ecdfb0;}
</style>`,
      (id) =>
        `tl.from('#${id} .light',{autoAlpha:0,duration:.72,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .hand',{x:90,y:36,duration:.58,ease:'power1.out'},.08);\n` +
        `tl.from('#${id} .index,#${id} .statement,#${id} .note,#${id} .measure',{autoAlpha:0,duration:.4},.34);`,
    ),

  'practical-glow': () =>
    mk(
      'al2_prc',
      'practical-glow',
      (id) => `
<div class="al practical">
  <div class="room"><div class="lamp"><i></i><b></b></div><div class="sofa"></div><div class="person one"><i></i></div><div class="person two"><i></i></div><div class="window"></div></div>
  <div class="scene micro">PRACTICAL LIGHT / 19:16</div>
  <div class="statement head" data-edit>夜晚也有<br/>自己的颜色</div>
  <div class="note" data-edit>保留灯、窗和人之间真实的明暗关系。</div>
  <div class="sound num">ROOM · KETTLE · DISTANT STREET</div>
</div>
<style>${root(id)}
#${id} .practical{background:#252925;color:#f2eadc;}
#${id} .room{position:absolute;inset:0;background:linear-gradient(90deg,#1f2422 0 48%,#34342e 74%,#242923 100%);overflow:hidden;}
#${id} .lamp{position:absolute;right:250px;top:150px;width:420px;height:520px;filter:drop-shadow(0 0 110px #e7a95d88);}
#${id} .lamp i{position:absolute;left:66px;top:0;width:290px;height:210px;background:#e0a45f;clip-path:polygon(18% 0,82% 0,100% 100%,0 100%);}
#${id} .lamp b{position:absolute;left:204px;top:205px;width:15px;height:315px;background:#8f7457;}
#${id} .sofa{position:absolute;right:40px;bottom:-40px;width:1060px;height:370px;background:#45483f;border-radius:160px 160px 0 0;box-shadow:inset 0 55px 80px #78664a33;}
#${id} .person{position:absolute;bottom:60px;width:350px;height:670px;background:#2d342f;clip-path:polygon(29% 0,71% 0,82% 18%,96% 32%,100% 100%,0 100%,4% 32%,18% 18%);}
#${id} .person i{position:absolute;left:86px;top:18px;width:180px;height:205px;border-radius:48%;background:linear-gradient(90deg,#6e5040,#bd825b);}
#${id} .one{right:670px;}#${id} .two{right:270px;background:#3a352f;}#${id} .two i{background:linear-gradient(90deg,#b67a56,#6b4c3a);}
#${id} .window{position:absolute;left:0;top:0;width:420px;height:1080px;background:#33464a;box-shadow:80px 0 150px #5f858766;}
#${id} .scene{position:absolute;left:68px;top:64px;}
#${id} .statement{position:absolute;left:62px;top:260px;width:600px;font-size:98px;line-height:1.1;letter-spacing:.04em;}
#${id} .note{position:absolute;left:70px;bottom:175px;width:470px;border-top:1px solid #f2eadc61;padding-top:24px;font-size:27px;line-height:1.55;color:#f2eadcc4;}
#${id} .sound{position:absolute;left:70px;bottom:61px;font-size:17px;letter-spacing:.13em;color:#f2eadc99;}
</style>`,
      (id) =>
        `tl.from('#${id} .lamp',{autoAlpha:0,duration:.7,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .person',{autoAlpha:0,y:20,duration:.48,stagger:.1},.12);\n` +
        `tl.from('#${id} .scene,#${id} .statement,#${id} .note,#${id} .sound',{autoAlpha:0,y:8,duration:.4},.36);`,
    ),

  'breathing-room': () =>
    mk(
      'al2_br',
      'breathing-room',
      (id) => `
<div class="al breathing">
  <div class="land"><div class="sky"></div><div class="ridge back"></div><div class="ridge front"></div><div class="path"></div><div class="figure"></div></div>
  <div class="index micro">BREATHING ROOM / HOLD 04.2s</div>
  <div class="statement head" data-edit>让环境说完</div>
  <div class="note" data-edit>靠近之后，给尺度、天气和余音一次完整回归。</div>
  <div class="level num">WIDE 24 mm · AMBIENCE −18 LUFS</div>
</div>
<style>${root(id)}
#${id} .breathing{background:#c6cbc5;color:#26302a;}
#${id} .land{position:absolute;inset:0;overflow:hidden;background:#c6cbc5;}
#${id} .sky{position:absolute;inset:0 0 355px 0;background:linear-gradient(180deg,#dde0dc,#b6c1bd);}
#${id} .ridge{position:absolute;left:0;right:0;bottom:0;}
#${id} .back{height:610px;background:#76877e;clip-path:polygon(0 45%,16% 21%,30% 37%,44% 10%,58% 32%,74% 0,88% 30%,100% 16%,100% 100%,0 100%);opacity:.72;}
#${id} .front{height:410px;background:#4e6155;clip-path:polygon(0 34%,18% 17%,39% 38%,56% 6%,73% 28%,88% 0,100% 20%,100% 100%,0 100%);}
#${id} .path{position:absolute;left:600px;bottom:-80px;width:900px;height:510px;background:#9b9686;clip-path:polygon(45% 0,55% 0,100% 100%,0 100%);opacity:.74;}
#${id} .figure{position:absolute;left:975px;bottom:205px;width:58px;height:158px;background:#29312c;clip-path:polygon(25% 0,75% 0,100% 23%,87% 100%,13% 100%,0 23%);}
#${id} .index{position:absolute;left:68px;top:62px;}
#${id} .statement{position:absolute;right:66px;top:80px;font-size:82px;line-height:1.1;letter-spacing:.045em;}
#${id} .note{position:absolute;left:70px;bottom:108px;width:500px;font-size:27px;line-height:1.55;color:#e9eee9;}
#${id} .level{position:absolute;right:70px;bottom:62px;font-size:17px;letter-spacing:.13em;color:#e9eee9b5;}
</style>`,
      (id) =>
        `tl.from('#${id} .sky',{autoAlpha:0,duration:.75,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .ridge',{y:26,autoAlpha:0,duration:.56,stagger:.1,ease:'power1.out'},.08);\n` +
        `tl.from('#${id} .figure,#${id} .index,#${id} .statement,#${id} .note,#${id} .level',{autoAlpha:0,duration:.42},.36);`,
    ),

  'daylight-return': () =>
    mk(
      'al2_ret',
      'daylight-return',
      (id) => `
<div class="al return">
  <div class="interior"><div class="window"><i></i><b></b></div><div class="floor"></div><div class="chair"></div><div class="plant"><i></i><b></b></div><div class="light"></div></div>
  <div class="index micro">DAYLIGHT RETURN / FINAL HOLD</div>
  <div class="statement head" data-edit>最后，回到<br/>完整的现场</div>
  <div class="note" data-edit>不再添加解释，让光、空间和余音留下结论。</div>
  <div class="time num">16:28:41 · SOURCE CONTINUES</div>
</div>
<style>${root(id)}
#${id} .return{background:#e7e2d8;color:#272b26;}
#${id} .interior{position:absolute;inset:0;background:#b8b1a2;overflow:hidden;}
#${id} .window{position:absolute;right:0;top:0;width:980px;height:850px;background:#dfe6e2;box-shadow:-180px 110px 220px #f0d6a89c;}
#${id} .window i{position:absolute;left:322px;top:0;width:12px;height:850px;background:#aaa99f;}#${id} .window b{position:absolute;left:0;top:420px;width:980px;height:12px;background:#aaa99f;}
#${id} .floor{position:absolute;left:0;right:0;bottom:0;height:330px;background:#84725c;clip-path:polygon(0 30%,100% 0,100% 100%,0 100%);}
#${id} .chair{position:absolute;right:450px;bottom:110px;width:390px;height:410px;border:26px solid #4e4a40;border-top:0;background:#796956;transform:skewX(-4deg);}
#${id} .plant{position:absolute;right:95px;bottom:80px;width:360px;height:650px;}
#${id} .plant i,#${id} .plant b{position:absolute;left:140px;top:40px;width:150px;height:400px;background:#657260;clip-path:polygon(50% 0,100% 32%,72% 100%,35% 62%,0 35%);transform:rotate(19deg);}#${id} .plant b{left:30px;top:120px;transform:rotate(-22deg);background:#73806b;}
#${id} .light{position:absolute;left:540px;bottom:0;width:800px;height:680px;background:#f0d29b5e;clip-path:polygon(35% 0,100% 0,77% 100%,0 100%);mix-blend-mode:screen;}
#${id} .index{position:absolute;left:68px;top:64px;}
#${id} .statement{position:absolute;left:62px;top:245px;width:710px;font-size:94px;line-height:1.15;letter-spacing:.04em;}
#${id} .note{position:absolute;left:70px;bottom:165px;width:500px;border-top:1px solid #272b2654;padding-top:24px;font-size:27px;line-height:1.55;}
#${id} .time{position:absolute;left:70px;bottom:62px;font-size:17px;letter-spacing:.13em;color:#272b2694;}
</style>`,
      (id) =>
        `tl.from('#${id} .light',{autoAlpha:0,duration:.82,ease:'power1.out'},0);\n` +
        `tl.from('#${id} .plant,#${id} .chair',{autoAlpha:0,y:12,duration:.48},.1);\n` +
        `tl.from('#${id} .index,#${id} .statement,#${id} .note,#${id} .time',{autoAlpha:0,y:8,duration:.42},.34);`,
    ),
};
