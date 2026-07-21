import { describe, expect, it } from 'vitest';
import { parsePlan, unifiedPlanRows } from './plan';

describe('parsePlan(场景化 storyboard)', () => {
  it('解析场景:from/to/framing/graphic(组件+brief+真实数据)+ 标题/片尾', () => {
    const text =
      '```json\n' +
      JSON.stringify({
        title: { text: '标题', durationSec: 3 },
        scenes: [
          { from: 0, to: 1, framing: 'corner', graphic: { component: 'metric', brief: '完播率大数字', data: '87%' } },
          { from: 2, to: 2, framing: 'full', graphic: { component: 'callout', brief: '收尾金句' } },
        ],
        outro: { text: '关注我', durationSec: 2 },
      }) +
      '\n```';
    const plan = parsePlan(text, 3);
    expect(plan.scenes).toHaveLength(2);
    expect(plan.scenes[0]).toMatchObject({ from: 0, to: 1, framing: 'corner' });
    expect(plan.scenes[0]!.graphic).toEqual({ component: 'metric', brief: '完播率大数字', data: '87%' });
    expect(plan.scenes[1]!.framing).toBe('full');
    expect(plan.title?.text).toBe('标题');
    expect(plan.outro?.text).toBe('关注我');
  });

  it('尾部没覆盖 → 最后一场延伸到末尾', () => {
    const p = parsePlan('```json\n{"scenes":[{"from":0,"to":0,"framing":"full"}]}\n```', 4);
    expect(p.scenes).toHaveLength(1);
    expect(p.scenes[0]!.to).toBe(3); // 延伸到末尾 index
  });

  it('重叠 → 顺成单调不重叠;越界 clamp 到句数', () => {
    const p = parsePlan('```json\n{"scenes":[{"from":0,"to":5,"framing":"full"},{"from":2,"to":3,"framing":"corner"}]}\n```', 4);
    expect(p.scenes[0]!.from).toBe(0);
    expect(p.scenes[p.scenes.length - 1]!.to).toBe(3); // clamp 到 sentenceCount-1
    for (let i = 1; i < p.scenes.length; i++) expect(p.scenes[i]!.from).toBeGreaterThan(p.scenes[i - 1]!.to);
  });

  it('被前面场景完全吞掉的场景 → 整场丢弃(graphic.data 抠自原句区间,平移会挂错句子)', () => {
    const text =
      '```json\n' +
      JSON.stringify({
        scenes: [
          { from: 0, to: 3, framing: 'full' },
          { from: 1, to: 2, framing: 'corner', graphic: { component: 'metric', brief: '完播率', data: '87%' } }, // 完全被 [0,3] 吞
          { from: 4, to: 5, framing: 'split' },
        ],
      }) +
      '\n```';
    const p = parsePlan(text, 6);
    expect(p.scenes.map((s) => [s.from, s.to])).toEqual([
      [0, 3],
      [4, 5],
    ]);
    expect(p.scenes.some((s) => s.graphic)).toBe(false); // 被吞场景连同 graphic 一起丢,不平移挂到别的句子
  });

  it('中段 gap → 并入前一个场景(延长 prev.to,覆盖每句恰好一次)', () => {
    const p = parsePlan(
      '```json\n{"scenes":[{"from":0,"to":1,"framing":"full"},{"from":4,"to":5,"framing":"corner"}]}\n```',
      6,
    );
    expect(p.scenes.map((s) => [s.from, s.to])).toEqual([
      [0, 3], // gap [2,3] 归前一场
      [4, 5],
    ]);
  });

  it('开头 gap → 并入第一个场景(from=0)', () => {
    const p = parsePlan('```json\n{"scenes":[{"from":2,"to":5,"framing":"full"}]}\n```', 6);
    expect(p.scenes.map((s) => [s.from, s.to])).toEqual([[0, 5]]);
  });

  it('非法 framing → full;非法 component → callout;没 brief 的图形被丢', () => {
    const p = parsePlan('```json\n{"scenes":[{"from":0,"to":0,"framing":"wtf","graphic":{"component":"nope"}}]}\n```', 1);
    expect(p.scenes[0]!.framing).toBe('full');
    expect(p.scenes[0]!.graphic).toBeUndefined(); // component 退 callout,但没 brief → 整个 graphic 丢
  });

  it('graphic.size:合法档保留,非法值丢弃(缺省由 build-draft 按 card 兜)', () => {
    const p = parsePlan(
      '```json\n{"scenes":[{"from":0,"to":0,"framing":"corner","graphic":{"component":"metric","brief":"b","size":"poster"}},{"from":1,"to":1,"framing":"full","graphic":{"component":"metric","brief":"b","size":"huge"}}]}\n```',
      2,
    );
    expect(p.scenes[0]!.graphic?.size).toBe('poster');
    expect(p.scenes[1]!.graphic?.size).toBeUndefined();
  });

  it('坏 JSON → 空 scenes(不崩)', () => {
    const p = parsePlan('模型抽风了没给 json', 2);
    expect(p.scenes).toHaveLength(0);
  });
});

