import type { FrameLocalePack } from '../types';

export const pack: FrameLocalePack = {
  title: 'Biennale',
  summary:
    'Constructivist gallery poster — giant type bleeding off the edge with one inverted ink plate, for manifestos, hot takes and launches.',
  copy: {
    // Title card (two lines of giant type -> English poster slogan)
    把观点: 'SHOW,',
    讲成画面: "DON'T TELL",
    // Big number
    本月增长: 'THIS MONTH',
    // Number change (clip counter, unit in the inverted block)
    条: 'CLIPS',
    规律是拆出来的: 'MINED, NOT GUESSED',
    // Sections (act banner, giant type = current act name)
    '第Ⅰ幕': 'ACT Ⅰ',
    '第Ⅱ幕': 'ACT Ⅱ',
    '第Ⅲ幕': 'ACT Ⅲ',
    亮出判断: 'VERDICT',
    // Comparison (300px giant type, numbers shortened: 72H vs 3H)
    老办法: 'OLD WAY',
    新办法: 'NEW WAY',
    '3天': '72H',
    '3小时': '3H',
    // Call to action (340px giant type; FOLLOW won't fit, bottom marquee already loops FOLLOW)
    关注: 'JOIN',
    // List (manifesto)
    先说结论: 'POINT FIRST',
    一图一论点: 'IDEA = IMAGE',
    回扣钩子: 'CLOSE THE LOOP',
    // Quote (em inverted plate over the verb)
    别追热点: "DON'T CHASE",
    做: 'OWN',
    热点: 'IT',
    '摘自口播 02\'14"': 'VO 02\'14"',
    // Cover (520px giant bleeding type is this dialect's core; the bottom bar spells the full name)
    // Cover giant type: BIENNALE's 8 Latin letters at 520px ~2360px overflow the canvas; use the context key to shrink the font size
    'class="h">双年展': 'class="h" style="font-size:330px">BIENNALE',
  },
};
