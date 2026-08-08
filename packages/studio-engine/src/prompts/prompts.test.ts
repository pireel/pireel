import { describe, expect, it } from 'vitest';
import {
  AGENT_TRANSCRIPT_MAX_CHARS,
  AROLL_GUIDE,
  BLOCK_SYSTEM,
  CHAT_IDENTITY,
  SPOKEN_VISUAL_DIRECTION,
  STUDIO_TOOLS,
  THEME_GENERAL_BRIEF,
  buildChatSystem,
  buildSituation,
  mcpInstructions,
  withActiveTheme,
  wrapAgentTranscript,
} from './index';

describe('静态提示词完整性', () => {
  const STATICS: Array<[name: string, s: string]> = [
    ['BLOCK_SYSTEM', BLOCK_SYSTEM],
    ['CHAT_IDENTITY', CHAT_IDENTITY],
    ['THEME_GENERAL_BRIEF', THEME_GENERAL_BRIEF],
  ];
  for (const [name, s] of STATICS) {
    it(`${name} 非空且无未转义的模板残留`, () => {
      expect(s.length).toBeGreaterThan(100);
      // 迁移期残留检查:不允许旧 {{var}} 占位语法混进来
      expect(s).not.toMatch(/\{\{\w+\}\}/);
    });
  }
  it('Skill 是编辑判断视角，工作流由通用工具组合', () => {
    expect(CHAT_IDENTITY).toContain('selected Scenario Skill is an editorial lens');
    expect(CHAT_IDENTITY).toContain('no scenario-specific plan/layout macro');
    expect(STUDIO_TOOLS.some((tool) => ['analyze_narration', 'lay_out', 'add_graphics'].includes(tool.id))).toBe(false);
  });
  it('Chat 身份是剪辑专家，而不是被动助手或泛化导演', () => {
    expect(CHAT_IDENTITY).toContain("Studio's video editing expert");
    expect(CHAT_IDENTITY).toContain('professional editorial judgment');
    expect(CHAT_IDENTITY).not.toContain('AI video DIRECTOR');
  });
  it('口播全片编排覆盖语义锚点、密度、取景与用户优先级', () => {
    for (const phrase of ['proper name', 'list, steps or process', 'place', 'money', 'person', 'physical object', 'action', 'tone or emotion']) {
      expect(SPOKEN_VISUAL_DIRECTION).toContain(phrase);
    }
    expect(SPOKEN_VISUAL_DIRECTION).toContain('5–10 seconds');
    expect(SPOKEN_VISUAL_DIRECTION).toContain('crop, punch-in, wide reset, corner or split');
    expect(SPOKEN_VISUAL_DIRECTION).toContain('ALWAYS override');
    expect(CHAT_IDENTITY).toContain(SPOKEN_VISUAL_DIRECTION);
    expect(mcpInstructions('test-version')).toContain(SPOKEN_VISUAL_DIRECTION);
  });
  it('Chat 禁止把模型私有工具协议输出给用户', () => {
    expect(CHAT_IDENTITY).toContain('NEVER print or imitate XML, HTML, DSML');
  });
});

