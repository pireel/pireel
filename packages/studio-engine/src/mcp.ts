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

import { MCP_DESCRIPTION_OVERRIDES, MCP_INSTRUCTIONS, STUDIO_TOOLS, STUDIO_TOOL_MAP } from './prompts';

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
  /** Execute over the bridge (routing layer = StudioBridge DO stub fetch /call). */
  callBridge: (tool: string, input: Record<string, unknown>, timeoutMs: number) => Promise<McpBridgeResult>;
  /** Frame catalog (routing layer = frameRegistry.list()). */
  listFrames: () => { id: string; title: string; summary: string }[];
  /** Frame playbook body (routing layer = frameRegistry.get + FRAME_PLAYBOOK_PREAMBLE). */
  readFrame: (frameId: string) => McpBridgeResult;
  /** A-roll editing guide body (routing layer = AROLL_GUIDE). */
  readEditingGuide: () => McpBridgeResult;
  /** BYO block brief: bridge-returned compose context + the agent's instruction → {system,prompt} (routing layer = briefs.assembleComposeBrief + frameRegistry). */
  assembleComposeBrief: (bridgeData: Record<string, unknown>, instruction: string) => McpBridgeResult;
  /** BYO plan brief: bridge-returned plan context → {system,prompt} (routing layer = briefs.assemblePlanBrief). */
  assemblePlanBrief: (bridgeData: Record<string, unknown>) => McpBridgeResult;
  /** Icon lookup (routing layer = icons.lookupIcons) — get_icons, referenced by BLOCK_SYSTEM in BYO generation, is available under the same name on the MCP surface. */
  lookupIcons: (names: string[], kind?: string) => McpBridgeResult;
  /** Local media import registration (routing layer = verify R2 object + write/create project row): after the agent
   *  uploads the user's local video to the byte rendezvous, this attaches it to a project (with optional transcript), no browser needed. */
  importMedia: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** Browser session handoff (routing layer = store one-time code + build /auth/handoff URL): the agent uses it
   *  to get a logged-in studio tab in its own built-in browser — the execution surface for bridge tools. */
  createBrowserHandoff: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** Create a new empty project (routing layer = write a studioProjects row, comp=emptyComposition). A new project is the "most recent" →
   *  becomes the offline active project. No browser. */
  createProject: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** List the current user's projects (routing layer = query studioProjects, lightweight metadata; most recent first = offline active project). */
  listProjects: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** Switch active project (routing layer = bump the project's updatedAt to newest → offline tools operate on it, and return its state). */
  switchProject: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** Rename a project's title (routing layer = update title where id+userId). */
  renameProject: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
}

/* ============================ Tool surface ============================ */

/** Tools answered directly on the server (body only on server / pure catalog / direct cloud-state ops): no bridge. */
export const MCP_SERVER_TOOL_IDS = new Set(['read_editing_guide', 'read_frame', 'list_frames', 'get_icons', 'import_media', 'create_browser_handoff', 'create_project', 'list_projects', 'switch_project', 'rename_project']);

/** MCP-only bridge tools (not in STUDIO_TOOLS, invisible to internal chat):
 *  get_state=state snapshot; apply_block/submit_plan=the validate-and-place surface for BYO generation output;
 *  capture_frame=visual verification (returns a captured frame as image content so the agent can "see" its own edits).
 *  compose_block_brief/plan_brief are "bridge-fetch context + server-assemble" composite tools, dispatched separately. */
export const MCP_BRIDGE_EXTRA_TOOL_IDS = new Set(['get_state', 'apply_block', 'submit_plan', 'capture_frame', 'visual_brief', 'submit_visual']);

/** Brief composite tools → bridge context-operation names (implemented browser-side in runExternalTool). */
export const MCP_BRIEF_TOOLS: Record<string, string> = {
  compose_block_brief: 'compose_context',
  plan_brief: 'plan_context',
};

/** Bridge timeout for slow tools (generation/analysis in the browser, minutes-scale); instant ops get 60s. */
const CARD_TIMEOUT_MS = 600_000;
const BADGE_TIMEOUT_MS = 60_000;

