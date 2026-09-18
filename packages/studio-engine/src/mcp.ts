/**
 * Studio's MCP server core (pure functions, zero I/O) — external agents (Codex / Claude Code)
 * drive studio's full editing toolset with their own models via /api/studio/mcp.
 *
 * Business-model cornerstone: LLM orchestration burns the user's own Codex/Claude subscription (this endpoint
 * bypasses the credits gate); hosted component generation still bounces through the browser to
 * /api/studio/compose on the existing session billing — generation still charges, orchestration is free.
 *
 * Architecture: the v3 tool surface (agent-surface-v3) is the only surface; every call keeps its own name and
 * shape end to end. Account services (skills, frames, catalog search, generation, projects) are answered here;
 * document and runtime tools travel through the StudioBridge DO to the open studio tab as run_v3 (bridge-do.ts's
 * header explains why it is a bridge), and the routing layer runs the offline executor when no tab is open.
 *
 * Protocol: the stateless subset of MCP streamable HTTP (single request → single JSON response, no SSE/session
 * headers). Compatible with both Codex's and Claude Code's HTTP transports. This file does no auth / doesn't touch
 * the DO — that's the routing layer's job, injected via McpDeps so vitest can pin the contract directly.
 */

import type { V3ToolContext } from './agent-surface-v3/context';
import { describeStepFailure } from './agent-surface-v3/receipt-errors';
import { validateV3Input } from './agent-surface-v3/validate';
import { V3_TOOL_IDS, V3_TOOLS } from './agent-surface-v3/registry';
import { V3_TOOL_SCHEMAS } from './agent-surface-v3/schemas';
import { v3Instructions } from './agent-surface-v3/instructions';
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
  resolveV3Context?: () => Promise<V3ToolContext>;
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
  /** The frame attached to the active project, for manage_frame read without an id. */
  attachedFrameId?: () => Promise<string | null>;
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
  /** Text-to-sound-effect primitive (server-direct; picture-synchronous generate_foley runs in the tab over the bridge). */
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

/** Tools the server answers itself (catalog, account and generation services). A call is server-owned
 *  when its arguments fall in the server's half: project-scope management, non-local asset scopes,
 *  stock imports, generation jobs. Everything else runs in the studio tab or the offline executor. */
export const MCP_SERVER_TOOL_IDS = new Set(['list_skills', 'read_skill', 'get_icons', 'import_media', 'create_browser_handoff', 'manage_project', 'search_assets', 'register_media', 'inspect_media', 'list_models', 'generate_image', 'generate_video', 'generate_audio', 'generate_speech', 'lip_sync', 'manage_voices', 'manage_frame']);

export function serverOwnsCall(name: string, args: Record<string, unknown>): boolean {
  switch (name) {
    case 'manage_project': return args.scope === 'project';
    // Project-local media includes unsaved device assets only the tab can see.
    case 'search_assets': return args.kind === 'font' || (args.scope !== undefined && args.scope !== 'mine');
    case 'register_media': return !!args.stock && typeof args.stock === 'object';
    case 'inspect_media': return args.mode === 'generation';
    case 'manage_frame': return args.action === 'list' || args.action === 'read';
    default: return MCP_SERVER_TOOL_IDS.has(name);
  }
}

/** Bridge-side system operations the server may send to the tab besides run_v3. */
export const MCP_BRIDGE_EXTRA_TOOL_IDS = new Set(['get_state', 'run_v3', 'adopt_cloud_project', 'load_local_assets', 'load_local_source']);

/** Bridge timeout for slow tools (generation/analysis in the browser, minutes-scale); instant ops get 60s. */
const CARD_TIMEOUT_MS = 600_000;
const BADGE_TIMEOUT_MS = 60_000;
const LONG_RUNNING_V3 = new Set(['inspect_timeline', 'inspect_media', 'get_transcript', 'remove_silence', 'denoise_audio', 'bake_component', 'apply_component', 'export', 'generate_foley', 'assemble_from_review']);

