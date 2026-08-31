import { describe, expect, it, vi } from 'vitest';
import { STUDIO_TOOLS } from './prompts';
import {
  type McpDeps,
  MCP_SERVER_TOOL_IDS,
  bridgeTimeoutMs,
  buildMcpTools,
  handleMcpRequest,
} from './mcp';

function deps(overrides: Partial<McpDeps> = {}): McpDeps {
  return {
    skillVersion: '2099-01-01.1',
    callBridge: vi.fn(async () => ({ ok: true, summary: 'done' })),
    listFrames: vi.fn(() => [{ id: 'f1', title: 'F1', summary: 's' }]),
    listSkills: vi.fn(async () => ({ ok: true, summary: '1 skill', data: { skills: [{ id: 'usk_1', title: '大女主' }] } })),
    readSkill: vi.fn(async (id: string) => ({ ok: true, summary: id, data: { skill: { id, playbook: 'PB' } } })),
    readFrame: vi.fn((id: string) => ({ ok: true, summary: id, data: { playbook: 'PB' } })),
    readEditingGuide: vi.fn(() => ({ ok: true, data: { guide: 'G' } })),
    assembleComposeBrief: vi.fn((_d: Record<string, unknown>, instruction: string) => ({ ok: true, data: { system: 'SYS', prompt: `P:${instruction}` } })),
    lookupIcons: vi.fn(() => ({ ok: true, data: { icons: [], misses: [] } })),
    importMedia: vi.fn(async () => ({ ok: true, summary: 'imported', data: { projectId: 'p1' } })),
    createBrowserHandoff: vi.fn(async () => ({ ok: true, summary: 'handoff', data: { url: 'https://x/auth/handoff?code=c', project_id: 'p2' } })),
    createProject: vi.fn(async () => ({ ok: true, summary: 'created', data: { projectId: 'p3', title: 'New' } })),
    listProjects: vi.fn(async () => ({ ok: true, summary: '0', data: { projects: [], active: null } })),
    switchProject: vi.fn(async () => ({ ok: true, summary: 'switched', data: { projectId: 'p1' } })),
    renameProject: vi.fn(async () => ({ ok: true, summary: 'renamed', data: { projectId: 'p1', title: 'X' } })),
    listAssets: vi.fn(async () => ({ ok: true, summary: '1 assets in the library', data: { assets: [{ id: 'u1', kind: 'image', url: 'https://cdn.example/u1.png' }], project: {} } })),
    searchAssets: vi.fn(async () => ({ ok: true, summary: '1 matching asset', data: { results: [{ assetId: 'u1', kind: 'image', scope: 'cloud' }] } })),
    searchStock: vi.fn(async () => ({ ok: true, summary: '1 online result', data: { results: [{ assetId: 'px_1', provider: 'pexels' }] } })),
    importStock: vi.fn(async () => ({ ok: true, summary: 'stock imported', data: { registration: { id: 'up_1', kind: 'image', url: 'https://cdn.example/stock.jpg' } } })),
    listModels: vi.fn(async () => ({ ok: true, summary: '2 generation models', data: { models: [] } })),
    generateImage: vi.fn(async () => ({ ok: true, summary: 'image started', data: { id: 'ci1', status: 'pending' } })),
    generateVideo: vi.fn(async () => ({ ok: true, summary: 'video started', data: { id: 'cv1', status: 'pending' } })),
    generateMusic: vi.fn(async () => ({ ok: true, summary: 'music generated', data: { asset: { id: 'cm1', url: 'https://cdn.example/m.wav' } } })),
    getGenerationJobs: vi.fn(async () => ({ ok: true, summary: '2 generation jobs', data: { jobs: [] } })),
    listVoices: vi.fn(async () => ({ ok: true, summary: '2 voices', data: { voices: [] } })),
    cloneVoice: vi.fn(async () => ({ ok: true, summary: 'voice created', data: { voice: { id: 'voice_1' } } })),
    designVoice: vi.fn(async () => ({ ok: true, summary: 'voice designed', data: { voice: { id: 'voice_2' } } })),
    deleteVoice: vi.fn(async () => ({ ok: true, summary: 'voice deleted' })),
    generateSpeech: vi.fn(async () => ({ ok: true, summary: 'speech', data: { asset: { url: 'https://cdn.example/s.mp3' } } })),
    lipSync: vi.fn(async () => ({ ok: true, summary: 'lip sync', data: { creationId: 'c1', status: 'pending' } })),
    ...overrides,
  };
}

