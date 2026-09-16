/**
 * Studio's MCP server core (pure functions, zero I/O) — external agents (Codex / Claude Code)
 * drive studio's full editing toolset with their own models via /api/studio/mcp.
 *
 * Business-model cornerstone: LLM orchestration burns the user's own Codex/Claude subscription (this endpoint
 * bypasses the credits gate); block generation (add_block etc.) still bounces through the browser to
 * /api/studio/compose on the existing session billing — generation still charges, orchestration is free.
 *
 * Architecture: the tool surface reuses STUDIO_TOOLS verbatim (same table as internal chat, so adding a tool
 * to the registry grows one here automatically); execution forwards through the StudioBridge DO back to the open
 * studio tab (bridge-do.ts's header comment explains why it's a bridge, not server-side execution). Only content
 * tools are answered directly on the server: read_editing_guide / read_frame (body lives only on the server) +
 * MCP-only list_frames. get_state goes over the bridge (state is in the browser) — MCP has no mechanism to inject
 * a snapshot into the system prompt, so this fills the gap.
 *
 * Protocol: the stateless subset of MCP streamable HTTP (single request → single JSON response, no SSE/session
 * headers). Compatible with both Codex's and Claude Code's HTTP transports. This file does no auth / doesn't touch
 * the DO — that's the routing layer's job, injected via McpDeps so vitest can pin the contract directly.
 */

import { translateV3Call, type V3AdapterContext, type LegacyCall } from './agent-surface-v3/adapter';
import { describeStepFailure } from './agent-surface-v3/receipt-errors';
import { V3_RETIRED_TOOL_IDS, V3_TOOL_IDS, V3_TOOLS, v3ReplacementIndex } from './agent-surface-v3/registry';
import { V3_TOOL_SCHEMAS } from './agent-surface-v3/schemas';
import { v3Instructions } from './agent-surface-v3/instructions';
import { STUDIO_TOOL_MAP, TAB_CANNOT_SERVE_ERRORS } from './prompts';
import { searchFontsTool } from './font-search-tool';

/* ============================ JSON-RPC shapes ============================ */

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

/* ============================ Dependency injection ============================ */

/** Bridge return (the browser runStudioTool's StudioToolResult + get_state's state). */
export interface McpBridgeResult {
  ok: boolean;
  summary?: string;
  error?: string;
  data?: unknown;
  state?: string;
  [k: string]: unknown;
}