export function bridgeTimeoutMs(toolId: string): number {
  return LONG_RUNNING_V3.has(toolId) ? CARD_TIMEOUT_MS : BADGE_TIMEOUT_MS;
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
    // multiple images (inspect_media brief sample frames, inspect_timeline frames): text (index/timestamp/labeling contract) first, frames follow in index order
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

/** Answer a server-owned v3 call from the account services. `null` = this call is not the server's. */
async function dispatchServerTool(name: string, args: Record<string, unknown>, deps: McpDeps): Promise<McpBridgeResult | null> {
  if (!serverOwnsCall(name, args)) return null;
  switch (name) {
    case 'list_skills': return deps.listSkills(args);
    case 'read_skill': {
      const id = typeof args.id === 'string' ? args.id.trim() : '';
      if (!id) return { ok: false, error: 'missing_field', path: 'id', fix: 'Pass the exact id from list_skills or the system-prompt skill index.' };
      return deps.readSkill(id);
    }
    case 'get_icons': {
      const names = Array.isArray(args.names) ? (args.names as unknown[]).map(String).filter(Boolean) : [];
      if (!names.length) return { ok: false, error: 'missing_field', path: 'names', fix: 'Pass up to 8 icon names.' };
      return deps.lookupIcons(names, typeof args.kind === 'string' ? args.kind : undefined);
    }
    case 'import_media': return deps.importMedia(args);
    case 'create_browser_handoff': return deps.createBrowserHandoff(args);
    case 'manage_frame': {
      if (args.action === 'list') { const frames = deps.listFrames(); return { ok: true, summary: `${frames.length} frames`, data: frames }; }
      const id = typeof args.id === 'string' ? args.id : '';
      if (id) return deps.readFrame(id);
      if (args.action === 'read') {
        const attached = await deps.attachedFrameId?.();
        if (attached) return deps.readFrame(attached);
        return { ok: false, error: 'no_frame_attached', fix: 'Attach a frame first (manage_frame action:attach with an id from action:list), or pass id to read a specific one.' };
      }
      return { ok: false, error: 'missing_field', path: 'id', fix: 'Pass the frame id from manage_frame action:list.' };
    }
    case 'manage_project': {
      const action = String(args.action ?? 'list');
      if (action === 'list') return deps.listProjects(args);
      if (action === 'switch') return deps.switchProject({ project_id: args.id });
      if (action === 'create') return deps.createProject({ ...(typeof args.title === 'string' && args.title.trim() ? { title: args.title } : {}) });
      if (action === 'rename') return deps.renameProject({ ...(typeof args.id === 'string' && args.id ? { project_id: args.id } : {}), title: args.title });
      return { ok: false, error: 'invalid_value', path: 'action', value: args.action, allowed: ['list', 'switch', 'create', 'rename'] };
    }
    case 'search_assets': {
      if (args.kind === 'font') {
        const call: Record<string, unknown> = {};
        for (const key of ['query', 'script', 'category', 'limit']) if (args[key] !== undefined) call[key] = args[key];
        return searchFontsTool(call);
      }
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (args.scope === 'stock') {
        if (!query) return { ok: false, error: 'missing_field', path: 'query', fix: 'Stock search needs a concrete visual query.' };
        const call: Record<string, unknown> = { query };
        if (typeof args.kind === 'string' && args.kind !== 'all') call.kind = args.kind;
        for (const key of ['page', 'limit']) if (args[key] !== undefined) call[key] = args[key];
        return deps.searchStock(call);
      }
      if (!query) {
        if (args.scope === 'all') return { ok: false, error: 'missing_field', path: 'query', fix: 'Listing needs one explicit scope: mine, cloud or official.' };
        const call: Record<string, unknown> = { scope: args.scope };
        for (const key of ['kind', 'limit']) if (args[key] !== undefined) call[key] = args[key];
        return deps.listAssets(call);
      }
      const call: Record<string, unknown> = { query, scope: args.scope };
      for (const key of ['kind', 'limit']) if (args[key] !== undefined) call[key] = args[key];
      return deps.searchAssets(call);
    }
    case 'inspect_media': {
      const ids = Array.isArray(args.ids) ? (args.ids as unknown[]).filter((id): id is string => typeof id === 'string' && !!id) : [];
      return deps.getGenerationJobs(ids.length ? { ids } : {});
    }
    case 'list_models': return deps.listModels(args);
    case 'generate_image': return deps.generateImage(args);
    case 'generate_video': return deps.generateVideo(args);
    case 'generate_audio': {
      const { kind, ...rest } = args;
      if (kind === 'music') return deps.generateMusic(rest);
      if (kind === 'sfx') return deps.generateSfx(rest);
      return { ok: false, error: 'invalid_value', path: 'kind', value: kind, allowed: ['music', 'sfx'] };
    }
    case 'generate_speech': return deps.generateSpeech(args);
    case 'lip_sync': return deps.lipSync(args);
    case 'manage_voices': {
      const { action, ...rest } = args;
      if (action === 'list') return deps.listVoices(rest);
      if (action === 'clone') return deps.cloneVoice(rest);
      if (action === 'design') return deps.designVoice(rest);
      if (action === 'delete') return deps.deleteVoice(rest);
      return { ok: false, error: 'invalid_value', path: 'action', value: action, allowed: ['list', 'clone', 'design', 'delete'] };
    }
    default: return null;
  }
}

/** Register a stock result: durable cloud copy first, then the registration lands in the project
 *  (live tab or offline executor) together with any directly registered assets. */
async function registerStock(args: Record<string, unknown>, deps: McpDeps): Promise<McpBridgeResult> {
  const steps: Array<{ tool: string; ok: boolean; summary?: string; error?: string }> = [];
  const imported = await deps.importStock(args.stock as Record<string, unknown>);
  steps.push({ tool: 'import_stock', ok: imported.ok, ...(imported.summary ? { summary: imported.summary } : {}), ...(imported.error ? { error: imported.error } : {}) });
  if (!imported.ok) return { ...imported, data: { ...(imported.data && typeof imported.data === 'object' ? imported.data as Record<string, unknown> : {}), steps } };
  const registration = readPath(imported, 'data.registration');
  if (registration === undefined) return { ok: false, error: 'chain_broken', detail: 'the stock import returned no registration', data: { steps } };
  const assets = [registration, ...(Array.isArray(args.assets) ? args.assets : [])];
  const registered = await deps.callBridge('run_v3', { name: 'register_media', args: { assets } }, bridgeTimeoutMs('register_media'));
  steps.push({ tool: 'register_media', ok: registered.ok, ...(registered.summary ? { summary: registered.summary } : {}), ...(registered.error ? { error: registered.error } : {}) });
  if (!registered.ok) return { ok: false, error: String(registered.error ?? 'register_failed'), detail: `register_media failed after 1 completed step; the stock copy is imported`, data: { steps } };
  return { ...registered, data: { ...(registered.data && typeof registered.data === 'object' ? registered.data as Record<string, unknown> : {}), steps } };
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

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cursor, key) => (cursor && typeof cursor === 'object' ? (cursor as Record<string, unknown>)[key] : undefined), value);
}