describe('chat 缓存架构:system 静态、局势在消息里', () => {
  it('普通长度口播稿完整进入上下文,只有超长稿明确标记截断', () => {
    const ordinary = 'a'.repeat(12_000);
    expect(wrapAgentTranscript(ordinary)).toContain(ordinary);
    expect(wrapAgentTranscript(ordinary)).not.toContain('truncated');
    const long = wrapAgentTranscript('b'.repeat(AGENT_TRANSCRIPT_MAX_CHARS + 1));
    expect(long).toContain('truncated; use search_media');
    expect(long).not.toContain('b'.repeat(AGENT_TRANSCRIPT_MAX_CHARS + 1));
  });

  it('buildChatSystem 不含局势正文(identity 提到 <composition_state> 是在告诉模型它在消息里)', () => {
    for (const sys of [buildChatSystem(null, '- f1 · F1 — x'), buildChatSystem({ id: 'f1', title: 'F1' })]) {
      expect(sys).not.toContain('Edited duration:');
      expect(sys).not.toContain('Overlay blocks');
      expect(sys).not.toContain('Playhead:');
    }
  });
  it('buildChatSystem 同参数逐次字节相同(纯函数,无 request-time 动态内容)', () => {
    expect(buildChatSystem(null, '- f1 · F1 — x')).toBe(buildChatSystem(null, '- f1 · F1 — x'));
  });
  it('buildSituation 不带口播稿正文(稿子经 extract_asr 回执/read_script 一次性进信息流)', () => {
    const s = buildSituation({ composition: { durationSec: 10 }, playheadSec: 1, pipeline: { asr: true } });
    expect(s).not.toContain('Spoken script');
    expect(s).toContain('Pipeline: transcript done');
  });
  it('buildSituation 明确当前成片以及动态序号和稳定 id 的边界', () => {
    const s = buildSituation({
      output: { id: 'output-stable', title: '短版', position: 2, total: 3 },
      composition: { durationSec: 10 },
    });
    expect(s).toContain('Active output: #2 "短版"');
    expect(s).toContain('stable id output-stable');
    expect(s).toContain('All unqualified edits and @ element references target this active output');
  });
  it('read_script 工具在契约表里(插入片段的稿子靠它按需进上下文)', () => {
    expect(STUDIO_TOOLS.some((t) => t.id === 'read_script')).toBe(true);
  });
  it('字幕/口播稿剪辑工具在契约表里', () => {
    for (const id of ['set_captions', 'remove_captions', 'edit_caption_text', 'remove_silence', 'cut_narration', 'list_words', 'delete_words']) {
      expect(STUDIO_TOOLS.some((t) => t.id === id)).toBe(true);
    }
  });
  it('全局 P0 编辑原语在 Chat/MCP 同一契约表里', () => {
    for (const id of ['set_canvas', 'set_shot_framing', 'set_media_transform', 'set_media_crop', 'apply_layout']) {
      expect(STUDIO_TOOLS.some((t) => t.id === id)).toBe(true);
    }
  });
  it('取景预设与原子 transform/crop 分层，不暴露完整自动重构工具', () => {
    const transform = STUDIO_TOOLS.find((tool) => tool.id === 'set_media_transform')!;
    const crop = STUDIO_TOOLS.find((tool) => tool.id === 'set_media_crop')!;
    expect(transform.description).toContain('atomic layer transform');
    expect(crop.description).toContain('atomic crop primitive');
    expect(CHAT_IDENTITY).toContain('Combine these atoms');
  });
  it('素材检索以显式 scope 为权限边界，本地图片有独立准备通道', () => {
    const search = STUDIO_TOOLS.find((tool) => tool.id === 'search_assets')!;
    const searchSchema = search.inputSchema as { required: string[]; properties: Record<string, unknown> };
    expect(searchSchema.required).toContain('scope');
    expect(search.description).toContain('permission boundary');
    const list = STUDIO_TOOLS.find((tool) => tool.id === 'list_assets')!;
    expect(list.description).toContain('least-privilege default');
    const prepare = STUDIO_TOOLS.find((tool) => tool.id === 'prepare_local_image')!;
    expect(prepare.chatOnly).toBe(true);
    expect(prepare.description).toContain('does NOT grant access');
  });
  it('新增组件可在创建时对齐完整口播时长', () => {
    const add = STUDIO_TOOLS.find((tool) => tool.id === 'add_block')!;
    const schema = add.inputSchema as { properties: Record<string, unknown> };
    expect(schema.properties).toHaveProperty('durationSec');
    expect(add.description).toContain('complete spoken thought');
  });
  it('语音与口型同步是可组合原子能力,不是数字人大工具', () => {
    const speech = STUDIO_TOOLS.find((tool) => tool.id === 'generate_speech')!;
    const lipSync = STUDIO_TOOLS.find((tool) => tool.id === 'lip_sync')!;
    expect(speech.kind).toBe('card');
    expect(lipSync.kind).toBe('card');
    expect((speech.inputSchema as { required: string[] }).required).toEqual(['text']);
    expect((lipSync.inputSchema as { required: string[] }).required).toEqual(['audioUrl']);
    expect(CHAT_IDENTITY).toContain('VOICE AND LIP-SYNC ARE COMPOSED ATOMICALLY');
    expect(CHAT_IDENTITY).toContain('never look for or claim a monolithic digital-human workflow');
  });
  it('画幅重构由 Agent 组合原语，不暴露完整功能工具', () => {
    expect(STUDIO_TOOLS.some((t) => ['auto_reframe', 'reframe_video'].includes(t.id))).toBe(false);
    expect(CHAT_IDENTITY).toContain('ASPECT REFRAMING IS A WORKFLOW, NOT A TOOL');
    for (const id of ['analyze_visual', 'set_canvas', 'split_shot', 'set_shot_framing', 'review_visuals']) {
      expect(CHAT_IDENTITY).toContain(id);
    }
  });
  it('批量精确取景是一笔原子调用,画面分析先返回本地稳定人物区间', () => {
    const framing = STUDIO_TOOLS.find((tool) => tool.id === 'set_shot_framing')!;
    const framingSchema = framing.inputSchema as { properties: Record<string, unknown> };
    expect(framingSchema.properties).toHaveProperty('updates');
    expect(framing.description).toContain('ONE updates[] call');
    expect(CHAT_IDENTITY).toContain('ONE set_shot_framing {updates:[...]} call');
    const visual = STUDIO_TOOLS.find((tool) => tool.id === 'analyze_visual')!;
    expect(visual.description).toContain('subjectTracks');
    expect(visual.description).toContain('already clustered locally');
  });
  it('批量切分带 framing 目的,稳定人物区间内由运行时拒绝冗余切点', () => {
    const split = STUDIO_TOOLS.find((tool) => tool.id === 'split_shot')!;
    const schema = split.inputSchema as { properties: Record<string, unknown> };
    expect(schema.properties).toHaveProperty('atSecs');
    expect(schema.properties).toHaveProperty('purpose');
    expect(split.description).toContain('ONE atSecs[] call');
    expect(CHAT_IDENTITY).toContain('purpose:"framing"');
    expect(CHAT_IDENTITY).toContain('<execution_budget>');
  });
  it('MCP 与内置 Agent 共享批处理规则，并由外部 host 追踪单任务预算', () => {
    const instructions = mcpInstructions('test-version');
    expect(instructions).toContain('EXECUTION BUDGET');
    expect(instructions).toContain('24 Pireel tool calls');
    expect(instructions).toContain('12 plan/act cycles');
    expect(instructions).toContain('ONE split_shot {atSecs:[...],purpose:"framing"}');
    expect(instructions).toContain('ONE set_shot_framing {updates:[...]}');
  });
  it('成品画面复检先本地去重，并允许显式逐帧云端检查', () => {
    const review = STUDIO_TOOLS.find((tool) => tool.id === 'review_visuals')!;
    const schema = review.inputSchema as { properties: Record<string, unknown> };
    expect(review.description).toContain('compares them locally');
    expect(schema.properties).toHaveProperty('forceCloudAll');
    expect(CHAT_IDENTITY).toContain('locally collapses visually similar frames');
  });
  it('口播剪辑手册单独 skill:工具在表、映射到我们的剪辑面、按需进(不进 system)', () => {
    expect(STUDIO_TOOLS.some((t) => t.id === 'read_editing_guide')).toBe(true);
    expect(AROLL_GUIDE).toContain('remove_silence');
    expect(AROLL_GUIDE).toContain('minimumPauseSec 0.5');
    expect(AROLL_GUIDE).toContain('speechPaddingSec 0.15 on EACH speech-facing edge');
    expect(STUDIO_TOOLS.find((t) => t.id === 'cut_narration')!.description).toContain('semantic passages');
    // 内容包按需读,绝不进静态 system(缓存前缀不被打穿)
    expect(buildChatSystem(null)).not.toContain(AROLL_GUIDE.slice(0, 80));
  });
  it('set_captions 的 preset enum 从字幕预设表来(agent 只能选、不能自造)', () => {
    const preset = (STUDIO_TOOLS.find((t) => t.id === 'set_captions')!.inputSchema as { properties: { preset: { enum: string[] } } }).properties.preset;
    expect(preset.enum).toContain('em-yellow');
    expect(preset.enum.length).toBeGreaterThanOrEqual(18);
  });
  it('<caption_catalog> 进静态 system,且逐次字节相同', () => {
    const sys = buildChatSystem(null);
    expect(sys).toContain('<caption_catalog>');
    expect(sys).toContain('em-yellow');
    expect(sys).toBe(buildChatSystem(null));
  });
  it('buildSituation 反映字幕开关态', () => {
    expect(buildSituation({ composition: { durationSec: 10 } })).toContain('Captions: off');
    expect(buildSituation({ composition: { durationSec: 10, captions: { preset: 'ln-black', yPct: 88 } } })).toContain('Captions: ON — preset ln-black');
  });
});

describe('主题装配', () => {
  it('无主题 = 原样返回(不加空壳段落)', () => {
    expect(withActiveTheme('SYS')).toBe('SYS');
  });
  it('compose 主题包裹:含约束文案 + 主题内容', () => {
    const s = withActiveTheme('SYS', 'THEME_TOKENS');
    expect(s.startsWith('SYS\n\n')).toBe(true);
    expect(s).toContain('ACTIVE THEME (preset design system)');
    expect(s).toContain('THEME_TOKENS');
  });
});
