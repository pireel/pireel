import { describe, expect, it } from 'vitest';
import { type Composition, cutTransitions, videoFrameTimelineBody } from './composition';
import { SERVER_EXECUTABLE_TOOLS, type ServerToolProject, runServerTool } from './server-tools';

function proj(over: Partial<ServerToolProject> = {}): ServerToolProject {
  const comp: Composition = {
    width: 1080,
    height: 1920,
    theme: 'general',
    video: null,
    blocks: [
      { id: 'b1', templateId: 'custom', slots: { innerHtml: '<div>hi</div>', timelineBody: '' }, startSec: 1, durationSec: 3, trackIndex: 1, label: '标题卡' },
    ],
    shots: [
      { id: 's1', srcStart: 0, srcEnd: 10, treatment: 'full' },
      { id: 's2', srcStart: 10, srcEnd: 20, treatment: 'punch-in' },
    ],
  };
  return {
    id: 'p1',
    title: '测试项目',
    comp,
    context: {
      asr: [
        { start: 0, end: 5, text: '第一句话' },
        { start: 5, end: 12, text: '第二句话' },
        { start: 12, end: 20, text: '第三句话' },
      ],
    },
    videoDurationSec: 20,
    ...over,
  };
}

describe('离线执行器(标签页关着时的 MCP fallback)', () => {
  it('get_state:离线声明 + 与浏览器同源的局势快照', () => {
    const r = runServerTool('get_state', {}, proj());
    expect(r.result.ok).toBe(true);
    expect(r.result.state).toContain('OFFLINE MODE');
    expect(r.result.state).toContain('测试项目');
    expect(r.result.state).toContain('@b1');
    expect(r.result.state).toContain('@s2');
    expect(r.comp).toBeUndefined(); // 纯查询不落库
  });
  it('read_script:云端转写按浏览器同格式吐出;没存转写给指路错误', () => {
    const r = runServerTool('read_script', {}, proj());
    expect((r.result.data as { transcript: string }).transcript).toContain('[0–5s] 第一句话');
    const r2 = runServerTool('read_script', {}, proj({ context: {} }));
    expect(r2.result.ok).toBe(false);
    expect(r2.result.error).toContain('extract_asr');
  });
  it('move_block/delete_block:改动经 comp 返回(路由落库),原 comp 不被原地改', () => {
    const p = proj();
    const r = runServerTool('move_block', { blockId: 'b1', startSec: 5.5 }, p);
    expect(r.result.ok).toBe(true);
    expect(r.comp!.blocks[0]!.startSec).toBe(5.5);
    expect(p.comp.blocks[0]!.startSec).toBe(1); // 入参不可变
    const r2 = runServerTool('delete_block', { blockId: 'b1' }, p);
    expect(r2.comp!.blocks).toHaveLength(0);
  });
  it('cut_narration:源秒→成片秒换算 + 删除(与浏览器同一批 trim 纯函数)', () => {
    const p = proj();
    const r = runServerTool('cut_narration', { ranges: [{ fromSec: 0, toSec: 5 }] }, p);
    expect(r.result.ok).toBe(true);
    // 删掉了 0-5s:总时长 20 → 15
    const total = r.comp!.shots!.reduce((a, s) => a + (s.srcEnd - s.srcStart), 0);
    expect(total).toBeCloseTo(15, 1);
  });
  it('split_shot:离线必须给 atSec(没有播放头)', () => {
    const r = runServerTool('split_shot', {}, proj());
    expect(r.result.ok).toBe(false);
    expect(r.result.error).toContain('atSec');
    const r2 = runServerTool('split_shot', { atSec: 5 }, proj());
    expect(r2.result.ok).toBe(true);
    expect(r2.comp!.shots).toHaveLength(3);
  });
  it('set_captions:有云端转写才能开;submit_plan 落 context 不落 comp', () => {
    const r = runServerTool('set_captions', { preset: 'ln-clean' }, proj());
    expect(r.result.ok).toBe(true);
    expect(r.comp!.captionStyle?.preset).toBe('ln-clean');
    expect(r.comp!.blocks.length).toBeGreaterThan(1);
    const r2 = runServerTool('set_captions', { preset: 'ln-clean' }, proj({ context: {} }));
    expect(r2.result.ok).toBe(false);
    const r3 = runServerTool('submit_plan', { plan: { scenes: [{ from: 0, to: 2, framing: 'full' }] } }, proj());
    expect(r3.result.ok).toBe(true);
    expect(r3.context?.plan).toBeTruthy();
    expect(r3.comp).toBeUndefined();
  });
  it('set_video_filter:整镜调色,值替换整份;全中性=字段摘掉;关键帧进 vid 时间轴体', () => {
    const r = runServerTool('set_video_filter', { shotId: 's1', brightness: 1.2, saturate: 0 }, proj());
    expect(r.result.ok).toBe(true);
    expect(r.comp!.shots![0]!.filter).toEqual({ brightness: 1.2, saturate: 0 });
    expect(videoFrameTimelineBody(r.comp!.shots!)).toContain("filter: 'brightness(1.2) saturate(0)'");
    expect(videoFrameTimelineBody(r.comp!.shots!)).toContain("filter: 'none'"); // s2 中性段复位,防前镜漏色
    // 不带任何系数 = 还原
    const p2 = proj({ comp: { ...proj().comp, shots: r.comp!.shots } });
    const r2 = runServerTool('set_video_filter', { shotId: 's1' }, p2);
    expect(r2.comp!.shots![0]!.filter).toBeUndefined();
    expect(videoFrameTimelineBody(r2.comp!.shots!)).not.toContain('filter:'); // 全片无调色=一行不出
    expect(runServerTool('set_video_filter', { shotId: 'nope', brightness: 1.1 }, proj()).result.ok).toBe(false);
  });
  it('add_transition:内容级切点转场——挂后镜 transIn、prevId 锚前镜;非切点拒绝;none 移除;区内禁分割', () => {
    // proj 的切点在 10s(s1|s2)
    const r = runServerTool('add_transition', { atSec: 10.1, effect: 'crosszoom', durationSec: 2 }, proj());
    expect(r.result.ok).toBe(true);
    const s2 = r.comp!.shots!.find((s) => s.id === 's2')!;
    expect(s2.transIn).toEqual({ prevId: 's1', effect: 'crosszoom', durationSec: 2 });
    expect(cutTransitions(r.comp!.shots!)).toEqual([{ cut: 10, shotId: 's2', effect: 'crosszoom', half: 1, dir: 'left' }]);
    // 非切点拒绝并列出边界
    const r2 = runServerTool('add_transition', { atSec: 5, effect: 'fadeblack' }, proj());
    expect(r2.result.ok).toBe(false);
    expect(r2.result.error).toContain('10');
    // 转场覆盖区内禁分割;区外照常
    const p2 = proj({ comp: { ...proj().comp, shots: r.comp!.shots } });
    expect(runServerTool('split_shot', { atSec: 10.5 }, p2).result.ok).toBe(false);
    expect(runServerTool('split_shot', { atSec: 15 }, p2).result.ok).toBe(true);
    // none 移除;删任一邻镜 → prevId 失配自动失效
    const r3 = runServerTool('add_transition', { atSec: 10, effect: 'none' }, p2);
    expect(r3.comp!.shots!.find((s) => s.id === 's2')!.transIn).toBeUndefined();
    const r4 = runServerTool('delete_shot', { shotId: 's1' }, p2);
    expect(cutTransitions(r4.comp!.shots!)).toEqual([]);
    // 时长被两侧镜长夹:durationSec 4 但镜长只 1.5s → half 贴 1.5
    const shots5 = [
      { id: 'a', srcStart: 0, srcEnd: 1.5, treatment: 'full' as const },
      { id: 'b', srcStart: 1.5, srcEnd: 20, treatment: 'full' as const, transIn: { prevId: 'a', effect: 'directional' as const, durationSec: 4 } },
    ];
    expect(cutTransitions(shots5)[0]!.half).toBe(1.5);
  });
  it('set_caption_translations:译文写在转写句上,铺字幕时进块;越界/清除各有口径', () => {
    // 字幕未开:译文落 context,提示要 set_captions 才显示;comp 不长字幕
    const r = runServerTool('set_caption_translations', { items: [{ index: 0, text: 'First line' }, { index: 2, text: 'Third line' }] }, proj());
    expect(r.result.ok).toBe(true);
    expect(r.result.summary).toContain('set_captions');
    expect(r.context!.asr![0]!.sub).toBe('First line');
    expect(r.context!.asr![1]!.sub).toBeUndefined();
    // 已有译文的项目开字幕 → 副行进块 slots
    const p2 = proj({ context: { asr: [{ start: 0, end: 5, text: '第一句话', sub: 'Hello there' }] } });
    const r2 = runServerTool('set_captions', { preset: 'ln-clean' }, p2);
    const cap = r2.comp!.blocks.find((b) => b.templateId === 'caption');
    expect(cap?.slots.sub).toBe('Hello there');
    // 字幕已开时配译文 → 整层重铺,副行立刻进块
    const p3 = proj({ comp: { ...proj().comp, blocks: r2.comp!.blocks }, context: proj().context });
    const r3 = runServerTool('set_caption_translations', { items: [{ index: 1, text: 'Second line' }] }, p3);
    expect(r3.comp!.blocks.some((b) => b.slots.sub === 'Second line')).toBe(true);
    // 越界给行数;空 text 删单句;clear 清全部
    const r4 = runServerTool('set_caption_translations', { items: [{ index: 9, text: 'x' }] }, proj());
    expect(r4.result.ok).toBe(false);
    expect(r4.result.error).toContain('3 lines');
    const r5 = runServerTool('set_caption_translations', { clear: true }, p2);
    expect(r5.context!.asr![0]!.sub).toBeUndefined();
  });
  it('apply_block:同一套 parse+lint;compose_context 占位带 suggested_instruction', () => {
    const raw = '加一张卡\n```html\n<div id="nb">OK</div>\n```\n```js\ntl.to("#nb", { opacity: 1, duration: 0.3 });\n```';
    const r = runServerTool('apply_block', { raw, atSec: 2 }, proj());
    expect(r.result.ok).toBe(true);
    expect(r.comp!.blocks).toHaveLength(2);
    const r2 = runServerTool('compose_context', { blockId: 'b1' }, proj());
    expect(r2.result.ok).toBe(true);
    expect((r2.result.data as { block: { id: string } }).block.id).toBe('b1');
  });
  it('apply_block:新块 id 一轮收敛(未知 blockId 原样采用;lint 回执还稳定 id)', () => {
    // compose_context 给新元素铸的 id 不在 comp 里——apply 带这个"未知" id 必须原样采用,不许报找不到
    const rc = runServerTool('compose_context', {}, proj());
    const minted = (rc.result.data as { block: { id: string } }).block.id;
    const rawOk = `note\n\`\`\`html\n<div><style>#${minted} .t{color:red}</style><div class="t">x</div></div>\n\`\`\`\n\`\`\`js\ntl.to("#${minted} .t",{opacity:1,duration:.3});\n\`\`\``;
    const r1 = runServerTool('apply_block', { raw: rawOk, blockId: minted, atSec: 1 }, proj());
    expect(r1.result.ok).toBe(true);
    expect((r1.result.data as { newBlockId: string }).newBlockId).toBe(minted);
    // scope 错 id 且不带 blockId → lint 拦下,回执必须还一个稳定 id;按回执改一轮就收敛,新块用同一 id
    const rawBad = 'note\n```html\n<div><style>#stale9 .t{color:red}</style><div class="t">x</div></div>\n```\n```js\ntl.to("#stale9 .t",{opacity:1,duration:.3});\n```';
    const r2 = runServerTool('apply_block', { raw: rawBad, atSec: 1 }, proj());
    expect(r2.result.ok).toBe(false);
    const handed = (r2.result.data as { blockId: string }).blockId;
    expect(handed).toBeTruthy();
    const r3 = runServerTool('apply_block', { raw: rawBad.replaceAll('#stale9', `#${handed}`), blockId: handed, atSec: 1 }, proj());
    expect(r3.result.ok).toBe(true);
    expect((r3.result.data as { newBlockId: string }).newBlockId).toBe(handed);
  });
  it('不支持的工具明确拒绝(路由据 SERVER_EXECUTABLE_TOOLS 预筛,这里兜底)', () => {
    expect(SERVER_EXECUTABLE_TOOLS.has('extract_asr')).toBe(false);
    expect(SERVER_EXECUTABLE_TOOLS.has('capture_frame')).toBe(false);
    const r = runServerTool('extract_asr', {}, proj());
    expect(r.result.ok).toBe(false);
  });
});
