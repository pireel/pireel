/** Editorial Collage: one sharp physical proposition, halftone cutouts, bold paper fields, causal assembly. */
import { type Block, mk } from './shared';

const root = (id: string) => `
#${id} .ec{position:absolute;inset:0;overflow:hidden;background:var(--paper);color:var(--fg);font-family:var(--font-body);}
#${id} .head{font-family:var(--font-head);font-weight:950;letter-spacing:-.055em;line-height:.84;}
#${id} .mono{font-family:var(--font-num);font-weight:800;letter-spacing:.12em;text-transform:uppercase;}
#${id} .grain{position:absolute;inset:0;opacity:.18;background-image:radial-gradient(rgb(23 21 19 / .34) .7px,transparent .8px);background-size:7px 7px;mix-blend-mode:multiply;pointer-events:none;}
#${id} .halftone{position:absolute;background-color:#d7d1c7;background-image:radial-gradient(var(--fg) 1.4px,transparent 1.6px);background-size:8px 8px;border:9px solid var(--paper);filter:drop-shadow(10px 12px 0 rgb(23 21 19 / .18));}
#${id} .paper{position:absolute;background:var(--accent);border:7px solid var(--paper);box-shadow:var(--shadow);}
#${id} .cream{background:var(--paper);border:5px solid var(--fg);}
#${id} .rule{position:absolute;height:13px;background:var(--fg);transform-origin:left center;}
#${id} .thread{position:absolute;height:7px;background:var(--accent-2);transform-origin:left center;}
#${id} .micro{font-family:var(--font-num);font-size:18px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;}
#${id} .caption{position:absolute;font-size:27px;font-weight:760;line-height:1.35;}
#${id} .stamp{position:absolute;padding:13px 18px;background:var(--accent-2);border:5px solid var(--fg);box-shadow:6px 7px 0 var(--fg);font-family:var(--font-num);font-size:19px;font-weight:950;letter-spacing:.09em;transform:rotate(-4deg);}
#${id} [data-edit]{outline:none;}`;

export const cover: () => Block = () => mk('cv_ec', '封面', (id) => `
<div class="ec cover"><div class="field"></div><div class="gear halftone"></div><div class="subject halftone"></div><div class="input paper"></div><div class="result cream"></div><i class="thread a"></i><i class="thread b"></i><h1 class="head" data-edit>编辑<br/>拼贴</h1><div class="en mono">EDITORIAL COLLAGE</div><div class="stamp">ONE SHARP VISUAL IDEA</div><div class="micro thesis">MEANING / MATERIAL / ASSEMBLY</div><div class="grain"></div></div>
<style>${root(id)}
#${id} .cover .field{position:absolute;inset:0 43% 0 0;background:var(--panel);}
#${id} .cover .gear{right:250px;top:155px;width:510px;height:510px;border-radius:50%;clip-path:polygon(50% 0,61% 15%,78% 8%,84% 27%,100% 34%,88% 50%,100% 66%,84% 73%,78% 92%,61% 85%,50% 100%,39% 85%,22% 92%,16% 73%,0 66%,12% 50%,0 34%,16% 27%,22% 8%,39% 15%);}
#${id} .cover .subject{right:510px;bottom:-70px;width:300px;height:570px;clip-path:polygon(24% 0,76% 0,87% 18%,82% 36%,100% 100%,0 100%,18% 36%,13% 18%);}
#${id} .cover .input{right:990px;top:225px;width:180px;height:180px;transform:rotate(-8deg);}
#${id} .cover .result{right:70px;bottom:105px;width:300px;height:190px;transform:rotate(7deg);}
#${id} .cover .thread.a{right:890px;top:360px;width:250px;transform:rotate(14deg);}
#${id} .cover .thread.b{right:245px;top:690px;width:330px;transform:rotate(26deg);}
#${id} .cover h1{position:absolute;left:72px;top:180px;color:var(--paper);font-size:205px;}
#${id} .cover .en{position:absolute;left:82px;top:635px;color:var(--paper);font-size:29px;}
#${id} .cover .stamp{left:705px;top:90px;}
#${id} .cover .thesis{position:absolute;left:82px;bottom:70px;color:var(--paper);}
</style>`, (id) => `tl.from('#${id} .field',{x:-180,duration:.3},0);tl.from('#${id} .gear',{scale:0,rotation:-35,duration:.34},.12);tl.from('#${id} .subject',{y:150,autoAlpha:0,duration:.28},.26);tl.from('#${id} .input,#${id} .result',{scale:.5,rotation:0,autoAlpha:0,duration:.24,stagger:.12},.36);tl.from('#${id} .thread',{scaleX:0,duration:.18,stagger:.1},.5);tl.from('#${id} h1,#${id} .en,#${id} .thesis',{x:-45,autoAlpha:0,duration:.2,stagger:.06},.28);tl.from('#${id} .stamp',{scale:0,rotation:5,duration:.18},.7);`);