import { PLAN_SYSTEM_TOOLS, assemblePlan, buildPlanPrompt, extractPlanJson } from './plan';

describe('extractPlanJson(容错:截断/尾逗号)', () => {
  it('被 max_tokens 截断的输出:丢不完整尾场景,保住前面的', () => {
    const truncated = '```json\n{"title":{"text":"钩子","durationSec":2.5},"scenes":[{"from":0,"to":1,"framing":"full"},{"from":2,"to":3,"fra';
    const o = extractPlanJson(truncated);
    expect(Array.isArray(o.scenes)).toBe(true);
    expect((o.scenes as unknown[]).length).toBe(1);
    expect((o.title as { text: string }).text).toBe('钩子');
  });

  it('尾逗号修复;无围栏也认;完全不是 JSON → 空对象', () => {
    expect((extractPlanJson('{"scenes":[{"from":0,"to":1,"framing":"full"},]}').scenes as unknown[]).length).toBe(1);
    expect(extractPlanJson('抱歉,我无法完成')).toEqual({});
  });
});

describe('assemblePlan(工具环 pieces → DraftPlan)', () => {
  it('乱序发射的场景排序归一;title/outro 兜底默认时长', () => {
    const plan = assemblePlan(
      {
        scenes: [
          { from: 3, to: 5, framing: 'corner', graphic: { component: 'chart', brief: 'b' } },
          { from: 0, to: 2, framing: 'full' },
        ],
        title: { text: '钩子' },
        outro: { text: '关注我' },
      },
      6,
    );
    expect(plan.scenes.map((s) => [s.from, s.to])).toEqual([
      [0, 2],
      [3, 5],
    ]);
    expect(plan.title).toMatchObject({ text: '钩子', durationSec: 2.5 });
    expect(plan.outro).toMatchObject({ text: '关注我', durationSec: 2 });
  });

  it('工具环中途停(尾部没覆盖)→ 末场景延伸到最后一句;坏场景对象被丢弃', () => {
    const plan = assemblePlan(
      { scenes: [{ from: 0, to: 3, framing: 'full' }, { bogus: true }, null] },
      10,
    );
    expect(plan.scenes).toHaveLength(1);
    expect(plan.scenes[0]).toMatchObject({ from: 0, to: 9 });
  });
});

describe('PLAN_SYSTEM_TOOLS 契约', () => {
  it('工具环契约:add_scene 逐个发射、批量、覆盖完成说 done;共享 CORE 的分段/图形/节奏规则', () => {
    expect(PLAN_SYSTEM_TOOLS).toContain('add_scene');
    expect(PLAN_SYSTEM_TOOLS).toContain('set_title');
    expect(PLAN_SYSTEM_TOOLS).toContain('set_outro');
    expect(PLAN_SYSTEM_TOOLS).toContain('done');
    expect(PLAN_SYSTEM_TOOLS).toContain('PACING');
    expect(PLAN_SYSTEM_TOOLS).toContain('LANGUAGE');
    expect(PLAN_SYSTEM_TOOLS).not.toContain('json block'); // 工具环不吐大 JSON
  });
});

