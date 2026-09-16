import { describe, expect, it, vi } from 'vitest';
import { V3_TOOLS } from './agent-surface-v3/registry';
import { TAB_CANNOT_SERVE_ERRORS } from './prompts';
import {
  type McpDeps,
  MCP_SERVER_TOOL_IDS,
  bridgeTimeoutMs,
  buildMcpTools,
  handleMcpRequest,
  runV3Tool,
} from './mcp';

function deps(overrides: Partial<McpDeps> = {}): McpDeps {
  return {
    skillVersion: '2099-01-01.1',
    callBridge: vi.fn(async (tool: string) => (tool === 'run_v3' ? { ok: false, error: 'studio_not_open' } : { ok: true, summary: 'done' })),
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
    generateSfx: vi.fn(async () => ({ ok: true, summary: 'sfx generated', data: { asset: { id: 'cs1', url: 'https://cdn.example/s.mp3' } } })),
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

describe('MCP v3 surface', () => {
  it('passes exact resolved catalog locators into the live placement transaction', async () => {
    const assets = [{ id: 'bgm:test', kind: 'audio', url: 'https://cdn.example/music.mp3', durationSec: 5 }];
    const d = deps({ resolvePlacementAssets: vi.fn(async () => assets), callBridge: vi.fn(async () => ({ ok: true })) });
    const args = { clips: [{ assetId: 'bgm:test', startFrame: 0, role: 'music', source: [0, 5] }] };
    expect(await runV3Tool('add_clips', args, d)).toMatchObject({ ok: true });
    expect(d.resolvePlacementAssets).toHaveBeenCalledWith(['bgm:test']);
    expect(d.callBridge).toHaveBeenCalledWith('run_v3', { name: 'add_clips', args, placementAssets: assets }, expect.any(Number));
  });

  it('registers catalog assets before offline placement after the live fallback declines', async () => {
    const assets = [{ id: 'bgm:test', kind: 'audio', url: 'https://cdn.example/music.mp3', durationSec: 5 }];
    const d = deps({ resolvePlacementAssets: vi.fn(async () => assets), resolveV3Context: async () => ({ fps: 30, kindOf: () => undefined }) });
    expect(await runV3Tool('add_clips', { clips: [{ assetId: 'bgm:test', startFrame: 0, role: 'music', source: [0, 5] }] }, d)).toMatchObject({ ok: true });
    expect(vi.mocked(d.callBridge).mock.calls.map(call => call[0])).toEqual(['run_v3', 'register_media', 'add_clips']);
  });

  it('rejects invalid model kinds without contacting either the catalog or browser', async () => {
    const d = deps();
    expect(await runV3Tool('list_models', { kind: 'audio' }, d)).toMatchObject({ ok: false, error: 'invalid_value', path: 'kind' });
    expect(d.listModels).not.toHaveBeenCalled();
    expect(d.callBridge).not.toHaveBeenCalled();
  });
  const v3ctx = async () => ({ fps: 30, kindOf: (id: string) => (id.startsWith('g') ? 'graphic' as const : id.startsWith('a') ? 'audio' as const : 'narrative' as const) });

  it('assembles the offline component brief and returns frame-based apply_component targets', async () => {
    const placement = { xPct: 5, yPct: 60, widthPct: 70, heightPct: 20 };
    const d = deps({ resolveV3Context: v3ctx,
      callBridge: vi.fn(async (tool) => tool === 'run_v3' ? { ok: false, error: 'studio_not_open' } : { ok: true, data: { block: { id: 'gNew' }, atSec: 2, durationSec: 3, placement } }),
      assembleComposeBrief: vi.fn((data, instruction) => ({ ok: true, data: { system: 'SYS', prompt: instruction, target: { blockId: 'gNew', atSec: data.atSec, durationSec: data.durationSec, placement } } })),
    });
    const response = await handleMcpRequest({ id: 1, method: 'tools/call', params: { name: 'compose_component', arguments: { instruction: 'lower third', atFrame: 60, durationFrames: 90, placement, format: 'html' } } }, d);
    const result = JSON.parse((response!.result as { content: { text: string }[] }).content[0]!.text);
    expect(result).toMatchObject({ ok: true, data: { system: 'SYS', prompt: 'lower third', target: { clipId: 'gNew', atFrame: 60, durationFrames: 90, placement } } });
    expect(result.data.target).not.toHaveProperty('blockId');
    expect(d.callBridge).toHaveBeenLastCalledWith('compose_context', expect.objectContaining({ atSec: 2, durationSec: 3, instruction: 'lower third', format: 'html' }), expect.any(Number));
    expect(d.assembleComposeBrief).toHaveBeenCalledWith(expect.objectContaining({ format: 'html' }), 'lower third');
  });

  it('preserves offline component context failures instead of assembling a missing target', async () => {
    const d = deps({ resolveV3Context: v3ctx, callBridge: vi.fn(async () => ({ ok: false, error: 'studio_not_open' })) });
    const response = await handleMcpRequest({ id: 1, method: 'tools/call', params: { name: 'compose_component', arguments: { instruction: 'lower third' } } }, d);
    expect(JSON.parse((response!.result as { content: { text: string }[] }).content[0]!.text)).toMatchObject({ ok: false, error: 'studio_not_open' });
    expect(d.assembleComposeBrief).not.toHaveBeenCalled();
  });

  it('always lists only the consolidated public tools', async () => {
    const legacy = await handleMcpRequest({ id: 1, method: 'tools/list' }, deps());
    const v3 = await handleMcpRequest({ id: 2, method: 'tools/list' }, deps({ resolveV3Context: v3ctx }));
    const legacyNames = (legacy!.result as { tools: { name: string }[] }).tools.map((t) => t.name);
    const v3Names = (v3!.result as { tools: { name: string }[] }).tools.map((t) => t.name);
    expect(legacyNames).toEqual(v3Names);
    expect(v3Names).not.toContain('set_shot_treatment');
    expect(v3Names).toEqual(expect.arrayContaining(['get_state', 'set_clip_framing', 'ripple_delete_ranges', 'manage_project']));
    expect(v3Names).not.toContain('generate_foley'); // chat-only stays off MCP
    expect(v3Names.length).toBe(V3_TOOLS.filter((tool) => !tool.chatOnly).length); // every v3 tool except the chat-only ones
  });

  it('sends v3 calls to the live tab as one run_v3 bridge call when a tab is open', async () => {
    const callBridge = vi.fn(async () => ({ ok: true, summary: 'moved', data: { steps: [], delta: { shifted: [] } } }));
    const d = deps({ resolveV3Context: v3ctx, callBridge });
    await handleMcpRequest({ id: 30, method: 'tools/call', params: { name: 'move_clips', arguments: { items: [{ clipId: 'n1', startFrame: 90 }] } } }, d);
    expect(callBridge).toHaveBeenCalledTimes(1);
    expect(callBridge).toHaveBeenCalledWith('run_v3', { name: 'move_clips', args: { items: [{ clipId: 'n1', startFrame: 90 }] } }, expect.any(Number));
  });

  it('serves project navigation and handoff on the server when the open tab declines them', async () => {
    // The tab runs the same tool table but edits one open document: it owns no account-level
    // capability. Before this, an open tab turned those calls into a hard failure for an MCP
    // client — the very tools an agent needs to start a project or open the editor.
    const callBridge = vi.fn(async (_tool: string, input: unknown) => {
      const name = (input as { name?: string }).name;
      // The codes come from the engine, not from a copy here: a rename must break this test rather
      // than leave it green while the real handoff stops working.
      if (name === 'manage_project') return { ok: false, error: TAB_CANNOT_SERVE_ERRORS.projectNav };
      if (name === 'create_browser_handoff') return { ok: false, error: TAB_CANNOT_SERVE_ERRORS.handoff };
      return { ok: true, summary: 'done' };
    });
    const d = deps({ resolveV3Context: v3ctx, callBridge });

    const created = await handleMcpRequest({ id: 40, method: 'tools/call', params: { name: 'manage_project', arguments: { scope: 'project', action: 'create', title: 'T' } } }, d);
    expect(d.createProject).toHaveBeenCalledWith({ title: 'T' });
    expect(JSON.parse((created!.result as { content: { text: string }[] }).content[0]!.text)).toMatchObject({ ok: true });

    await handleMcpRequest({ id: 41, method: 'tools/call', params: { name: 'create_browser_handoff', arguments: {} } }, d);
    expect(d.createBrowserHandoff).toHaveBeenCalled();

    // An ordinary edit the tab declines for its own reasons is still the tab's answer.
    const refused = vi.fn(async () => ({ ok: false, error: 'locked track' }));
    const d2 = deps({ resolveV3Context: v3ctx, callBridge: refused });
    const body = await handleMcpRequest({ id: 42, method: 'tools/call', params: { name: 'move_clips', arguments: { items: [{ clipId: 'n1', startFrame: 90 }] } } }, d2);
    expect(refused).toHaveBeenCalledTimes(1);
    expect(JSON.parse((body!.result as { content: { text: string }[] }).content[0]!.text)).toMatchObject({ ok: false, error: 'locked track' });
  });

  it.each([
    ['manage_frame', { action: 'list' }, 'listFrames', undefined],
    ['manage_frame', { action: 'read', id: 'f1' }, 'readFrame', 'f1'],
    ['read_skill', { id: 'visual-craft' }, 'readSkill', 'visual-craft'],
    ['list_models', { kind: 'all' }, 'listModels', { kind: 'all' }],
    ['list_skills', {}, 'listSkills', {}],
    ['manage_voices', { action: 'list' }, 'listVoices', {}],
    ['get_icons', { names: ['play'] }, 'lookupIcons', ['play']],
    ['import_media', {}, 'importMedia', {}],
    ['create_browser_handoff', { project_id: 'p1' }, 'createBrowserHandoff', { project_id: 'p1' }],
    ['generate_image', { prompt: 'test' }, 'generateImage', { prompt: 'test' }],
    ['generate_video', { prompt: 'test' }, 'generateVideo', { prompt: 'test' }],
    ['generate_speech', { text: 'test', voiceId: 'v1' }, 'generateSpeech', { text: 'test', voiceId: 'v1' }],
    ['generate_audio', { kind: 'music', prompt: 'test' }, 'generateMusic', { prompt: 'test' }],
    ['generate_audio', { kind: 'sfx', prompt: 'test' }, 'generateSfx', { prompt: 'test' }],
    ['search_assets', { scope: 'official', kind: 'video' }, 'listAssets', { scope: 'official', kind: 'video' }],
    ['search_assets', { scope: 'cloud', query: 'city' }, 'searchAssets', { scope: 'cloud', query: 'city' }],
    ['search_assets', { scope: 'stock', query: 'ocean', kind: 'video' }, 'searchStock', { query: 'ocean', kind: 'video' }],
    ['inspect_media', { mode: 'generation', ids: ['job1'] }, 'getGenerationJobs', { ids: ['job1'] }],
    ['manage_project', { scope: 'project', action: 'create', title: 'New' }, 'createProject', { title: 'New' }],
  ])('routes %s %j to its account service without sending it to the tab', async (name, args, handler, input) => {
    // The live browser can return an unknown operation OR a plausible but wrong empty catalog.
    const callBridge = vi.fn(async () => ({ ok: true, summary: 'empty browser catalog', data: { assets: [], models: [] } }));
    const resolveV3Context = vi.fn(v3ctx);
    const d = deps({ resolveV3Context, callBridge });
    const response = await handleMcpRequest({ id: 43, method: 'tools/call', params: { name, arguments: args } }, d);
    expect((response!.result as { isError: boolean }).isError).toBe(false);
    if (input === undefined) expect(d[handler as keyof McpDeps]).toHaveBeenCalledWith();
    else if (handler === 'lookupIcons') expect(d.lookupIcons).toHaveBeenCalledWith(input, undefined);
    else expect(d[handler as keyof McpDeps]).toHaveBeenCalledWith(input);
    expect(callBridge).not.toHaveBeenCalled();
    expect(resolveV3Context).not.toHaveBeenCalled();
  });

  it.each([
    ['search_assets', { scope: 'mine' }],
    ['search_assets', { scope: 'mine', query: 'local' }],
    ['manage_project', { scope: 'output', action: 'duplicate', title: 'Copy' }],
    ['manage_frame', { action: 'attach', id: 'f1' }],
    ['register_media', { assets: [{ id: 'a1', kind: 'image', url: 'https://example.com/a.png' }] }],
  ])('keeps document-owned %s %j on the live tab', async (name, args) => {
    const callBridge = vi.fn(async () => ({ ok: true, summary: 'live result' }));
    const d = deps({ callBridge });
    await handleMcpRequest({ id: 44, method: 'tools/call', params: { name, arguments: args } }, d);
    expect(callBridge).toHaveBeenCalledExactlyOnceWith('run_v3', { name, args }, expect.any(Number));
  });

  it('preserves every image and its frame metadata across offline multi-step captures', async () => {
    const callBridge = vi.fn(async (tool: string, input: Record<string, unknown>) => tool === 'run_v3'
      ? { ok: false, error: 'studio_not_open' }
      : { ok: true, image: { data: `frame-${input.atSec}`, mimeType: 'image/jpeg' }, data: { atSec: input.atSec } });
    const d = deps({ resolveV3Context: v3ctx, callBridge });
    const response = await handleMcpRequest({ id: 45, method: 'tools/call', params: { name: 'inspect_timeline', arguments: { frames: [60, 210] } } }, d);
    const content = (response!.result as { content: Array<{ type: string; data?: string; text?: string }> }).content;
    expect(content.filter((item) => item.type === 'image').map((item) => item.data)).toEqual(['frame-2', 'frame-7']);
    expect(JSON.parse(content[0]!.text!).data.steps.map((step: { data: unknown }) => step.data)).toEqual([{ atSec: 2 }, { atSec: 7 }]);
  });

  it('translates frame-based v3 calls onto legacy seconds and routes by clip kind', async () => {
    const d = deps({ resolveV3Context: v3ctx });
    const response = await handleMcpRequest({ id: 3, method: 'tools/call', params: { name: 'move_clips', arguments: { items: [{ clipId: 'n1', startFrame: 90 }, { clipId: 'g1', startFrame: 120 }] } } }, d);
    expect(d.callBridge).toHaveBeenNthCalledWith(1, 'run_v3', expect.anything(), expect.any(Number));
    expect(d.callBridge).toHaveBeenNthCalledWith(2, 'move_clips', { items: [{ clipId: 'n1', startSec: 3 }] }, expect.any(Number));
    expect(d.callBridge).toHaveBeenNthCalledWith(3, 'move_block', { blockId: 'g1', startSec: 4 }, expect.any(Number));
    const body = JSON.parse((response!.result as { content: { text: string }[] }).content[0]!.text) as { ok: boolean; data: { steps: unknown[] } };
    expect(body.ok).toBe(true);
    expect(body.data.steps).toHaveLength(2);
  });

  it('chains a stock import into live register_media using the previous result', async () => {
    const callBridge = vi.fn(async (tool: string) => tool === 'run_v3'
      ? { ok: false, error: 'unexpected browser stock import' }
      : { ok: true, summary: 'registered' });
    const d = deps({ resolveV3Context: v3ctx, callBridge });
    const payload = { query: 'city night', kind: 'video', page: 1, limit: 12, assetId: 'px_1' };
    await handleMcpRequest({ id: 4, method: 'tools/call', params: { name: 'register_media', arguments: { stock: payload } } }, d);
    expect(d.importStock).toHaveBeenCalledWith(payload);
    expect(callBridge).toHaveBeenCalledTimes(1);
    expect(d.callBridge).toHaveBeenCalledWith('register_media', { assets: [{ id: 'up_1', kind: 'image', url: 'https://cdn.example/stock.jpg' }] }, expect.any(Number));
  });

  it('returns the adapter error shape and never calls the engine on bad input', async () => {
    const d = deps({  });
    const response = await handleMcpRequest({ id: 5, method: 'tools/call', params: { name: 'ripple_delete_ranges', arguments: { ranges: [[30, 60]] } } }, d);
    const body = JSON.parse((response!.result as { content: { text: string }[] }).content[0]!.text) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: false, error: 'fps_unavailable' });
    expect((d.callBridge as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0])).toEqual(['run_v3']);
    expect((response!.result as { isError: boolean }).isError).toBe(true);
  });

  it('stops a multi-step call at the first failure and reports what was applied', async () => {
    const callBridge = vi.fn(async (tool: string) => (tool === 'run_v3' ? { ok: false, error: 'studio_not_open' } : tool === 'delete_blocks' ? { ok: true, summary: 'blocks gone' } : { ok: false, error: 'locked track' }));
    const d = deps({ resolveV3Context: v3ctx, callBridge });
    const response = await handleMcpRequest({ id: 6, method: 'tools/call', params: { name: 'remove_clips', arguments: { clipIds: ['g1', 'n1'] } } }, d);
    const body = JSON.parse((response!.result as { content: { text: string }[] }).content[0]!.text) as { ok: boolean; error: string; detail: string; data: { steps: { tool: string; ok: boolean }[] } };
    expect(body.ok).toBe(false);
    expect(body.error).toBe('locked track');
    expect(body.detail).toContain('after 1 completed step');
    expect(body.data.steps.map((step) => [step.tool, step.ok])).toEqual([['delete_blocks', true], ['remove_clips', false]]);
  });

  it('rejects old protocol names without executing aliases', async () => {
    const d = deps();
    const response = await handleMcpRequest({ id: 1, method: 'tools/call', params: { name: 'move_block', arguments: { blockId: 'g1', startSec: 1 } } }, d);
    expect(JSON.parse((response!.result as { content: { text: string }[] }).content[0]!.text)).toMatchObject({ ok: false, error: 'unknown_tool' });
    expect(d.callBridge).not.toHaveBeenCalled();
  });
  it('rejects internal chat-only commands that are not in the public MCP catalog', async () => {
    const d = deps();
    for (const name of ['generate_foley', 'run_v3']) {
      const response = await handleMcpRequest({ id: 1, method: 'tools/call', params: { name, arguments: {} } }, d);
      expect(JSON.parse((response!.result as { content: { text: string }[] }).content[0]!.text)).toMatchObject({ ok: false, error: 'unknown_tool' });
    }
    expect(d.callBridge).not.toHaveBeenCalled();
  });
  it('initializes the v3 contract and handles protocol notifications', async () => {
    const init = await handleMcpRequest({ id: 1, method: 'initialize', params: { protocolVersion: 'test-protocol' } }, deps());
    expect(init!.result).toMatchObject({ protocolVersion: 'test-protocol' });
    expect((init!.result as { instructions: string }).instructions).toContain('get_state');
    expect(await handleMcpRequest({ method: 'notifications/initialized' }, deps())).toBeNull();
    expect((await handleMcpRequest({ id: 2, method: 'unknown' }, deps()))!.error?.code).toBe(-32601);
    expect((await handleMcpRequest({ id: 3, method: 'ping' }, deps()))!.result).toEqual({});
  });
});
