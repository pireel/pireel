import { describe, expect, it } from 'vitest';
import { dropPlaceholdersInWindows, graphicBoxForSize, insertedClipPlaceholder, isPlaceholder, layoutFromPlan, layoutInsertWindow, pickGraphicBox, placeholderSpec } from './build-draft';
import { blockKind } from './composition';
import type { DraftPlan } from './plan';
import type { AsrSegment } from './build-blocks';

const sentences: AsrSegment[] = [
  { start: 2, end: 4, text: '钩子前三秒定生死' },
  { start: 4, end: 6, text: '完播率到87%才算合格' },
];

const plan: DraftPlan = {
  title: { text: '三个技巧', sub: '@账号', durationSec: 2.5 },
  scenes: [
    { from: 0, to: 0, framing: 'punch-in', graphic: { brief: '强调钩子前三秒' } },
    { from: 1, to: 1, framing: 'corner', graphic: { brief: '完播率大数字卡', data: '87% 完播率' } },
  ],
  outro: { text: '关注我', durationSec: 2 },
};

const video = { url: 'https://cdn.pireel.com/a.mp4', durationSec: 8 };
const phs = (c: { blocks: ReturnType<typeof layoutFromPlan>['blocks'] }) => c.blocks.filter(isPlaceholder);

describe('layoutFromPlan(场景化分镜:按场景切镜 + 待配图占位;general 默认无花字)', () => {
  const comp = layoutFromPlan(plan, { video, sentences });

  it('general 默认不铺字幕/花字(只出设计图形)', () => {
    expect(comp.blocks.filter((b) => b.templateId === 'caption')).toHaveLength(0);
  });

  it('标题 + 每个场景图形 + 片尾 全转待配图占位(带 spec)', () => {
    const p = phs(comp);
    expect(p.length).toBe(4); // 标题 + callout + metric + 片尾
    expect(p.every((b) => placeholderSpec(b).length > 0)).toBe(true);
  });

  it('metric 占位指令带真实数据(87% / 完播率)+ 组件名', () => {
    const stat = phs(comp).find((b) => placeholderSpec(b).includes('87%'))!;
    expect(stat).toBeTruthy();
    expect(placeholderSpec(stat)).toContain('完播率');
    expect(placeholderSpec(stat)).toContain('大数字卡');
  });

  it('corner 场景 → 人缩角(corner-br);初稿不自动铺转场块', () => {
    expect(comp.blocks.filter((b) => blockKind(b) === 'transition')).toHaveLength(0); // 分镜边界=跳切,取景负责视觉变化
    const shot = comp.shots?.find((s) => Math.abs(s.srcStart - 4) < 0.3);
    expect(shot?.treatment).toBe('corner-br');
    const punch = comp.shots?.find((s) => Math.abs(s.srcStart - 2) < 0.3);
    expect(punch?.treatment).toBe('punch-in');
  });

  it('场景 0 图形占位避开开场标题(起点推迟到标题结束,相应缩短)', () => {
    const g0 = phs(comp).find((b) => placeholderSpec(b).includes('钩子前三秒'))!;
    expect(g0.startSec).toBeCloseTo(2.5, 5); // max(场景起点 2, 标题 2.5)
    expect(g0.durationSec).toBeCloseTo(1.5, 5); // 4 - 2.5
  });

  it('标题几乎盖满场景 0 → 图形占位太短直接跳过', () => {
    const longTitle: DraftPlan = { ...plan, title: { text: '三个技巧', durationSec: 3.5 } };
    const c = layoutFromPlan(longTitle, { video, sentences });
    expect(phs(c).some((b) => placeholderSpec(b).includes('钩子前三秒'))).toBe(false); // 剩 0.5s < 0.8s
    expect(phs(c)).toHaveLength(3); // 标题 + metric + 片尾
  });

  it('分镜只切视觉变化点:全屏相邻场景不成刀(章节感归图形,不剁视频轨)', () => {
    const flat: DraftPlan = {
      scenes: [
        { from: 0, to: 0, framing: 'full', graphic: { brief: '第一章' } },
        { from: 1, to: 1, framing: 'full', graphic: { brief: '第二章', data: '87%' } },
      ],
    };
    const c = layoutFromPlan(flat, { video, sentences });
    expect(c.shots).toHaveLength(1); // 画面/取景全程没变 → 一整条,场景边界不切
    expect(phs(c)).toHaveLength(2); // 配图仍按场景各落各的
  });

  it('相邻同取景场景合并成一段;取景变化点才成刀', () => {
    const twoCorner: DraftPlan = {
      scenes: [
        { from: 0, to: 0, framing: 'corner', graphic: { brief: 'A' } },
        { from: 1, to: 1, framing: 'corner', graphic: { brief: 'B', data: '87%' } },
      ],
    };
    const c = layoutFromPlan(twoCorner, { video, sentences });
    // 0-2 全屏 · 2-6 corner(两场合并) · 6-8 全屏
    expect(c.shots).toHaveLength(3);
    expect(c.shots![1]).toMatchObject({ srcStart: 2, srcEnd: 6, treatment: 'corner-br' });
  });

  // 画布朝向决定「腾地方」是哪一种,不是模型说了算:竖屏只可能缩角(腾出上下一大块),
  // 横屏只可能左右分半。竖屏切左右会把人挤成一条,横屏切上下只剩两条扁带。
  // 这条以前只写在规划提示词里,模型吐错就照做;现在非法组合在代码里根本表达不出来。
  it('朝向门控:竖屏画布上 corner/split 都落成缩角,永不出现左右分', () => {
    const gapped: AsrSegment[] = [
      { start: 2, end: 4, text: '第一句' },
      { start: 4.7, end: 6, text: '第二句' }, // 句间 0.7s 呼吸停顿
    ];
    const p: DraftPlan = {
      scenes: [
        { from: 0, to: 0, framing: 'corner', graphic: { brief: 'A' } },
        { from: 1, to: 1, framing: 'split', graphic: { brief: 'B', data: '87%' } },
      ],
    };
    const c = layoutFromPlan(p, { video: { ...video, width: 1080, height: 1920 }, sentences: gapped });
    const treatments = (c.shots ?? []).map((s) => s.treatment);
    expect(treatments.some((t) => t === 'split-l' || t === 'split-r')).toBe(false);
    // 两个场景都落到同一种取景 → 合成一段,呼吸缝不产生 full 碎镜
    expect(treatments).toEqual(['full', 'corner-br', 'full']);
    expect(c.shots![1]).toMatchObject({ srcStart: 2, srcEnd: 6 });
  });

  it('朝向门控:横屏画布上 corner/split 都落成左右分,永不出现缩角', () => {
    const gapped: AsrSegment[] = [
      { start: 2, end: 4, text: '第一句' },
      { start: 4.7, end: 6, text: '第二句' },
    ];
    const p: DraftPlan = {
      scenes: [
        { from: 0, to: 0, framing: 'corner', graphic: { brief: 'A' } },
        { from: 1, to: 1, framing: 'split', graphic: { brief: 'B', data: '87%' } },
      ],
    };
    const c = layoutFromPlan(p, { video: { ...video, width: 1920, height: 1080 }, sentences: gapped });
    const treatments = (c.shots ?? []).map((s) => s.treatment);
    expect(treatments.some((t) => t === 'corner-tl' || t === 'corner-br')).toBe(false);
    expect(treatments).toEqual(['full', 'split-r', 'full']);
  });

  it('同取景相邻场景带呼吸缝也合并成一段', () => {
    const gapped: AsrSegment[] = [
      { start: 2, end: 4, text: '第一句' },
      { start: 4.7, end: 6, text: '第二句' },
    ];
    const p: DraftPlan = {
      scenes: [
        { from: 0, to: 0, framing: 'corner', graphic: { brief: 'A' } },
        { from: 1, to: 1, framing: 'corner', graphic: { brief: 'B', data: '87%' } },
      ],
    };
    const c = layoutFromPlan(p, { video, sentences: gapped });
    expect(c.shots).toHaveLength(3); // full · corner(2→6 一整段) · full
    expect(c.shots![1]).toMatchObject({ srcStart: 2, srcEnd: 6, treatment: 'corner-br' });
  });

  it('corner/split 是给图形腾位的:场景没配图 → 取景回 full(不再缩了但空区没内容)', () => {
    const p: DraftPlan = {
      scenes: [
        { from: 0, to: 0, framing: 'corner' }, // 规划没给 graphic
        { from: 1, to: 1, framing: 'split' }, // 同上
      ],
    };
    const c = layoutFromPlan(p, { video, sentences });
    expect((c.shots ?? []).every((s) => s.treatment === 'full')).toBe(true);
    expect(phs(c)).toHaveLength(0);
  });

  it('场景 < 1s 不取景(布局层硬兜底,不只靠提示词)', () => {
    const shortSents: AsrSegment[] = [
      { start: 2, end: 2.9, text: '短句' }, // 0.9s < 1s
      { start: 2.9, end: 6, text: '正常长度的一句' },
    ];
    const p: DraftPlan = {
      scenes: [
        { from: 0, to: 0, framing: 'corner', graphic: { brief: 'A' } },
        { from: 1, to: 1, framing: 'full', graphic: { brief: 'B', data: '87%' } },
      ],
    };
    const c = layoutFromPlan(p, { video, sentences: shortSents });
    expect((c.shots ?? []).every((s) => s.treatment === 'full')).toBe(true);
  });

  it('画面切点只保留内容真变的:同内容 jump cut 不进分镜,口播→b-roll 保留', () => {
    const label = (content: 'talkinghead' | 'broll') => ({ content, person: 'center' as const, safe: 'full' as const, hasText: false, desc: '' });
    const p: DraftPlan = { scenes: [{ from: 0, to: 1, framing: 'full', graphic: { brief: 'A' } }] };
    const same = { cuts: [5], segments: [{ start: 0, end: 5, label: label('talkinghead') }, { start: 5, end: 8, label: label('talkinghead') }] };
    const c1 = layoutFromPlan(p, { video, sentences, cuts: [5], visual: same });
    expect((c1.shots ?? []).map((s) => s.srcStart)).not.toContain(5); // jump cut 被滤掉
    const diff = { cuts: [5], segments: [{ start: 0, end: 5, label: label('talkinghead') }, { start: 5, end: 8, label: label('broll') }] };
    const c2 = layoutFromPlan(p, { video, sentences, cuts: [5], visual: diff });
    expect((c2.shots ?? []).map((s) => s.srcStart)).toContain(5); // 真切换保留
  });

  it('首尾 1s 内的画面切点丢弃(防碎头碎尾)', () => {
    const p: DraftPlan = { scenes: [{ from: 0, to: 1, framing: 'full', graphic: { brief: 'A' } }] };
    const c = layoutFromPlan(p, { video, sentences, cuts: [0.6, 7.5] }); // 视频 8s
    const starts = (c.shots ?? []).map((s) => s.srcStart);
    expect(starts).not.toContain(0.6);
    expect(starts).not.toContain(7.5);
  });

  it('体量档裁框:poster=整块基底;card 高钳 0.42 垂直居中;banner 通栏横带;badge 左上小签', () => {
    const base = { x: 0.07, y: 0.46, w: 0.86, h: 0.38 };
    expect(graphicBoxForSize(base, 'poster')).toEqual(base);
    const card = graphicBoxForSize(base, undefined); // 缺省 = card;基底本来就矮 → 原样
    expect(card).toEqual(base);
    const tall = { x: 0.5, y: 0.12, w: 0.42, h: 0.76 }; // split 空区:card 不再吃整列
    const tallCard = graphicBoxForSize(tall, 'card');
    expect(tallCard.h).toBeCloseTo(0.42, 5);
    expect(tallCard.y).toBeCloseTo(0.12 + (0.76 - 0.42) / 2, 5);
    const banner = graphicBoxForSize(base, 'banner');
    expect(banner.w).toBe(base.w);
    expect(banner.h).toBeCloseTo(0.18, 5);
    const badge = graphicBoxForSize(base, 'badge');
    expect(badge).toMatchObject({ x: base.x, y: base.y });
    expect(badge.w).toBeCloseTo(0.46, 5);
    expect(badge.h).toBeCloseTo(0.18, 5);
  });

  it('占位 spec 带 SIZE INTENT 与 BACKDROP(corner 空区=纯色页面底,punch-in=实拍活动底)', () => {
    const specs = phs(comp).map(placeholderSpec);
    const metric = specs.find((s) => s.includes('87%'))!; // corner 场景 → 空区
    expect(metric).toContain('SIZE INTENT');
    expect(metric).toContain('BACKDROP: flat theme page');
    const callout = specs.find((s) => s.includes('钩子前三秒'))!; // punch-in → 实拍底
    expect(callout).toContain('BACKDROP: live moving footage');
  });

  it('full 场景图形盒不侵入底部字幕禁区(y+h ≤ 0.84)', () => {
    const noFraming: DraftPlan = {
      scenes: [{ from: 0, to: 1, framing: 'full', graphic: { brief: '全屏图形' } }],
    };
    const c = layoutFromPlan(noFraming, { video, sentences });
    const g = phs(c).find((b) => placeholderSpec(b).includes('全屏图形'))!;
    expect(g.box!.y + g.box!.h).toBeLessThanOrEqual(0.84 + 1e-6);
  });

  it('片尾占位贴末端', () => {
    const outro = phs(comp).find((b) => b.startSec > 4 && placeholderSpec(b).includes('关注我'))!;
    expect(outro.startSec).toBeCloseTo(6, 1); // 8 - 2
  });

  it('分镜片段 = 场景切点 ∪ 源画面切点', () => {
    const withCuts = layoutFromPlan(plan, { video, sentences, cuts: [5] });
    const starts = (withCuts.shots ?? []).map((s) => s.srcStart);
    expect(starts).toContain(0); // 首段补 0
    expect(starts).toContain(4); // 场景切点
    expect(starts).toContain(5); // 源画面切点
  });

  it('画面是录屏 → 不出图形占位(只剩标题 + 片尾)', () => {
    const visual = {
      cuts: [],
      segments: [{ start: 0, end: 8, label: { content: 'screen' as const, person: 'none' as const, safe: 'full' as const, hasText: false, desc: '' } }],
    };
    const c = layoutFromPlan(plan, { video, sentences, visual });
    expect(phs(c).some((b) => placeholderSpec(b).includes('87%'))).toBe(false);
    expect(phs(c)).toHaveLength(2); // 标题 + 片尾
  });
});

