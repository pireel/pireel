/**
 * Studio 的 MCP server 核心(纯函数,零 I/O)—— 外部 agent(Codex / Claude Code)
 * 经 /api/studio/mcp 用自己的模型驱动 studio 的全套编辑工具。
 *
 * 商业模式基石:LLM 编排烧的是用户自己的 Codex/Claude 订阅(这个端点不过
 * credits gate);块生成(add_block 等)仍由浏览器打回 /api/studio/compose,
 * 走既有 session 计费——生成照收费,编排免费。
 *
 * 架构:工具面 = STUDIO_TOOLS 原封复用(与内部 chat 同一张表,registry 加一个
 * 工具这里自动长出来),执行经 StudioBridge DO 转发回打开着的 studio 标签页
 * (bridge-do.ts 顶注释讲了为什么是桥不是服务端执行)。仅内容类工具服务端直答:
 * read_editing_guide / read_frame(正文只在 server)+ MCP 专属 list_frames。
 * get_state 过桥(局势在浏览器)——MCP 没有 system 注入快照的机制,靠它补。
 *
 * 协议:MCP streamable HTTP 的无状态子集(单请求单响应 JSON,无 SSE/会话头)。
 * Codex 与 Claude Code 的 HTTP transport 都兼容。本文件不做鉴权/不碰 DO——
 * 那是路由层的事,经 McpDeps 注入,好让 vitest 直接钉契约。
 */

import { MCP_DESCRIPTION_OVERRIDES, MCP_INSTRUCTIONS, STUDIO_TOOLS, STUDIO_TOOL_MAP } from './prompts';

/* ============================ JSON-RPC 形状 ============================ */

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

/* ============================ 依赖注入 ============================ */

/** 桥回执(浏览器 runStudioTool 的 StudioToolResult + get_state 的 state)。 */
export interface McpBridgeResult {
  ok: boolean;
  summary?: string;
  error?: string;
  data?: unknown;
  state?: string;
  [k: string]: unknown;
}

export interface McpDeps {
  /** 过桥执行(路由层 = StudioBridge DO stub fetch /call)。 */
  callBridge: (tool: string, input: Record<string, unknown>, timeoutMs: number) => Promise<McpBridgeResult>;
  /** frame 目录(路由层 = frameRegistry.list())。 */
  listFrames: () => { id: string; title: string; summary: string }[];
  /** frame playbook 正文(路由层 = frameRegistry.get + FRAME_PLAYBOOK_PREAMBLE)。 */
  readFrame: (frameId: string) => McpBridgeResult;
  /** 口播剪辑手册正文(路由层 = AROLL_GUIDE)。 */
  readEditingGuide: () => McpBridgeResult;
  /** BYO 块简报:桥回的 compose 上下文 + agent 的 instruction → {system,prompt}(路由层 = briefs.assembleComposeBrief + frameRegistry)。 */
  assembleComposeBrief: (bridgeData: Record<string, unknown>, instruction: string) => McpBridgeResult;
  /** BYO 规划简报:桥回的 plan 上下文 → {system,prompt}(路由层 = briefs.assemblePlanBrief)。 */
  assemblePlanBrief: (bridgeData: Record<string, unknown>) => McpBridgeResult;
  /** 图标查询(路由层 = icons.lookupIcons)——BYO 生成里 BLOCK_SYSTEM 引用的 get_icons 在 MCP 面同名可用。 */
  lookupIcons: (names: string[], kind?: string) => McpBridgeResult;
  /** 本地媒体导入登记(路由层 = 验 R2 对象 + 写/建项目行):agent 把用户本地视频传上
   *  字节汇合点后,用它把视频挂到项目上(含可选转写),全程不需要浏览器。 */
  importMedia: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
  /** 浏览器会话交接(路由层 = 一次性码落库 + 拼 /auth/handoff URL):agent 用它
   *  在自己的内置浏览器里拿到已登录的 studio 标签页——桥类工具的执行面。 */
  createBrowserHandoff: (args: Record<string, unknown>) => Promise<McpBridgeResult>;
}

/* ============================ 工具面 ============================ */

/** 服务端直答的工具(正文只在 server / 纯目录 / 直操作云状态):不过桥。 */
export const MCP_SERVER_TOOL_IDS = new Set(['read_editing_guide', 'read_frame', 'list_frames', 'get_icons', 'import_media', 'create_browser_handoff']);