export function bridgeTimeoutMs(toolId: string): number {
  if (toolId === 'visual_brief') return CARD_TIMEOUT_MS; // runs the free geometry pass inside (minutes-scale); don't cap it at extra's 60s
  return STUDIO_TOOL_MAP[toolId]?.kind === 'card' ? CARD_TIMEOUT_MS : BADGE_TIMEOUT_MS;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const EMPTY_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/** MCP tool list: all of STUDIO_TOOLS (descriptions rewritten for the MCP context) + the MCP-only extras. */
export function buildMcpTools(): McpToolDef[] {
  const out: McpToolDef[] = [];
  for (const d of STUDIO_TOOLS) {
    if (d.id === 'read_frame') {
      // MCP version takes a frame_id param (the internal chat version reads it from session mount state; MCP has no session)
      out.push({
        name: d.id,
        description: MCP_DESCRIPTION_OVERRIDES.read_frame!,
        inputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: { frame_id: { type: 'string', description: 'Frame id from list_frames.' } },
          required: ['frame_id'],
        },
      });
      continue;
    }
    out.push({
      name: d.id,
      description: MCP_DESCRIPTION_OVERRIDES[d.id] ?? d.description,
      inputSchema: d.inputSchema,
    });
  }
  out.push(
    {
      name: 'get_state',
      description:
        "Fetch the CURRENT composition state from the user's open studio tab: duration, pipeline progress, overlay blocks (ids/kinds/timing), video shots (edited+src clocks, treatments), captions on/off, selection, playhead. Call BEFORE your first edit and whenever your picture of the timeline may be stale — every mutation invalidates previous snapshots.",
      inputSchema: EMPTY_SCHEMA,
    },
    {
      name: 'list_frames',
      description:
        'List available frames (theme content packs that define the whole design language: palette, fonts, composition rules). Use before recommending or attaching a theme; apply one with attach_frame, read its playbook with read_frame.',
      inputSchema: EMPTY_SCHEMA,
    },
    /* ---------- BYO-brain generation surface: brief → you generate → apply validates and places (no Pireel credits burned) ---------- */
    {
      name: 'compose_block_brief',
      description:
        "Get the FULL generation contract {system, prompt} for one overlay block, assembled from the live composition (theme tokens, frame design language, box size, on-screen beats, neighbor roster). YOU then generate the response with your own model, following the contract exactly (one short note, then ```html fence, then ```js timeline fence), and submit the raw text via apply_block. Targets: `blockId` of a pending placeholder (its design spec becomes the instruction — omit `instruction`); `blockId` of an existing block + `instruction` = rewrite; no blockId + `instruction` = new element at `atSec` (defaults to playhead). This is the default way to create/edit block content — it does NOT charge Pireel credits.",
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          blockId: { type: 'string', description: 'Target block id (placeholder to fill, or existing block to rewrite). Omit for a new element.' },
          atSec: { type: 'number', description: 'New element only: timeline start seconds (defaults to playhead).' },
          instruction: { type: 'string', description: 'What to build/change. Required unless targeting a placeholder.' },
        },
      },
    },
    {
      name: 'apply_block',
      description:
        "Validate and place a block you generated from compose_block_brief. Pass the SAME blockId/atSec you gave the brief, and `raw` = your full generated text (note + ```html + ```js fences; fences are parsed out). The block is linted (scoped CSS, no scripts, deterministic animation); on lint failure you get the issues back — fix ONLY those and re-apply. Placeholder blockId → fills it; existing blockId → overwrites its content; neither → inserts a new element (optional durationSec, default 3s; optional label).",
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          blockId: { type: 'string' },
          atSec: { type: 'number' },
          durationSec: { type: 'number', description: 'New element only: seconds on screen (default 3).' },
          label: { type: 'string', description: 'New element only: short timeline label.' },
          raw: { type: 'string', description: 'Your full generated text: note, then ```html fence, then ```js fence.' },
        },
        required: ['raw'],
      },
    },
    {
      name: 'plan_brief',
      description:
        'Get the FULL narration-planning contract {system, prompt} (transcript sentences, per-sentence visual hints, inserted-clip context). YOU generate the DraftPlan JSON with your own model per the contract, then call submit_plan with it. Requires a transcript (extract_asr first). Default over analyze_narration — does NOT charge Pireel credits.',
      inputSchema: EMPTY_SCHEMA,
    },
    {
      name: 'submit_plan',
      description:
        'Submit the DraftPlan you generated from plan_brief (pass the JSON text or object as `plan`). It is coerced/validated (scene ranges clamped to the sentence count); on success the plan is stored and lay_out will storyboard from it. Rejected if no scenes survive validation — regenerate and resubmit.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { plan: { description: 'The DraftPlan JSON (object, or its raw text).' } },
        required: ['plan'],
      },
    },
    {
      name: 'visual_brief',
      description:
        "BYO visual analysis, step 1 of 2 (does NOT charge Pireel credits — default over analyze_visual). The tab runs the free passes (scene cuts, face/geometry safe zones, palette; takes roughly the geometry pass a minute or two) and returns sparse sample frames as IMAGES plus their timestamps. YOU look at each frame and label it, then call submit_visual. If analysis is already available it says so — skip submitting.",
      inputSchema: EMPTY_SCHEMA,
    },
    {
      name: 'submit_visual',
      description:
        'BYO visual analysis, step 2 of 2: submit per-frame labels for the frames visual_brief returned. labels = [{index, content: talkinghead|screen|broll|slide|other, person: left|center|right|none, safe: left|right|top|bottom|full|none, has_text?: boolean, desc?: short English sentence}] — index matches the frames order. The tab assembles the full visual timeline (your semantics + its own geometry) and lay_out will use it.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          labels: {
            type: 'array',
            description: 'One entry per frame you looked at.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                index: { type: 'number' },
                content: { type: 'string', enum: ['talkinghead', 'screen', 'broll', 'slide', 'other'] },
                person: { type: 'string', enum: ['left', 'center', 'right', 'none'] },
                safe: { type: 'string', enum: ['left', 'right', 'top', 'bottom', 'full', 'none'] },
                has_text: { type: 'boolean' },
                desc: { type: 'string' },
              },
              required: ['index', 'content', 'person', 'safe'],
            },
          },
        },
        required: ['labels'],
      },
    },
    {
      name: 'import_media',
      description:
        "Import LOCAL files into Pireel (no manual API key). TWO STEPS: ① call with NO arguments → returns a short-lived import `token`; ② run the plugin's import helper (skills/pireel/scripts/import-media.mjs) with `--token <token>` and the file paths — it probes metadata, transcribes audio (if ffmpeg is available), and registers everything by itself. You normally never call this tool WITH `sig` — the helper does that registration call. IMPORTANT — the main VIDEO streams straight into the OPEN studio tab over your machine (no cloud upload, fast even for big files), so a studio tab MUST be open first: if none is, the helper exits saying so — open one (create_browser_handoff, then open the url with YOUR browser) and re-run the helper. Images and b-roll (--broll) do NOT need a tab (they go to the cloud). A project with existing footage is never clobbered (a new project is created). After import, transcript tools (read_script/cut_narration/plan/captions) work immediately if a transcript was produced.",
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sig: { type: 'string', description: 'Registration mode only (the helper uses this; you rarely do): content signature name:size:mtimeMs of already-uploaded bytes.' },
          filename: { type: 'string', description: 'Original filename (used for the project title).' },
          duration_sec: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          transcript_segments: {
            type: 'array',
            description: 'Transcript ({start,end,text} in source seconds) — unlocks transcript-based offline editing immediately.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: { start: { type: 'number' }, end: { type: 'number' }, text: { type: 'string' } },
              required: ['start', 'end', 'text'],
            },
          },
        },
      },
    },
    {
      name: 'capture_frame',
      description:
        "SEE the composition: capture one rendered frame (background + video with its framing + all overlay graphics) at `atSec` (defaults to playhead) as an image. Use it to VERIFY your work after apply_block / caption / framing changes — check placement, overlap with the speaker, contrast, sizing — and fix what looks wrong. Runs in the user's browser tab.",
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { atSec: { type: 'number', description: 'Edited-timeline seconds to capture (defaults to playhead).' } },
      },
    },
    {
      name: 'create_browser_handoff',
      description:
        "Mint a one-time sign-in URL that opens the Pireel studio editor in a browser ALREADY logged in as the connected user. Use it whenever you need a live editor surface: right after connecting, when the user asks to see/open the editor, or when a tool fails with studio_not_open. Open the returned url with YOUR OWN built-in/embedded browser tool — the browser whose pages YOU can see and control. NEVER open it via the OS `open`/`start`/`xdg-open` command or the user's default browser: the ticket is single-use, so burning it on a surface you cannot see wastes it AND leaves you blind. The tab you open becomes the live editing surface (get_state, capture_frame and every visual tool run through it), and the user watches the edit happen there. Optional project_id opens that project; omit it for a fresh empty project. The URL expires in ~60 seconds: open it immediately, never print it to the user, and never share it as a user-facing link (it carries a login ticket — for sharing, give the plain project URL without it).",
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          project_id: { type: 'string', description: 'Existing studio project id to open. Omit to start a fresh empty project.' },
        },
      },
    },
    {
      name: 'get_icons',
      description:
        'Look up inline SVG icons by name (the same icon registry the generation contract references — never hand-draw semantic icons, and no emoji on canvas). names = up to 8 lucide-style kebab-case names; kind "brand" for brand logos.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          names: { type: 'array', items: { type: 'string' }, description: 'Icon names, e.g. ["trending-up","shield-check"].' },
          kind: { type: 'string', enum: ['icon', 'brand'] },
        },
        required: ['names'],
      },
    },
    {
      name: 'create_project',
      description:
        "Create a NEW empty Pireel project (no video yet) — no browser needed. Use it when the user wants to start fresh, or when get_state / offline tools report 'no cloud project'. The new project immediately becomes your ACTIVE project (offline tools operate on your most-recently-touched project). To also add footage, follow with import_media; to open it in a live tab, use create_browser_handoff {project_id}.",
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { title: { type: 'string', description: 'Optional project title (defaults to a dated name).' } },
      },
    },
    {
      name: 'list_projects',
      description:
        "List the connected user's Pireel projects (lightweight: id, title, updated time, whether it has video). Newest first — the top one is your current ACTIVE project for offline tools. Use it to find a project by name before switch_project / rename_project / create_browser_handoff.",
      inputSchema: EMPTY_SCHEMA,
    },
    {
      name: 'switch_project',
      description:
        "Make PROJECT the ACTIVE project for subsequent OFFLINE edits, and return its current state. Offline tools (get_state, cuts, blocks, captions, plan) operate on your most-recently-touched project; this brings the chosen one to the front so you can edit it without a browser tab. (To open it in a live browser tab instead, use create_browser_handoff {project_id}.)",
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { project_id: { type: 'string', description: 'Project id from list_projects.' } },
        required: ['project_id'],
      },
    },
    {
      name: 'rename_project',
      description: "Rename a Pireel project's title. No browser needed.",
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          project_id: { type: 'string', description: 'Project id from list_projects.' },
          title: { type: 'string', description: 'New title.' },
        },
        required: ['project_id', 'title'],
      },
    },
  );
  return out;
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
        instructions: MCP_INSTRUCTIONS,
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

      if (MCP_SERVER_TOOL_IDS.has(name)) {
        if (name === 'list_frames') {
          const frames = deps.listFrames();
          return toolResponse(raw.id, { ok: true, summary: `${frames.length} frames`, data: frames });
        }
        if (name === 'read_frame') {
          const fid = args.frame_id;
          if (typeof fid !== 'string' || !fid) return toolResponse(raw.id, { ok: false, error: 'frame_id required (ids via list_frames)' });
          return toolResponse(raw.id, deps.readFrame(fid));
        }
        if (name === 'get_icons') {
          const names = Array.isArray(args.names) ? (args.names as unknown[]).map(String).filter(Boolean) : [];
          if (!names.length) return toolResponse(raw.id, { ok: false, error: 'names required (up to 8 icon names)' });
          return toolResponse(raw.id, deps.lookupIcons(names, typeof args.kind === 'string' ? args.kind : undefined));
        }
        if (name === 'import_media') return toolResponse(raw.id, await deps.importMedia(args));
        if (name === 'create_browser_handoff') return toolResponse(raw.id, await deps.createBrowserHandoff(args));
        if (name === 'create_project') return toolResponse(raw.id, await deps.createProject(args));
        if (name === 'list_projects') return toolResponse(raw.id, await deps.listProjects(args));
        if (name === 'switch_project') return toolResponse(raw.id, await deps.switchProject(args));
        if (name === 'rename_project') return toolResponse(raw.id, await deps.renameProject(args));
        return toolResponse(raw.id, deps.readEditingGuide());
      }

      // BYO brief (composite: bridge-fetch context → server-assemble prompt): the LLM belongs to the caller, no credits burned
      if (MCP_BRIEF_TOOLS[name]) {
        const ctx = await deps.callBridge(MCP_BRIEF_TOOLS[name], args, BADGE_TIMEOUT_MS);
        if (!ctx.ok) return toolResponse(raw.id, ctx);
        const data = (ctx.data ?? {}) as Record<string, unknown>;
        if (name === 'plan_brief') return toolResponse(raw.id, deps.assemblePlanBrief(data));
        const suggested = typeof data.suggested_instruction === 'string' ? data.suggested_instruction : '';
        const instruction = typeof args.instruction === 'string' && args.instruction.trim() ? args.instruction.trim() : suggested;
        if (!instruction) return toolResponse(raw.id, { ok: false, error: 'instruction required (only placeholders carry their own design spec)' });
        return toolResponse(raw.id, deps.assembleComposeBrief(data, instruction));
      }

      if (!MCP_BRIDGE_EXTRA_TOOL_IDS.has(name) && !STUDIO_TOOL_MAP[name]) {
        return rpcError(raw.id, -32602, `unknown tool: ${name}`);
      }
      const result = await deps.callBridge(name, args, MCP_BRIDGE_EXTRA_TOOL_IDS.has(name) && name !== 'visual_brief' ? BADGE_TIMEOUT_MS : bridgeTimeoutMs(name));
      return toolResponse(raw.id, result);
    }
    default:
      return rpcError(raw.id, -32601, `method not found: ${method}`);
  }
}
