/** Product Native preview dialect: real product action, light display type, proof, and release. */
import { type Block, mk } from './shared';

const root = (id: string) => `
#${id} .pn{position:absolute;inset:0;overflow:hidden;background:var(--paper);color:var(--fg);font-family:var(--font-body);}
#${id} .head{font-family:var(--font-head);font-weight:900;letter-spacing:-.055em;text-transform:uppercase;}
#${id} .num{font-family:var(--font-num);font-variant-numeric:tabular-nums;}
#${id} .micro{font-family:var(--font-num);font-size:18px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;}
#${id} .phone{position:absolute;width:520px;height:920px;border:18px solid #111;border-radius:64px;background:#d9c2a4;overflow:hidden;box-shadow:0 30px 70px #0005;}
#${id} .phone:before{content:'';position:absolute;left:178px;top:15px;width:164px;height:34px;border-radius:22px;background:#111;z-index:8;}
#${id} .creator{position:absolute;width:430px;height:680px;}
#${id} .creator .hair{position:absolute;left:115px;top:26px;width:210px;height:254px;border-radius:46% 46% 40% 40%;background:#251c19;}
#${id} .creator .face{position:absolute;left:145px;top:92px;width:154px;height:190px;border-radius:48% 48% 44% 44%;background:#c98b67;}
#${id} .creator .body{position:absolute;left:64px;top:260px;width:310px;height:430px;border-radius:150px 150px 0 0;background:#47634e;}
#${id} .creator .eye{position:absolute;left:180px;top:158px;width:22px;height:9px;border-radius:50%;background:#241912;box-shadow:70px 0 0 #241912;}
#${id} .creator .mouth{position:absolute;left:213px;top:225px;width:42px;height:8px;border-radius:50%;background:#8b4139;}
#${id} .hand{position:absolute;background:#c98b67;border-radius:48px;transform-origin:center;}
#${id} .bottle{position:absolute;width:158px;height:305px;border-radius:35px 35px 44px 44px;background:#eee9de;border:8px solid #111;box-shadow:12px 16px 0 #1113;}
#${id} .bottle:before{content:'';position:absolute;left:31px;top:-70px;width:80px;height:76px;border:8px solid #111;border-bottom:0;border-radius:20px 20px 0 0;background:var(--accent);}
#${id} .bottle:after{content:'FORM / 01';position:absolute;left:17px;right:17px;top:118px;padding:15px 7px;border-top:5px solid #111;border-bottom:5px solid #111;font:800 18px/1 var(--font-num);text-align:center;}
#${id} .caption{position:absolute;display:inline-block;padding:14px 22px;background:#111;color:#fff;border-radius:14px;font-size:31px;font-weight:850;line-height:1.12;}
#${id} .caption b{color:var(--accent-2);}
#${id} [data-edit]{outline:none;}`;

