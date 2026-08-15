import { describe, expect, it } from 'vitest';
import {
  AGENT_TRANSCRIPT_MAX_CHARS,
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
  it('系统身份是剪辑专家，Skill 保持 Markdown 判断空间', () => {
    expect(CHAT_IDENTITY).toContain("Studio's video editing expert");
    expect(CHAT_IDENTITY).toContain('professional editorial judgment');
    expect(CHAT_IDENTITY).toContain('selected Studio Skill is a rich Markdown expert playbook');
    expect(CHAT_IDENTITY).toContain('NOT a structured configuration');
    expect(CHAT_IDENTITY).toContain('Skill and Frame are orthogonal session inputs');
    expect(CHAT_IDENTITY).toContain('NEVER infer, choose, reject, or switch a Frame because a Skill is active');
    expect(CHAT_IDENTITY).toContain('There is no scenario-specific edit macro');
    expect(CHAT_IDENTITY).toContain('Do not force it through as one uninterrupted execution');
    expect(CHAT_IDENTITY).toContain('For a small set of named choices call ask_user and WAIT');
    expect(CHAT_IDENTITY).toContain('For open-ended information, ask ONE concise natural-language question and stop');
    expect(CHAT_IDENTITY).toContain('Resolve only ONE blocking decision per wait');
    expect(CHAT_IDENTITY).toContain('is NOT permission to make one output');
    expect(CHAT_IDENTITY).toContain('uniform slices, filename-order assembly');
    expect(CHAT_IDENTITY).toContain('does NOT implicitly authorize charge-bearing media generation');
    expect(CHAT_IDENTITY).toContain('BRIEF DESIGNED GRAPHICS BY MEANING, NOT BY A GENERIC UI SHAPE');
    expect(CHAT_IDENTITY).toContain('Do not pre-solve it as a "top label", "bottom card", "CTA box"');
    expect(CHAT_IDENTITY).toContain('This is a hard pre-pilot checkpoint');
    expect(mcpInstructions('test-version')).toContain('Ask one concise question and wait when only the user can resolve that boundary');
    expect(mcpInstructions('test-version')).toContain('requires an explicit output count, purpose and meaningful variation dimension');
    expect(mcpInstructions('test-version')).toContain('Uniform slices or filename-order assembly');
    expect(mcpInstructions('test-version')).toContain('does NOT implicitly authorize charge-bearing media generation');
    expect(mcpInstructions('test-version')).toContain('hard pre-pilot checkpoint');
    expect(mcpInstructions('test-version')).toContain('distribution-specific update section');
    expect(mcpInstructions('test-version')).toContain('Plugin SemVer');
    expect(mcpInstructions('test-version')).not.toContain('npx skills update pireel');
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
  it('未选 Frame 时不隐式适配，完整创意任务会主动提供可跳过的选择', () => {
    const system = buildChatSystem(null, '- zen-white · Zen White\n- editorial-bold · Editorial Bold');
    expect(system).toContain('Remain themeless');
    expect(system).toContain('a complete edit does not authorize automatic Frame selection');
    expect(system).toContain('neutral visual-craft quality floor');
    expect(system).toContain('not permission to emit generic fixed cards');
    expect(system).toContain('user explicitly chooses one or explicitly delegates the choice');
    expect(system).toContain('proactively offer one or two Frame candidates plus a themeless choice');
    expect(system).toContain('catalog previews are samples of a visual language');
    expect(system).toContain('Never rank Frames by the active Skill');
    expect(system).toContain('Do not use a hidden safe default');
    expect(system).not.toContain('choose the best-fitting frame');
    expect(system).not.toContain('zen-white is present in the catalog, it is the safe default');

    const attach = STUDIO_TOOLS.find((tool) => tool.id === 'attach_frame')!;
    expect(attach.description).toContain('only after the user explicitly chooses a Frame or explicitly delegates the choice');
    expect(attach.description).toContain('Skill and Frame are independent');
  });
  it('Frame 是完整视频设计系统，不是固定组件或加了颜色的基础能力', () => {
    const system = buildChatSystem({ id: 'zen-white', title: '留白 Zen' });
    expect(system).toContain('rich Markdown playbook');
    expect(system).toContain('Frame is NOT a set of fixed output types, scene routes, quotas, block recipes');
    expect(system).toContain('a foundational editing method with colors attached');
    expect(system).toContain("adapt its audiovisual world to each Scene's purpose and evidence");
    expect(system).toContain('Skill and Frame are orthogonal');
    expect(system).toContain('do not judge this Frame\'s compatibility from the active Skill');
    expect(STUDIO_TOOLS.find((tool) => tool.id === 'read_frame')?.description).toContain('complete video design-system playbook');
    expect(mcpInstructions('test-version')).toContain('a foundational editing method with colors attached');
    expect(mcpInstructions('test-version')).toContain('Skill and Frame are orthogonal');
  });
  it('同时选择 Skill 与 Frame 时并列注入，不产生绑定关系', () => {
    const system = buildChatSystem(
      { id: 'afterimage', title: '余像 Afterimage' },
      undefined,
      {
        id: 'product-demo',
        title: 'Product Demo',
        description: 'Demonstrate a product.',
        markdown: '# Product Demo\n\nFollow verified product evidence.',
      },
    );
    expect(system).toContain('<studio_skill id="product-demo"');
    expect(system).toContain('<frame_attached id="afterimage"');
    expect(system).toContain('independently selected');
    expect(system).not.toContain('product-demo is compatible with afterimage');
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
  it('buildSituation 携带可跨轮继续执行的 Director Plan、精确 sceneId 与真实 Clip 归属', () => {
    const s = buildSituation({
      composition: { durationSec: 10 },
      directorPlan: {
        goal: '让观众相信结论',
        creativeThesis: '先问题，后证据',
        scenes: [{
          id: 'proof',
          label: '证据落地',
          startSec: 4,
          endSec: 8,
          viewerTask: 'believe',
          narrativeRole: 'prove',
          sceneFamily: 'media-evidence',
          purpose: '用原始证据支撑核心判断',
          evidence: ['产品实拍'],
          treatmentId: 'evidence-plane',
          visualAnchor: '真实产品结果',
          visualTreatment: '保留主体，证据占据视觉中心',
          motionPlan: '证据进入后保持',
          soundPlan: '保留口播与产品声',
          assetStrategy: '优先项目素材',
          brollDecision: 'source',
          brollRationale: '结论需要实拍证明',
          clipIds: ['shot-proof', 'block-proof'],
        }],
      },
    });
    expect(s).toContain('Director Plan: goal "让观众相信结论"');
    expect(s).toContain('sceneId=proof');
    expect(s).toContain('@shot-proof, @block-proof');
    expect(s).toContain('purpose: 用原始证据支撑核心判断');
    expect(s).toContain('treatment: evidence-plane');
    expect(s).toContain('B-roll: source — 结论需要实拍证明');
    expect(s).toContain('pass the exact sceneId');
  });
  it('read_script 工具在契约表里(插入片段的稿子靠它按需进上下文)', () => {
    expect(STUDIO_TOOLS.some((t) => t.id === 'read_script')).toBe(true);
    const asr = STUDIO_TOOLS.find((tool) => tool.id === 'extract_asr')!;
    const schema = asr.inputSchema as { properties: Record<string, unknown> };
    expect(schema.properties).toHaveProperty('assetId');
    expect(schema.properties).toHaveProperty('clipId');
    expect(asr.description).toContain('semantic text truth');
    expect(CHAT_IDENTITY).toContain('SEMANTIC truth, not automatically TIMING truth');
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
  it('完整编辑先保存可校验导演方案，但它不是场景宏', () => {
    const plan = STUDIO_TOOLS.find((tool) => tool.id === 'set_director_plan')!;
    expect(plan.chatOnly).toBe(true);
    expect(plan.description).toContain('NOT a macro');
    const schema = plan.inputSchema as { required: string[]; properties: Record<string, unknown> };
    expect(schema.required).toEqual(['goal', 'creativeThesis', 'scenes']);
    expect(schema.properties).toHaveProperty('scenes');
    const sceneSchema = (schema.properties.scenes as { items: { required: string[]; properties: Record<string, unknown> } }).items;
    expect(sceneSchema.required).toEqual(expect.arrayContaining(['treatmentId', 'visualAnchor', 'visualTreatment', 'motionPlan', 'soundPlan', 'assetStrategy', 'brollDecision', 'brollRationale']));
    expect(sceneSchema.properties).toHaveProperty('visualMetaphor');
    expect(CHAT_IDENTITY).toContain('call set_director_plan before other timeline mutations');
    expect(CHAT_IDENTITY).toContain('Every planned add_block, add_texts, add_clips, insert_clips, and insert_clip call MUST pass the exact sceneId');
    expect(CHAT_IDENTITY).toContain('call analyze_visual BEFORE set_director_plan whenever a Frame is attached');
    expect(CHAT_IDENTITY).toContain('MUST NOT be implemented as add_block calls alone');
    expect(CHAT_IDENTITY).toContain('immediately place/size it from the actual footage observations with place_block');
    expect(CHAT_IDENTITY).toContain('Treat B-roll selection as DIRECTOR judgment');
    expect(CHAT_IDENTITY).toContain('A complete edit is NOT complete if review_visuals fails');
  });
  it('取景预设与原子 transform/crop 分层，不暴露完整自动重构工具', () => {
    const transform = STUDIO_TOOLS.find((tool) => tool.id === 'set_media_transform')!;
    const crop = STUDIO_TOOLS.find((tool) => tool.id === 'set_media_crop')!;
    expect(transform.description).toContain('atomic layer transform');
    expect(crop.description).toContain('atomic crop primitive');
    expect(CHAT_IDENTITY).toContain('Combine these atoms');
  });
  it('原生多轨放置也携带 Director Scene 归属', () => {
    for (const id of ['add_clips', 'insert_clips']) {
      const tool = STUDIO_TOOLS.find((candidate) => candidate.id === id)!;
      const schema = tool.inputSchema as { properties: { clips: { items: { properties: Record<string, unknown> } } } };
      expect(schema.properties.clips.items.properties).toHaveProperty('sceneId');
      expect(tool.description).toContain('sceneId');
    }
    const addTexts = STUDIO_TOOLS.find((candidate) => candidate.id === 'add_texts')!;
    const textSchema = addTexts.inputSchema as { properties: { items: { items: { properties: Record<string, unknown> } } } };
    expect(textSchema.properties.items.items.properties).toHaveProperty('sceneId');
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
    expect(schema.properties).toHaveProperty('sceneId');
    expect(add.description).toContain('complete spoken thought');
    expect(add.description).toContain('binds the new clip back to the Semantic Scene');
    const insert = STUDIO_TOOLS.find((tool) => tool.id === 'insert_clip')!;
    const insertSchema = insert.inputSchema as { properties: Record<string, unknown> };
    expect(insertSchema.properties).toHaveProperty('sceneId');
    expect(insert.description).toContain("scene's evidence + assetStrategy");
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
  it('MCP 与内置 Agent 共享批处理规则，但不把内部容量说成用户预算或积分', () => {
    const instructions = mcpInstructions('test-version');
    expect(instructions).toContain('INTERNAL EXECUTION CAPACITY');
    expect(instructions).toContain('24 Pireel tool calls');
    expect(instructions).toContain('There is no plan/act or model-round ceiling');
    expect(instructions).toContain('NEVER expose a budget, limit, count, token, credit, or capacity');
    expect(instructions).toContain('ONE split_shot {atSecs:[...],purpose:"framing"}');
    expect(instructions).toContain('ONE set_shot_framing {updates:[...]}');
  });
  it('成品画面复检先本地去重，并允许显式逐帧云端检查', () => {
    const review = STUDIO_TOOLS.find((tool) => tool.id === 'review_visuals')!;
    const schema = review.inputSchema as { properties: Record<string, unknown> };
    expect(review.description).toContain('compares frames locally');
    expect(review.description).toContain('entrance, pressure, proof and exit');
    expect(review.description).toContain('repairScope');
    expect(schema.properties).toHaveProperty('sceneIds');
    expect(schema.properties).toHaveProperty('forceCloudAll');
    expect(CHAT_IDENTITY).toContain('samples Director Scene entrance, pressure, proof, exit');
    expect(CHAT_IDENTITY).toContain('repair ONLY the listed Semantic Scenes');
  });
  it('口播剪辑手册单独 skill:工具在表、映射到我们的剪辑面、按需进(不进 system)', () => {
    expect(STUDIO_TOOLS.some((t) => t.id === 'read_editing_guide')).toBe(true);
    expect(STUDIO_TOOLS.find((t) => t.id === 'cut_narration')!.description).toContain('semantic passages');
    // 内容包按需读,绝不进静态 system(缓存前缀不被打穿)
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
    expect(s).toContain('THEME DISTINCTIVENESS IS STRUCTURAL, NOT A RECOLOR');
    expect(s).toContain('at least TWO non-token signatures');
    expect(s).toContain('A polished generic rectangle wearing the theme colors is a failure');
    expect(s).toContain('THEME_TOKENS');
  });
});