import { MIN_CUT_GAP_SEC, graphicBoxFromGeometry, mergeCuts } from './build-draft';
import type { VisualTimeline } from './visual-types';

describe('mergeCuts(邻近切点合并,语义优先)', () => {
  it('画面切点贴着语义切点(<0.5s)丢弃;远的保留;画面切点彼此过近也去重', () => {
    const out = mergeCuts([0, 5, 10], [5.3, 7, 7.2, 9.8]).map((c) => c.start);
    expect(out).toEqual([0, 5, 7, 10]); // 5.3/9.8 贴语义丢;7.2 贴 7 丢
  });

  it('无画面切点 = 语义切点原样', () => {
    expect(mergeCuts([0, 3.2], []).map((c) => c.start)).toEqual([0, 3.2]);
    expect(MIN_CUT_GAP_SEC).toBeGreaterThan(0);
  });
});

describe('graphicBoxFromGeometry(几何安全区驱动落点)', () => {
  const seg = (start: number, end: number, geom?: VisualTimeline['segments'][number]['geom']): VisualTimeline['segments'][number] => ({
    start,
    end,
    label: { content: 'talkinghead', person: 'center', safe: 'full', hasText: false, desc: '' },
    ...(geom ? { geom } : {}),
  });
  const vt = (segments: VisualTimeline['segments']): VisualTimeline => ({ cuts: [], segments });

  it('无画面数据 / 段无几何 → 退固定框', () => {
    expect(graphicBoxFromGeometry(undefined, 0, 5)).toMatchObject({ x: 0.07, y: 0.46 });
    expect(graphicBoxFromGeometry(vt([seg(0, 5)]), 0, 5)).toMatchObject({ x: 0.07, y: 0.46 });
  });

  it('主导段最大空矩形 → 内缩 + 底部钳到字幕禁区(y+h ≤ 0.84)', () => {
    const v = vt([seg(0, 6, { rects: [{ x: 0.05, y: 0.05, w: 0.9, h: 0.9 }], face: null, subject: null })]);
    const box = graphicBoxFromGeometry(v, 0, 6);
    expect(box.x).toBeCloseTo(0.08, 5); // 0.05 + 0.03 内缩
    expect(box.y + box.h).toBeLessThanOrEqual(0.84 + 1e-9); // 不进字幕禁区
    expect(box.w).toBeCloseTo(0.84, 5);
  });

  it('跨段人脸硬避让:首选矩形压到别段的脸 → 落到下一个矩形', () => {
    const v = vt([
      seg(0, 4, {
        rects: [
          { x: 0.05, y: 0.05, w: 0.9, h: 0.5 }, // 首选:压到第二段的脸
          { x: 0.05, y: 0.55, w: 0.9, h: 0.28 }, // 次选:安全
        ],
        face: null,
        subject: null,
      }),
      seg(4, 6, { rects: [{ x: 0.05, y: 0.6, w: 0.9, h: 0.2 }], face: { x: 0.3, y: 0.1, w: 0.25, h: 0.2 }, subject: null }),
    ]);
    const box = graphicBoxFromGeometry(v, 0, 6);
    expect(box.y).toBeGreaterThan(0.5); // 用的是次选(下半)
  });

  it('全部矩形太小(摆不下像样图形)→ 退固定框', () => {
    const v = vt([seg(0, 5, { rects: [{ x: 0.4, y: 0.4, w: 0.2, h: 0.1 }], face: null, subject: null })]);
    expect(graphicBoxFromGeometry(v, 0, 5)).toMatchObject({ x: 0.07, y: 0.46 });
  });
});