export const cover: () => Block = () => mk('cv_pn2', '封面', (id) => `
<div class="pn cover">
  <div class="red"></div><div class="yellow"></div><div class="phone"><div class="creator"><i class="hair"></i><i class="face"></i><i class="body"></i><i class="eye"></i><i class="mouth"></i></div><div class="hand"></div><div class="bottle"></div><div class="caption">真实上手，<b>直接看懂</b></div></div>
  <div class="title head" data-edit>商品<br/>原生</div><div class="english num">PRODUCT NATIVE</div><div class="line micro">PRODUCT / ACTION / TYPE / PROOF</div>
</div>
<style>${root(id)}
#${id} .cover{background:#f7f4ec;}#${id} .red{position:absolute;left:-170px;top:-90px;width:730px;height:1280px;background:var(--accent);transform:rotate(-11deg);}#${id} .yellow{position:absolute;right:-160px;top:-150px;width:670px;height:700px;border-radius:50%;background:var(--accent-2);}
#${id} .cover .phone{right:185px;top:78px;transform:rotate(5deg);}#${id} .cover .creator{left:45px;top:130px;}#${id} .cover .hand{left:150px;top:585px;width:350px;height:84px;transform:rotate(-9deg);}#${id} .cover .bottle{right:34px;top:415px;transform:rotate(8deg) scale(.78);}#${id} .cover .caption{left:35px;bottom:70px;font-size:25px;}
#${id} .title{position:absolute;left:104px;top:102px;color:#fff;font-size:182px;line-height:.82;z-index:4;}#${id} .english{position:absolute;left:113px;top:450px;color:#fff;font-size:24px;font-weight:900;letter-spacing:.16em;z-index:4;}#${id} .line{position:absolute;left:105px;bottom:76px;color:#fff;z-index:4;}
</style>`, (id) =>
  `tl.from('#${id} .red',{x:-180,duration:.34,ease:'power3.out'},0);\n`+
  `tl.from('#${id} .yellow',{scale:0,transformOrigin:'center',duration:.3,ease:'back.out(1.5)'},.08);\n`+
  `tl.from('#${id} .phone',{y:170,rotation:-3,autoAlpha:0,duration:.38,ease:'power3.out'},.18);\n`+
  `tl.from('#${id} .title,#${id} .english,#${id} .line',{x:-55,autoAlpha:0,duration:.25,stagger:.06},.36);`);

