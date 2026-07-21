/**
 * 奶油 Cream(foodie-vlog)的口播叠加件:餐桌道具语言——菜单便签式白色大圆角贴纸
 * (歪 2-5° 相邻反号、软影无描边)、药丸 chip 清单、食欲橙价格章 pill(一件只一个橙点,
 * 可 glow)、蜂蜜黄次强调、糖珠圆点缀饰、blob 异形盘托数字、蒸汽线。画面里的菜是主角,
 * 件是摆在旁边的可爱道具,动效 back.out 弹入。
 */

import { mk, txt, type Block } from '../dialects/shared';

const STICK = 'background:var(--panel);border-radius:52px;box-shadow:var(--shadow);';
const CHIP = 'background:var(--panel);border-radius:999px;box-shadow:var(--shadow);';
const BADGE = 'background:var(--accent);color:var(--panel);border-radius:999px;box-shadow:var(--glow);';
const HONEY = 'background:var(--accent-2);color:var(--panel);border-radius:999px;box-shadow:var(--shadow);';
const BLOB = 'background:var(--panel);border-radius:44% 56% 52% 48% / 55% 46% 54% 45%;box-shadow:var(--shadow);';
const BOUNCE = `{y:70,autoAlpha:0,rotation:-6,duration:0.34,ease:'back.out(1.6)'}`;
const POP = `{scale:0,autoAlpha:0,duration:0.26,ease:'back.out(2)'}`;

