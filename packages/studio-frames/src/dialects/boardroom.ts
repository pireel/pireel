/** Boardroom v2 preview dialect: people, exhibits, evidence lines, tension, ownership, release. */
import { type Block, mk } from './shared';

const root = (id: string) => `
#${id} .br{position:absolute;inset:0;overflow:hidden;background:var(--paper);color:var(--fg);font-family:var(--font-body);}
#${id} .head{font-family:var(--font-head);font-weight:900;letter-spacing:-.045em;}
#${id} .num{font-family:var(--font-num);font-variant-numeric:tabular-nums;}
#${id} .micro{font-family:var(--font-num);font-size:18px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;}
#${id} .person{position:absolute;width:460px;height:790px;}
#${id} .person .hair{position:absolute;left:103px;top:24px;width:255px;height:260px;border-radius:48% 48% 38% 38%;background:#252126;}
#${id} .person .face{position:absolute;left:139px;top:92px;width:184px;height:220px;border-radius:48% 48% 43% 43%;background:#c78968;}
#${id} .person .body{position:absolute;left:35px;top:292px;width:390px;height:520px;border-radius:180px 180px 0 0;background:#465665;}
#${id} .person .eye{position:absolute;left:185px;top:176px;width:23px;height:9px;border-radius:50%;background:#241913;box-shadow:82px 0 0 #241913;}
#${id} .person .mouth{position:absolute;left:220px;top:256px;width:48px;height:8px;border-radius:50%;background:#88443e;}
#${id} .doc{position:absolute;background:#fff;border:2px solid var(--line);box-shadow:var(--shadow);}
#${id} .doc .rule{position:absolute;left:46px;right:46px;height:4px;background:var(--fg);}
#${id} .doc .thin{height:2px;background:var(--line);}
#${id} .source{font-family:var(--font-num);font-size:17px;letter-spacing:.08em;color:var(--muted);}
#${id} [data-edit]{outline:none;}`;

export const cover: () => Block = () => mk('cv_br2', '封面', (id) => `
<div class="br cover">
  <div class="ink"></div><div class="room"><div class="table"></div><div class="person"><i class="hair"></i><i class="face"></i><i class="body"></i><i class="eye"></i><i class="mouth"></i></div><div class="doc"><i class="rule"></i><i class="rule thin"></i><i class="chart"></i></div></div>
  <div class="line"></div><div class="title head" data-edit>决策室</div><div class="english num">BOARDROOM</div><div class="thesis micro">PERSON / EVIDENCE / DECISION / OWNER</div>
</div>
<style>${root(id)}
#${id} .cover{background:#f3f5f6;}#${id} .ink{position:absolute;left:0;top:0;width:805px;height:1080px;background:var(--panel-2);}#${id} .room{position:absolute;right:0;top:0;width:1220px;height:1080px;background:linear-gradient(145deg,#d7dde1,#f7f8f8 58%,#b8c0c5);overflow:hidden;}#${id} .table{position:absolute;left:-120px;right:-100px;bottom:-120px;height:420px;background:#7a6655;transform:skewY(-7deg);}#${id} .person{right:170px;top:150px;}#${id} .cover .doc{left:115px;top:215px;width:470px;height:620px;transform:rotate(-5deg);}#${id} .cover .doc .rule{top:76px;}#${id} .cover .doc .thin{top:132px;}#${id} .chart{position:absolute;left:55px;right:55px;bottom:85px;height:330px;background:linear-gradient(160deg,transparent 0 38%,var(--accent) 39% 44%,transparent 45% 56%,var(--accent) 57% 62%,transparent 63%);clip-path:polygon(0 80%,28% 58%,49% 67%,72% 32%,100% 6%,100% 100%,0 100%);opacity:.95;}
#${id} .line{position:absolute;left:705px;top:0;width:18px;height:780px;background:var(--accent);}#${id} .title{position:absolute;left:92px;top:230px;color:#fff;font-size:185px;line-height:.95;}#${id} .english{position:absolute;left:102px;top:465px;color:#fff;font-size:32px;font-weight:900;letter-spacing:.2em;}#${id} .thesis{position:absolute;left:102px;bottom:90px;color:#fff;}
</style>`, (id) =>
  `tl.from('#${id} .ink',{x:-180,duration:.35,ease:'power3.out'},0);\n`+
  `tl.from('#${id} .room',{x:220,duration:.38,ease:'power3.out'},.08);\n`+
  `tl.from('#${id} .doc,#${id} .person',{y:90,autoAlpha:0,duration:.32,stagger:.1},.26);\n`+
  `tl.from('#${id} .line',{scaleY:0,transformOrigin:'top',duration:.27},.38);\n`+
  `tl.from('#${id} .title,#${id} .english,#${id} .thesis',{x:-45,autoAlpha:0,duration:.24,stagger:.06},.46);`);