describe('dropPlaceholdersInWindows(插入窗内不留配图占位)', () => {
  const ph = (startSec: number, durationSec: number) =>
    ({ id: `ph${startSec}`, templateId: 'media', slots: { spec: '【大数字卡】x' }, startSec, durationSec, trackIndex: 2 }) as Parameters<typeof isPlaceholder>[0];
  const cap = (startSec: number) => ({ id: `c${startSec}`, templateId: 'media', slots: {}, startSec, durationSec: 2, trackIndex: 2 }) as Parameters<typeof isPlaceholder>[0];
  it('压在插入窗上的占位剔除,窗外保留;非占位块不动', () => {
    const out = dropPlaceholdersInWindows([ph(0, 2), ph(3, 4), ph(8, 2), cap(3)], [{ start: 3, end: 7 }]);
    expect(out.map((b) => b.id)).toEqual(['ph0', 'ph8', 'c3']);
  });
  it('恰好贴边(≤50ms 重叠容差)不算压窗', () => {
    const out = dropPlaceholdersInWindows([ph(0, 3), ph(7, 2)], [{ start: 3, end: 7 }]);
    expect(out).toHaveLength(2);
  });
  it('无窗原样返回', () => {
    const blocks = [ph(0, 2)];
    expect(dropPlaceholdersInWindows(blocks, [])).toBe(blocks);
  });
});

