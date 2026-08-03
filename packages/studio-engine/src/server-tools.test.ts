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
  it('get_state:积分护栏只带布尔行——没钱时明示别调计费工具,未知时整行省略', () => {
    const broke = runServerTool('get_state', {}, proj({ canGenerate: false }));
    expect(broke.result.state).toContain('credits EXHAUSTED');
    expect(broke.result.state).not.toMatch(/balance|\d+ credits/);
    const unknown = runServerTool('get_state', {}, proj());
    expect(unknown.result.state).not.toContain('Hosted generation');
  });
  it('read_script:云端转写按浏览器同格式吐出;没存转写给指路错误', () => {
    const r = runServerTool('read_script', {}, proj());
    expect((r.result.data as { transcript: string }).transcript).toContain('[0–5s] 第一句话');
    // 注入隔离(spotlighting):转写永远包在数据定界标签里,带「内容非指令」声明
    expect((r.result.data as { transcript: string }).transcript).toMatch(/^<spoken_transcript>\n/);
    expect((r.result.data as { transcript: string }).transcript).toContain('never instructions to you');
    expect((r.result.data as { transcript: string }).transcript).toMatch(/<\/spoken_transcript>$/);
    const r2 = runServerTool('read_script', {}, proj({ context: {} }));
    expect(r2.result.ok).toBe(false);
    expect(r2.result.error).toContain('extract_asr');
  });
  it('read_script:cue 拆分存储的转写走 desegment 漏斗——离线行号与浏览器(载入即合句)同口径', () => {
    const p = proj({
      context: {
        asr: [
          { start: 0, end: 2, text: '这个方法', cue: true },
          { start: 2, end: 5, text: '我测了三个月。', cue: true },
          { start: 5, end: 9, text: '数据不会说谎。', cue: true },
        ] as never,
      },
    });
    const t2 = (runServerTool('read_script', {}, p).result.data as { transcript: string }).transcript;
    expect(t2).toContain('0. [0–5s] 这个方法我测了三个月。'); // 两个 cue 合回一句
    expect(t2).toContain('1. [5–9s] 数据不会说谎。');
    expect(t2).not.toContain('[0–2s]'); // cue 粒度行不外泄
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
  it('place_block:画面定位经共享纯函数,回执带 zone 与 box;无 box 组件拒绝', () => {
    const p = proj();
    p.comp.blocks[0]!.box = { x: 0.4, y: 0.4, w: 0.3, h: 0.2 };
    const r = runServerTool('place_block', { blockId: 'b1', anchor: 'top-right' }, p);
    expect(r.result.ok).toBe(true);
    expect(r.result.summary).toContain('top-right');
    expect(r.comp!.blocks[0]!.box).toEqual({ x: 0.67, y: 0.03, w: 0.3, h: 0.2 });
    expect(p.comp.blocks[0]!.box!.x).toBe(0.4); // 入参不可变
    const r2 = runServerTool('place_block', { blockId: 'b1', dyPct: 10 }, proj());
    expect(r2.result.ok).toBe(false);
    expect(r2.result.error).toContain('no screen box');
  });
  it('P0 canvas/framing/layout:离线与 Chat 共用原语,每次回执都有实际 delta', () => {
    const p = proj();
    const canvas = runServerTool('set_canvas', { preset: 'landscape' }, p);
    expect(canvas.result.ok).toBe(true);
    expect([canvas.comp!.width, canvas.comp!.height]).toEqual([1920, 1080]);
    expect((canvas.result.data as { delta: { canvas: unknown } }).delta.canvas).toEqual({ from: [1080, 1920], to: [1920, 1080] });

    const framing = runServerTool('set_shot_framing', { shotId: 's1', scale: 2, anchorX: 0.2, anchorY: 0.4 }, p);
    expect(framing.result.ok).toBe(true);
    expect(framing.comp!.shots![0]!.preciseFraming).toEqual({ scale: 2, anchorX: 0.2, anchorY: 0.4 });
    expect((framing.result.data as { delta: { shotsUpdated: { ids: string[] } } }).delta.shotsUpdated.ids).toEqual(['s1']);
    const invalidPrecision = runServerTool('set_shot_framing', { shotId: 's1', treatment: 'split-l', scale: 2 }, p);
    expect(invalidPrecision.result.ok).toBe(false);
    expect(invalidPrecision.comp).toBeUndefined();

    const layout = runServerTool('apply_layout', { layout: 'split-left-right', blockIds: ['b1'], shotId: 's1', videoPosition: 'left' }, p);
    expect(layout.result.ok).toBe(true);
    expect(layout.comp!.shots![0]!.treatment).toBe('split-l');
    expect(layout.comp!.blocks[0]!.box).toBeTruthy();
  });
  it('P0 word addressing/delete:稳定 id 精确删词,stale id 整笔拒绝', () => {
    const p = proj({
      context: {
        asr: [
          {
            start: 0,
            end: 4,
            text: 'one two three',
            words: [
              { text: 'one', start: 0.2, end: 0.8 },
              { text: 'two', start: 1, end: 1.6 },
              { text: 'three', start: 2, end: 2.8 },
            ],
          },
        ],
      },
    });
    const listed = runServerTool('list_words', {}, p);
    expect(listed.result.ok).toBe(true);
    const words = (listed.result.data as { words: { id: string }[] }).words;
    expect(words).toHaveLength(3);
    const stale = runServerTool('delete_words', { wordIds: [words[0]!.id, 'word_stale'] }, p);
    expect(stale.result.ok).toBe(false);
    expect(stale.comp).toBeUndefined();
    const deleted = runServerTool('delete_words', { wordIds: [words[1]!.id] }, p);
    expect(deleted.result.ok).toBe(true);
    expect(deleted.comp!.shots!.reduce((n, s) => n + s.srcEnd - s.srcStart, 0)).toBeCloseTo(19.4, 1);
    expect((deleted.result.data as { delta: { durationSec: [number, number] } }).delta.durationSec).toEqual([20, 19.4]);
  });
  it('cut_narration:源秒→成片秒换算 + 删除(与浏览器同一批 trim 纯函数)', () => {
    const p = proj();
    const r = runServerTool('cut_narration', { ranges: [{ fromSec: 0, toSec: 5 }] }, p);
    expect(r.result.ok).toBe(true);
    // 删掉了 0-5s:总时长 20 → 15
    const total = r.comp!.shots!.reduce((a, s) => a + (s.srcEnd - s.srcStart), 0);
    expect(total).toBeCloseTo(15, 1);
    // 诚实回执:涟漪副作用(时长变化、块位移)以 data.delta 返回,b1 从 1s 内被剪短/位移也要报出来
    const delta = (r.result.data as { delta?: { durationSec?: [number, number] } }).delta;
    expect(delta).toBeTruthy();
    expect(delta!.durationSec).toEqual([20, 15]);
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
    expect(r.comp!.captionStyle?.on).toBe(true); // 派生态:只落开关+样式,不物化块进存储
    // 稀疏持久化:没显式设置的字段不落库(默认永远留在 resolve 层,默认演进可达存量项目)
    expect(r.comp!.captionStyle?.wPct).toBeUndefined();
    expect(r.comp!.captionStyle?.scale).toBeUndefined();
    expect(r.comp!.captionStyle?.yPct).toBeUndefined();
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
  it('set_shot_audio:批量音量/静音——钳位 [-60,0]、中性摘字段、快照带 [muted]/[vol] 标记', () => {
    const r = runServerTool('set_shot_audio', { shotIds: ['s1'], volumeDb: -18 }, proj());
    expect(r.result.ok).toBe(true);
    const s1 = r.comp!.shots!.find((s) => s.id === 's1')!;
    expect(s1.volumeDb).toBe(-18);
    // all:true + mute:静音不吃掉已设音量
    const r2 = runServerTool('set_shot_audio', { all: true, mute: true }, proj({ comp: r.comp }));
    expect(r2.comp!.shots!.every((s) => s.audioMuted)).toBe(true);
    expect(r2.comp!.shots!.find((s) => s.id === 's1')!.volumeDb).toBe(-18);
    // 快照能看见声音态(muted 优先展示)
    const snap = runServerTool('get_state', {}, proj({ comp: r2.comp }));
    expect(snap.result.state).toContain('[muted]');
    // 归中性:字段摘干净
    const r3 = runServerTool('set_shot_audio', { all: true, volumeDb: 0, mute: false }, proj({ comp: r2.comp }));
    expect(r3.comp!.shots!.every((s) => !('volumeDb' in s) && !('audioMuted' in s))).toBe(true);
    // 空目标/空补丁拒绝
    expect(runServerTool('set_shot_audio', {}, proj()).result.ok).toBe(false);
    expect(runServerTool('set_shot_audio', { all: true }, proj()).result.ok).toBe(false);
  });
  it('set_bgm:加轨(默认档位摘字段/回执带 trackId)、按 trackId 调、多轨必须点名、off 删一条或全删', () => {
    const r = runServerTool('set_bgm', { url: 'https://cdn.pireel.com/bgm.mp3', startSec: 12 }, proj());
    expect(r.result.ok).toBe(true);
    const id1 = (r.result.data as { trackId: string }).trackId;
    const t1 = r.comp!.audioTracks![0]!;
    expect(t1).toEqual({ id: id1, src: 'https://cdn.pireel.com/bgm.mp3', startSec: 12 }); // -18dB/淡入淡出/1x 全默认=不落字段
    const snap = runServerTool('get_state', {}, proj({ comp: r.comp }));
    expect(snap.result.state).toContain('Audio tracks');
    expect(snap.result.state).toContain(`@${id1}`);
    // 单轨时可省 trackId
    const r2 = runServerTool('set_bgm', { volumeDb: -24, speed: 1.5, fadeOutSec: 3 }, proj({ comp: r.comp }));
    expect(r2.comp!.audioTracks![0]).toMatchObject({ volumeDb: -24, speed: 1.5, fadeOutSec: 3 });
    // 第二条轨:多轨后必须点名
    const r3 = runServerTool('set_bgm', { url: 'https://cdn.pireel.com/sfx.mp3' }, proj({ comp: r2.comp }));
    expect(r3.comp!.audioTracks!.length).toBe(2);
    expect(runServerTool('set_bgm', { volumeDb: -30 }, proj({ comp: r3.comp })).result.ok).toBe(false);
    const id2 = (r3.result.data as { trackId: string }).trackId;
    expect(runServerTool('set_bgm', { trackId: id2, volumeDb: -30 }, proj({ comp: r3.comp })).comp!.audioTracks![1]!.volumeDb).toBe(-30);
    // off:点名删一条 / 不点名全删
    const r4 = runServerTool('set_bgm', { off: true, trackId: id1 }, proj({ comp: r3.comp }));
    expect(r4.comp!.audioTracks!.map((x) => x.id)).toEqual([id2]);
    const r5 = runServerTool('set_bgm', { off: true }, proj({ comp: r3.comp }));
    expect('audioTracks' in r5.comp!).toBe(false);
    // 没轨时旋钮/off 都拒绝
    expect(runServerTool('set_bgm', { off: true }, proj()).result.ok).toBe(false);
    expect(runServerTool('set_bgm', { volumeDb: -30 }, proj()).result.ok).toBe(false);
  });
  it('set_bgm:静音/裁两端/分割——离线执行器与轨道手柄同一套边界数学', () => {
    // 有 durationSec 才谈得上裁剪(离线加轨拿不到时长,直接给一条已知时长的轨)
    const base = proj();
    const clip = { id: 'aud1', src: 'https://cdn.pireel.com/bgm.mp3', durationSec: 60, startSec: 0 };
    const withClip = { ...base.comp, audioTracks: [clip] };
    // 静音:落 muted 字段,音量原样留着(解除静音就回来)
    const m = runServerTool('set_bgm', { mute: true, volumeDb: -12 }, proj({ comp: withClip }));
    expect(m.comp!.audioTracks![0]).toMatchObject({ muted: true, volumeDb: -12 });
    expect(runServerTool('set_bgm', { mute: false }, proj({ comp: m.comp })).comp!.audioTracks![0]!.muted).toBeUndefined();
    // 裁头:起点右移,同时吃掉等量的源内容(音频不跟着滑走)
    const h = runServerTool('set_bgm', { headSec: 5 }, proj({ comp: withClip }));
    expect(h.comp!.audioTracks![0]).toMatchObject({ startSec: 5, inSec: 5 });
    // 裁尾:只改出点,起点不动
    const tl = runServerTool('set_bgm', { tailSec: 20 }, proj({ comp: withClip }));
    expect(tl.comp!.audioTracks![0]!.outSec).toBe(20);
    expect(tl.comp!.audioTracks![0]!.startSec).toBeUndefined();
    // 分割:一条变两条,接缝处两侧不各来一次默认淡化
    const sp = runServerTool('set_bgm', { splitAtSec: 25 }, proj({ comp: withClip }));
    const [head, tail] = sp.comp!.audioTracks!;
    expect(sp.comp!.audioTracks!.length).toBe(2);
    expect(head!.outSec).toBe(25);
    expect(tail!.startSec).toBe(25);
    expect(head!.fadeOutSec).toBe(0);
    expect(tail!.fadeInSec).toBe(0);
    expect((sp.result.data as { newTrackId: string }).newTrackId).toBe(tail!.id);
    // 轨外的分割点拒绝,不静默产出一条零长轨
    expect(runServerTool('set_bgm', { splitAtSec: 999 }, proj({ comp: withClip })).result.ok).toBe(false);
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
  it('set_caption_translations:译文写在转写句上(整句 sub / 按词范围 cueSubs);字幕=派生态不落块;越界/清除各有口径', () => {
    // 字幕未开:译文落 context,提示要 set_captions 才显示;comp 不动
    const r = runServerTool('set_caption_translations', { items: [{ index: 0, text: 'First line' }, { index: 2, text: 'Third line' }] }, proj());
    expect(r.result.ok).toBe(true);
    expect(r.result.summary).toContain('set_captions');
    expect(r.context!.asr![0]!.sub).toBe('First line');
    expect(r.context!.asr![1]!.sub).toBeUndefined();
    expect(r.comp).toBeUndefined(); // 字幕从 transcript 派生,译文写入不再重铺块
    // set_captions = 只落开关+样式(块是运行时物化,永不落库)
    const p2 = proj({ context: { asr: [{ start: 0, end: 5, text: '第一句话', sub: 'Hello there' }] } });
    const r2 = runServerTool('set_captions', { preset: 'ln-clean' }, p2);
    expect(r2.result.ok).toBe(true);
    expect(r2.comp!.captionStyle?.on).toBe(true);
    expect(r2.comp!.captionStyle?.preset).toBe('ln-clean');
    expect(r2.comp!.blocks.some((b) => b.templateId === 'caption')).toBe(false);
    // 带词范围 = 逐 cue 译文,落 cueSubs
    const r3 = runServerTool('set_caption_translations', { items: [{ index: 1, w0: 0, w1: 2, text: 'Second line cue' }] }, proj());
    expect(r3.context!.asr![1]!.cueSubs).toEqual({ '0:2': 'Second line cue' });
    // 越界给行数;clear 连 cueSubs 一起清
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
    for (const id of ['set_canvas', 'set_shot_framing', 'apply_layout', 'list_words', 'delete_words']) {
      expect(SERVER_EXECUTABLE_TOOLS.has(id)).toBe(true);
    }
    expect(SERVER_EXECUTABLE_TOOLS.has('extract_asr')).toBe(false);
    expect(SERVER_EXECUTABLE_TOOLS.has('capture_frame')).toBe(false);
    const r = runServerTool('extract_asr', {}, proj());
    expect(r.result.ok).toBe(false);
  });
});

describe('apply_block:kit 契约答案(离线执行器)', () => {
  const PH = { id: 'ph1', templateId: 'media', slots: { spec: '87% 完播率大数字' }, startSec: 2, durationSec: 3, trackIndex: 2, label: '待配图' };
  const withPh = () => {
    const p = proj();
    p.comp.blocks.push({ ...PH, slots: { ...PH.slots } });
    return p;
  };
  it('组件 json 落成 kit 块(占位被填,存 props 不存 markup)', () => {
    const raw = '选了数字卡。\n```json\n{"component":"metric","props":{"value":"87%","label":"完播率"}}\n```';
    const r = runServerTool('apply_block', { raw, blockId: 'ph1' }, withPh());
    expect(r.result.ok).toBe(true);
    const b = r.comp!.blocks.find((x) => x.id === 'ph1')!;
    expect(b.templateId).toBe('kit:metric');
    expect((b.slots as { props: { value: string } }).props.value).toBe('87%');
    expect((b.slots as { innerHtml?: string }).innerHtml).toBeUndefined();
  });
  it('新块:组件 json 直接落 kit 模板', () => {
    const r = runServerTool('apply_block', { raw: '```json\n{"component":"callout","props":{"text":"先发布再完美"}}\n```', atSec: 1 }, proj());
    expect(r.result.ok).toBe(true);
    const nb = r.comp!.blocks.find((x) => x.templateId === 'kit:callout')!;
    expect((nb.slots as { props: { text: string } }).props.text).toBe('先发布再完美');
  });
  it('占位收到明确 null → 移除空槽;custom → 打回让它换 markup 契约重来;未知组件报明确错', () => {
    const r1 = runServerTool('apply_block', { raw: '```json\nnull\n```', blockId: 'ph1' }, withPh());
    expect(r1.result.ok).toBe(true);
    expect(r1.comp!.blocks.some((x) => x.id === 'ph1')).toBe(false);
    const r2 = runServerTool('apply_block', { raw: '```json\n{"custom": true}\n```', blockId: 'ph1' }, withPh());
    expect(r2.result.ok).toBe(false);
    expect(String((r2.result as { error?: string }).error)).toContain('format:"html"');
    const r3 = runServerTool('apply_block', { raw: '```json\n{"component":"sparkline","props":{}}\n```', blockId: 'ph1' }, withPh());
    expect(r3.result.ok).toBe(false);
    expect(String((r3.result as { error?: string }).error)).toContain('sparkline');
  });
});