export const blocks: Record<string, () => Block> = {
  'room-thesis': () => mk('br2_thesis', 'room-thesis', (id) => `
<div class="br thesis">
  <div class="room"><div class="window"></div><div class="table"></div><div class="person"><i class="hair"></i><i class="face"></i><i class="body"></i><i class="eye"></i><i class="mouth"></i></div></div>
  <div class="field"><span class="micro">ROOM THESIS / CURRENT JUDGMENT</span><h2 class="head" data-edit>先说判断<br/><b>再让证据改变它</b></h2><p data-edit>人物、现场与问题先成立，不从一页执行摘要开始。</p></div><div class="edge"></div><div class="index num">01 / DECISION IN PROGRESS</div>
</div>
<style>${root(id)}
#${id} .thesis{background:var(--panel-2);color:#fff;}#${id} .thesis .room{position:absolute;right:0;top:0;width:880px;height:1080px;background:linear-gradient(140deg,#e9edef,#bec8ce);overflow:hidden;}#${id} .window{position:absolute;right:50px;top:70px;width:410px;height:500px;border:18px solid #9ba7ae;background:#eaf3f8;}#${id} .table{position:absolute;left:-80px;right:-80px;bottom:-90px;height:360px;background:#756456;transform:skewY(-7deg);}#${id} .thesis .person{left:165px;top:180px;}#${id} .field{position:absolute;left:95px;top:105px;width:860px;}#${id} .field h2{margin:125px 0 0;font-size:115px;line-height:.95;}#${id} .field h2 b{display:inline-block;margin-top:18px;color:#fff;border-bottom:14px solid var(--accent);padding-bottom:8px;}#${id} .field p{margin-top:78px;width:700px;font-size:27px;line-height:1.55;color:#ffffffb8;}#${id} .edge{position:absolute;left:1010px;top:0;width:16px;height:760px;background:var(--accent);}#${id} .index{position:absolute;left:96px;bottom:65px;font-size:19px;letter-spacing:.14em;}
</style>`, (id) =>
    `tl.from('#${id} .room',{x:220,duration:.36,ease:'power3.out'},0);\n`+
    `tl.from('#${id} .edge',{scaleY:0,transformOrigin:'top',duration:.28},.16);\n`+
    `tl.from('#${id} .field>* ,#${id} .index',{x:-45,autoAlpha:0,duration:.24,stagger:.07},.28);`),

  'speaker-exhibit': () => mk('br2_speaker', 'speaker-exhibit', (id) => `
<div class="br speaker">
  <div class="human"><div class="person"><i class="hair"></i><i class="face"></i><i class="body"></i><i class="eye"></i><i class="mouth"></i></div><span class="micro">LIVE BRIEFING / SOURCE ATTACHED</span></div>
  <div class="exhibit"><div class="doc"><i class="rule"></i><i class="rule thin"></i><div class="quote head" data-edit>“增长回来，<br/>但不是原来的增长。”</div><span class="source">SOURCE / OPERATING REVIEW / 2026-06</span></div><i class="connect"></i></div>
  <div class="copy head" data-edit>让人物和证据<br/><b>共享权威</b></div>
</div>
<style>${root(id)}
#${id} .speaker{background:#f3f5f6;}#${id} .human{position:absolute;left:0;top:0;width:760px;height:1080px;background:linear-gradient(145deg,#d1d8dc,#f4f6f7);overflow:hidden;}#${id} .human .person{left:145px;top:190px;}#${id} .human>span{position:absolute;left:68px;bottom:55px;}#${id} .exhibit{position:absolute;left:760px;right:0;top:0;height:1080px;background:var(--panel-2);}#${id} .speaker .doc{left:175px;top:135px;width:770px;height:720px;}#${id} .speaker .doc .rule{top:70px;}#${id} .speaker .doc .thin{top:125px;}#${id} .quote{position:absolute;left:50px;right:50px;top:195px;font-size:72px;line-height:1.08;}#${id} .source{position:absolute;left:50px;bottom:48px;}#${id} .connect{position:absolute;left:-105px;top:500px;width:250px;height:12px;background:var(--accent);}#${id} .speaker .copy{position:absolute;left:75px;top:80px;width:680px;font-size:62px;line-height:1;}#${id} .speaker .copy b{color:var(--accent);}
</style>`, (id) =>
    `tl.from('#${id} .human',{x:-150,duration:.34,ease:'power3.out'},0);\n`+
    `tl.from('#${id} .exhibit',{x:180,duration:.34,ease:'power3.out'},.08);\n`+
    `tl.from('#${id} .doc',{scale:.92,autoAlpha:0,duration:.3},.28);\n`+
    `tl.from('#${id} .connect',{scaleX:0,transformOrigin:'right',duration:.23},.44);\n`+
    `tl.from('#${id} .copy',{autoAlpha:0,y:20,duration:.24},.5);`),

  'evidence-ledger': () => mk('br2_ledger', 'evidence-ledger', (id) => `
<div class="br ledger">
  <div class="question"><span class="micro">EVIDENCE LEDGER / ACTUAL VS PLAN</span><h2 class="head" data-edit>增长来自哪里？</h2><p data-edit>不是把数字摆大，而是让基线、变化和原因同时可见。</p></div>
  <div class="plot"><div class="axis"></div><div class="bar a"><b class="num">64</b><i></i><span>计划</span></div><div class="bar b"><b class="num">81</b><i></i><span>实际</span></div><div class="event"><b>复购贡献</b><span class="num">+17</span></div><div class="source num">SOURCE / VERIFIED OPERATING DATA / PERIOD NEEDS CONFIRMATION</div></div>
  <div class="decision head" data-edit>增长回来了，<br/><b>来源已经改变</b></div>
</div>
<style>${root(id)}
#${id} .ledger{background:#f3f5f6;}#${id} .question{position:absolute;left:85px;top:75px;width:690px;}#${id} .question h2{margin:90px 0 0;font-size:95px;}#${id} .question p{margin-top:55px;width:620px;font-size:27px;line-height:1.55;}#${id} .plot{position:absolute;left:820px;right:80px;top:80px;bottom:80px;background:#fff;border:3px solid var(--fg);}#${id} .axis{position:absolute;left:90px;right:70px;bottom:175px;height:5px;background:var(--fg);}#${id} .bar{position:absolute;bottom:178px;width:220px;}#${id} .bar.a{left:150px;}#${id} .bar.b{left:470px;}#${id} .bar i{display:block;width:100%;height:410px;background:#c8ced3;}#${id} .bar.b i{height:570px;background:var(--accent);}#${id} .bar b{position:absolute;left:0;bottom:100%;margin-bottom:18px;font-size:48px;}#${id} .bar span{position:absolute;left:0;top:100%;margin-top:24px;font-size:24px;font-weight:800;}#${id} .event{position:absolute;right:65px;top:185px;width:320px;border-top:10px solid var(--accent);padding-top:20px;}#${id} .event b{display:block;font-size:29px;}#${id} .event span{display:block;margin-top:16px;font-size:58px;color:var(--accent);}#${id} .plot .source{position:absolute;left:55px;bottom:40px;font-size:16px;color:var(--muted);}#${id} .ledger .decision{position:absolute;left:85px;bottom:90px;width:660px;font-size:68px;line-height:1.05;}#${id} .ledger .decision b{color:var(--accent);}
</style>`, (id) =>
    `tl.from('#${id} .question>* ,#${id} .decision',{x:-45,autoAlpha:0,duration:.24,stagger:.07},0);\n`+
    `tl.from('#${id} .plot',{x:160,autoAlpha:0,duration:.33,ease:'power3.out'},.14);\n`+
    `tl.from('#${id} .bar i',{scaleY:0,transformOrigin:'bottom',duration:.34,stagger:.12},.36);\n`+
    `tl.from('#${id} .event',{scaleX:0,transformOrigin:'left',duration:.24},.62);`),

  'decision-fork': () => mk('br2_fork', 'decision-fork', (id) => `
<div class="br fork">
  <div class="intro"><span class="micro">DECISION FORK / ONE MATERIAL CONSTRAINT</span><h2 class="head" data-edit>两个方向都合理<br/><b>直到风险出现</b></h2></div>
  <div class="choice left"><span class="num">A / EXPAND</span><h3 class="head" data-edit>现在扩张</h3><p>更快获得规模</p><i class="path"></i></div><div class="choice right"><span class="num">B / STABILIZE</span><h3 class="head" data-edit>先稳住复购</h3><p>降低回本压力</p><i class="path"></i></div>
  <div class="risk"><b class="head" data-edit>现金周期</b><span class="num">+47 DAYS</span><p>真实条件需用户确认</p></div><div class="resolved num">CONSTRAINT → DECISION</div>
</div>
<style>${root(id)}
#${id} .fork{background:var(--panel-2);color:#fff;}#${id} .intro{position:absolute;left:80px;top:70px;width:1100px;}#${id} .intro h2{margin-top:75px;font-size:85px;line-height:1;}#${id} .intro h2 b{color:#fff;border-bottom:12px solid var(--accent-2);}#${id} .choice{position:absolute;top:455px;width:690px;height:410px;padding:42px 50px;background:#fff;color:var(--fg);}#${id} .choice.left{left:80px;}#${id} .choice.right{left:850px;}#${id} .choice span{font-size:18px;font-weight:900;letter-spacing:.12em;color:var(--muted);}#${id} .choice h3{margin:62px 0 0;font-size:64px;}#${id} .choice p{font-size:27px;color:var(--muted);}#${id} .path{position:absolute;left:50px;right:50px;bottom:50px;height:10px;background:#b9c1c8;}#${id} .right .path{background:var(--accent);}#${id} .risk{position:absolute;right:70px;top:85px;width:380px;padding:30px 34px;background:var(--accent-2);color:#fff;}#${id} .risk b{display:block;font-size:45px;}#${id} .risk span{display:block;margin-top:18px;font-size:34px;font-weight:900;}#${id} .risk p{margin:18px 0 0;font-size:18px;}#${id} .resolved{position:absolute;right:80px;bottom:70px;font-size:19px;letter-spacing:.14em;}
</style>`, (id) =>
    `tl.from('#${id} .intro>*',{x:-45,autoAlpha:0,duration:.24,stagger:.08},0);\n`+
    `tl.from('#${id} .choice',{y:100,autoAlpha:0,duration:.3,stagger:.12},.25);\n`+
    `tl.from('#${id} .path',{scaleX:0,transformOrigin:'left',duration:.26,stagger:.1},.5);\n`+
    `tl.from('#${id} .risk',{x:100,autoAlpha:0,duration:.26,ease:'power3.out'},.56);`),

  'ownership-line': () => mk('br2_owner', 'ownership-line', (id) => `
<div class="br owner">
  <div class="person"><i class="hair"></i><i class="face"></i><i class="body"></i><i class="eye"></i><i class="mouth"></i></div><div class="blue"></div>
  <div class="copy"><span class="micro">OWNERSHIP LINE / DECISION TO ACTION</span><h2 class="head" data-edit>决定不落到人<br/><b>就还不是决定</b></h2><div class="commit"><span>负责人</span><b data-edit>增长团队</b><span>复盘点</span><b data-edit>四周后</b></div></div>
  <div class="line"></div><div class="source num">OWNER AND DATE REQUIRE USER CONFIRMATION</div>
</div>
<style>${root(id)}
#${id} .owner{background:#f3f5f6;}#${id} .owner>.person{left:130px;top:175px;}#${id} .blue{position:absolute;left:0;bottom:0;width:720px;height:250px;background:var(--accent);}#${id} .owner .copy{position:absolute;left:760px;top:110px;width:1010px;}#${id} .owner .copy h2{margin:115px 0 0;font-size:105px;line-height:.98;}#${id} .owner .copy h2 b{color:var(--accent);}#${id} .commit{margin-top:78px;display:grid;grid-template-columns:190px 1fr;gap:18px 35px;border-top:5px solid var(--fg);padding-top:28px;}#${id} .commit span{font-size:22px;color:var(--muted);letter-spacing:.12em;}#${id} .commit b{font-size:36px;}#${id} .owner .line{position:absolute;left:640px;top:0;width:14px;height:850px;background:var(--accent);}#${id} .owner .source{position:absolute;right:95px;bottom:60px;font-size:17px;letter-spacing:.12em;color:var(--muted);}
</style>`, (id) =>
    `tl.from('#${id} .person,#${id} .blue',{x:-130,autoAlpha:0,duration:.34,stagger:.08,ease:'power3.out'},0);\n`+
    `tl.from('#${id} .line',{scaleY:0,transformOrigin:'top',duration:.3},.18);\n`+
    `tl.from('#${id} .copy>* ,#${id} .source',{x:45,autoAlpha:0,duration:.24,stagger:.07},.3);`),

  'signed-close': () => mk('br2_close', 'signed-close', (id) => `
<div class="br close">
  <div class="ink"></div><div class="statement"><span class="micro">SIGNED CLOSE / LESS INFORMATION</span><h2 class="head" data-edit>先稳住复购<br/><b>再谈下一城</b></h2><p data-edit>结论、负责人和下一复盘点必须来自用户确认。</p><div class="sign"><i></i><span class="num">DECISION / OWNER / REVIEW</span></div></div>
  <div class="room"><div class="table"></div><div class="person"><i class="hair"></i><i class="face"></i><i class="body"></i><i class="eye"></i><i class="mouth"></i></div></div>
</div>
<style>${root(id)}
#${id} .close{background:#f3f5f6;}#${id} .close .ink{position:absolute;left:0;top:0;width:1160px;height:1080px;background:var(--panel-2);}#${id} .statement{position:absolute;left:90px;top:95px;width:930px;color:#fff;}#${id} .statement h2{margin:130px 0 0;font-size:125px;line-height:.94;}#${id} .statement h2 b{color:#fff;border-bottom:14px solid var(--accent);}#${id} .statement p{margin-top:80px;width:760px;font-size:27px;line-height:1.5;color:#ffffffb6;}#${id} .sign{margin-top:90px;width:770px;}#${id} .sign i{display:block;width:100%;height:8px;background:var(--accent);}#${id} .sign span{display:block;margin-top:20px;font-size:18px;letter-spacing:.14em;}#${id} .close .room{position:absolute;right:0;top:0;width:760px;height:1080px;background:linear-gradient(145deg,#dce1e4,#f8f9f9);overflow:hidden;}#${id} .close .table{position:absolute;left:-100px;right:-80px;bottom:-100px;height:340px;background:#756456;transform:skewY(-8deg);}#${id} .close .person{left:120px;top:180px;}
</style>`, (id) =>
    `tl.from('#${id} .ink',{x:-180,duration:.35,ease:'power3.out'},0);\n`+
    `tl.from('#${id} .room',{x:170,duration:.35,ease:'power3.out'},.08);\n`+
    `tl.from('#${id} .statement>*',{x:-45,autoAlpha:0,duration:.24,stagger:.08},.3);\n`+
    `tl.from('#${id} .sign i',{scaleX:0,transformOrigin:'left',duration:.26},.62);`),
};