export const overlays: Record<string, () => Block> = {
  标题条: () =>
    mk(
      'fo_ttl',
      '标题条',
      (id) => `
<div class="w">
  <div class="stick">
    <div class="t" data-edit="title">${txt('标题一', 'Title 1')}</div>
    <div class="dots"><i></i><i></i><i></i></div>
  </div>
  <div class="badge" data-edit="kick">${txt('标签', 'Label')}</div>
</div>
<style>
#${id} .w{position:absolute;left:80px;bottom:96px;width:56%;font-family:var(--font-head);}
#${id} .stick{${STICK}color:var(--fg);padding:40px 56px 34px;transform:rotate(-2deg);display:flex;flex-direction:column;gap:24px;}
#${id} .t{font-size:70px;font-weight:800;line-height:1.2;}
#${id} .dots{display:flex;gap:18px;}
#${id} .dots i{width:20px;height:20px;border-radius:999px;background:var(--accent);}
#${id} .dots i:nth-child(2){background:var(--accent-2);}
#${id} .dots i:nth-child(3){background:var(--panel-2);}
#${id} .badge{position:absolute;${BADGE}right:26px;top:-40px;transform:rotate(6deg);font-size:38px;font-weight:800;padding:20px 40px;}
</style>`,
      (id) =>
        `tl.from('#${id} .stick',${BOUNCE},0);\n` +
        `tl.from('#${id} .badge',${POP.replace('0.26', '0.3')},0.24);\n` +
        `tl.from('#${id} .dots i',{scale:0,duration:0.22,stagger:0.07,ease:'back.out(2)'},0.34);`,
    ),
  大数字: () =>
    mk(
      'fo_num',
      '大数字',
      (id) => `
<div class="w">
  <div class="blob">
    <div class="v"><b data-edit="num">180</b><i data-edit="unit">°C</i></div>
    <span class="cap" data-edit="label">${txt('· 12 分钟 ·', '· 12 minutes ·')}</span>
  </div>
  <i class="spr s1"></i><i class="spr s2"></i><i class="spr s3"></i>
</div>
<style>
#${id} .w{position:absolute;right:110px;top:110px;width:560px;height:430px;font-family:var(--font-head);}
#${id} .blob{position:absolute;inset:0;${BLOB}transform:rotate(-2deg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;}
#${id} .v{display:flex;align-items:baseline;font-family:var(--font-num);color:var(--accent);line-height:1;}
#${id} .v b{font-size:170px;font-weight:800;letter-spacing:-0.03em;}
#${id} .v i{font-style:normal;font-size:70px;font-weight:800;}
#${id} .cap{font-size:40px;font-weight:700;color:var(--muted);}
#${id} .spr{position:absolute;border-radius:999px;}
#${id} .s1{width:52px;height:52px;left:-24px;top:30px;background:var(--accent-2);}
#${id} .s2{width:32px;height:32px;right:-8px;top:-16px;background:var(--panel-2);}
#${id} .s3{width:64px;height:64px;right:16px;bottom:-24px;background:var(--panel-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .blob',{scale:0.6,autoAlpha:0,duration:0.36,ease:'back.out(1.5)'},0);\n` +
        `tl.from('#${id} .v b',{innerText:0,snap:{innerText:1},duration:0.7,ease:'power1.out'},0.14);\n` +
        `tl.from('#${id} .spr',{scale:0,duration:0.26,stagger:0.09,ease:'back.out(2)'},0.3);`,
    ),
  要点列表: () =>
    mk(
      'fo_list',
      '要点列表',
      (id) => `
<div class="w">
  <div class="badge hd" data-edit="title">${txt('列表标题', 'List title')}</div>
  <div class="chips">
    <span class="chip" data-edit="p1">${txt('要点一', 'Point 1')}</span>
    <span class="chip b" data-edit="p2">${txt('要点二', 'Point 2')}</span>
    <span class="chip" data-edit="p3">${txt('要点三', 'Point 3')}</span>
  </div>
</div>
<style>
#${id} .w{position:absolute;left:84px;top:50%;transform:translateY(-50%);width:560px;font-family:var(--font-head);}
#${id} .hd{position:relative;display:inline-block;${BADGE}font-size:38px;font-weight:800;padding:20px 44px;transform:rotate(-3deg);margin-left:10px;}
#${id} .chips{display:flex;flex-wrap:wrap;gap:26px;margin-top:34px;}
#${id} .chip{${CHIP}color:var(--fg);font-size:44px;font-weight:700;padding:26px 46px;transform:rotate(-1.5deg);}
#${id} .chip:nth-child(2){transform:rotate(1.5deg);}
#${id} .chip.b{${HONEY}}
</style>`,
      (id) =>
        `tl.from('#${id} .hd',${POP.replace('0.26', '0.3')},0);\n` +
        `tl.from('#${id} .chip',{scale:0,duration:0.26,stagger:0.09,ease:'back.out(1.8)'},0.16);`,
    ),
  关键词重击: () =>
    mk(
      'fo_kw',
      '关键词重击',
      (id) => `
<div class="w">
  <b class="t" data-edit="word">${txt('关键词', 'Keyword')}</b>
  <i class="spr s1"></i><i class="spr s2"></i>
</div>
<style>
#${id} .w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-2deg);${STICK}padding:44px 68px 50px;font-family:var(--font-head);}
#${id} .t{font-size:130px;font-weight:800;line-height:1;color:var(--accent);white-space:nowrap;}
#${id} .spr{position:absolute;border-radius:999px;}
#${id} .s1{width:46px;height:46px;left:-20px;top:-16px;background:var(--accent-2);}
#${id} .s2{width:32px;height:32px;right:-12px;bottom:-10px;background:var(--panel-2);}
</style>`,
      (id) =>
        `tl.from('#${id} .w',{scale:0.5,autoAlpha:0,rotation:'-=8',duration:0.32,ease:'back.out(1.7)'},0);\n` +
        `tl.from('#${id} .spr',{scale:0,duration:0.24,stagger:0.1,ease:'back.out(2)'},0.28);`,
    ),
  标注: () =>
    mk(
      'fo_call',
      '标注',
      (id) => `
<div class="w">
  <svg class="steam" viewBox="0 0 200 130">
    <path d="M50 120 C 38 92 62 74 50 44 C 44 30 52 18 50 8"/>
    <path d="M100 124 C 88 94 114 76 100 44 C 94 30 102 16 100 4"/>
    <path d="M150 120 C 138 92 162 74 150 44 C 144 30 152 18 150 8"/>
  </svg>
  <div class="chip" data-edit="note">${txt('标注一', 'Note 1')}</div>
</div>
<style>
#${id} .w{position:absolute;right:150px;top:22%;display:flex;flex-direction:column;align-items:center;font-family:var(--font-head);}
#${id} .steam{width:200px;height:130px;}
#${id} .steam path{fill:none;stroke:var(--panel);stroke-width:12;stroke-linecap:round;opacity:0.95;stroke-dasharray:210;}
#${id} .chip{${CHIP}color:var(--fg);font-size:40px;font-weight:800;padding:20px 44px;transform:rotate(2deg);margin-top:6px;}
</style>`,
      (id) =>
        `tl.from('#${id} .chip',{scale:0.5,y:30,autoAlpha:0,duration:0.28,ease:'back.out(1.7)'},0);\n` +
        `tl.from('#${id} .steam path',{strokeDashoffset:210,autoAlpha:0,duration:0.5,stagger:0.12,ease:'power1.out'},0.2);`,
    ),
  关注引导: () =>
    mk(
      'fo_cta',
      '关注引导',
      (id) => `
<div class="w">
  <div class="chip top" data-edit="side">${txt('说明一', 'Detail 1')}</div>
  <div class="btn" data-edit="cta">${txt('+ 关注', '+ Follow')}</div>
  <div class="hearts"><i>🧡</i><i>💛</i><i>🧡</i></div>
</div>
<style>
#${id} .w{position:absolute;right:96px;bottom:100px;display:flex;flex-direction:column;align-items:center;gap:22px;font-family:var(--font-head);}
#${id} .top{${CHIP}color:var(--fg);font-size:34px;font-weight:700;padding:16px 36px;transform:rotate(3deg);}
#${id} .btn{${BADGE}font-size:62px;font-weight:800;padding:28px 76px;transform:rotate(-1.5deg);white-space:nowrap;}
#${id} .hearts{display:flex;gap:30px;font-size:48px;}
#${id} .hearts i{font-style:normal;display:inline-block;}
#${id} .hearts i:nth-child(1){transform:rotate(-12deg);}
#${id} .hearts i:nth-child(3){transform:rotate(12deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .btn',{scale:0.4,autoAlpha:0,duration:0.32,ease:'back.out(1.8)'},0);\n` +
        `tl.from('#${id} .top',${POP},0.2);\n` +
        `tl.from('#${id} .hearts i',{y:40,autoAlpha:0,duration:0.26,stagger:0.08,ease:'back.out(2)'},0.34);`,
    ),
  金句: () =>
    mk(
      'fo_quote',
      '金句',
      (id) => `
<div class="w">
  <div class="stick">
    <div class="q"><span data-edit="l1">${txt('“金句上半句,', '“Quote line one,')}</span><b data-edit="l2">${txt('下半句。”', 'and line two.”')}</b></div>
    <div class="a" data-edit="sig">${txt('—— 署名', '— Attribution')}</div>
    <div class="dots"><i></i><i></i><i></i></div>
  </div>
  <i class="pearl"></i>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:104px;transform:translateX(-50%);width:58%;font-family:var(--font-head);}
#${id} .stick{${STICK}color:var(--fg);padding:44px 60px 36px;transform:rotate(1.5deg);display:flex;flex-direction:column;gap:22px;}
#${id} .q{font-size:60px;font-weight:800;line-height:1.35;}
#${id} .q b{color:var(--accent);}
#${id} .a{font-size:32px;font-weight:700;color:var(--muted);}
#${id} .dots{display:flex;gap:18px;}
#${id} .dots i{width:18px;height:18px;border-radius:999px;background:var(--accent);}
#${id} .dots i:nth-child(2){background:var(--accent-2);}
#${id} .dots i:nth-child(3){background:var(--panel-2);}
#${id} .pearl{position:absolute;width:64px;height:64px;border-radius:999px;background:var(--accent-2);left:-30px;top:-26px;}
</style>`,
      (id) =>
        `tl.from('#${id} .stick',{y:70,autoAlpha:0,rotation:7,duration:0.34,ease:'back.out(1.6)'},0);\n` +
        `tl.from('#${id} .q b',{autoAlpha:0,duration:0.24},0.3);\n` +
        `tl.from('#${id} .dots i,#${id} .pearl',{scale:0,duration:0.24,stagger:0.07,ease:'back.out(2)'},0.4);`,
    ),
  左右对比: () =>
    mk(
      'fo_cmp',
      '左右对比',
      (id) => `
<div class="w">
  <div class="s a"><i data-edit="lt">${txt('选项一', 'Option A')}</i><b data-edit="lv">¥29.9</b><u class="strike"></u></div>
  <div class="s b"><i data-edit="rt">${txt('选项二', 'Option B')}</i><b data-edit="rv">¥19.9</b></div>
  <div class="save" data-edit="badge">${txt('立省 ¥10', 'Save $10')}</div>
</div>
<style>
#${id} .w{position:absolute;left:50%;bottom:100px;transform:translateX(-50%);display:flex;align-items:center;gap:30px;font-family:var(--font-head);}
#${id} .s{width:350px;padding:30px 24px 34px;display:flex;flex-direction:column;align-items:center;gap:14px;}
#${id} .s i{font-style:normal;font-size:30px;font-weight:700;}
#${id} .s b{font-family:var(--font-num);font-size:80px;font-weight:800;line-height:1;}
#${id} .a{${STICK}position:relative;color:var(--muted);transform:rotate(-3deg);}
#${id} .strike{position:absolute;left:56px;right:56px;top:58%;height:10px;border-radius:999px;background:var(--fg);transform:rotate(-7deg);}
#${id} .b{${BADGE}border-radius:52px;transform:rotate(2deg);}
#${id} .save{position:absolute;${HONEY}right:-40px;top:-52px;font-size:34px;font-weight:800;padding:16px 34px;transform:rotate(7deg);}
</style>`,
      (id) =>
        `tl.from('#${id} .a',{y:60,autoAlpha:0,rotation:-10,duration:0.3,ease:'back.out(1.6)'},0);\n` +
        `tl.from('#${id} .strike',{scaleX:0,transformOrigin:'left center',duration:0.24,ease:'power2.out'},0.26);\n` +
        `tl.from('#${id} .b',{scale:0.5,autoAlpha:0,rotation:10,duration:0.32,ease:'back.out(1.7)'},0.4);\n` +
        `tl.from('#${id} .save',${POP.replace('0.26', '0.28')},0.72);`,
    ),
};

export type { Block };