export interface McpDeps {
  /** Skill baseline announced in initialize.instructions — an opaque release tag (clients
   *  update on mismatch, not ordering; each release must announce a distinct string). The
   *  hosting route derives it from the shipped skill's VERSION file — the single source. */
  skillVersion: string;
  /** How this client installed Pireel. `plugin` bundles have a host that owns updates, so the
   *  workflow-baseline reminder is skipped for them; anything else (manual MCP registration, a
   *  standalone Skill) has no update mechanism and still gets it. The hosting route reads it from
   *  a request header the generated plugin manifests set; absent means standalone. */
  distribution?: 'plugin' | 'standalone';
  /** Optional private foundational editing judgment injected by the host into initialize instructions. */
  editingExpertise?: string;
  /** v3 only: fps of the active output and a clip-id → kind resolver, read from the latest project
   *  document. Without it every frame-based v3 call fails with `fps_unavailable`. */
  resolveV3Context?: () => Promise<V3AdapterContext>;
  /** Execute over the bridge (routing layer = StudioBridge DO stub fetch /call). */
  callBridge: (tool: string, input: Record<string, unknown>, timeoutMs: number) => Promise<McpBridgeResult>;
  /** Bytes of a captured frame the browser stored in the user's cloud media space (routing layer =
   *  the object store, after an ownership check). Without it, keyed frames are reported as unavailable. */
  readFrameImage?: (key: string) => Promise<{ data: string; mimeType: string } | null>;
  /** Frame catalog (routing layer = frameRegistry.list()). */
  listFrames: () => { id: string; title: string; summary: string }[];
  /** Account-scoped Studio Skill catalog and full playbook lookup. Catalog metadata is
   *  lightweight; private instructions are returned only by an explicit read. */
  listSkills: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  readSkill: (skillId: string) => Promise<McpBridgeResult>;
  /** Frame playbook body (routing layer = frameRegistry.get). */
  readFrame: (frameId: string) => McpBridgeResult;
  /** A-roll editing guide body (routing layer = AROLL_GUIDE). */
  readEditingGuide: () => McpBridgeResult;
  /** BYO block brief: bridge-returned compose context + the agent's instruction → {system,prompt} (routing layer = briefs.assembleComposeBrief + frameRegistry). */
  assembleComposeBrief: (bridgeData: Record<string, unknown>, instruction: string) => McpBridgeResult;
  /** Icon lookup (routing layer = icons.lookupIcons) — get_icons, referenced by BLOCK_SYSTEM in BYO generation, is available under the same name on the MCP surface. */
  lookupIcons: (names: string[], kind?: string) => McpBridgeResult;
  /** Local media import registration. Main video and images rendezvous with the open tab and remain
   *  device-local; cloud-backed audio/B-roll attach their verified object metadata to the project. */
  importMedia: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** Browser session handoff (routing layer = store one-time code + build /auth/handoff URL): the agent uses it
   *  to get a logged-in studio tab in its own built-in browser — the execution surface for bridge tools. */
  createBrowserHandoff: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** Create a new empty project (routing layer = write a studioProjects row, comp=emptyComposition). A new project is the "most recent" →
   *  becomes the offline active project. No browser. */
  createProject: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** List the current user's projects (routing layer = query studioProjects, lightweight metadata; most recent first = offline active project). */
  listProjects: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** Switch active project (routing layer verifies ownership and pins the editing session to it, then returns its state). */
  switchProject: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** Rename a project's title (routing layer = update title where id+userId). */
  renameProject: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** Asset library enumeration (routing layer = query user_uploads role=general + the active project's sources).
   *  Server-direct so it works with the tab closed too. */
  listAssets: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** Natural-language metadata search across local-index/cloud/official library scopes.
   *  Server-direct so external agents do not need an open Studio tab. */
  searchAssets: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** Resolve exact catalog IDs on placement, including after the search tab/session is gone. */
  resolvePlacementAssets?: (ids: string[]) => Promise<Array<Record<string, unknown>>>;
  /** Search provider-backed online stock, then durably import one exact returned result.
   *  Both operations are server-direct and preserve source/license metadata. */
  searchStock: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  importStock: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** Hosted generation catalog and tasks, server-direct so Studio need not be open. */
  listModels: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  generateImage: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  generateVideo: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  generateMusic: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** Text-to-sound-effect primitive (server-direct; the picture-synchronous generate_foley stays chat-only). */
  generateSfx: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  getGenerationJobs: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** Hosted TTS, server-direct so Studio need not be open. */
  generateSpeech: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** Voice inventory, design and cloning lifecycle, server-direct so Studio need not be open. */
  listVoices: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  cloneVoice: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  designVoice: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  deleteVoice: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** Hosted asynchronous lip-sync generation in the active project's generation space. */
  lipSync: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
}

/* ============================ Tool surface ============================ */

/** Tools answered directly on the server (body only on server / pure catalog / direct cloud-state ops): no bridge. */
export const MCP_SERVER_TOOL_IDS = new Set(['read_editing_guide', 'read_frame', 'list_frames', 'list_skills', 'read_skill', 'get_icons', 'search_fonts', 'import_media', 'create_browser_handoff', 'create_project', 'list_projects', 'switch_project', 'rename_project', 'list_assets', 'search_assets', 'search_stock', 'import_stock', 'list_models', 'generate_image', 'generate_video', 'generate_music', 'generate_sfx', 'get_generation_jobs', 'list_voices', 'clone_voice', 'design_voice', 'delete_voice', 'generate_speech', 'lip_sync']);

/** MCP-only bridge tools (not in STUDIO_TOOLS, invisible to internal chat):
 *  get_state=state snapshot; apply_block=the validate-and-place surface for BYO generation output;
 *  capture_frame=one-moment visual verification; review_sequence=whole-Scene temporal verification
 *  (both return captured frames as image content so the agent can "see" its own edits).
 *  compose_block_brief is a "bridge-fetch context + server-assemble" composite tool, dispatched separately. */
export const MCP_BRIDGE_EXTRA_TOOL_IDS = new Set(['get_state', 'apply_block', 'capture_frame', 'review_sequence', 'visual_brief', 'submit_visual', 'run_v3',
  // Internal target of v3 set_clip_properties.props: a deterministic patch of a bespoke component's editable properties. Never advertised on its own.
  'set_block_props']);

/** Brief composite tools → bridge context-operation names (implemented browser-side in runExternalTool). */
export const MCP_BRIEF_TOOLS: Record<string, string> = {
  compose_block_brief: 'compose_context',
};

/** Bridge timeout for slow tools (generation/analysis in the browser, minutes-scale); instant ops get 60s. */
const CARD_TIMEOUT_MS = 600_000;
const BADGE_TIMEOUT_MS = 60_000;

export function bridgeTimeoutMs(toolId: string): number {
  if (toolId === 'visual_brief' || toolId === 'review_sequence') return CARD_TIMEOUT_MS; // multi-frame work can take minutes; don't cap it at extra's 60s
  return STUDIO_TOOL_MAP[toolId]?.kind === 'card' ? CARD_TIMEOUT_MS : BADGE_TIMEOUT_MS;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/* ============================ Protocol handling ============================ */

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_SERVER_INFO = { name: 'pireel-studio', version: '1.0.0' };

function rpcResult(id: JsonRpcRequest['id'], result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, result };
}
function rpcError(id: JsonRpcRequest['id'], code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

interface FrameImageRef { data?: unknown; key?: unknown; mimeType?: unknown }

/** Resolve keyed frames to bytes so the agent receives image content; frames that cannot be read are dropped
 *  and counted, never sent as a bare key the agent cannot open. */
export async function hydrateFrameImages(r: McpBridgeResult, deps: Pick<McpDeps, 'readFrameImage'>): Promise<McpBridgeResult> {
  const resolve = async (image: unknown): Promise<{ data: string; mimeType: string } | null> => {
    if (!image || typeof image !== 'object') return null;
    const ref = image as FrameImageRef;
    const mimeType = typeof ref.mimeType === 'string' ? ref.mimeType : 'image/jpeg';
    if (typeof ref.data === 'string' && ref.data) return { data: ref.data, mimeType };
    if (typeof ref.key === 'string' && ref.key && deps.readFrameImage) {
      const read = await deps.readFrameImage(ref.key).catch(() => null);
      if (read) return { data: read.data, mimeType: read.mimeType || mimeType };
    }
    return null;
  };
  if (!r.ok) return r;
  const out: McpBridgeResult = { ...r };
  let unavailable = 0;
  if (Array.isArray(r.images)) {
    const resolved = await Promise.all(r.images.map(resolve));
    unavailable += resolved.filter((image) => !image).length;
    out.images = resolved.filter((image): image is { data: string; mimeType: string } => !!image);
  }
  if (r.image) {
    const resolved = await resolve(r.image);
    if (resolved) out.image = resolved;
    else {
      delete out.image;
      unavailable += 1;
    }
  }
  if (unavailable) out.framesUnavailable = unavailable;
  return out;
}

/** Tool result → MCP content (text JSON; isError tells the agent to correct course rather than parrot it).
 *  Captured frames become image content (the agent "sees" directly); snapshots are given as raw body (not wrapped in JSON). */
function toolResponse(id: JsonRpcRequest['id'], r: McpBridgeResult): JsonRpcResponse {
  if (r.ok && Array.isArray(r.images) && r.images.length) {
    // multiple images (visual_brief sample frames): text (index/timestamp/labeling contract) first, frames follow in index order
    const imgs = (r.images as { data: string; mimeType?: string }[]).filter((i) => typeof i?.data === 'string');
    const { images: _drop, ...rest } = r;
    return rpcResult(id, {
      content: [
        { type: 'text', text: JSON.stringify(rest) },
        ...imgs.map((i) => ({ type: 'image' as const, data: i.data, mimeType: i.mimeType ?? 'image/jpeg' })),
      ],
      isError: false,
    });
  }
  if (r.ok && r.image && typeof (r.image as { data?: unknown }).data === 'string') {
    const img = r.image as { data: string; mimeType?: string };
    return rpcResult(id, {
      content: [
        { type: 'image', data: img.data, mimeType: img.mimeType ?? 'image/jpeg' },
        { type: 'text', text: r.summary ?? 'frame captured' },
      ],
      isError: false,
    });
  }
  const text = r.ok && typeof r.state === 'string' ? r.state : JSON.stringify(r);
  return rpcResult(id, { content: [{ type: 'text', text }], isError: !r.ok });
}

/** Dispatch one legacy tool call (server-direct, BYO brief, or bridge). `null` = unknown tool. */
async function dispatchEditorTool(name: string, args: Record<string, unknown>, deps: McpDeps): Promise<McpBridgeResult | null> {

  if (MCP_SERVER_TOOL_IDS.has(name)) {
    if (name === 'list_frames') {
      const frames = deps.listFrames();
      return ({ ok: true, summary: `${frames.length} frames`, data: frames });
    }
    if (name === 'read_frame') {
      const fid = args.frame_id;
      if (typeof fid !== 'string' || !fid) return ({ ok: false, error: 'frame_id required (ids via list_frames)' });
      return (deps.readFrame(fid));
    }
    if (name === 'list_skills') return (await deps.listSkills(args));
    if (name === 'read_skill') {
      const skillId = args.skill_id;
      if (typeof skillId !== 'string' || !skillId) return ({ ok: false, error: 'skill_id required (ids via list_skills)' });
      return (await deps.readSkill(skillId));
    }
    if (name === 'search_fonts') return searchFontsTool(args);
    if (name === 'get_icons') {
      const names = Array.isArray(args.names) ? (args.names as unknown[]).map(String).filter(Boolean) : [];
      if (!names.length) return ({ ok: false, error: 'names required (up to 8 icon names)' });
      return (deps.lookupIcons(names, typeof args.kind === 'string' ? args.kind : undefined));
    }
    if (name === 'import_media') return (await deps.importMedia(args));
    if (name === 'create_browser_handoff') return (await deps.createBrowserHandoff(args));
    if (name === 'create_project') return (await deps.createProject(args));
    if (name === 'list_projects') return (await deps.listProjects(args));
    if (name === 'switch_project') return (await deps.switchProject(args));
    if (name === 'rename_project') return (await deps.renameProject(args));
    if (name === 'list_assets') return (await deps.listAssets(args));
    if (name === 'search_assets') return (await deps.searchAssets(args));
    if (name === 'search_stock') return (await deps.searchStock(args));
    if (name === 'import_stock') return (await deps.importStock(args));
    if (name === 'list_models') {
      if (args.kind !== undefined && !['image', 'video', 'all'].includes(args.kind as string)) {
        return { ok: false, error: 'invalid_value', path: 'kind', allowed: ['image', 'video', 'all'] };
      }
      return await deps.listModels(args);
    }
    if (name === 'generate_image') return (await deps.generateImage(args));
    if (name === 'generate_video') return (await deps.generateVideo(args));
    if (name === 'generate_music') return (await deps.generateMusic(args));
    if (name === 'generate_sfx') return (await deps.generateSfx(args));
    if (name === 'get_generation_jobs') return (await deps.getGenerationJobs(args));
    if (name === 'list_voices') return (await deps.listVoices(args));
    if (name === 'clone_voice') return (await deps.cloneVoice(args));
    if (name === 'design_voice') return (await deps.designVoice(args));
    if (name === 'delete_voice') return (await deps.deleteVoice(args));
    if (name === 'generate_speech') return (await deps.generateSpeech(args));
    if (name === 'lip_sync') return (await deps.lipSync(args));
    return (deps.readEditingGuide());
  }

  // BYO brief (composite: bridge-fetch context → server-assemble prompt): the LLM belongs to the caller, no credits burned
  if (MCP_BRIEF_TOOLS[name]) {
    const ctx = await deps.callBridge(MCP_BRIEF_TOOLS[name], args, BADGE_TIMEOUT_MS);
    if (!ctx.ok) return (ctx);
    const data = (ctx.data ?? {}) as Record<string, unknown>;
    const instruction = typeof args.instruction === 'string' ? args.instruction.trim() : '';
    if (!instruction) return ({ ok: false, error: 'instruction required' });
    const format = args.format === 'html' || args.format === 'kit' ? { format: args.format } : {};
    return (deps.assembleComposeBrief({ ...data, ...format }, instruction));
  }

  if (!MCP_BRIDGE_EXTRA_TOOL_IDS.has(name) && !STUDIO_TOOL_MAP[name]) return null;
  const result = await deps.callBridge(name, args, MCP_BRIDGE_EXTRA_TOOL_IDS.has(name) && name !== 'visual_brief' && name !== 'review_sequence' ? BADGE_TIMEOUT_MS : bridgeTimeoutMs(name));
  return withWorkflowBaseline(name, result, deps);
}

function withWorkflowBaseline(name: string, result: McpBridgeResult, deps: McpDeps): McpBridgeResult {
  if (name === 'get_state' && result.ok && typeof result.state === 'string' && deps.distribution !== 'plugin') {
    // The initialize-time version broadcast reaches only fresh connections; a long-lived
    // session spanning a release never sees it. get_state opens (and re-anchors) every
    // working session, so the baseline rides its receipt — same trust model, delivered at
    // the moment of use. The tag is opaque (different string = update, no ordering), and
    // the update COMMAND is deliberately not prescribed here: the installed skill's own
    // distribution section routes Plugin bundles to the host Plugin manager and standalone
    // Skills to their Skill installer — this line must stay channel-neutral.
    //
    // Plugin installs are skipped: their host already owns updates (it orders versions and
    // installs the newer one), and because a release deploys the server before publishing the
    // plugin, this line would otherwise spend that window telling every Plugin user to update
    // to a version that is not published yet. Standalone installs have no such mechanism, so
    // this stays their only signal.
    result.state = `Pireel workflow baseline: ${deps.skillVersion} — if the VERSION next to your loaded Pireel SKILL.md differs, update through YOUR distribution's channel per that skill's update section (then re-read the files) before continuing. If it matches, ignore this line.\n\n${result.state}`;
  }
  return (result);
}

/** Tool list for the v3 surface: the consolidated registry with its own descriptions and schemas. */
export function buildMcpTools(): McpToolDef[] {
  return V3_TOOLS
    .filter((tool) => !tool.chatOnly)
    .map((tool) => {
      const spec = V3_TOOL_SCHEMAS[tool.id];
      if (!spec) throw new Error(`v3 tool ${tool.id} has no schema`);
      return { name: tool.id, description: spec.description, inputSchema: spec.inputSchema };
    });
}

/** v3 tools whose live execution can take minutes inherit a slow legacy tool's bridge timeout. */
const V3_BRIDGE_TIMEOUT_TOOL: Record<string, string> = {
  get_transcript: 'read_script',
  inspect_media: 'analyze_visual',
  inspect_timeline: 'review_sequence',
  apply_component: 'apply_block',
  remove_silence: 'remove_silence',
  export: 'export_video',
  denoise_audio: 'denoise_audio',
};

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cursor, key) => (cursor && typeof cursor === 'object' ? (cursor as Record<string, unknown>)[key] : undefined), value);
}