describe('buildPlanPrompt 插入片段上下文(多源主轨)', () => {
  const sentences = [
    { index: 0, text: '第一句。', start: 0, end: 2 },
    { index: 1, text: '第二句。', start: 2, end: 4 },
  ];
  it('无插入段:不出现 INSERTED CLIPS 段', () => {
    const p = buildPlanPrompt({ sentences, videoDurationSec: 4 });
    expect(p).not.toContain('INSERTED CLIPS');
  });
  it('统一叙事流:插入段句子按锚点交织进同一份行号,规则钉死不跨源', () => {
    const p = buildPlanPrompt({
      sentences,
      videoDurationSec: 12,
      inserts: [{ atSec: 2, durationSec: 8, text: '算力提升三倍', sentences: [{ index: 0, start: 1, end: 5, text: '算力提升三倍' }] }],
    });
    expect(p).toContain('INSERTED CLIPS');
    // 锚点 2.0 = 第一句(0-2)之后:插入段行拿到全局行号 1,后续主句顺延
    expect(p).toContain('1. [clip #1] [1.0-5.0] 算力提升三倍');
    expect(p).toContain('a scene must never mix [clip #k] rows with narration rows');
    expect(p).toContain('planned together with everything around them'); // 整体一起考虑,不是各排各的
  });
  it('无声插入段:标记行不占行号,场景绕开', () => {
    const p = buildPlanPrompt({ sentences, videoDurationSec: 12, inserts: [{ atSec: 2, durationSec: 8, text: '' }] });
    expect(p).toContain('--- [clip #1] 8.0s inserted footage, no speech');
    expect(p).toContain('no scene or graphic covers it');
  });
});

describe('插入段平权分镜(统一叙事流 → 装配层分解)', () => {
  const rows = [
    { src: 'main' as const, local: 0, start: 0, end: 2, text: '第一句' },
    { src: 'main' as const, local: 1, start: 2, end: 4, text: '第二句' },
    { src: 1, local: 0, start: 1, end: 5, text: '算力提升三倍' },
    { src: 1, local: 1, start: 5, end: 9, text: '功耗降两成' },
    { src: 'main' as const, local: 2, start: 4, end: 6, text: '第三句' },
  ];
  const scene = (from: number, to: number, extra: Record<string, unknown> = {}) => ({ from, to, framing: 'full', ...extra });

  it('全局行号场景分解:主场景重映射本地索引,插入段场景归 clip', () => {
    const plan = parsePlan(
      JSON.stringify({
        scenes: [scene(0, 1), scene(2, 3, { framing: 'corner', graphic: { component: 'metric', brief: '算力x3' } }), scene(4, 4)],
      }),
      rows,
    );
    expect(plan.scenes).toEqual([expect.objectContaining({ from: 0, to: 1 }), expect.objectContaining({ from: 2, to: 2 })]);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts![0]!.clip).toBe(1);
    expect(plan.inserts![0]!.scenes[0]).toMatchObject({ from: 0, to: 1, framing: 'corner' });
    expect(plan.inserts![0]!.scenes[0]!.graphic?.component).toBe('metric');
  });

  it('LLM 违规跨源的场景按源界拆分:首片保留图形,后续片回 full 无图', () => {
    const plan = parsePlan(
      JSON.stringify({ scenes: [scene(0, 4, { framing: 'split', graphic: { component: 'callout', brief: '点题' } })] }),
      rows,
    );
    expect(plan.scenes).toEqual([
      expect.objectContaining({ from: 0, to: 1, framing: 'split' }),
      expect.objectContaining({ from: 2, to: 2, framing: 'full' }),
    ]);
    expect(plan.scenes[0]!.graphic?.component).toBe('callout');
    expect(plan.scenes[1]!.graphic).toBeUndefined();
    expect(plan.inserts![0]!.scenes[0]).toMatchObject({ from: 0, to: 1, framing: 'full' });
  });

  it('遗留/回灌签名(纯句数):scenes 即主叙述,存储态 inserts 原样收编', () => {
    const plan = parsePlan(JSON.stringify({ scenes: [scene(0, 0)], inserts: [{ clip: 2, scenes: [scene(1, 3)] }] }), 1);
    expect(plan.scenes).toHaveLength(1);
    expect(plan.inserts![0]!.clip).toBe(2);
    expect(plan.inserts![0]!.scenes[0]!.to).toBe(3);
  });

  it('unifiedPlanRows:按锚点交织,无句子插入段不占行', () => {
    const r = unifiedPlanRows(
      [
        { index: 0, start: 0, end: 4, text: 'A' },
        { index: 1, start: 4, end: 8, text: 'B' },
      ],
      [
        { atSec: 4, durationSec: 6, text: 'x', sentences: [{ index: 0, start: 0, end: 6, text: 'x' }] },
        { atSec: 8, durationSec: 3, text: '' }, // 无句子:不占行
      ],
    );
    expect(r.map((x) => x.src)).toEqual(['main', 1, 'main']);
    expect(r[1]).toMatchObject({ local: 0, text: 'x' });
  });
});
