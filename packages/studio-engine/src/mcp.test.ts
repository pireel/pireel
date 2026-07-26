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
    callBridge: vi.fn(async () => ({ ok: true, summary: 'done' })),
    listFrames: vi.fn(() => [{ id: 'f1', title: 'F1', summary: 's' }]),
    readFrame: vi.fn((id: string) => ({ ok: true, summary: id, data: { playbook: 'PB' } })),
    readEditingGuide: vi.fn(() => ({ ok: true, data: { guide: 'G' } })),
    assembleComposeBrief: vi.fn((_d: Record<string, unknown>, instruction: string) => ({ ok: true, data: { system: 'SYS', prompt: `P:${instruction}` } })),
    assemblePlanBrief: vi.fn(() => ({ ok: true, data: { system: 'PSYS', prompt: 'PP' } })),
    lookupIcons: vi.fn(() => ({ ok: true, data: { icons: [], misses: [] } })),
    importMedia: vi.fn(async () => ({ ok: true, summary: 'imported', data: { projectId: 'p1' } })),
    createBrowserHandoff: vi.fn(async () => ({ ok: true, summary: 'handoff', data: { url: 'https://x/auth/handoff?code=c', project_id: 'p2' } })),
    createProject: vi.fn(async () => ({ ok: true, summary: 'created', data: { projectId: 'p3', title: 'New' } })),
    listProjects: vi.fn(async () => ({ ok: true, summary: '0', data: { projects: [], active: null } })),
    switchProject: vi.fn(async () => ({ ok: true, summary: 'switched', data: { projectId: 'p1' } })),
    renameProject: vi.fn(async () => ({ ok: true, summary: 'renamed', data: { projectId: 'p1', title: 'X' } })),
    listAssets: vi.fn(async () => ({ ok: true, summary: '1 assets in the library', data: { assets: [{ id: 'u1', kind: 'image', url: 'https://cdn.example/u1.png' }], project: {} } })),
    ...overrides,
  };
}