/** Run one v3 call: schema check, then the server's own services or the studio tab (whose bridge
 *  falls back to the offline executor when no tab is open), and the receipt back as it came. */
export async function runV3Tool(name: string, args: Record<string, unknown>, deps: McpDeps): Promise<McpBridgeResult> {
  // Schema-level refusals are decided here, before the live tab is involved: the tab runs whatever
  // bundle its page loaded, so a value the published schema forbids must not depend on it.
  const invalid = validateV3Input(name, args);
  if (invalid) {
    const { status: _status, ...rest } = invalid;
    return { ok: false, ...rest };
  }
  if (name === 'register_media' && args.stock && typeof args.stock === 'object') return registerStock(args, deps);
  const served = await dispatchServerTool(name, args, deps);
  if (served) return served;
  let placementAssets: Array<Record<string, unknown>> | undefined;
  if ((name === 'add_clips' || name === 'insert_clips') && Array.isArray(args.clips) && deps.resolvePlacementAssets) {
    const ids = [...new Set(args.clips.flatMap((row) => row && typeof row === 'object' && typeof row.assetId === 'string' ? [row.assetId] : []))];
    if (ids.length) {
      try { placementAssets = await deps.resolvePlacementAssets(ids); }
      catch { return { ok: false, error: 'asset_resolution_failed', hint: 'Catalog lookup failed; retry before placing these clips.' }; }
    }
  }
  const live = await deps.callBridge('run_v3', { name, args, ...(placementAssets?.length ? { placementAssets } : {}) }, bridgeTimeoutMs(name));
  if (name === 'compose_component' && live.ok) {
    // The offline executor answers with raw context; the tab already returns the assembled brief.
    const data = (live.data ?? {}) as Record<string, unknown>;
    if (!('system' in data) && data.block) {
      const instruction = typeof args.instruction === 'string' ? args.instruction.trim() : '';
      if (!instruction) return { ok: false, error: 'missing_field', path: 'instruction' };
      const format = args.format === 'html' || args.format === 'kit' ? { format: args.format } : {};
      const brief = deps.assembleComposeBrief({ ...data, ...format }, instruction);
      if (!brief.ok) return brief;
      const fps = deps.resolveV3Context ? (await deps.resolveV3Context()).fps : Number.NaN;
      const block = data.block as Record<string, unknown>;
      return { ...brief, data: { ...(brief.data as Record<string, unknown>), target: {
        clipId: block.id,
        ...(typeof data.atSec === 'number' && Number.isFinite(fps) ? { atFrame: Math.round(data.atSec * fps) } : {}),
        ...(typeof data.durationSec === 'number' && Number.isFinite(fps) ? { durationFrames: Math.max(1, Math.round(data.durationSec * fps)) } : {}),
        ...(data.placement ? { placement: data.placement } : {}),
      }, next: 'Generate the component yourself from system + prompt, then call apply_component with this target unchanged plus your full raw text.' } };
    }
  }
  if (!live.ok) {
    const ctx: V3ToolContext = deps.resolveV3Context ? await deps.resolveV3Context().catch(() => ({ fps: Number.NaN, kindOf: () => undefined })) : { fps: Number.NaN, kindOf: () => undefined };
    return { ...live, ...describeStepFailure(name, args, typeof live.error === 'string' ? live.error : undefined, ctx, live.data) };
  }
  return withWorkflowBaseline(name, live, deps);
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
      return toolResponse(raw.id, { ok: false, error: 'unknown_tool', detail: `Unknown tool: ${name}. Use tools/list.` });
    }
    default:
      return rpcError(raw.id, -32601, `method not found: ${method}`);
  }
}
