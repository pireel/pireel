/** Editorial Pulse preview dialect: subject-led address, proof, turn, breath, and return. */
import { type Block, mk } from './shared';

const root = (id: string) => `
#${id} .ep{position:absolute;inset:0;overflow:hidden;background:var(--paper);color:var(--fg);font-family:var(--font-body);}
#${id} .head{font-family:var(--font-head);font-weight:800;text-transform:uppercase;}
#${id} .num{font-family:var(--font-num);font-variant-numeric:tabular-nums;}
#${id} .micro{font-family:var(--font-num);font-size:20px;letter-spacing:.16em;text-transform:uppercase;}
#${id} .speaker{position:absolute;background:var(--panel-2);overflow:hidden;}
#${id} .speaker .body{position:absolute;background:#26344a;clip-path:polygon(25% 0,74% 0,83% 15%,96% 34%,100% 100%,0 100%,4% 34%,17% 15%);}
#${id} .speaker .face{position:absolute;border-radius:48% 48% 43% 45%;background:linear-gradient(90deg,#bd8063 0 51%,#e7b18a 52% 100%);}
#${id} .speaker .eye{position:absolute;width:16px;height:8px;border-radius:50%;background:#181b21;}
#${id} [data-edit]{outline:none;}`;

export const cover: () => Block = () =>
  mk('cv_ep2', '封面', (id) => `
<div class="ep cover">
  <div class="rail"></div><div class="pulse"></div>
  <div class="field"><div class="micro">SUBJECT / THOUGHT / EVIDENCE</div><div class="title head" data-edit>编辑<br/>脉冲</div><div class="en">EDITORIAL PULSE</div></div>
  <div class="speaker"><i class="body"></i><i class="face"></i><i class="eye"></i></div>
  <div class="turn">，</div><div class="code num">FRAME 06 / SPEAK · PROVE · TURN</div>
</div>
<style>${root(id)}
#${id} .cover{background:var(--panel-2);color:var(--paper);}
#${id} .field{position:absolute;left:0;top:205px;width:1190px;height:650px;background:var(--paper);color:var(--fg);padding:58px 86px;box-sizing:border-box;clip-path:polygon(0 0,100% 0,88% 100%,0 100%);}
#${id} .title{font-size:174px;line-height:.86;letter-spacing:-.04em;margin-top:50px;}
#${id} .en{position:absolute;left:92px;bottom:46px;font-size:24px;letter-spacing:.2em;}
#${id} .speaker{right:0;top:0;width:790px;height:1080px;}
#${id} .speaker .body{left:95px;top:315px;width:700px;height:800px;}
#${id} .speaker .face{left:275px;top:105px;width:310px;height:355px;}
#${id} .speaker .eye{left:452px;top:235px;}
#${id} .rail{position:absolute;left:0;right:0;top:146px;height:9px;background:var(--accent);}
#${id} .pulse{position:absolute;right:70px;top:100px;width:320px;height:110px;border-top:8px solid var(--accent);clip-path:polygon(0 50%,42% 50%,48% 9%,56% 88%,63% 31%,70% 50%,100% 50%,100% 61%,68% 61%,64% 48%,55% 100%,48% 34%,45% 61%,0 61%);background:var(--accent);}
#${id} .turn{position:absolute;left:720px;bottom:80px;color:var(--accent-2);font-family:var(--font-head);font-size:250px;line-height:.45;}
#${id} .code{position:absolute;left:86px;bottom:54px;font-size:19px;letter-spacing:.15em;}
</style>`, (id) =>
    `tl.from('#${id} .field',{x:-180,duration:.34,ease:'power3.out'},0);\n`+
    `tl.from('#${id} .speaker',{x:120,autoAlpha:0,duration:.4,ease:'power2.out'},.08);\n`+
    `tl.from('#${id} .title,#${id} .en,#${id} .turn,#${id} .code',{autoAlpha:0,y:24,duration:.26,stagger:.06},.3);`);