describe('MCP 工具面', () => {
  it('STUDIO_TOOLS 全量映射 + MCP 专属工具(registry 加工具这里自动长出来)', () => {
    const names = new Set(buildMcpTools().map((t) => t.name));
    // chatOnly 工具(review_visuals 这类托管视觉模型)不出现在 MCP 面——外部 agent 通过 capture_frame/review_sequence 使用自己的眼睛
    for (const d of STUDIO_TOOLS) expect(names.has(d.id)).toBe(!d.chatOnly);
    for (const extra of ['get_state', 'list_frames', 'list_skills', 'read_skill', 'compose_block_brief', 'apply_block', 'review_sequence', 'get_icons', 'search_stock', 'import_stock']) {
      expect(names.has(extra)).toBe(true);
    }
  });
  it('私有/community Skill 通过稳定的目录与正文接口暴露，不把内部实现当契约', () => {
    const tools = buildMcpTools();
    const list = tools.find((tool) => tool.name === 'list_skills')!;
    const read = tools.find((tool) => tool.name === 'read_skill')!;
    expect(list.description).toContain('private author-owned Skills');
    expect(list.description).toContain('never private playbook text');
    expect((read.inputSchema as { required?: string[] }).required).toContain('skill_id');
    expect(read.description).toContain('stable Skill boundary');
    expect(read.description).toContain('list_voices');
    expect(read.description).not.toContain('editorialOpeningEvidence');
  });
  it('自家 LLM 收费工具在 MCP 面标注 credits 警示并指到 BYO 流(商业模式:编排+文本生成走用户订阅)', () => {
    const tools = buildMcpTools();
    for (const [id, byo] of [
      ['add_block', 'compose_block_brief'],
      ['edit_block', 'compose_block_brief'],
    ] as const) {
      const t = tools.find((t) => t.name === id)!;
      expect(t.description).toContain('CHARGES');
      expect(t.description).toContain(byo);
    }
  });
  it('read_frame 的 MCP 版带必填 frame_id(内部 chat 版靠会话挂载态,MCP 没有会话)', () => {
    const t = buildMcpTools().find((t) => t.name === 'read_frame')!;
    expect((t.inputSchema as { required?: string[] }).required).toContain('frame_id');
  });
  it('自定义音色三件套暴露给 MCP，并明确价格发现与审批边界', () => {
    const tools = buildMcpTools();
    const clone = tools.find((tool) => tool.name === 'clone_voice')!;
    const design = tools.find((tool) => tool.name === 'design_voice')!;
    const speech = tools.find((tool) => tool.name === 'generate_speech')!;
    expect(clone.description).toContain('customVoiceAccess.cloneCredits');
    expect(design.description).toContain('customVoiceAccess.designCredits');
    expect(design.description).toContain('explicit approval');
    expect((design.inputSchema as { required?: string[] }).required).toContain('prompt');
    expect(speech.description).toContain('exact approved clean text');
    expect(speech.description).toContain('The runtime compiles those controls only for synthesis');
  });
  it('description 不引用 MCP 语境里不存在的机制(frame 目录经 list_frames,不在 system)', () => {
    const t = buildMcpTools().find((t) => t.name === 'attach_frame')!;
    expect(t.description).not.toContain('<frame_catalog>');
    expect(t.description).toContain('list_frames');
  });
  it('本地导入先用内置浏览器,仅在明确回环错误后切换受控浏览器', () => {
    const tool = buildMcpTools().find((candidate) => candidate.name === 'import_media')!;
    expect(tool.description).toContain('built-in/embedded browser first');
    expect(tool.description).toContain('local loopback is unreachable from this browser');
    expect(tool.description).toContain('If and only if');
    expect(tool.description).not.toContain('prefer connected Chrome');
  });
  it('外部 Agent 能保存同一套 Director Plan 与开放式 Scene 设计', () => {
    const tools = buildMcpTools();
    const plan = tools.find((tool) => tool.name === 'set_director_plan')!;
    const scene = tools.find((tool) => tool.name === 'set_scene_designs')!;
    expect(plan.description).toContain('external host');
    expect(plan.description).not.toContain('request_approval');
    expect(scene.description).toContain('open spatial-temporal design');
    expect((scene.inputSchema as { properties: { scenes: { items: { properties: Record<string, unknown> } } } }).properties.scenes.items.properties).not.toHaveProperty('layout');
  });
  it('超时分档:card(浏览器里跑生成/分析)10 分钟,badge(即时)60 秒', () => {
    expect(bridgeTimeoutMs('analyze_visual')).toBe(600_000);
    expect(bridgeTimeoutMs('move_block')).toBe(60_000);
  });
});