/** MCP 专属过桥工具(不在 STUDIO_TOOLS 里,内部 chat 不可见):
 *  get_state=局势快照;apply_block/submit_plan=BYO 生成物的校验落块面;
 *  capture_frame=视觉验证(截帧回 image content,agent 能"看"自己改的效果)。
 *  compose_block_brief/plan_brief 是「桥取上下文+服务端组装」复合工具,单列于 dispatch。 */
export const MCP_BRIDGE_EXTRA_TOOL_IDS = new Set(['get_state', 'apply_block', 'submit_plan', 'capture_frame', 'visual_brief', 'submit_visual']);

/** brief 复合工具 → 桥上下文操作名(浏览器侧 runExternalTool 实现)。 */
export const MCP_BRIEF_TOOLS: Record<string, string> = {
  compose_block_brief: 'compose_context',
  plan_brief: 'plan_context',
};

/** 慢工具(浏览器里跑生成/分析,分钟级)的桥超时;即时操作给 60s。 */
const CARD_TIMEOUT_MS = 600_000;
const BADGE_TIMEOUT_MS = 60_000;

export function bridgeTimeoutMs(toolId: string): number {
  if (toolId === 'visual_brief') return CARD_TIMEOUT_MS; // 里面跑免费几何遍(分钟级),别按 extra 的 60s 掐
  return STUDIO_TOOL_MAP[toolId]?.kind === 'card' ? CARD_TIMEOUT_MS : BADGE_TIMEOUT_MS;
}

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const EMPTY_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/** MCP 工具列表:STUDIO_TOOLS 全量(description 按 MCP 语境改写)+ MCP 专属三件。 */
export function buildMcpTools(): McpToolDef[] {
  const out: McpToolDef[] = [];
  for (const d of STUDIO_TOOLS) {
    if (d.id === 'read_frame') {
      // MCP 版带 frame_id 参数(内部 chat 版从会话挂载态取,MCP 没有会话)
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
    /* ---------- BYO-brain 生成面:brief → 你生成 → apply 校验落块(不烧 Pireel credits) ---------- */
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
        "Import LOCAL files into Pireel (no browser, no manual API key). Videos land on a project; images (png/jpg/webp/gif) land in the asset library and return a reference URL for composed blocks. TWO STEPS: ① call with NO arguments → returns a short-lived import `token`; ② run the plugin's import helper (skills/asset-import/scripts/import-media.mjs) with `--token <token>` and the file paths — it uploads the bytes, probes metadata, transcribes audio (if ffmpeg is available), and registers everything by itself. You normally never call this tool WITH `sig` — the helper does that registration call. A project with existing footage is never clobbered (a new project is created). After import, offline tools (read_script/cut_narration/plan/captions) work immediately if a transcript was produced.",
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
  );
  return out;
}

/* ============================ 协议处理 ============================ */

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_SERVER_INFO = { name: 'pireel-studio', version: '1.0.0' };

function rpcResult(id: JsonRpcRequest['id'], result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, result };
}
function rpcError(id: JsonRpcRequest['id'], code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

/** 工具执行结果 → MCP content(文本 JSON;isError 让 agent 知道该改口而不是复述)。
 *  截帧结果转 image content(agent 直接"看");快照直接给正文(不裹 JSON)。 */
function toolResponse(id: JsonRpcRequest['id'], r: McpBridgeResult): JsonRpcResponse {
  if (r.ok && Array.isArray(r.images) && r.images.length) {
    // 多图(visual_brief 采样帧):文本(index/时刻/标注契约)在前,帧按 index 顺序跟随
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

/** 处理一条 JSON-RPC 消息。返回 null = 通知(notification),路由回 202 空响应。 */
export async function handleMcpRequest(raw: JsonRpcRequest, deps: McpDeps): Promise<JsonRpcResponse | null> {
  const method = raw.method;
  if (typeof method !== 'string') return rpcError(raw.id, -32600, 'invalid request: method required');

  // 通知(initialized/cancelled/…):无需响应
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
        return toolResponse(raw.id, deps.readEditingGuide());
      }

      // BYO 简报(复合:桥取上下文 → 服务端组装 prompt):LLM 归调用方,不烧 credits
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