export const blocks: Record<string, () => Block> = {
  'speaker-thesis': () => mk('ep2_ths', 'speaker-thesis', (id) => `
<div class="ep thesis">
  <div class="speaker"><i class="body"></i><i class="face"></i><i class="eye"></i></div>
  <div class="plane"><span class="micro">THESIS / 01</span><h2 class="head" data-edit>不是说得更多<br/><b>是让观点站住</b></h2><p data-edit>人物先建立可信度，文字只替关键转折占据空间。</p></div>
  <div class="rail"></div><div class="stamp num">VOICE LEADS / TYPE SETTLES</div>
</div>
<style>${root(id)}
#${id} .thesis{background:var(--panel-2);color:var(--paper);}
#${id} .speaker{right:0;top:0;width:860px;height:1080px;}
#${id} .speaker .body{left:80px;top:330px;width:760px;height:790px;}
#${id} .speaker .face{left:290px;top:105px;width:320px;height:360px;}
#${id} .speaker .eye{left:466px;top:235px;}
#${id} .plane{position:absolute;left:76px;top:108px;width:1160px;height:785px;background:var(--paper);color:var(--fg);padding:58px 70px;box-sizing:border-box;clip-path:polygon(0 0,100% 0,87% 100%,0 100%);}
#${id} h2{margin:105px 0 0;font-size:114px;line-height:1.06;letter-spacing:-.035em;}#${id} h2 b{color:var(--accent);}
#${id} p{margin-top:78px;width:650px;border-top:2px solid var(--fg);padding-top:22px;font-size:27px;line-height:1.55;}
#${id} .rail{position:absolute;left:76px;right:70px;bottom:98px;height:8px;background:var(--accent);}
#${id} .stamp{position:absolute;left:80px;bottom:54px;font-size:18px;letter-spacing:.15em;}
</style>`, (id) =>
    `tl.from('#${id} .speaker',{x:130,autoAlpha:0,duration:.4,ease:'power2.out'},0);\n`+
    `tl.from('#${id} .plane',{x:-180,duration:.36,ease:'power3.out'},.08);\n`+
    `tl.from('#${id} h2,#${id} p,#${id} .rail,#${id} .stamp',{autoAlpha:0,y:22,duration:.25,stagger:.06},.32);`),

  'proof-window': () => mk('ep2_prf', 'proof-window', (id) => `
<div class="ep proof">
  <div class="speaker"><i class="body"></i><i class="face"></i><i class="eye"></i></div>
  <div class="copy"><span class="micro">CLAIM / OBSERVED RESULT</span><h2 class="head" data-edit>先看证据<br/>再听结论</h2><p data-edit>证明占据足够面积，人物在结果改变理解后重新接管画面。</p></div>
  <div class="window"><span class="micro">30 DAY OBSERVATION</span><div class="metric num">38<i>%</i><b>→</b>61<i>%</i></div><div class="bars"><i></i><i></i><i></i><i></i></div><small data-edit>完成率 · n=42 · 来源待确认</small></div>
  <div class="edge"></div>
</div>
<style>${root(id)}
#${id} .proof{background:var(--panel-2);color:var(--paper);}
#${id} .speaker{left:0;top:0;width:620px;height:1080px;opacity:.82;}
#${id} .speaker .body{left:10px;top:370px;width:610px;height:760px;}#${id} .speaker .face{left:145px;top:145px;width:280px;height:315px;}#${id} .speaker .eye{left:300px;top:258px;}
#${id} .copy{position:absolute;left:680px;top:72px;width:520px;}#${id} .copy h2{margin:48px 0 0;font-size:84px;line-height:1.02;}#${id} .copy p{margin-top:38px;font-size:24px;line-height:1.55;color:#f4f0e8bd;}
#${id} .window{position:absolute;right:72px;top:120px;width:620px;height:820px;background:var(--paper);color:var(--fg);padding:54px;box-sizing:border-box;box-shadow:18px 18px 0 var(--accent);}
#${id} .metric{margin-top:120px;font-size:128px;font-weight:800;letter-spacing:-.07em;}#${id} .metric i{font-style:normal;font-size:40px;}#${id} .metric b{font-size:70px;margin:0 20px;}
#${id} .bars{position:absolute;left:54px;right:54px;bottom:170px;height:170px;display:flex;align-items:flex-end;gap:28px;border-bottom:4px solid var(--fg);}#${id} .bars i{display:block;width:90px;background:var(--accent);height:42px;}#${id} .bars i:nth-child(2){height:70px}#${id} .bars i:nth-child(3){height:108px}#${id} .bars i:nth-child(4){height:158px}
#${id} .window small{position:absolute;left:54px;bottom:72px;font-size:23px;font-weight:700;}
#${id} .edge{position:absolute;left:630px;top:0;width:9px;height:1080px;background:var(--accent-2);}
</style>`, (id) =>
    `tl.from('#${id} .speaker,#${id} .copy',{autoAlpha:0,duration:.3},0);\n`+
    `tl.from('#${id} .window',{x:250,duration:.38,ease:'power3.out'},.13);\n`+
    `tl.from('#${id} .bars i',{scaleY:0,transformOrigin:'bottom',duration:.24,stagger:.05},.44);`),

  'keyword-turn': () => mk('ep2_trn', 'keyword-turn', (id) => `
<div class="ep turn">
  <div class="before"><span class="micro">ASSUMPTION</span><div class="head" data-edit>更快</div></div>
  <div class="slash">/</div>
  <div class="after"><span class="micro">THE ACTUAL TURN</span><div class="head" data-edit>更清楚</div><p data-edit>一句修正，改变整段解释的方向。</p></div>
  <div class="pulse"></div><div class="code num">WORD REPLACEMENT / 02</div>
</div>
<style>${root(id)}
#${id} .turn{background:var(--panel-2);color:var(--paper);}
#${id} .before{position:absolute;left:90px;top:145px;width:650px;}#${id} .before .head{margin-top:90px;font-size:250px;line-height:.9;color:#f4f0e84d;text-decoration:line-through;text-decoration-thickness:8px;}
#${id} .slash{position:absolute;left:760px;top:-80px;color:var(--accent-2);font-family:var(--font-head);font-size:900px;line-height:1;transform:rotate(10deg);}
#${id} .after{position:absolute;right:90px;top:120px;width:910px;height:790px;background:var(--paper);color:var(--fg);padding:58px 70px;box-sizing:border-box;}
#${id} .after .head{margin-top:100px;font-size:210px;line-height:.92;color:var(--accent);letter-spacing:-.06em;}#${id} .after p{position:absolute;left:72px;bottom:70px;font-size:28px;font-weight:700;}
#${id} .pulse{position:absolute;left:90px;right:90px;bottom:95px;height:8px;background:var(--accent);}
#${id} .code{position:absolute;left:94px;bottom:50px;font-size:18px;letter-spacing:.15em;}
</style>`, (id) =>
    `tl.from('#${id} .before',{autoAlpha:0,duration:.25},0);\n`+
    `tl.from('#${id} .slash',{scaleY:0,transformOrigin:'top',duration:.25,ease:'power3.out'},.14);\n`+
    `tl.from('#${id} .after',{x:220,duration:.34,ease:'power3.out'},.22);\n`+
    `tl.from('#${id} .after .head,#${id} .after p',{autoAlpha:0,y:22,duration:.22,stagger:.08},.5);`),

  'chapter-breath': () => mk('ep2_brh', 'chapter-breath', (id) => `
<div class="ep breath">
  <div class="index num">03</div><div class="rail"></div>
  <div class="phrase"><span class="micro">CHAPTER BREATH</span><h2 class="head" data-edit>让上一句话<br/>先留下来</h2><p data-edit>减少图形、降低音乐，让人物的呼吸完成转场。</p></div>
  <div class="quiet"><i></i><b></b></div><div class="next num">NEXT / PROOF</div>
</div>
<style>${root(id)}
#${id} .breath{background:var(--paper);}
#${id} .index{position:absolute;left:82px;top:70px;font-size:30px;font-weight:700;}#${id} .rail{position:absolute;left:82px;top:128px;width:9px;height:820px;background:var(--accent);}
#${id} .phrase{position:absolute;left:180px;top:132px;width:920px;}#${id} .phrase h2{margin:125px 0 0;font-size:112px;line-height:1.12;letter-spacing:-.035em;}#${id} .phrase p{margin-top:100px;width:680px;font-size:28px;line-height:1.6;color:var(--muted);}
#${id} .quiet{position:absolute;right:90px;top:100px;width:600px;height:790px;background:var(--panel-2);}#${id} .quiet i{position:absolute;left:70px;right:70px;top:390px;height:2px;background:#f4f0e84d;}#${id} .quiet b{position:absolute;left:275px;top:345px;width:56px;height:90px;border:3px solid var(--accent-2);border-radius:50%;}
#${id} .next{position:absolute;right:100px;bottom:78px;font-size:18px;letter-spacing:.16em;color:var(--muted);}
</style>`, (id) =>
    `tl.from('#${id} .rail',{scaleY:0,transformOrigin:'top',duration:.4},0);\n`+
    `tl.from('#${id} .phrase',{autoAlpha:0,y:20,duration:.42},.16);\n`+
    `tl.from('#${id} .quiet',{autoAlpha:0,duration:.6},.28);`),

  'counterpoint': () => mk('ep2_ctr', 'counterpoint', (id) => `
<div class="ep counter">
  <section class="claim"><span class="micro">THE EASY ANSWER</span><h2 class="head" data-edit>把内容<br/>做得更满</h2><p data-edit>看起来更忙，不等于更有说服力。</p></section>
  <section class="answer"><span class="micro">THE ANSWER WE CAN PROVE</span><h2 class="head" data-edit>只留下<br/><b>一个关系</b></h2><p data-edit>人物提出观点，证据改变理解，然后回到人物。</p></section>
  <div class="seam num">CLAIM → EVIDENCE → RETURN</div>
</div>
<style>${root(id)}
#${id} .counter{display:flex;}#${id} section{height:1080px;box-sizing:border-box;position:relative;padding:78px 86px;}#${id} .claim{width:42%;background:var(--paper);}#${id} .answer{width:58%;background:var(--panel-2);color:var(--paper);padding-left:120px;}
#${id} section h2{margin:150px 0 0;font-size:105px;line-height:1.08;letter-spacing:-.04em;}#${id} .answer h2{font-size:132px;}#${id} .answer h2 b{color:var(--accent);}
#${id} section p{position:absolute;left:88px;right:80px;bottom:110px;border-top:3px solid currentColor;padding-top:22px;font-size:27px;line-height:1.5;}#${id} .answer p{left:120px;}
#${id} .seam{position:absolute;left:42%;top:50%;transform:translate(-50%,-50%) rotate(-90deg);background:var(--accent-2);color:white;padding:16px 30px;font-size:18px;font-weight:800;letter-spacing:.14em;white-space:nowrap;}
</style>`, (id) =>
    `tl.from('#${id} .claim',{x:-150,duration:.32,ease:'power3.out'},0);\n`+
    `tl.from('#${id} .answer',{x:190,duration:.34,ease:'power3.out'},.08);\n`+
    `tl.from('#${id} section h2,#${id} section p,#${id} .seam',{autoAlpha:0,y:18,duration:.24,stagger:.08},.34);`),

  'direct-close': () => mk('ep2_cls', 'direct-close', (id) => `
<div class="ep close">
  <div class="speaker"><i class="body"></i><i class="face"></i><i class="eye"></i></div>
  <div class="line"><span class="micro">DIRECT CLOSE</span><h2 class="head" data-edit>最后<br/>回到人</h2><p data-edit>让一个准确动作代替一整墙号召。</p><b data-edit>继续看真实的结果 →</b></div>
  <div class="rail"></div><div class="code num">VOICE / BREATH / RELEASE</div>
</div>
<style>${root(id)}
#${id} .close{background:var(--panel-2);color:var(--paper);}#${id} .speaker{left:0;top:0;width:980px;height:1080px;}#${id} .speaker .body{left:80px;top:350px;width:850px;height:760px;}#${id} .speaker .face{left:330px;top:100px;width:330px;height:375px;}#${id} .speaker .eye{left:515px;top:240px;}
#${id} .line{position:absolute;right:72px;top:98px;width:820px;height:820px;background:var(--paper);color:var(--fg);padding:62px 74px;box-sizing:border-box;}#${id} .line h2{margin:88px 0 0;font-size:150px;line-height:.96;}#${id} .line p{margin-top:62px;font-size:27px;color:var(--muted);}#${id} .line b{position:absolute;left:74px;bottom:66px;font-size:31px;color:var(--accent);}
#${id} .rail{position:absolute;left:80px;right:72px;bottom:96px;height:9px;background:var(--accent);}#${id} .code{position:absolute;right:76px;bottom:53px;font-size:18px;letter-spacing:.16em;}
</style>`, (id) =>
    `tl.from('#${id} .speaker',{autoAlpha:0,duration:.55},0);\n`+
    `tl.from('#${id} .line',{x:210,duration:.36,ease:'power3.out'},.12);\n`+
    `tl.from('#${id} .line h2,#${id} .line p,#${id} .line b,#${id} .rail',{autoAlpha:0,y:18,duration:.24,stagger:.07},.42);`),
};
