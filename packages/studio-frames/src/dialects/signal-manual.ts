/**
 * Signal Manual preview dialect.
 * CSS-composed studies only: no hosted footage or official assets. The examples show a full
 * operational world—source fields, type, signal hierarchy, state motion, and proof—not an arrow kit.
 */

import { type Block, mk } from './shared';

const root = (id: string) => `
#${id} .sm{position:absolute;inset:0;overflow:hidden;background:var(--paper);color:var(--fg);font-family:var(--font-body);}
#${id} .head{font-family:var(--font-head);font-weight:800;text-transform:uppercase;}
#${id} .num{font-family:var(--font-num);font-variant-numeric:tabular-nums;}
#${id} .micro{font-family:var(--font-num);font-size:20px;line-height:1.4;letter-spacing:.15em;text-transform:uppercase;}
#${id} .signal{background:var(--accent);color:var(--fg);}
#${id} .reference{background:var(--accent-2);color:#fff;}
#${id} [data-edit]{outline:none;}`;

export const cover: () => Block = () =>
  mk(
    'cv_sm2',
    '封面',
    (id) => `
<div class="sm cover">
  <div class="field"><div class="machine"><i></i><b></b><em></em></div><div class="operator"><i></i></div><div class="floor"></div><div class="focus"><i></i><b></b></div></div>
  <div class="edition micro">FRAME 06 / OPERATIONAL WORLD</div>
  <div class="index num">SM—06<br/>REV.02</div>
  <div class="title head" data-edit>信号<br/>手册</div>
  <div class="english">SIGNAL MANUAL</div>
  <div class="thesis" data-edit>看清动作，确认结果</div>
  <div class="baseline num">SOURCE / ACTION / STATE / CONSEQUENCE</div>
</div>
<style>${root(id)}
#${id} .cover{background:var(--paper);}
#${id} .field{position:absolute;left:0;top:0;width:1210px;height:1080px;background:#798086;overflow:hidden;}
#${id} .machine{position:absolute;left:80px;bottom:126px;width:850px;height:610px;background:#373e43;clip-path:polygon(0 19%,13% 19%,13% 0,75% 0,75% 14%,100% 14%,100% 100%,0 100%);}
#${id} .machine i{position:absolute;left:180px;top:115px;width:360px;height:275px;background:#aab0b0;border:16px solid #20272c;}#${id} .machine b{position:absolute;right:90px;top:105px;width:150px;height:210px;background:#151b22;}#${id} .machine em{position:absolute;right:122px;top:145px;width:86px;height:86px;border-radius:50%;background:var(--accent);}
#${id} .operator{position:absolute;right:55px;top:165px;width:360px;height:865px;background:#252c30;clip-path:polygon(27% 0,73% 0,82% 17%,95% 31%,100% 100%,0 100%,5% 31%,18% 17%);}
#${id} .operator i{position:absolute;left:84px;top:18px;width:190px;height:220px;border-radius:48%;background:#a5785f;}
#${id} .floor{position:absolute;left:0;right:0;bottom:0;height:150px;background:#4d5558;}
#${id} .focus{position:absolute;left:506px;top:356px;width:382px;height:300px;border:9px solid var(--accent);}
#${id} .focus i{position:absolute;right:-9px;top:-9px;width:104px;height:25px;background:var(--accent);}#${id} .focus b{position:absolute;left:-9px;bottom:-9px;width:25px;height:104px;background:var(--accent);}
#${id} .edition{position:absolute;left:1272px;top:72px;}
#${id} .index{position:absolute;right:64px;top:68px;font-size:20px;line-height:1.5;text-align:right;letter-spacing:.12em;}
#${id} .title{position:absolute;left:1258px;top:228px;font-size:152px;line-height:.88;letter-spacing:.045em;}
#${id} .english{position:absolute;right:70px;top:255px;font-size:24px;letter-spacing:.21em;writing-mode:vertical-rl;}
#${id} .thesis{position:absolute;left:1272px;bottom:164px;border-top:6px solid var(--accent);padding-top:24px;font-size:30px;font-weight:700;letter-spacing:.08em;}
#${id} .baseline{position:absolute;right:64px;bottom:61px;font-size:16px;letter-spacing:.13em;color:var(--muted);}
</style>`,
    (id) =>
      `tl.from('#${id} .field',{autoAlpha:0,duration:.3},0);\n` +
      `tl.from('#${id} .focus',{scaleX:0,transformOrigin:'left',duration:.32,ease:'power2.out'},.12);\n` +
      `tl.from('#${id} .edition,#${id} .index,#${id} .title,#${id} .english,#${id} .thesis,#${id} .baseline',{autoAlpha:0,x:12,duration:.3,stagger:.035},.28);`,
  );