describe('MCP 协议处理', () => {
  it('initialize:回显协议版本,instructions 带字幕目录与 get_state 纪律', async () => {
    const r = await handleMcpRequest(
      { id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
      deps({ editingExpertise: 'PRIVATE HOST EDITING JUDGMENT' }),
    );
    const result = r!.result as { protocolVersion: string; instructions: string; serverInfo: { name: string } };
    expect(result.protocolVersion).toBe('2025-03-26');
    expect(result.serverInfo.name).toBe('pireel-studio');
    expect(result.instructions).toContain('<caption_catalog>');
    expect(result.instructions).toContain('get_state');
    expect(result.instructions).toContain('<editing_expertise>');
    expect(result.instructions).toContain('PRIVATE HOST EDITING JUDGMENT');
  });
  it('通知返回 null(路由回 202);未知方法回 -32601', async () => {
    expect(await handleMcpRequest({ method: 'notifications/initialized' }, deps())).toBeNull();
    const r = await handleMcpRequest({ id: 2, method: 'resources/list' }, deps());
    expect(r!.error?.code).toBe(-32601);
  });
  it('服务端内容工具不过桥:read_editing_guide / read_frame / list_frames / Studio Skills', async () => {
    const d = deps();
    await handleMcpRequest({ id: 3, method: 'tools/call', params: { name: 'read_editing_guide' } }, d);
    await handleMcpRequest({ id: 4, method: 'tools/call', params: { name: 'read_frame', arguments: { frame_id: 'f1' } } }, d);
    await handleMcpRequest({ id: 5, method: 'tools/call', params: { name: 'list_frames' } }, d);
    await handleMcpRequest({ id: 51, method: 'tools/call', params: { name: 'list_skills', arguments: { query: '大女主' } } }, d);
    await handleMcpRequest({ id: 52, method: 'tools/call', params: { name: 'read_skill', arguments: { skill_id: 'usk_1' } } }, d);
    expect(d.callBridge).not.toHaveBeenCalled();
    expect(d.readEditingGuide).toHaveBeenCalled();
    expect(d.readFrame).toHaveBeenCalledWith('f1');
    expect(d.listSkills).toHaveBeenCalledWith({ query: '大女主' });
    expect(d.readSkill).toHaveBeenCalledWith('usk_1');
    // 服务端直答集合与 dispatch 的特判保持同步
    expect([...MCP_SERVER_TOOL_IDS].sort()).toEqual(['clone_voice', 'create_browser_handoff', 'create_project', 'delete_voice', 'design_voice', 'generate_image', 'generate_music', 'generate_speech', 'generate_video', 'get_generation_jobs', 'get_icons', 'import_media', 'import_stock', 'lip_sync', 'list_assets', 'list_frames', 'list_models', 'list_projects', 'list_skills', 'list_voices', 'read_editing_guide', 'read_frame', 'read_skill', 'rename_project', 'search_assets', 'search_stock', 'switch_project']);
    // import_media 服务端直答(登记进项目行,不过桥)
    const d2 = deps();
    await handleMcpRequest({ id: 100, method: 'tools/call', params: { name: 'import_media', arguments: { sig: 'a.mp4:1:2' } } }, d2);
    expect(d2.importMedia).toHaveBeenCalledWith({ sig: 'a.mp4:1:2' });
    expect(d2.callBridge).not.toHaveBeenCalled();
    // create_browser_handoff 服务端直答(签一次性码,不过桥——标签页可能还不存在)
    const d3 = deps();
    await handleMcpRequest({ id: 101, method: 'tools/call', params: { name: 'create_browser_handoff', arguments: { project_id: 'p2' } } }, d3);
    expect(d3.createBrowserHandoff).toHaveBeenCalledWith({ project_id: 'p2' });
    expect(d3.callBridge).not.toHaveBeenCalled();
    const d4 = deps();
    await handleMcpRequest({ id: 102, method: 'tools/call', params: { name: 'search_assets', arguments: { query: '口播配乐', kind: 'audio' } } }, d4);
    expect(d4.searchAssets).toHaveBeenCalledWith({ query: '口播配乐', kind: 'audio' });
    await handleMcpRequest({ id: 1021, method: 'tools/call', params: { name: 'search_stock', arguments: { query: 'city night', kind: 'video' } } }, d4);
    expect(d4.searchStock).toHaveBeenCalledWith({ query: 'city night', kind: 'video' });
    const stockImport = { query: 'city night', kind: 'video', page: 1, limit: 12, assetId: 'px_1' };
    await handleMcpRequest({ id: 1022, method: 'tools/call', params: { name: 'import_stock', arguments: stockImport } }, d4);
    expect(d4.importStock).toHaveBeenCalledWith(stockImport);
    expect(d4.callBridge).not.toHaveBeenCalled();
    const d5 = deps();
    await handleMcpRequest({ id: 103, method: 'tools/call', params: { name: 'generate_speech', arguments: { text: '你好', voiceId: 'system:voice-1' } } }, d5);
    await handleMcpRequest({ id: 104, method: 'tools/call', params: { name: 'lip_sync', arguments: { audioUrl: 'https://cdn.example/s.mp3', sourceImageUrl: 'https://cdn.example/p.jpg' } } }, d5);
    await handleMcpRequest({ id: 105, method: 'tools/call', params: { name: 'list_voices', arguments: {} } }, d5);
    await handleMcpRequest({ id: 106, method: 'tools/call', params: { name: 'clone_voice', arguments: { audioAssetId: 'up_1', name: 'Mine', consentConfirmed: true } } }, d5);
    await handleMcpRequest({ id: 107, method: 'tools/call', params: { name: 'design_voice', arguments: { prompt: 'Warm, credible English narrator', language: 'en' } } }, d5);
    await handleMcpRequest({ id: 1071, method: 'tools/call', params: { name: 'delete_voice', arguments: { voiceId: 'voice_1' } } }, d5);
    expect(d5.generateSpeech).toHaveBeenCalledWith({ text: '你好', voiceId: 'system:voice-1' });
    expect(d5.lipSync).toHaveBeenCalledWith({ audioUrl: 'https://cdn.example/s.mp3', sourceImageUrl: 'https://cdn.example/p.jpg' });
    expect(d5.listVoices).toHaveBeenCalledWith({});
    expect(d5.cloneVoice).toHaveBeenCalledWith({ audioAssetId: 'up_1', name: 'Mine', consentConfirmed: true });
    expect(d5.designVoice).toHaveBeenCalledWith({ prompt: 'Warm, credible English narrator', language: 'en' });
    expect(d5.deleteVoice).toHaveBeenCalledWith({ voiceId: 'voice_1' });
    expect(d5.callBridge).not.toHaveBeenCalled();
    const d6 = deps();
    await handleMcpRequest({ id: 108, method: 'tools/call', params: { name: 'list_models', arguments: { kind: 'image' } } }, d6);
    await handleMcpRequest({ id: 109, method: 'tools/call', params: { name: 'generate_image', arguments: { prompt: 'ocean' } } }, d6);
    await handleMcpRequest({ id: 110, method: 'tools/call', params: { name: 'generate_video', arguments: { prompt: 'waves' } } }, d6);
    await handleMcpRequest({ id: 111, method: 'tools/call', params: { name: 'generate_music', arguments: { prompt: 'calm piano' } } }, d6);
    await handleMcpRequest({ id: 112, method: 'tools/call', params: { name: 'get_generation_jobs', arguments: { ids: ['ci1'] } } }, d6);
    expect(d6.listModels).toHaveBeenCalledWith({ kind: 'image' });
    expect(d6.generateImage).toHaveBeenCalledWith({ prompt: 'ocean' });
    expect(d6.generateVideo).toHaveBeenCalledWith({ prompt: 'waves' });
    expect(d6.generateMusic).toHaveBeenCalledWith({ prompt: 'calm piano' });
    expect(d6.getGenerationJobs).toHaveBeenCalledWith({ ids: ['ci1'] });
    expect(d6.callBridge).not.toHaveBeenCalled();
  });
  it('桥工具带 kind 对应超时过桥;未知工具 -32602', async () => {
    const d = deps();
    await handleMcpRequest({ id: 6, method: 'tools/call', params: { name: 'analyze_visual' } }, d);
    expect(d.callBridge).toHaveBeenCalledWith('analyze_visual', {}, 600_000);
    await handleMcpRequest({ id: 7, method: 'tools/call', params: { name: 'cut_narration', arguments: { ranges: [] } } }, d);
    expect(d.callBridge).toHaveBeenCalledWith('cut_narration', { ranges: [] }, 60_000);
    const r = await handleMcpRequest({ id: 8, method: 'tools/call', params: { name: 'nope' } }, d);
    expect(r!.error?.code).toBe(-32602);
  });
  it('get_state:过桥,快照文本直接作 content 正文(不裹 JSON),并带 skill 基线行(长会话跨发版也能收到更新信号)', async () => {
    const d = deps({ callBridge: vi.fn(async () => ({ ok: true, state: '<composition_state>\nX\n</composition_state>' })) });
    const r = await handleMcpRequest({ id: 9, method: 'tools/call', params: { name: 'get_state' } }, d);
    const content = (r!.result as { content: { text: string }[]; isError: boolean }).content;
    expect(content[0]!.text).toContain('<composition_state>');
    expect(content[0]!.text).toContain('Pireel workflow baseline:');
    // Channel-neutral by contract: Plugin bundles must NOT be told to run the standalone CLI.
    expect(content[0]!.text).not.toContain('npx skills');
    expect((r!.result as { isError: boolean }).isError).toBe(false);
  });
  it('桥失败(studio 没开)→ isError=true,正文带 hint', async () => {
    const d = deps({ callBridge: vi.fn(async () => ({ ok: false, error: 'studio_not_open', hint: 'open the tab' })) });
    const r = await handleMcpRequest({ id: 10, method: 'tools/call', params: { name: 'undo' } }, d);
    const result = r!.result as { content: { text: string }[]; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('studio_not_open');
  });
});

describe('BYO-brain 契约(brief → 外部生成 → apply,客户端无关)', () => {
  it('compose_block_brief:桥取上下文(compose_context)→ 服务端组装,agent 的 instruction 透传', async () => {
    const d = deps({ callBridge: vi.fn(async () => ({ ok: true, data: { block: { id: 'b1' }, theme: 'general' } })) });
    const r = await handleMcpRequest({ id: 11, method: 'tools/call', params: { name: 'compose_block_brief', arguments: { blockId: 'b1', instruction: '做张对比卡' } } }, d);
    expect(d.callBridge).toHaveBeenCalledWith('compose_context', { blockId: 'b1', instruction: '做张对比卡' }, 60_000);
    expect(d.assembleComposeBrief).toHaveBeenCalledWith({ block: { id: 'b1' }, theme: 'general' }, '做张对比卡');
    expect((r!.result as { isError: boolean }).isError).toBe(false);
    const tool = buildMcpTools().find((candidate) => candidate.name === 'compose_block_brief')!;
    expect((tool.inputSchema as { properties: Record<string, unknown> }).properties).toHaveProperty('durationSec');
    expect(tool.description).toContain('spoken beats');
    expect((tool.inputSchema as { properties: Record<string, unknown> }).properties).toHaveProperty('placement');
  });
  it('compose_block_brief 无 instruction 会打回;apply_block 直接过桥', async () => {
    const d = deps({ callBridge: vi.fn(async () => ({ ok: true, data: { block: { id: 'b2' } } })) });
    const invalid = await handleMcpRequest({ id: 13, method: 'tools/call', params: { name: 'compose_block_brief', arguments: { blockId: 'b2' } } }, d);
    expect((invalid!.result as { isError: boolean }).isError).toBe(true);
    expect(d.assembleComposeBrief).not.toHaveBeenCalled();
    await handleMcpRequest({ id: 15, method: 'tools/call', params: { name: 'apply_block', arguments: { blockId: 'b1', raw: 'x' } } }, d);
    expect(d.callBridge).toHaveBeenCalledWith('apply_block', { blockId: 'b1', raw: 'x' }, 60_000);
  });
  it('get_icons 服务端直答(BLOCK_SYSTEM 引用的同名工具在 MCP 面可用);桥上下文失败原样透传', async () => {
    const d = deps();
    await handleMcpRequest({ id: 17, method: 'tools/call', params: { name: 'get_icons', arguments: { names: ['trending-up'] } } }, d);
    expect(d.lookupIcons).toHaveBeenCalledWith(['trending-up'], undefined);
    expect(d.callBridge).not.toHaveBeenCalled();
    const d2 = deps({ callBridge: vi.fn(async () => ({ ok: false, error: 'studio_not_open' })) });
    const r = await handleMcpRequest({ id: 18, method: 'tools/call', params: { name: 'compose_block_brief', arguments: { instruction: 'x' } } }, d2);
    expect((r!.result as { isError: boolean }).isError).toBe(true);
    expect(d2.assembleComposeBrief).not.toHaveBeenCalled();
  });
  it('capture_frame:截帧回 image content(agent 的眼睛)', async () => {
    const d = deps({ callBridge: vi.fn(async () => ({ ok: true, summary: '已截取 3s 处画面', image: { data: 'AAAA', mimeType: 'image/jpeg' } })) });
    const r = await handleMcpRequest({ id: 20, method: 'tools/call', params: { name: 'capture_frame', arguments: { atSec: 3 } } }, d);
    const result = r!.result as { content: { type: string; data?: string }[]; isError: boolean };
    expect(result.isError).toBe(false);
    expect(result.content[0]!.type).toBe('image');
    expect(result.content[0]!.data).toBe('AAAA');
    const capture = buildMcpTools().find((t) => t.name === 'capture_frame')!;
    expect(capture.description).toContain('at most twice');
  });
  it('review_sequence:时序帧组回多个 image content', async () => {
    const d = deps({ callBridge: vi.fn(async () => ({
      ok: true,
      summary: '2 temporal checkpoints',
      data: { frames: [{ index: 0, atSec: 1 }, { index: 1, atSec: 2 }] },
      images: [
        { data: 'AAAA', mimeType: 'image/jpeg' },
        { data: 'BBBB', mimeType: 'image/jpeg' },
      ],
    })) });
    const r = await handleMcpRequest({ id: 201, method: 'tools/call', params: { name: 'review_sequence', arguments: { sceneIds: ['scene-1'] } } }, d);
    const result = r!.result as { content: { type: string; data?: string }[]; isError: boolean };
    expect(result.isError).toBe(false);
    expect(result.content.map((part) => part.type)).toEqual(['text', 'image', 'image']);
    expect(d.callBridge).toHaveBeenCalledWith('review_sequence', { sceneIds: ['scene-1'] }, 600_000);
    const review = buildMcpTools().find((tool) => tool.name === 'review_sequence')!;
    expect(review.description).toContain('TEMPORAL SEQUENCE');
  });
  it('MCP instructions 教 BYO 主路径', async () => {
    const r = await handleMcpRequest({ id: 19, method: 'initialize' }, deps());
    const ins = (r!.result as { instructions: string }).instructions;
    expect(ins).toContain('YOU ARE THE MODEL');
    expect(ins).toContain('compose_block_brief');
    expect(ins).toContain('general tools');
    expect(ins).not.toContain('submit_plan');
  });
});