/** A live tab answering one of these is saying "not mine", the same as having no tab at all: project
 *  navigation and handoff minting are account-level, not document-level, and only the server owns
 *  them. Anything else the tab says is the answer. */
const TAB_CANNOT_SERVE: ReadonlySet<string> = new Set<string>(['studio_not_open', ...Object.values(TAB_CANNOT_SERVE_ERRORS)]);

/** Run one v3 call: translate to legacy calls, apply them in order (chaining results where the adapter
 *  asks), and fold the receipts into one result. Delta shaping lands with the receipt contract. */
export async function runV3Tool(name: string, args: Record<string, unknown>, deps: McpDeps): Promise<McpBridgeResult> {
  let placementAssets: Array<Record<string, unknown>> | undefined;
  if ((name === 'add_clips' || name === 'insert_clips') && Array.isArray(args.clips) && deps.resolvePlacementAssets) {
    const ids = [...new Set(args.clips.flatMap((row) => row && typeof row === 'object' && typeof row.assetId === 'string' ? [row.assetId] : []))];
    if (ids.length) {
      try { placementAssets = await deps.resolvePlacementAssets(ids); }
      catch { return { ok: false, error: 'asset_resolution_failed', hint: 'Catalog lookup failed; retry before placing these clips.' }; }
    }
  }
  // Route account-owned steps before contacting the tab: its chat handlers may reject them,
  // or worse, answer a cloud/official catalog request with a plausible empty local catalog.
  // Probe without document context; frame/clip-dependent translations still run in the live tab.
  const contextFree: V3AdapterContext = { fps: Number.NaN, kindOf: () => undefined };
  const probe = translateV3Call(name, args, contextFree);
  if (name === 'list_models' && probe.status === 'error') {
    const { status: _status, ...error } = probe;
    return { ok: false, ...error };
  }
  const serverOwned = probe.status === 'ok' && probe.calls.some((call) =>
    MCP_SERVER_TOOL_IDS.has(call.tool)
    // Project-local media includes unsaved device assets only the tab can see.
    && !(['list_assets', 'search_assets'].includes(call.tool) && call.input.scope === 'mine'));
  if (!serverOwned) {
    // Document edits stay grouped against the live tab's exact fps, ids and undo history.
    const live = await deps.callBridge('run_v3', { name, args, ...(placementAssets?.length ? { placementAssets } : {}) }, bridgeTimeoutMs(V3_BRIDGE_TIMEOUT_TOOL[name] ?? name));
    if (!(live.ok === false && TAB_CANNOT_SERVE.has(String(live.error)))) return withWorkflowBaseline(name, live, deps);
  }
  const ctx: V3AdapterContext = !serverOwned && deps.resolveV3Context
    ? await deps.resolveV3Context()
    : contextFree;
  const translation = serverOwned ? probe : translateV3Call(name, args, { ...ctx, placementAssets });
  if (translation.status === 'error') {
    const { status: _status, ...rest } = translation;
    return { ok: false, ...rest };
  }
  if (translation.status === 'pending') return { ok: false, error: 'not_available_yet', detail: translation.reason };
  if (name === 'compose_component') {
    // The adapter yields raw context; offline callers need the same assembled authoring
    // contract and frame-based target as the live run_v3 handler.
    const result = await dispatchEditorTool('compose_block_brief', {
      ...translation.calls[0]!.input,
      instruction: args.instruction,
      ...(args.format === 'kit' || args.format === 'html' ? { format: args.format } : {}),
    }, deps);
    if (!result?.ok) return result ?? { ok: false, error: 'adapter_mapped_unknown_tool' };
    const data = (result.data ?? {}) as Record<string, unknown>;
    const target = (data.target ?? {}) as Record<string, unknown>;
    return { ...result, data: { ...data, target: {
      clipId: target.blockId,
      ...(typeof target.atSec === 'number' ? { atFrame: Math.round(target.atSec * ctx.fps) } : {}),
      ...(typeof target.durationSec === 'number' ? { durationFrames: Math.max(1, Math.round(target.durationSec * ctx.fps)) } : {}),
      ...(target.placement ? { placement: target.placement } : {}),
    }, next: 'Generate the component yourself from system + prompt, then call apply_component with this target unchanged plus your full raw text.' } };
  }
  const steps: Array<{ tool: string; ok: boolean; summary?: string; error?: string; data?: unknown }> = [];
  const images: Array<{ data: string; mimeType?: string }> = [];
  let previous: McpBridgeResult | null = null;
  for (const call of translation.calls as LegacyCall[]) {
    const input: Record<string, unknown> = { ...call.input };
    if (call.usePrevious) {
      const carried = readPath(previous, call.usePrevious.resultPath);
      if (carried === undefined) {
        return { ok: false, error: 'chain_broken', detail: `${call.tool} needed ${call.usePrevious.resultPath} from the previous step`, data: { steps } };
      }
      input[call.usePrevious.inputKey] = call.usePrevious.asArray ? [carried] : carried;
    }
    const result = await dispatchEditorTool(call.tool, input, deps);
    if (result === null) return { ok: false, error: 'adapter_mapped_unknown_tool', detail: call.tool, data: { steps } };
    if (translation.calls.length === 1) {
      if (!result.ok) return { ...result, ...describeStepFailure(name, args, typeof result.error === 'string' ? result.error : undefined, ctx) };
      return translation.note ? { ...result, note: translation.note } : result;
    }
    if (result.image) images.push(result.image as { data: string; mimeType?: string });
    if (Array.isArray(result.images)) images.push(...result.images as Array<{ data: string; mimeType?: string }>);
    steps.push({ tool: call.tool, ok: result.ok, ...(result.summary ? { summary: result.summary } : {}), ...(result.error ? { error: result.error } : {}), ...(result.data !== undefined ? { data: result.data } : {}) });
    if (!result.ok) {
      const failure = describeStepFailure(name, args, typeof result.error === 'string' ? result.error : undefined, ctx);
      return { ok: false, ...failure, detail: `${failure.detail} — ${call.tool} failed after ${steps.length - 1} completed step(s); earlier steps are applied`, data: { steps } };
    }
    previous = result;
  }
  return {
    ok: true,
    summary: steps.map((step) => step.summary).filter(Boolean).join('; ') || `${name} applied ${steps.length} steps`,
    data: { steps, ...(translation.note ? { note: translation.note } : {}) },
    ...(images.length ? { images } : {}),
  };
}