export const blocks: Record<string, () => Block> = {
  'creator-proximity': () => mk('pn2_creator', 'creator-proximity', (id) => `
<div class="pn proximity">
  <div class="phone"><div class="creator"><i class="hair"></i><i class="face"></i><i class="body"></i><i class="eye"></i><i class="mouth"></i></div><div class="hand"></div><div class="bottle"></div></div>
  <div class="copy"><span class="micro">CREATOR PROXIMITY / LIVE PRODUCT</span><h2 class="head" data-edit>人和产品<br/><b>在同一个现场</b></h2><p data-edit>让眼神、手势和真实上手共同解释，不把人物缩进装饰卡片。</p></div><div class="stamp num">01 / NEAR ENOUGH TO BELIEVE</div>
</div>
<style>${root(id)}
#${id} .proximity{background:#f7f4ec;}#${id} .proximity .phone{left:120px;top:80px;transform:rotate(-3deg);}#${id} .proximity .creator{left:45px;top:130px;}#${id} .proximity .hand{left:160px;top:600px;width:340px;height:82px;transform:rotate(-11deg);}#${id} .proximity .bottle{right:28px;top:430px;transform:scale(.72) rotate(9deg);}
#${id} .copy{position:absolute;left:760px;top:142px;width:970px;}#${id} .copy h2{margin:118px 0 0;font-size:110px;line-height:.95;}#${id} .copy h2 b{display:inline-block;background:var(--accent);color:#fff;padding:5px 18px;}#${id} .copy p{width:760px;margin-top:70px;font-size:29px;line-height:1.55;font-weight:650;}#${id} .stamp{position:absolute;right:120px;bottom:82px;padding-top:18px;border-top:5px solid #111;font-size:20px;font-weight:850;}
</style>`, (id) =>
    `tl.from('#${id} .phone',{x:-140,rotation:-10,autoAlpha:0,duration:.36,ease:'power3.out'},0);\n`+
    `tl.from('#${id} .copy>* ,#${id} .stamp',{y:24,autoAlpha:0,duration:.25,stagger:.08},.25);`),

  'tactile-detail': () => mk('pn2_detail', 'tactile-detail', (id) => `
<div class="pn detail">
  <div class="macro"><i class="drop d1"></i><i class="drop d2"></i><i class="swipe"></i><span class="micro">REAL TEXTURE / SOURCE DETAIL</span></div>
  <div class="orient"><div class="bottle"></div><i class="hand"></i><b class="head" data-edit>细节要回答问题</b><p data-edit>先认出完整产品，再靠近材质、触感与真实动作。</p></div><div class="index num">02 — TACTILE DETAIL</div>
</div>
<style>${root(id)}
#${id} .detail{background:#111;color:#fff;}#${id} .macro{position:absolute;left:0;top:0;width:1110px;height:1080px;background:radial-gradient(circle at 35% 44%,#ffd4a9 0 60px,#dd9368 61px 180px,#b8664e 181px 340px,#76382f 341px 100%);overflow:hidden;}#${id} .macro span{position:absolute;left:70px;top:60px;}#${id} .drop{position:absolute;border-radius:50% 50% 52% 48%;background:#fff8e8cc;box-shadow:0 0 55px #fff8e8;}#${id} .d1{left:380px;top:390px;width:180px;height:210px;}#${id} .d2{left:620px;top:300px;width:95px;height:115px;}#${id} .swipe{position:absolute;left:140px;top:680px;width:880px;height:120px;border-radius:50%;background:#f7e8cd99;transform:rotate(-13deg);}
#${id} .orient{position:absolute;right:0;top:0;width:810px;height:1080px;background:var(--accent-2);color:#111;}#${id} .orient .bottle{left:305px;top:170px;transform:scale(1.15);}#${id} .orient .hand{left:40px;top:480px;width:610px;height:110px;transform:rotate(-8deg);}#${id} .orient b{position:absolute;left:70px;right:55px;bottom:250px;font-size:70px;line-height:.95;}#${id} .orient p{position:absolute;left:70px;right:70px;bottom:110px;font-size:25px;line-height:1.45;font-weight:700;}#${id} .index{position:absolute;left:72px;bottom:55px;font-size:18px;letter-spacing:.14em;}
</style>`, (id) =>
    `tl.from('#${id} .macro',{x:-160,duration:.34,ease:'power3.out'},0);\n`+
    `tl.from('#${id} .orient',{x:180,duration:.34,ease:'power3.out'},.08);\n`+
    `tl.from('#${id} .drop,#${id} .swipe',{scale:0,transformOrigin:'center',duration:.26,stagger:.08},.3);\n`+
    `tl.from('#${id} .orient b,#${id} .orient p,#${id} .index',{autoAlpha:0,y:18,duration:.22,stagger:.06},.48);`),

  'action-continuity': () => mk('pn2_action', 'action-continuity', (id) => `
<div class="pn continuity">
  <div class="stage s1"><div class="bottle"></div><i class="hand"></i><span class="num">BEFORE</span></div><div class="stage s2"><div class="bottle"></div><i class="hand"></i><span class="num">CONTACT</span></div><div class="stage s3"><div class="bottle"></div><i class="result"></i><span class="num">RESULT</span></div>
  <div class="rule"><span class="micro">ACTION CONTINUITY</span><h2 class="head" data-edit>看见动作<br/><b>也看见结果</b></h2></div>
</div>
<style>${root(id)}
#${id} .continuity{background:#111;color:#fff;}#${id} .stage{position:absolute;top:0;width:640px;height:1080px;overflow:hidden;border-right:7px solid #111;}#${id} .s1{left:0;background:#e7c8a1;}#${id} .s2{left:640px;background:#cd8f6d;}#${id} .s3{left:1280px;background:var(--accent-2);}#${id} .stage .bottle{left:242px;top:315px;transform:scale(.84);}#${id} .stage .hand{left:-30px;top:480px;width:470px;height:95px;transform:rotate(-6deg);}#${id} .s2 .hand{left:40px;top:400px;transform:rotate(-20deg);}#${id} .s2 .bottle{left:325px;top:350px;transform:scale(.84) rotate(14deg);}#${id} .s3 .bottle{left:355px;top:330px;transform:scale(.9);}#${id} .result{position:absolute;left:100px;top:440px;width:235px;height:235px;border-radius:50%;background:#fff;border:13px solid var(--accent);box-shadow:0 0 0 22px #fff8;}#${id} .stage span{position:absolute;left:42px;bottom:42px;padding:12px 17px;background:#111;color:#fff;font-size:19px;font-weight:900;letter-spacing:.12em;}
#${id} .rule{position:absolute;left:66px;top:60px;z-index:5;}#${id} .rule h2{margin:42px 0 0;font-size:72px;line-height:.92;text-shadow:0 5px 0 #111;}#${id} .rule h2 b{color:var(--accent-2);}
</style>`, (id) =>
    `tl.from('#${id} .stage',{y:140,autoAlpha:0,duration:.3,stagger:.1,ease:'power3.out'},0);\n`+
    `tl.from('#${id} .stage .hand',{x:-180,duration:.28,stagger:.1,ease:'power3.out'},.22);\n`+
    `tl.from('#${id} .rule',{autoAlpha:0,x:-40,duration:.24},.5);`),

  'caption-pressure': () => mk('pn2_caption', 'caption-pressure', (id) => `
<div class="pn captions">
  <div class="phone"><div class="creator"><i class="hair"></i><i class="face"></i><i class="body"></i><i class="eye"></i><i class="mouth"></i></div><div class="hand"></div><div class="bottle"></div><div class="caption c1">不是更多装饰</div><div class="caption c2">是让一句话 <b>改变理解</b></div></div>
  <div class="copy"><span class="micro">CAPTION AS CURRENT SPEECH</span><h2 class="head" data-edit>字幕跟着意思走</h2><p data-edit>稳定基线，保护人物、手、产品和证明；只强调真正改变含义的词。</p><div class="safe num">SAFE / FACE / HAND / PRODUCT / UI</div></div>
</div>
<style>${root(id)}
#${id} .captions{background:var(--accent);}#${id} .captions .phone{left:150px;top:80px;transform:rotate(-2deg);}#${id} .captions .creator{left:45px;top:125px;}#${id} .captions .hand{left:150px;top:580px;width:360px;height:84px;transform:rotate(-10deg);}#${id} .captions .bottle{right:25px;top:415px;transform:scale(.75) rotate(8deg);}#${id} .c1{left:35px;bottom:170px;}#${id} .c2{left:35px;bottom:80px;}
#${id} .captions .copy{position:absolute;left:810px;top:145px;width:900px;color:#fff;}#${id} .captions .copy h2{margin:115px 0 0;font-size:112px;line-height:.92;}#${id} .captions .copy p{margin-top:75px;width:780px;font-size:29px;line-height:1.52;font-weight:700;}#${id} .safe{margin-top:85px;padding-top:22px;border-top:5px solid #fff;font-size:19px;letter-spacing:.12em;}
</style>`, (id) =>
    `tl.from('#${id} .phone',{y:140,rotation:-8,autoAlpha:0,duration:.34,ease:'power3.out'},0);\n`+
    `tl.from('#${id} .caption',{x:-60,autoAlpha:0,duration:.22,stagger:.14,ease:'power2.out'},.25);\n`+
    `tl.from('#${id} .copy>*',{x:45,autoAlpha:0,duration:.24,stagger:.07},.38);`),

  'proof-hold': () => mk('pn2_proof', 'proof-hold', (id) => `
<div class="pn proof">
  <div class="field"><span class="micro">PROOF HOLD / NO DISTRACTION</span><div class="before"><i></i><b class="num">BEFORE</b></div><div class="after"><i></i><b class="num">AFTER</b></div><div class="measure num">真实条件与来源需用户确认</div></div>
  <div class="copy"><h2 class="head" data-edit>证明出现时<br/><b>先让画面安静</b></h2><p data-edit>同等条件、可读尺度、必要限定；不用动画把证据变成背景。</p><span class="pause num">HOLD / READ / VERIFY</span></div>
</div>
<style>${root(id)}
#${id} .proof{background:#f7f4ec;}#${id} .field{position:absolute;left:70px;top:70px;width:1050px;height:940px;background:#111;color:#fff;border-radius:26px;overflow:hidden;}#${id} .field>span{position:absolute;left:48px;top:42px;}#${id} .before,#${id} .after{position:absolute;top:140px;width:430px;height:620px;background:#d49a74;}#${id} .before{left:48px;}#${id} .after{right:48px;background:#e2af86;}#${id} .before i,#${id} .after i{position:absolute;left:90px;top:90px;width:250px;height:300px;border-radius:45% 55% 48% 52%;background:#a6604e;}#${id} .after i{background:#f0d7c0;box-shadow:0 0 0 22px #fff5;}#${id} .before b,#${id} .after b{position:absolute;left:28px;bottom:28px;padding:11px 15px;background:#111;color:#fff;letter-spacing:.12em;}#${id} .measure{position:absolute;left:48px;bottom:55px;font-size:19px;letter-spacing:.08em;}
#${id} .proof .copy{position:absolute;left:1240px;top:145px;width:590px;}#${id} .proof .copy h2{font-size:90px;line-height:.96;}#${id} .proof .copy h2 b{display:inline;background:var(--accent-2);box-shadow:15px 0 0 var(--accent-2),-8px 0 0 var(--accent-2);}#${id} .proof .copy p{margin-top:80px;font-size:27px;line-height:1.5;font-weight:650;}#${id} .pause{position:absolute;left:0;top:770px;width:520px;padding-top:20px;border-top:5px solid #111;font-weight:900;letter-spacing:.14em;}
</style>`, (id) =>
    `tl.from('#${id} .field',{scale:.94,autoAlpha:0,duration:.32,ease:'power2.out'},0);\n`+
    `tl.from('#${id} .before,#${id} .after',{y:80,autoAlpha:0,duration:.28,stagger:.12},.18);\n`+
    `tl.from('#${id} .copy>*',{autoAlpha:0,y:22,duration:.24,stagger:.08},.38);`),

  'direct-release': () => mk('pn2_release', 'direct-release', (id) => `
<div class="pn release">
  <div class="product"><div class="bottle"></div><i class="hand"></i><div class="ring"></div></div>
  <div class="copy"><span class="micro">PRODUCT / VERIFIED OFFER / ACTION</span><h2 class="head" data-edit>最后回到<br/>认得出的产品</h2><p data-edit>产品名、价格、日期、优惠和去向必须由用户确认。</p><b class="cta head" data-edit>查看真实详情 →</b></div><div class="end num">DIRECT RELEASE / 06</div>
</div>
<style>${root(id)}
#${id} .release{background:var(--accent-2);}#${id} .product{position:absolute;right:-70px;top:-80px;width:930px;height:1240px;background:#111;transform:rotate(7deg);overflow:hidden;}#${id} .product .bottle{left:330px;top:350px;transform:scale(1.8) rotate(-7deg);}#${id} .product .hand{left:20px;top:680px;width:820px;height:135px;transform:rotate(-16deg);}#${id} .ring{position:absolute;left:180px;top:200px;width:560px;height:560px;border:30px solid var(--accent);border-radius:50%;}
#${id} .release .copy{position:absolute;left:85px;top:90px;width:900px;}#${id} .release .copy h2{margin:95px 0 0;font-size:120px;line-height:.92;}#${id} .release .copy p{margin-top:70px;width:680px;padding-top:24px;border-top:5px solid #111;font-size:27px;line-height:1.45;font-weight:700;}#${id} .cta{display:inline-block;margin-top:62px;padding:18px 28px;background:var(--accent);color:#fff;font-size:40px;letter-spacing:-.02em;}#${id} .end{position:absolute;left:86px;bottom:52px;font-size:19px;font-weight:900;letter-spacing:.14em;}
</style>`, (id) =>
    `tl.from('#${id} .product',{x:230,duration:.35,ease:'power3.out'},0);\n`+
    `tl.from('#${id} .product .bottle,#${id} .product .hand',{scale:.7,autoAlpha:0,duration:.34,stagger:.08,ease:'power3.out'},.17);\n`+
    `tl.from('#${id} .copy>* ,#${id} .end',{x:-45,autoAlpha:0,duration:.24,stagger:.07},.35);`),
};