describe('insertedClipPlaceholder(平权:插入段按自己的口播配图)', () => {
  it('有口播 → 出占位:窗内缩 0.2s,spec 带原话', () => {
    const b = insertedClipPlaceholder({ start: 10, end: 18 }, '这款芯片算力提升了三倍。');
    expect(b).not.toBeNull();
    expect(b!.startSec).toBe(10.2);
    expect(b!.durationSec).toBeCloseTo(7.6, 5);
    expect(isPlaceholder(b!)).toBe(true);
    expect(placeholderSpec(b!)).toContain('这款芯片算力提升了三倍。');
    expect(placeholderSpec(b!)).toContain('inserted clip');
  });
  it('缺省 box=固定兜底框;spec 带 BACKDROP(插入段=实拍活动底)、无脸时不带脸提示', () => {
    const b = insertedClipPlaceholder({ start: 10, end: 18 }, '这款芯片算力提升了三倍。')!;
    expect(b.box).toMatchObject({ x: 0.07, y: 0.46, w: 0.86, h: 0.38 });
    expect(placeholderSpec(b)).toContain('BACKDROP: live moving footage');
    expect(placeholderSpec(b)).not.toContain('face was detected');
  });
  it('传几何选框 → box 用它;hasFace 时 spec 带避脸提示', () => {
    const box = { x: 0.1, y: 0.55, w: 0.8, h: 0.25 };
    const b = insertedClipPlaceholder({ start: 10, end: 18 }, '算力提升三倍', { box, hasFace: true })!;
    expect(b.box).toEqual(box);
    expect(placeholderSpec(b)).toContain('BACKDROP: live moving footage');
    expect(placeholderSpec(b)).toContain('face was detected');
  });
  it('无声素材 → 不出占位(没有数据支撑的图形是装饰)', () => {
    expect(insertedClipPlaceholder({ start: 10, end: 18 }, '  ')).toBeNull();
  });
  it('过短窗口 → 不出占位', () => {
    expect(insertedClipPlaceholder({ start: 10, end: 11 }, '有话但太短')).toBeNull();
  });
});