/** Handle one JSON-RPC message. Returns null = a notification, routed back as an empty 202 response. */
export async function handleMcpRequest(raw: JsonRpcRequest, deps: McpDeps): Promise<JsonRpcResponse | null> {
  const method = raw.method;
  if (typeof method !== 'string') return rpcError(raw.id, -32600, 'invalid request: method required');

  // notifications (initialized/cancelled/…): no response needed
  if (method.startsWith('notifications/')) return null;

  switch (method) {
    case 'initialize': {
      const requested = (raw.params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
      return rpcResult(raw.id, {
        protocolVersion: typeof requested === 'string' ? requested : MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER_INFO,
        instructions: v3Instructions({ surface: 'mcp', skillVersion: deps.skillVersion, ...(deps.editingExpertise ? { editingExpertise: deps.editingExpertise } : {}) }),
      });
    }
    case 'ping':
      return rpcResult(raw.id, {});
    case 'tools/list':
      return rpcResult(raw.id, { tools: buildMcpTools() });
    case 'tools/call': {
      const name = (raw.params as { name?: unknown } | undefined)?.name;
      const args = ((raw.params as { arguments?: unknown } | undefined)?.arguments ?? {}) as Record<string, unknown>;
      if (typeof name !== 'string') return rpcError(raw.id, -32602, 'tools/call: name required');
      if (V3_TOOL_IDS.has(name) && !V3_TOOLS.find(tool => tool.id === name)?.chatOnly) {
        return toolResponse(raw.id, await hydrateFrameImages(await runV3Tool(name, args, deps), deps));
      }
      if (V3_RETIRED_TOOL_IDS.includes(name)) {
        return toolResponse(raw.id, { ok: false, error: 'tool_retired', detail: `${name} no longer exists: keep the plan in your working context and build the edit directly with the clip tools; inspect_timeline reviews the whole output without a plan.` });
      }
      const replacement = v3ReplacementIndex().get(name);
      return toolResponse(raw.id, { ok: false, error: 'unknown_tool',
        detail: replacement ? `Use ${replacement}; the old ${name} protocol is no longer accepted.` : `Unknown tool: ${name}. Use tools/list.` });
    }
    default:
      return rpcError(raw.id, -32601, `method not found: ${method}`);
  }
}