export const blocks: Record<string, () => Block> = {
  'metaphor-machine': () => mk('ec_machine', 'metaphor-machine', (id) => `
<div class="ec machine"><div class="label micro">METAPHOR MACHINE / ONE ACTION</div><div class="press cream"><i></i><b></b></div><div class="subject halftone"></div><div class="raw paper"></div><div class="result"></div><i class="thread"></i><h2 class="head" data-edit>把复杂<br/>压成清楚</h2><p class="caption" data-edit>不是解释更多，而是让一个物理动作说清关系。</p><div class="stamp">ONE PROPOSITION</div><div class="grain"></div></div>
<style>${root(id)}
#${id} .machine{background:var(--accent-2);}
#${id} .machine .label{position:absolute;left:70px;top:62px;}
#${id} .machine .press{position:absolute;left:690px;top:115px;width:780px;height:790px;box-shadow:14px 16px 0 rgb(23 21 19 / .2);}
#${id} .machine .press i{position:absolute;left:120px;top:95px;width:540px;height:340px;background:var(--panel);clip-path:polygon(12% 0,88% 0,100% 100%,0 100%);}
#${id} .machine .press b{position:absolute;left:250px;bottom:80px;width:280px;height:210px;background:var(--fg);}
#${id} .machine .subject{left:835px;top:240px;width:250px;height:420px;clip-path:polygon(24% 0,76% 0,88% 20%,80% 40%,100% 100%,0 100%,20% 40%,12% 20%);}
#${id} .machine .raw{left:500px;top:330px;width:210px;height:210px;transform:rotate(-9deg);}
#${id} .machine .result{position:absolute;left:1510px;top:405px;width:265px;height:165px;background:var(--panel);border:7px solid var(--paper);box-shadow:var(--shadow);transform:rotate(6deg);}
#${id} .machine .thread{left:1420px;top:490px;width:130px;}
#${id} .machine h2{position:absolute;left:70px;top:205px;font-size:126px;}
#${id} .machine p{left:78px;top:590px;width:510px;}
#${id} .machine .stamp{left:95px;bottom:95px;}
</style>`, (id) => `tl.from('#${id} .press',{y:100,autoAlpha:0,duration:.3},0);tl.from('#${id} .raw',{x:-140,rotation:0,autoAlpha:0,duration:.24},.18);tl.from('#${id} .subject',{y:-100,autoAlpha:0,duration:.24},.3);tl.to('#${id} .raw',{x:520,scale:.62,rotation:5,duration:.3},.42);tl.from('#${id} .thread',{scaleX:0,duration:.16},.66);tl.from('#${id} .result',{scale:0,rotation:0,duration:.22},.7);tl.from('#${id} h2,#${id} p',{x:-45,autoAlpha:0,duration:.22,stagger:.08},.24);tl.from('#${id} .stamp',{scale:0,duration:.16},.82);`),

  'process-assembly': () => mk('ec_process', 'process-assembly', (id) => `
<div class="ec process"><div class="route"></div><div class="station s1 cream"><b>01</b><i></i></div><div class="station s2"><b>02</b><div class="wheel halftone"></div></div><div class="station s3 cream"><b>03</b><em></em></div><div class="packet paper"></div><h2 class="head" data-edit>进入 · 转换 · 交付</h2><div class="micro note">THE OBJECT CHANGES / NOT THE LABELS</div><div class="stamp">PROCESS AS PHYSICAL CAUSE</div><div class="grain"></div></div>
<style>${root(id)}
#${id} .process{background:var(--panel);color:var(--paper);}
#${id} .process .route{position:absolute;left:120px;right:100px;top:575px;height:19px;background:var(--accent-2);transform:rotate(-4deg);}
#${id} .process .station{position:absolute;width:390px;height:430px;border:8px solid var(--paper);box-shadow:12px 15px 0 rgb(23 21 19 / .25);color:var(--fg);}
#${id} .process .station>b{position:absolute;left:25px;top:20px;font-family:var(--font-num);font-size:42px;}
#${id} .process .s1{left:120px;top:270px;transform:rotate(-5deg);}
#${id} .process .s1 i{position:absolute;left:85px;top:125px;width:220px;height:220px;background:var(--accent);clip-path:polygon(0 18%,62% 18%,62% 0,100% 50%,62% 100%,62% 82%,0 82%);}
#${id} .process .s2{left:750px;top:175px;background:var(--accent);transform:rotate(4deg);}
#${id} .process .s2 .wheel{left:75px;top:95px;width:225px;height:225px;border-radius:50%;}
#${id} .process .s3{right:100px;top:315px;transform:rotate(-3deg);}
#${id} .process .s3 em{position:absolute;left:70px;top:145px;width:250px;height:155px;background:var(--panel);clip-path:polygon(0 0,100% 0,82% 100%,16% 100%);}
#${id} .process .packet{left:210px;top:520px;width:95px;height:95px;z-index:4;}
#${id} .process h2{position:absolute;left:92px;top:62px;font-size:90px;}
#${id} .process .note{position:absolute;right:90px;bottom:70px;}
#${id} .process .stamp{left:710px;bottom:70px;color:var(--fg);}
</style>`, (id) => `tl.from('#${id} .route',{scaleX:0,duration:.32},0);tl.from('#${id} .station',{y:110,rotation:0,autoAlpha:0,duration:.28,stagger:.18},.12);tl.from('#${id} .packet',{scale:0,rotation:-12,duration:.18},.24);tl.to('#${id} .packet',{x:645,y:-145,rotation:8,duration:.34},.46);tl.to('#${id} .packet',{x:1285,y:5,scale:.72,rotation:0,duration:.34},.72);tl.from('#${id} h2,#${id} .note',{autoAlpha:0,y:25,duration:.2,stagger:.08},.18);tl.from('#${id} .stamp',{scale:0,duration:.16},.92);`),

  'contrast-cut': () => mk('ec_contrast', 'contrast-cut', (id) => `
<div class="ec contrast"><div class="left"><div class="tangle"></div><div class="subject halftone"></div></div><div class="right"><div class="track"></div><div class="subject halftone"></div><div class="result cream"></div></div><div class="seam"></div><div class="before mono">SCATTERED</div><div class="after mono">ALIGNED</div><h2 class="head" data-edit>不是换颜色<br/>是状态真的变了</h2><div class="grain"></div></div>
<style>${root(id)}
#${id} .contrast .left{position:absolute;inset:0 50% 0 0;background:var(--accent);}
#${id} .contrast .right{position:absolute;inset:0 0 0 50%;background:var(--paper);}
#${id} .contrast .seam{position:absolute;left:47%;top:-80px;width:150px;height:1250px;background:var(--fg);clip-path:polygon(35% 0,80% 7%,38% 18%,75% 30%,32% 43%,70% 58%,24% 72%,66% 84%,30% 100%,0 100%,15% 82%,0 68%,18% 51%,2% 37%,20% 20%,0 6%);}
#${id} .contrast .subject{width:250px;height:470px;clip-path:polygon(22% 0,78% 0,90% 20%,80% 42%,100% 100%,0 100%,20% 42%,10% 20%);}
#${id} .contrast .left .subject{left:330px;top:310px;transform:rotate(-13deg);}
#${id} .contrast .right .subject{right:370px;top:300px;}
#${id} .contrast .tangle{position:absolute;left:90px;top:185px;width:700px;height:650px;border:20px solid var(--accent-2);border-radius:50%;clip-path:polygon(0 0,100% 8%,85% 30%,100% 55%,72% 100%,35% 78%,0 100%,15% 58%);transform:rotate(17deg);}
#${id} .contrast .track{position:absolute;left:140px;top:535px;width:620px;height:22px;background:var(--panel);}
#${id} .contrast .result{right:80px;top:450px;width:230px;height:190px;transform:rotate(5deg);}
#${id} .contrast .before{position:absolute;left:70px;top:70px;color:var(--paper);font-size:24px;}
#${id} .contrast .after{position:absolute;right:70px;top:70px;font-size:24px;}
#${id} .contrast h2{position:absolute;left:625px;bottom:70px;width:720px;text-align:center;color:var(--paper);font-size:72px;z-index:3;}
</style>`, (id) => `tl.from('#${id} .left',{x:-240,duration:.28},0);tl.from('#${id} .tangle,#${id} .left .subject',{scale:.65,rotation:0,autoAlpha:0,duration:.26,stagger:.08},.16);tl.from('#${id} .seam',{scaleY:0,transformOrigin:'top',duration:.28},.4);tl.from('#${id} .right .track',{scaleX:0,duration:.22},.58);tl.from('#${id} .right .subject,#${id} .result',{x:120,autoAlpha:0,duration:.24,stagger:.1},.66);tl.from('#${id} h2',{y:40,autoAlpha:0,duration:.2},.78);`),

  'evidence-cutout': () => mk('ec_evidence', 'evidence-cutout', (id) => `
<div class="ec evidence"><div class="source halftone"><div class="focus"></div></div><div class="index mono">SOURCE / 04</div><div class="bracket a"></div><div class="bracket b"></div><div class="excerpt cream"><span class="micro">WHAT THE CLAIM RESTS ON</span><h2 class="head" data-edit>证据先站稳<br/>设计再说话</h2><p data-edit>保留来源、上下文与可核对的细节。</p></div><i class="thread"></i><div class="stamp">TRUTHFUL SOURCE</div><div class="grain"></div></div>
<style>${root(id)}
#${id} .evidence{background:var(--accent-2);}
#${id} .evidence .source{left:80px;top:80px;width:1030px;height:920px;background-size:10px 10px;}
#${id} .evidence .focus{position:absolute;right:150px;top:210px;width:360px;height:270px;border:13px solid var(--accent);}
#${id} .evidence .index{position:absolute;left:115px;top:110px;padding:12px 18px;background:var(--fg);color:var(--paper);font-size:18px;}
#${id} .evidence .excerpt{right:85px;top:155px;width:760px;height:700px;padding:70px;transform:rotate(2deg);box-shadow:14px 16px 0 rgb(23 21 19 / .2);}
#${id} .evidence .excerpt h2{margin-top:120px;font-size:84px;}
#${id} .evidence .excerpt p{margin-top:70px;width:560px;font-size:27px;line-height:1.5;}
#${id} .evidence .thread{left:1015px;top:530px;width:200px;transform:rotate(-7deg);}
#${id} .evidence .bracket{position:absolute;width:115px;height:115px;border-color:var(--accent);border-style:solid;z-index:3;}
#${id} .evidence .bracket.a{left:895px;top:260px;border-width:12px 12px 0 0;}
#${id} .evidence .bracket.b{left:895px;top:590px;border-width:0 12px 12px 0;}
#${id} .evidence .stamp{right:130px;bottom:105px;}
</style>`, (id) => `tl.from('#${id} .source',{x:-150,autoAlpha:0,duration:.32},0);tl.from('#${id} .excerpt',{x:150,rotation:0,autoAlpha:0,duration:.3},.2);tl.from('#${id} .focus',{scale:.5,autoAlpha:0,duration:.2},.42);tl.from('#${id} .bracket',{scale:.4,autoAlpha:0,duration:.18,stagger:.08},.5);tl.from('#${id} .thread',{scaleX:0,duration:.18},.58);tl.from('#${id} .excerpt>*',{y:25,autoAlpha:0,duration:.2,stagger:.07},.36);tl.from('#${id} .stamp',{scale:0,duration:.16},.75);`),

  'relation-field': () => mk('ec_relation', 'relation-field', (id) => `
<div class="ec relation"><div class="force halftone"></div><div class="node n1 paper"></div><div class="node n2 cream"></div><div class="node n3 paper"></div><i class="thread t1"></i><i class="thread t2"></i><i class="thread t3"></i><div class="orbit"></div><h2 class="head" data-edit>一个变化<br/>让全局重新排队</h2><p class="caption" data-edit>用距离、尺度和牵引表现关系，不画等分卡片。</p><div class="micro note">DOMINANT FORCE → RESPONDERS → NEW FIELD</div><div class="grain"></div></div>
<style>${root(id)}
#${id} .relation{background:var(--panel);color:var(--paper);}
#${id} .relation .force{left:145px;top:205px;width:560px;height:560px;border-radius:50%;}
#${id} .relation .orbit{position:absolute;left:70px;top:130px;width:710px;height:710px;border:8px solid var(--accent-2);border-radius:50%;transform:rotate(-8deg);}
#${id} .relation .node{width:180px;height:180px;z-index:2;}
#${id} .relation .n1{left:885px;top:180px;transform:rotate(-7deg);}
#${id} .relation .n2{left:1200px;top:440px;transform:rotate(5deg);}
#${id} .relation .n3{right:100px;bottom:120px;transform:rotate(-4deg);}
#${id} .relation .thread{left:630px;top:480px;z-index:1;}
#${id} .relation .t1{width:345px;transform:rotate(-42deg);}
#${id} .relation .t2{width:590px;transform:rotate(4deg);}
#${id} .relation .t3{width:1000px;transform:rotate(22deg);}
#${id} .relation h2{position:absolute;right:80px;top:80px;width:740px;font-size:92px;}
#${id} .relation p{right:95px;top:350px;width:570px;}
#${id} .relation .note{position:absolute;left:95px;bottom:65px;}
</style>`, (id) => `tl.from('#${id} .orbit',{scale:0,rotation:-30,duration:.3},0);tl.from('#${id} .force',{scale:0,duration:.28},.12);tl.from('#${id} .thread',{scaleX:0,duration:.22,stagger:.09},.3);tl.from('#${id} .node',{scale:0,rotation:0,duration:.22,stagger:.1},.48);tl.from('#${id} h2,#${id} p,#${id} .note',{x:45,autoAlpha:0,duration:.22,stagger:.07},.28);`),

  'clean-resolution': () => mk('ec_resolve', 'clean-resolution', (id) => `
<div class="ec resolve"><div class="scrap s1 paper"></div><div class="scrap s2 halftone"></div><div class="scrap s3 cream"></div><div class="anchor halftone"></div><i class="rule"></i><div class="copy"><span class="micro">CLEAN RESOLUTION / HOLD</span><h2 class="head" data-edit>最后只留<br/><b>真正重要的</b></h2><p data-edit>清走过程，让结果和一句判断安静停住。</p></div><div class="stamp">LET IT LAND</div><div class="grain"></div></div>
<style>${root(id)}
#${id} .resolve{background:var(--paper);}
#${id} .resolve .scrap{width:220px;height:180px;}
#${id} .resolve .s1{left:40px;top:80px;transform:rotate(-12deg);}
#${id} .resolve .s2{left:310px;bottom:40px;transform:rotate(8deg);}
#${id} .resolve .s3{right:30px;top:55px;transform:rotate(9deg);}
#${id} .resolve .anchor{left:150px;top:145px;width:720px;height:790px;clip-path:polygon(15% 0,88% 4%,100% 34%,90% 100%,5% 94%,0 28%);}
#${id} .resolve .rule{left:940px;top:170px;width:780px;background:var(--accent);}
#${id} .resolve .copy{position:absolute;left:1010px;top:235px;width:730px;}
#${id} .resolve .copy h2{margin-top:110px;font-size:102px;}
#${id} .resolve .copy h2 b{color:var(--accent);}
#${id} .resolve .copy p{margin-top:65px;width:570px;font-size:27px;line-height:1.5;}
#${id} .resolve .stamp{right:120px;bottom:100px;}
</style>`, (id) => `tl.from('#${id} .scrap',{scale:.5,rotation:0,autoAlpha:0,duration:.18,stagger:.07},0);tl.to('#${id} .scrap',{x:(i)=>[-320,-480,340][i],y:(i)=>[-240,300,-220][i],autoAlpha:0,duration:.28,stagger:.04},.32);tl.from('#${id} .anchor',{scale:.88,autoAlpha:0,duration:.32},.44);tl.from('#${id} .rule',{scaleX:0,duration:.22},.58);tl.from('#${id} .copy>*',{x:45,autoAlpha:0,duration:.22,stagger:.08},.6);tl.from('#${id} .stamp',{scale:0,duration:.16},.86);`),
};