describe('MCP 工具面', () => {
  it('STUDIO_TOOLS 全量映射 + MCP 专属工具(registry 加工具这里自动长出来)', () => {
    const names = new Set(buildMcpTools().map((t) => t.name));
    // chatOnly 工具(review_visuals 这类外包眼睛)不出现在 MCP 面——外部 agent 有自己的眼睛(capture_frame)
    for (const d of STUDIO_TOOLS) expect(names.has(d.id)).toBe(!d.chatOnly);
    for (const extra of ['get_state', 'list_frames', 'compose_block_brief', 'apply_block', 'plan_brief', 'submit_plan', 'get_icons']) {
      expect(names.has(extra)).toBe(true);
    }
  });
  it('自家 LLM 收费工具在 MCP 面标注 credits 警示并指到 BYO 流(商业模式:编排+文本生成走用户订阅)', () => {
    const tools = buildMcpTools();
    for (const [id, byo] of [
      ['add_block', 'compose_block_brief'],
      ['edit_block', 'compose_block_brief'],
      ['add_graphics', 'compose_block_brief'],
      ['analyze_narration', 'plan_brief'],
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
  it('description 不引用 MCP 语境里不存在的机制(frame 目录经 list_frames,不在 system)', () => {
    const t = buildMcpTools().find((t) => t.name === 'attach_frame')!;
    expect(t.description).not.toContain('<frame_catalog>');
    expect(t.description).toContain('list_frames');
  });
  it('超时分档:card(浏览器里跑生成/分析)10 分钟,badge(即时)60 秒', () => {
    expect(bridgeTimeoutMs('add_graphics')).toBe(600_000);
    expect(bridgeTimeoutMs('move_block')).toBe(60_000);
  });
});

describe('MCP 协议处理', () => {
  it('initialize:回显协议版本,instructions 带字幕目录与 get_state 纪律', async () => {
    const r = await handleMcpRequest({ id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, deps());
    const result = r!.result as { protocolVersion: string; instructions: string; serverInfo: { name: string } };
    expect(result.protocolVersion).toBe('2025-03-26');
    expect(result.serverInfo.name).toBe('pireel-studio');
    expect(result.instructions).toContain('<caption_catalog>');
    expect(result.instructions).toContain('get_state');
  });
  it('通知返回 null(路由回 202);未知方法回 -32601', async () => {
    expect(await handleMcpRequest({ method: 'notifications/initialized' }, deps())).toBeNull();
    const r = await handleMcpRequest({ id: 2, method: 'resources/list' }, deps());
    expect(r!.error?.code).toBe(-32601);
  });
  it('服务端内容工具不过桥:read_editing_guide / read_frame / list_frames', async () => {
    const d = deps();
    await handleMcpRequest({ id: 3, method: 'tools/call', params: { name: 'read_editing_guide' } }, d);
    await handleMcpRequest({ id: 4, method: 'tools/call', params: { name: 'read_frame', arguments: { frame_id: 'f1' } } }, d);
    await handleMcpRequest({ id: 5, method: 'tools/call', params: { name: 'list_frames' } }, d);
    expect(d.callBridge).not.toHaveBeenCalled();
    expect(d.readEditingGuide).toHaveBeenCalled();
    expect(d.readFrame).toHaveBeenCalledWith('f1');
    // 服务端直答集合与 dispatch 的特判保持同步
    expect([...MCP_SERVER_TOOL_IDS].sort()).toEqual(['create_browser_handoff', 'create_project', 'get_icons', 'import_media', 'list_assets', 'list_frames', 'list_projects', 'read_editing_guide', 'read_frame', 'rename_project', 'switch_project']);
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
  });
  it('桥工具带 kind 对应超时过桥;未知工具 -32602', async () => {
    const d = deps();
    await handleMcpRequest({ id: 6, method: 'tools/call', params: { name: 'lay_out' } }, d);
    expect(d.callBridge).toHaveBeenCalledWith('lay_out', {}, 600_000);
    await handleMcpRequest({ id: 7, method: 'tools/call', params: { name: 'cut_narration', arguments: { ranges: [] } } }, d);
    expect(d.callBridge).toHaveBeenCalledWith('cut_narration', { ranges: [] }, 60_000);
    const r = await handleMcpRequest({ id: 8, method: 'tools/call', params: { name: 'nope' } }, d);
    expect(r!.error?.code).toBe(-32602);
  });
  it('get_state:过桥,快照文本直接作 content 正文(不裹 JSON)', async () => {
    const d = deps({ callBridge: vi.fn(async () => ({ ok: true, state: '<composition_state>\nX\n</composition_state>' })) });
    const r = await handleMcpRequest({ id: 9, method: 'tools/call', params: { name: 'get_state' } }, d);
    const content = (r!.result as { content: { text: string }[]; isError: boolean }).content;
    expect(content[0]!.text).toContain('<composition_state>');
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
  });
  it('compose_block_brief:占位自带设计规格,无 instruction 也能出简报;两者皆无则打回', async () => {
    const d = deps({ callBridge: vi.fn(async () => ({ ok: true, data: { block: { id: 'p1' }, suggested_instruction: 'component: kpi …' } })) });
    await handleMcpRequest({ id: 12, method: 'tools/call', params: { name: 'compose_block_brief', arguments: { blockId: 'p1' } } }, d);
    expect(d.assembleComposeBrief).toHaveBeenCalledWith(expect.anything(), 'component: kpi …');
    const d2 = deps({ callBridge: vi.fn(async () => ({ ok: true, data: { block: { id: 'b2' } } })) });
    const r2 = await handleMcpRequest({ id: 13, method: 'tools/call', params: { name: 'compose_block_brief', arguments: {} } }, d2);
    expect((r2!.result as { isError: boolean }).isError).toBe(true);
    expect(d2.assembleComposeBrief).not.toHaveBeenCalled();
  });
  it('plan_brief:桥取 plan_context → 服务端组装;apply_block/submit_plan 过桥', async () => {
    const d = deps({ callBridge: vi.fn(async () => ({ ok: true, data: { sentences: [] } })) });
    await handleMcpRequest({ id: 14, method: 'tools/call', params: { name: 'plan_brief' } }, d);
    expect(d.callBridge).toHaveBeenCalledWith('plan_context', {}, 60_000);
    expect(d.assemblePlanBrief).toHaveBeenCalled();
    await handleMcpRequest({ id: 15, method: 'tools/call', params: { name: 'apply_block', arguments: { blockId: 'b1', raw: 'x' } } }, d);
    expect(d.callBridge).toHaveBeenCalledWith('apply_block', { blockId: 'b1', raw: 'x' }, 60_000);
    await handleMcpRequest({ id: 16, method: 'tools/call', params: { name: 'submit_plan', arguments: { plan: '{}' } } }, d);
    expect(d.callBridge).toHaveBeenCalledWith('submit_plan', { plan: '{}' }, 60_000);
  });
  it('get_icons 服务端直答(BLOCK_SYSTEM 引用的同名工具在 MCP 面可用);桥上下文失败原样透传', async () => {
    const d = deps();
    await handleMcpRequest({ id: 17, method: 'tools/call', params: { name: 'get_icons', arguments: { names: ['trending-up'] } } }, d);
    expect(d.lookupIcons).toHaveBeenCalledWith(['trending-up'], undefined);
    expect(d.callBridge).not.toHaveBeenCalled();
    const d2 = deps({ callBridge: vi.fn(async () => ({ ok: false, error: 'studio_not_open' })) });
    const r = await handleMcpRequest({ id: 18, method: 'tools/call', params: { name: 'plan_brief' } }, d2);
    expect((r!.result as { isError: boolean }).isError).toBe(true);
    expect(d2.assemblePlanBrief).not.toHaveBeenCalled();
  });
  it('capture_frame:截帧回 image content(agent 的眼睛)', async () => {
    const d = deps({ callBridge: vi.fn(async () => ({ ok: true, summary: '已截取 3s 处画面', image: { data: 'AAAA', mimeType: 'image/jpeg' } })) });
    const r = await handleMcpRequest({ id: 20, method: 'tools/call', params: { name: 'capture_frame', arguments: { atSec: 3 } } }, d);
    const result = r!.result as { content: { type: string; data?: string }[]; isError: boolean };
    expect(result.isError).toBe(false);
    expect(result.content[0]!.type).toBe('image');
    expect(result.content[0]!.data).toBe('AAAA');
    expect(new Set(buildMcpTools().map((t) => t.name)).has('capture_frame')).toBe(true);
  });
  it('MCP instructions 教 BYO 主路径', async () => {
    const r = await handleMcpRequest({ id: 19, method: 'initialize' }, deps());
    const ins = (r!.result as { instructions: string }).instructions;
    expect(ins).toContain('YOU ARE THE MODEL');
    expect(ins).toContain('compose_block_brief');
    expect(ins).toContain('submit_plan');
  });
});