export const blocks: Record<string, () => Block> = {
  'site-orientation': () =>
    mk(
      'sm2_site',
      'site-orientation',
      (id) => `
<div class="sm site">
  <div class="yard"><div class="roof"></div><div class="bay b1"></div><div class="bay b2"></div><div class="bay b3"></div><div class="lane"></div><div class="vehicle"></div><div class="person"></div></div>
  <div class="rail signal"><span class="micro">SITE ORIENTATION / FIELD 03</span><strong class="head" data-edit>先确认<br/>完整现场</strong><p data-edit>稳定地标保留之后，再进入关键边界。</p></div>
  <div class="locator"><i></i><b class="num">A—03</b></div>
  <div class="legend num"><span>WHOLE FIELD</span><span>ACTIVE BAY</span><span>ENTRY AXIS</span></div>
</div>
<style>${root(id)}
#${id} .site{background:#7d8589;color:#fff;}
#${id} .yard{position:absolute;inset:0;background:#7d8589;overflow:hidden;}
#${id} .roof{position:absolute;left:0;top:110px;width:1380px;height:150px;background:#343b40;clip-path:polygon(0 42%,86% 0,100% 39%,100% 100%,0 100%);}
#${id} .bay{position:absolute;top:255px;width:360px;height:560px;background:#50585c;border:12px solid #2b3236;box-sizing:border-box;}#${id} .b1{left:80px;}#${id} .b2{left:468px;background:#687175;}#${id} .b3{left:856px;}
#${id} .lane{position:absolute;left:0;right:0;bottom:0;height:330px;background:#5f676a;clip-path:polygon(0 28%,100% 0,100% 100%,0 100%);}
#${id} .vehicle{position:absolute;left:540px;bottom:102px;width:550px;height:250px;background:#262d31;clip-path:polygon(0 26%,16% 26%,27% 0,73% 0,85% 27%,100% 27%,100% 100%,0 100%);}
#${id} .person{position:absolute;left:1070px;bottom:94px;width:115px;height:330px;background:#e2b739;clip-path:polygon(28% 0,72% 0,84% 18%,100% 32%,90% 100%,10% 100%,0 32%,16% 18%);}
#${id} .rail{position:absolute;right:0;top:0;width:610px;height:1080px;padding:70px 64px;box-sizing:border-box;}
#${id} .rail strong{display:block;margin-top:175px;font-size:112px;line-height:.93;letter-spacing:.035em;}
#${id} .rail p{position:absolute;left:64px;right:64px;bottom:116px;border-top:3px solid var(--fg);padding-top:23px;font-size:27px;line-height:1.5;font-weight:650;}
#${id} .locator{position:absolute;left:452px;top:235px;width:390px;height:605px;border:8px solid var(--accent);box-sizing:border-box;}
#${id} .locator i{position:absolute;right:-8px;top:178px;width:90px;height:22px;background:var(--accent);}#${id} .locator b{position:absolute;right:-8px;top:-47px;background:var(--fg);color:#fff;padding:10px 16px;font-size:17px;letter-spacing:.12em;}
#${id} .legend{position:absolute;left:66px;bottom:54px;display:flex;gap:48px;font-size:16px;letter-spacing:.12em;}
</style>`,
      (id) =>
        `tl.from('#${id} .rail',{x:610,duration:.32,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .locator',{scaleY:0,transformOrigin:'top',duration:.3,ease:'power2.out'},.18);\n` +
        `tl.from('#${id} .rail strong,#${id} .rail p,#${id} .legend',{autoAlpha:0,duration:.28},.34);`,
    ),

  'controlled-action': () =>
    mk(
      'sm2_act',
      'controlled-action',
      (id) => `
<div class="sm action">
  <div class="work"><div class="panel"><i></i><b></b><em></em></div><div class="hand"><i></i><b></b></div><div class="arm"></div></div>
  <div class="step micro">CONTROLLED ACTION / STATE 02</div>
  <div class="verb head signal" data-edit>压下并保持</div>
  <div class="condition" data-edit>指示线稳定后再释放。</div>
  <div class="bracket"><i></i><b></b><span class="num">HOLD / 02.0s</span></div>
  <div class="status num"><span>INPUT / OBSERVED</span><span>CONTACT / ACTIVE</span><span>RESULT / PENDING</span></div>
</div>
<style>${root(id)}
#${id} .action{background:#31383d;color:#fff;}
#${id} .work{position:absolute;inset:0;background:linear-gradient(115deg,#262d31,#687177);overflow:hidden;}
#${id} .panel{position:absolute;right:120px;top:85px;width:940px;height:850px;background:#8c9598;border:22px solid #20272b;transform:perspective(1100px) rotateY(-8deg);}
#${id} .panel i{position:absolute;left:170px;top:180px;width:290px;height:290px;border-radius:50%;background:#2a3034;box-shadow:inset 0 0 0 40px #c4c7c2;}#${id} .panel b{position:absolute;left:260px;top:270px;width:110px;height:110px;border-radius:50%;background:var(--accent);}#${id} .panel em{position:absolute;right:140px;top:185px;width:190px;height:430px;background:#1d2428;box-shadow:inset 0 0 0 12px #616b6f;}
#${id} .hand{position:absolute;right:510px;top:335px;width:620px;height:250px;background:#b47d5e;clip-path:polygon(0 18%,66% 0,100% 30%,94% 82%,30% 100%,0 72%);transform:rotate(-8deg);box-shadow:0 30px 55px #11181c99;}
#${id} .hand i,#${id} .hand b{position:absolute;right:28px;width:290px;height:58px;border-radius:40px;background:#c58a68;}#${id} .hand i{top:35px;}#${id} .hand b{top:112px;right:10px;}
#${id} .arm{position:absolute;left:-130px;top:450px;width:760px;height:270px;background:#28333b;transform:rotate(-6deg);}
#${id} .step{position:absolute;left:68px;top:61px;}
#${id} .verb{position:absolute;left:64px;top:210px;padding:20px 25px 14px;font-size:106px;line-height:.92;letter-spacing:.035em;}
#${id} .condition{position:absolute;left:70px;top:390px;width:500px;font-size:29px;line-height:1.5;}
#${id} .bracket{position:absolute;right:575px;top:252px;width:350px;height:380px;border:8px solid var(--accent);border-right:0;}
#${id} .bracket i,#${id} .bracket b{position:absolute;right:0;width:75px;height:8px;background:var(--accent);}#${id} .bracket i{top:0;}#${id} .bracket b{bottom:0;}#${id} .bracket span{position:absolute;left:-8px;bottom:-49px;background:var(--accent);color:var(--fg);padding:10px 14px;font-size:16px;letter-spacing:.12em;}
#${id} .status{position:absolute;left:68px;right:66px;bottom:56px;display:flex;justify-content:space-between;border-top:2px solid #ffffff72;padding-top:20px;font-size:16px;letter-spacing:.13em;}
</style>`,
      (id) =>
        `tl.from('#${id} .hand',{x:-130,y:40,duration:.34,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .bracket',{scaleY:0,transformOrigin:'top',duration:.28,ease:'power2.out'},.16);\n` +
        `tl.from('#${id} .step,#${id} .verb,#${id} .condition,#${id} .status',{autoAlpha:0,duration:.28},.32);`,
    ),

  'section-reveal': () =>
    mk(
      'sm2_sec',
      'section-reveal',
      (id) => `
<div class="sm section">
  <div class="exterior"><div class="housing"><i></i><b></b></div><span class="micro">RECORDED EXTERIOR</span></div>
  <div class="interior"><div class="shell"></div><div class="core"></div><div class="flow"><i></i><b></b><em></em></div><span class="micro">ILLUSTRATIVE SECTION</span></div>
  <div class="cutline signal"><span class="num">SECTION B—B</span></div>
  <div class="statement head" data-edit>外部是记录<br/>内部是示意</div>
  <div class="note" data-edit>共享同一条轴，但不混淆证据身份。</div>
  <div class="key num"><span>SHELL</span><span>EMPTY SPACE</span><span>FLOW / INFERRED</span></div>
</div>
<style>${root(id)}
#${id} .section{background:var(--paper);}
#${id} .exterior,#${id} .interior{position:absolute;top:0;bottom:0;width:50%;overflow:hidden;}#${id} .exterior{left:0;background:#697277;color:#fff;}#${id} .interior{right:0;background:#f7f5ed;}
#${id} .exterior span,#${id} .interior span{position:absolute;left:54px;top:48px;}#${id} .interior span{left:auto;right:54px;color:var(--muted);}
#${id} .housing{position:absolute;left:105px;top:210px;width:710px;height:640px;background:#2e363a;clip-path:polygon(8% 0,92% 0,100% 13%,100% 87%,92% 100%,8% 100%,0 87%,0 13%);box-shadow:34px 38px 0 #4d565a;}
#${id} .housing i{position:absolute;left:185px;top:150px;width:340px;height:340px;border-radius:50%;background:#969d9d;box-shadow:inset 0 0 0 60px #1c2327;}#${id} .housing b{position:absolute;left:320px;top:285px;width:70px;height:70px;border-radius:50%;background:var(--accent);}
#${id} .shell{position:absolute;left:130px;top:210px;width:700px;height:640px;background:#d2d0c7;clip-path:polygon(8% 0,92% 0,100% 13%,100% 87%,92% 100%,8% 100%,0 87%,0 13%);}
#${id} .core{position:absolute;left:300px;top:360px;width:360px;height:340px;border-radius:50%;background:var(--fg);box-shadow:inset 0 0 0 58px var(--accent);}
#${id} .flow{position:absolute;left:225px;top:286px;width:510px;height:500px;border:7px dashed var(--accent-2);border-radius:50%;}
#${id} .flow i,#${id} .flow b,#${id} .flow em{position:absolute;width:26px;height:26px;background:var(--accent-2);transform:rotate(45deg);}#${id} .flow i{left:26px;top:72px;}#${id} .flow b{right:15px;top:210px;}#${id} .flow em{left:195px;bottom:-12px;}
#${id} .cutline{position:absolute;left:942px;top:0;width:36px;height:1080px;}#${id} .cutline span{position:absolute;left:-58px;top:490px;width:152px;text-align:center;transform:rotate(-90deg);font-size:17px;letter-spacing:.13em;}
#${id} .statement{position:absolute;left:64px;bottom:118px;font-size:76px;line-height:.94;letter-spacing:.03em;}
#${id} .note{position:absolute;right:66px;bottom:130px;width:470px;font-size:27px;line-height:1.5;}
#${id} .key{position:absolute;right:64px;bottom:54px;display:flex;gap:38px;font-size:15px;letter-spacing:.12em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .interior',{clipPath:'inset(0 100% 0 0)',duration:.38,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .cutline',{scaleY:0,transformOrigin:'top',duration:.3,ease:'power2.out'},.08);\n` +
        `tl.from('#${id} .core,#${id} .flow,#${id} .statement,#${id} .note,#${id} .key',{autoAlpha:0,duration:.28},.32);`,
    ),

  'state-verification': () =>
    mk(
      'sm2_vfy',
      'state-verification',
      (id) => `
<div class="sm verify">
  <div class="field"><div class="track"></div><div class="object before"><i></i></div><div class="object current"><i></i></div><div class="axis"></div></div>
  <div class="header"><span class="micro">STATE VERIFICATION / SAME BASIS</span><strong class="head" data-edit>对齐后再判断</strong></div>
  <div class="result signal"><span class="micro">OBSERVED RESULT</span><b class="head" data-edit>边缘已进入范围</b><em class="num">Δ 04 mm / BASIS B</em></div>
  <div class="measure num"><span>REFERENCE / REPORTED</span><span>CURRENT / OBSERVED</span><span>THRESHOLD / DOCUMENTED</span></div>
</div>
<style>${root(id)}
#${id} .verify{background:#f7f5ed;}
#${id} .field{position:absolute;left:0;top:180px;right:0;bottom:190px;background:#767f82;overflow:hidden;}
#${id} .track{position:absolute;left:0;right:0;top:280px;height:115px;background:#343b3f;box-shadow:0 25px 0 #565f62;}
#${id} .object{position:absolute;top:105px;width:370px;height:390px;background:#b7bcba;clip-path:polygon(12% 0,88% 0,100% 15%,100% 85%,88% 100%,12% 100%,0 85%,0 15%);}
#${id} .object i{position:absolute;left:105px;top:115px;width:160px;height:160px;border-radius:50%;background:#2c3337;}
#${id} .before{left:390px;opacity:.38;outline:7px dashed #f7f5ed;}#${id} .current{left:930px;box-shadow:18px 18px 0 #1d2428;}
#${id} .axis{position:absolute;left:1150px;top:0;width:8px;height:710px;background:var(--accent);box-shadow:-216px 0 0 var(--accent-2);}
#${id} .header{position:absolute;left:66px;right:66px;top:51px;display:flex;align-items:flex-end;justify-content:space-between;}
#${id} .header strong{font-size:74px;line-height:.9;letter-spacing:.035em;}
#${id} .result{position:absolute;left:0;right:0;bottom:0;height:190px;padding:31px 66px;box-sizing:border-box;display:grid;grid-template-columns:300px 1fr 300px;align-items:center;}
#${id} .result b{font-size:59px;letter-spacing:.04em;text-align:center;}#${id} .result em{font-style:normal;text-align:right;font-size:18px;letter-spacing:.12em;}
#${id} .measure{position:absolute;left:63px;right:63px;bottom:205px;display:flex;justify-content:space-between;font-size:15px;letter-spacing:.12em;color:#fff;}
</style>`,
      (id) =>
        `tl.from('#${id} .current',{x:-280,duration:.38,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .axis',{scaleY:0,transformOrigin:'top',duration:.3,ease:'power2.out'},.14);\n` +
        `tl.from('#${id} .header,#${id} .result,#${id} .measure',{autoAlpha:0,duration:.28},.32);`,
    ),

  'operator-handoff': () =>
    mk(
      'sm2_hand',
      'operator-handoff',
      (id) => `
<div class="sm handoff">
  <div class="scene"><div class="table"></div><div class="device"><i></i><b></b></div><div class="person left"><i></i></div><div class="person right"><i></i></div><div class="hands"></div></div>
  <div class="title"><span class="micro">OPERATOR HANDOFF / RESPONSIBILITY</span><strong class="head" data-edit>交接必须<br/>看得见</strong></div>
  <div class="rail"><i class="signal"></i><b class="reference"></b><em></em><span class="num a">PREPARE</span><span class="num b">RECEIVE</span><span class="num c">CONFIRM</span></div>
  <div class="note" data-edit>动作可以连续，责任不能靠剪辑推断。</div>
  <div class="roles num"><span>OPERATOR A / REPORTED</span><span>OPERATOR B / CONFIRMATION PENDING</span></div>
</div>
<style>${root(id)}
#${id} .handoff{background:#41494d;color:#fff;}
#${id} .scene{position:absolute;inset:0;background:linear-gradient(90deg,#565f63 0 48%,#747c7e 49% 100%);overflow:hidden;}
#${id} .table{position:absolute;left:180px;right:150px;bottom:0;height:300px;background:#242b2f;clip-path:polygon(5% 0,95% 0,100% 100%,0 100%);}
#${id} .device{position:absolute;left:730px;bottom:235px;width:470px;height:390px;background:#aab0af;border:18px solid #20272b;}
#${id} .device i{position:absolute;left:75px;top:74px;width:150px;height:150px;border-radius:50%;background:#30373b;box-shadow:inset 0 0 0 28px #d4d4cc;}#${id} .device b{position:absolute;right:58px;top:72px;width:120px;height:210px;background:#151b22;}
#${id} .person{position:absolute;bottom:170px;width:430px;height:780px;background:#283136;clip-path:polygon(28% 0,72% 0,82% 18%,96% 32%,100% 100%,0 100%,4% 32%,18% 18%);}
#${id} .person i{position:absolute;left:106px;top:20px;width:220px;height:250px;border-radius:48%;background:#9f6e54;}#${id} .left{left:90px;}#${id} .right{right:85px;background:#333b3e;}#${id} .right i{background:#b88462;}
#${id} .hands{position:absolute;left:630px;top:555px;width:660px;height:115px;background:#ae7859;clip-path:polygon(0 34%,38% 0,51% 32%,62% 0,100% 37%,94% 100%,61% 68%,50% 100%,36% 68%,6% 100%);}
#${id} .title{position:absolute;left:62px;top:58px;}#${id} .title strong{display:block;margin-top:68px;font-size:86px;line-height:.92;letter-spacing:.035em;}
#${id} .rail{position:absolute;left:500px;right:500px;bottom:165px;height:54px;border-top:7px solid #fff;}
#${id} .rail i,#${id} .rail b,#${id} .rail em{position:absolute;top:-17px;width:27px;height:27px;transform:rotate(45deg);}#${id} .rail i{left:0;}#${id} .rail b{left:48%;}#${id} .rail em{right:0;background:#fff;}
#${id} .rail span{position:absolute;top:31px;font-size:15px;letter-spacing:.12em;}#${id} .rail .a{left:-18px;}#${id} .rail .b{left:43%;}#${id} .rail .c{right:-25px;}
#${id} .note{position:absolute;right:65px;top:72px;width:450px;border-top:6px solid var(--accent);padding-top:20px;font-size:28px;line-height:1.5;font-weight:650;}
#${id} .roles{position:absolute;left:64px;right:64px;bottom:53px;display:flex;justify-content:space-between;font-size:16px;letter-spacing:.12em;}
</style>`,
      (id) =>
        `tl.from('#${id} .hands',{scaleX:0,transformOrigin:'center',duration:.36,ease:'power2.out'},0);\n` +
        `tl.from('#${id} .rail',{scaleX:0,transformOrigin:'left',duration:.36,ease:'power2.out'},.12);\n` +
        `tl.from('#${id} .title,#${id} .note,#${id} .roles',{autoAlpha:0,duration:.28},.32);`,
    ),

  'safe-release': () =>
    mk(
      'sm2_rel',
      'safe-release',
      (id) => `
<div class="sm release">
  <div class="clean"><div class="room"></div><div class="machine"><i></i><b></b><em></em></div><div class="operator"><i></i></div><div class="floor"></div></div>
  <div class="chapter micro">SAFE RELEASE / SOURCE STATE</div>
  <div class="statement head" data-edit>标记退出<br/>结果留下</div>
  <div class="note" data-edit>完整画面负责最后的确认。</div>
  <div class="state"><i></i><span class="micro">STATE CLEAR</span></div>
  <div class="time num">SOURCE 00:24:18 · HOLD 04.0s</div>
</div>
<style>${root(id)}
#${id} .release{background:#fff;}
#${id} .clean{position:absolute;right:0;top:0;width:1250px;height:1080px;background:#92999a;overflow:hidden;}
#${id} .room{position:absolute;inset:0;background:linear-gradient(110deg,#d2d2ca,#7e888b);}
#${id} .machine{position:absolute;right:90px;bottom:120px;width:780px;height:620px;background:#3d4549;clip-path:polygon(0 16%,15% 16%,15% 0,80% 0,80% 12%,100% 12%,100% 100%,0 100%);}
#${id} .machine i{position:absolute;left:120px;top:130px;width:300px;height:280px;background:#b3b7b4;border:15px solid #20272b;}#${id} .machine b{position:absolute;right:95px;top:110px;width:150px;height:240px;background:#171e22;}#${id} .machine em{position:absolute;right:128px;top:150px;width:85px;height:85px;border-radius:50%;background:#e7e5d9;}
#${id} .operator{position:absolute;left:40px;top:180px;width:360px;height:900px;background:#2c3438;clip-path:polygon(27% 0,73% 0,82% 17%,95% 31%,100% 100%,0 100%,5% 31%,18% 17%);}
#${id} .operator i{position:absolute;left:84px;top:18px;width:190px;height:220px;border-radius:48%;background:#a8775b;}
#${id} .floor{position:absolute;left:0;right:0;bottom:0;height:125px;background:#697275;}
#${id} .chapter{position:absolute;left:64px;top:62px;}
#${id} .statement{position:absolute;left:58px;top:250px;width:640px;font-size:103px;line-height:.93;letter-spacing:.035em;}
#${id} .note{position:absolute;left:64px;bottom:192px;width:440px;border-top:3px solid var(--fg);padding-top:23px;font-size:27px;line-height:1.5;}
#${id} .state{position:absolute;left:64px;bottom:105px;display:flex;align-items:center;gap:18px;}#${id} .state i{width:24px;height:24px;background:var(--accent-2);transform:rotate(45deg);}
#${id} .time{position:absolute;left:64px;bottom:52px;font-size:16px;letter-spacing:.12em;color:var(--muted);}
</style>`,
      (id) =>
        `tl.from('#${id} .clean',{autoAlpha:0,duration:.38},0);\n` +
        `tl.from('#${id} .state',{autoAlpha:0,duration:.24},.16);\n` +
        `tl.from('#${id} .chapter,#${id} .statement,#${id} .note,#${id} .time',{autoAlpha:0,x:10,duration:.3},.28);`,
    ),
};