describe('pickGraphicBox(rects→选框核心,主源/插入段共用)', () => {
  it('边距内缩 + 底部字幕禁区钳制(y+h ≤ 0.84)', () => {
    const box = pickGraphicBox([{ x: 0.05, y: 0.05, w: 0.9, h: 0.9 }], []);
    expect(box.x).toBeCloseTo(0.08, 5); // 0.05 + 0.03 内缩
    expect(box.w).toBeCloseTo(0.84, 5);
    expect(box.y + box.h).toBeLessThanOrEqual(0.84 + 1e-9);
  });
  it('首选矩形压脸 → 落到下一个矩形', () => {
    const rects = [
      { x: 0.05, y: 0.05, w: 0.9, h: 0.5 }, // 首选:压脸
      { x: 0.05, y: 0.55, w: 0.9, h: 0.28 }, // 次选:安全
    ];
    const box = pickGraphicBox(rects, [{ x: 0.3, y: 0.1, w: 0.25, h: 0.2 }]);
    expect(box.y).toBeGreaterThan(0.5);
  });
  it('全部矩形太小/全压脸 → 退兜底框', () => {
    expect(pickGraphicBox([{ x: 0.4, y: 0.4, w: 0.2, h: 0.1 }], [])).toMatchObject({ x: 0.07, y: 0.46 });
    expect(pickGraphicBox([{ x: 0.05, y: 0.05, w: 0.9, h: 0.5 }], [{ x: 0.3, y: 0.1, w: 0.4, h: 0.4 }])).toMatchObject({ x: 0.07, y: 0.46 });
  });
});

