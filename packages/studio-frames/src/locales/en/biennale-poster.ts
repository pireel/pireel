import type { FrameLocalePack } from '../types';

export const pack: FrameLocalePack = {
  title: 'Biennale',
  summary:
    'Constructivist gallery poster — giant type bleeding off the edge with one inverted ink plate, for manifestos, hot takes and launches.',
  copy: {
    // 标题卡(两行巨字 → 英文海报口号)
    把观点: 'SHOW,',
    讲成画面: "DON'T TELL",
    // 大数字
    本月增长: 'THIS MONTH',
    // 数字变化(条数计数,单位在反白块里)
    条: 'CLIPS',
    规律是拆出来的: 'MINED, NOT GUESSED',
    // 章节(幕次横带,巨字=当前幕名)
    '第Ⅰ幕': 'ACT Ⅰ',
    '第Ⅱ幕': 'ACT Ⅱ',
    '第Ⅲ幕': 'ACT Ⅲ',
    亮出判断: 'VERDICT',
    // 对比(300px 巨字,数字压到最短:72H vs 3H)
    老办法: 'OLD WAY',
    新办法: 'NEW WAY',
    '3天': '72H',
    '3小时': '3H',
    // 引导(340px 巨字,FOLLOW 塞不下,底部跑马灯已循环 FOLLOW)
    关注: 'JOIN',
    // 列表(MANIFESTO)
    先说结论: 'POINT FIRST',
    一图一论点: 'IDEA = IMAGE',
    回扣钩子: 'CLOSE THE LOOP',
    // 金句(em 反白板压在动词上)
    别追热点: "DON'T CHASE",
    做: 'OWN',
    热点: 'IT',
    '摘自口播 02\'14"': 'VO 02\'14"',
    // 封面(520px 巨字出血是该方言的本体,下方横条拼全名)
    // 封面巨字:BIENNALE 8 个拉丁字母在 520px 下 ~2360px 爆画布,借上下文键顺手压字号
    'class="h">双年展': 'class="h" style="font-size:330px">BIENNALE',
  },
};