describe('layoutInsertWindow(插入段平权分镜:按自己的场景切镜/取景/占位)', () => {
  const clip = { id: 'c1', src: 'blob:x', srcStart: 2, srcEnd: 14, treatment: 'full' as const };
  const sentences = [
    { index: 0, start: 2, end: 6, text: '这款芯片算力提升三倍' },
    { index: 1, start: 6, end: 10, text: '功耗反而降了两成' },
    { index: 2, start: 10, end: 14, text: '现在说说价格' },
  ];
  it('按取景变化切镜,场景图形落成占位(成片时间),clip 源区间连续覆盖', () => {
    const r = layoutInsertWindow({
      win: { start: 20, end: 32 },
      clip,
      sentences,
      scenes: [
        { from: 0, to: 1, framing: 'corner', graphic: { brief: '算力x3', data: '3倍/−20%' } },
        { from: 2, to: 2, framing: 'full' },
      ],
      layout: { box: { x: 0.05, y: 0.4, w: 0.4, h: 0.4 }, hasFace: true }, // 安全区在左 → 人在右
    })!;
    expect(r.shots.length).toBeGreaterThan(1);
    // 连续覆盖整段源区间
    expect(r.shots[0]!.srcStart).toBe(2);
    expect(r.shots.at(-1)!.srcEnd).toBe(14);
    for (let i = 0; i + 1 < r.shots.length; i++) expect(r.shots[i]!.srcEnd).toBeCloseTo(r.shots[i + 1]!.srcStart, 5);
    // 前两句 corner(人右 → corner-br),末句 full
    expect(r.shots[0]!.treatment).toBe('corner-br');
    expect(r.shots.at(-1)!.treatment).toBe('full');
    expect(r.shots.every((x) => x.src === 'blob:x')).toBe(true);
    // 占位在成片时间窗内
    expect(r.blocks).toHaveLength(1);
    expect(isPlaceholder(r.blocks[0]!)).toBe(true);
    expect(r.blocks[0]!.startSec).toBeGreaterThanOrEqual(20);
    expect(r.blocks[0]!.startSec + r.blocks[0]!.durationSec).toBeLessThanOrEqual(32);
  });
  it('corner 场景没落下图形(过短)→ 回 full 不留空腾位', () => {
    const r = layoutInsertWindow({
      win: { start: 20, end: 32 },
      clip,
      sentences,
      scenes: [{ from: 0, to: 0, framing: 'corner' }], // 无 graphic
    })!;
    expect(r.shots.every((x) => x.treatment === 'full')).toBe(true);
  });
  it('没场景/没句子 → null(调用方退回整段一拍)', () => {
    expect(layoutInsertWindow({ win: { start: 0, end: 12 }, clip, sentences, scenes: [] })).toBeNull();
    expect(layoutInsertWindow({ win: { start: 0, end: 12 }, clip, sentences: [], scenes: [{ from: 0, to: 0, framing: 'full' }] })).toBeNull();
  });
});
