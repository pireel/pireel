/**
 * Studio 编辑 agent 的工具集 —— 一处定义,server / client 共用。
 *
 * 关键设计:这些工具**不在服务端 execute**。服务端只用它们的 JSON schema 把 tool
 * 挂进 streamText(模型据此发 tool-call);真正的执行发生在**客户端**——studio-chat
 * 的 useChat.onToolCall 收到 tool-call 后,调工作台传进来的 runTool 直接改 React 里的
 * Composition 状态(移块/裁剪/换取景…),再 addToolOutput 把结果喂回,模型继续/收尾。
 * 块内容生成(add_block / edit_block)仍复用 /api/studio/compose。
 *
 * 因此本文件必须 client-safe:零服务端依赖,schema 用裸 JSON(不引 zod)。
 */

import { CAPTION_PRESETS } from '../caption-presets';

export type StudioToolKind = 'badge' | 'card';

export interface StudioToolDef {
  id: string;
  /** badge = 即时状态变更(小徽章);card = 需生成、较慢(卡片显示 note)。 */
  kind: StudioToolKind;
  /** 信息流里的小图标(emoji)。 */
  icon: string;
  /** 中文 UI 标签(进度/卡片标题用)。 */
  label: string;
  /** 运行中的默认忙碌文案(还没有流式 note/阶段进度时卡片显示这个,别让用户干等静态字)。 */
  busyText?: string;
  /** 英文 agent 指令(进 system prompt + tool description)。 */
  description: string;
  /** JSON schema —— 服务端 jsonSchema() 包给 tool();客户端只读 input,不校验。 */
  inputSchema: Record<string, unknown>;
}

const TREATMENTS = ['full', 'punch-in', 'corner-br', 'corner-tl', 'split-l', 'split-r'] as const;

/** 小工具:拼一个 object schema。 */
function obj(
  properties: Record<string, unknown>,
  required: string[],
): Record<string, unknown> {
  return { type: 'object', additionalProperties: false, properties, required };
}

export const STUDIO_TOOLS: StudioToolDef[] = [
  /* ---------- frame(主题内容包;服务端执行,客户端只渲染卡片,无 runTool 实现) ---------- */
  {
    id: 'read_frame',
    kind: 'card',
    busyText: '翻开主题手册…',
    icon: '🎨',
    label: '读取 frame 主题',
    description:
      "Load the attached frame's playbook (theme content pack: design tokens, composition rules, per-block build recipes). When <frame_attached> appears in the system prompt, call this ONCE — BEFORE planning or generating anything — then follow the playbook. Its result persists in the conversation: if a read_frame result for this frame is already in the history, do NOT call it again. No input needed.",
    inputSchema: obj({}, []),
  },
  {
    id: 'attach_frame',
    kind: 'badge',
    busyText: '挂载主题…',
    icon: '🖼️',
    label: '挂载 frame 主题',
    description:
      "Attach a frame (theme content pack) to this conversation by id — its design tokens apply to the composition immediately and <frame_attached> will then tell you to read_frame. Call this when the user picks a frame from your recommendation, or names one explicitly. The catalog of ids appears in <frame_catalog> when none is attached. Also usable to SWITCH to a different frame.",
    inputSchema: obj({ frame_id: { type: 'string', description: 'Frame id from the catalog, e.g. "biennale-poster"' } }, ['frame_id']),
  },
  /* ---------- 口播剪辑判断手册(单独技能内容包;服务端执行,客户端只渲染卡片,无 runTool 实现) ---------- */
  {
    id: 'read_editing_guide',
    kind: 'card',
    busyText: '翻开口播剪辑手册…',
    icon: '✂️',
    label: '读取剪辑手册',
    description:
      "Load the A-roll speech-cleanup playbook (complete-semantic-unit editing, retakes, false starts, two-tier fillers, boundary discipline). Call this ONCE — BEFORE any transcript-based speech cut (cleanup / de-filler / tighten / cut_narration / a highlight or short version) — then follow it. Its result persists in the conversation: if a read_editing_guide result is already in the history, do NOT call it again. No input needed.",
    inputSchema: obj({}, []),
  },
  /* ---------- 成片流水线(从口播视频到初稿,card · 慢) ---------- */
  {
    id: 'extract_asr',
    kind: 'card',
    busyText: '抽音频、转写口播稿…',
    icon: '📝',
    label: '提取口播稿',
    description:
      'Transcribe the spoken audio (extract audio → ASR) into timed sentences — the raw material for planning and storyboarding. Covers the main video AND every inserted other-source segment (each transcript section on its own source clock). It does NOT add captions and does NOT cut shots (captions are a theme option; storyboarding is lay_out). Run to (re)fetch the transcript. No input. Cheap to re-run (cached per file).',
    inputSchema: obj({}, []),
  },
  {
    id: 'read_script',
    kind: 'badge',
    busyText: '读取口播稿…',
    icon: '📖',
    label: '读取口播稿',
    description:
      "Read the full spoken transcript: main narration sentences (source-video seconds — the same clock as shot src in→out, never shifted by cutting) PLUS what each clip inserted from another source file says (in that file's own seconds). Call it for content-level requests — locating a sentence for cut_range / turning a claim into a graphic / answering what a segment says — when no transcript is in the conversation yet (an extract_asr result also carries it; don't call both). Transcribes inserted clips on demand; main narration requires extract_asr first. No input.",
    inputSchema: obj({}, []),
  },
  {
    id: 'analyze_narration',
    kind: 'card',
    busyText: '通读文稿、规划场景…',
    icon: '🧠',
    label: '分析口播稿',
    description:
      'Plan the whole piece from the narration: SEGMENT the script into scenes (group consecutive sentences by meaning), and for each scene pick a framing (full / punch-in / corner / split) + a DESIGNED graphic brief (metric / comparison / chart / pipeline / structure / KPI / timeline / callout, with real data pulled from the script). Designed graphics are the main event. Auto-runs extract_asr first if needed. No input.',
    inputSchema: obj({}, []),
  },
  {
    id: 'analyze_visual',
    kind: 'card',
    busyText: '逐帧分析画面…',
    icon: '🎬',
    label: '分析画面',
    description:
      'Analyze the footage LOCALLY (scene cuts + MediaPipe safe-zones/face + sparse VLM content) so graphics avoid the speaker. Slow (runs frame-by-frame in the browser) — shows a live progress + ETA. No input. Cached per file.',
    inputSchema: obj({}, []),
  },
  {
    id: 'lay_out',
    kind: 'card',
    busyText: '铺分镜结构、落占位…',
    icon: '✦',
    label: '分镜',
    description:
      'STORYBOARD the video: slice shots (by sentence ∪ scene cuts), apply framing (punch-in / corner / split) per the plan, and drop PLACEHOLDER slots where graphics should go (no graphics drawn yet — that is the next step). Auto-runs any missing prerequisite (ASR → narration plan ‖ visual analysis). Overwrites the composition structure, EXCEPT segments inserted from other source files — those are preserved at their timeline positions. No input. Captions/keyword overlays are added only if the theme enables them (general theme: off). Follow with add_graphics.',
    inputSchema: obj({}, []),
  },
  {
    id: 'add_graphics',
    kind: 'card',
    busyText: '设计图形生成中…',
    icon: '🎨',
    label: '配图',
    description:
      'ILLUSTRATE: fill placeholder slots from lay_out with DESIGNED fragments (card / chart / flow-or-structure diagram / KPI / callout), generated concurrently with live progress. Auto-runs lay_out first if there are no placeholders yet. Use after lay_out, when the user asks for the graphics to be drawn, or for a fresh full-draft run lay_out then add_graphics. Optional `blockIds` = only (re)illustrate these placeholder blocks (marked [placeholder] in <composition_state>); omit to fill ALL pending placeholders.',
    inputSchema: obj(
      {
        blockIds: { type: 'array', items: { type: 'string' }, description: 'Optional: placeholder block ids to (re)illustrate. Omit for all pending.' },
      },
      [],
    ),
  },

  /* ---------- 块内容(走 compose 生成,card) ---------- */
  {
    id: 'add_block',
    kind: 'card',
    busyText: '构思并编写这个组件…',
    icon: '✨',
    label: '加组件',
    description:
      'Add a NEW overlay element (a title card, big number/stat, bullet list, or an animated keyword caption). The actual HTML/animation is generated from your instruction. Use when the user wants something that is not on screen yet. Put a concrete, self-contained instruction in `instruction` (what it says + the look), written in the video\'s language (match the transcript unless the user says otherwise). Optional `atSec` = where on the timeline it starts (defaults to the current playhead).',
    inputSchema: obj(
      {
        instruction: { type: 'string', description: 'Instruction describing the new element (content + style).' },
        atSec: { type: 'number', description: 'Timeline start in seconds. Omit to use the playhead.' },
      },
      ['instruction'],
    ),
  },
  {
    id: 'edit_block',
    kind: 'card',
    busyText: '重写这块的排版/动画…',
    icon: '🎨',
    label: '改这块',
    description:
      "Edit ONE existing overlay block's content, styling or animation (e.g. make the keyword red and bigger, change the caption effect, add an outline, slow it down). Pass the target `blockId` (from <composition_state>; if the user wrote @id use that) and a concrete `instruction`. Do NOT use this for moving/resizing on the timeline — use move_block/resize_block for that.",
    inputSchema: obj(
      {
        blockId: { type: 'string', description: 'Target block id from <composition_state>.' },
        instruction: { type: 'string', description: 'Instruction describing the change.' },
      },
      ['blockId', 'instruction'],
    ),
  },

  /* ---------- 块时间/位置(即时,badge) ---------- */
  {
    id: 'move_block',
    kind: 'badge',
    icon: '↔️',
    label: '移动',
    description:
      'Move an overlay block to a new start time on the timeline (keeps its duration). `startSec` is the new absolute start in seconds.',
    inputSchema: obj(
      {
        blockId: { type: 'string' },
        startSec: { type: 'number', description: 'New absolute start in seconds (>= 0).' },
      },
      ['blockId', 'startSec'],
    ),
  },
  {
    id: 'resize_block',
    kind: 'badge',
    icon: '⌛',
    label: '改时长',
    description:
      "Change an overlay block's start and/or duration on the timeline. Provide the full new `startSec` and `durationSec` (seconds).",
    inputSchema: obj(
      {
        blockId: { type: 'string' },
        startSec: { type: 'number' },
        durationSec: { type: 'number', description: 'New duration in seconds (>= 0.3).' },
      },
      ['blockId', 'startSec', 'durationSec'],
    ),
  },
  {
    id: 'delete_block',
    kind: 'badge',
    icon: '🗑️',
    label: '删除',
    description: 'Delete an overlay block entirely.',
    inputSchema: obj({ blockId: { type: 'string' } }, ['blockId']),
  },
  {
    id: 'delete_blocks',
    kind: 'badge',
    icon: '🗑️',
    label: '批量删除',
    description: 'Delete SEVERAL overlay blocks in one call (e.g. clearing every caption-like block at once). Pass all target ids.',
    inputSchema: obj({ blockIds: { type: 'array', items: { type: 'string' } } }, ['blockIds']),
  },
  {
    id: 'duplicate_block',
    kind: 'badge',
    icon: '⧉',
    label: '复制',
    description:
      'Duplicate an overlay block (same content/box/track, new id). `atSec` = where the copy starts; omit to place it right after the original. Use then edit_block to vary the copy.',
    inputSchema: obj({ blockId: { type: 'string' }, atSec: { type: 'number' } }, ['blockId']),
  },
  {
    id: 'get_block',
    kind: 'badge',
    icon: '🔍',
    label: '查看块',
    description:
      "INSPECT one overlay block: returns its timing/track/box plus its actual content (HTML + animation, truncated). Use BEFORE edit_block when you need to know what's inside (e.g. to answer questions about it, or to make a precise change), or to debug why something looks wrong.",
    inputSchema: obj({ blockId: { type: 'string' } }, ['blockId']),
  },
  {
    id: 'focus_element',
    kind: 'badge',
    icon: '🎯',
    label: '定位',
    description:
      'SHOW the user an element: select it and move the playhead/preview to it. Use when you reference something the user should look at, or after creating/changing an element so the user sees the result.',
    inputSchema: obj({ id: { type: 'string', description: 'block or shot id' } }, ['id']),
  },

  /* ---------- 字幕(全局预设层:整句字幕/逐词强调,从口播稿铺,一处调全片生效) ---------- */
  {
    id: 'set_captions',
    kind: 'card',
    busyText: '按口播稿铺字幕…',
    icon: '💬',
    label: '设字幕',
    description:
      "Turn sentence captions ON and/or restyle them — the global subtitle layer laid from the transcript (ONE setting styles the WHOLE video; this is NOT a per-block edit). `preset` = a style id from <caption_catalog> (enabling captions if off, rebuilding the layer from the transcript — runs ASR first if needed). `yPct` = caption baseline's distance from the top as a % (smaller = higher). `scale` = size multiplier (1 = preset default). Use for turning captions on, switching their style, or nudging position/size. Pick the preset whose name+mode fits the ask; default to a clean full-line style (a `line` preset) when no style is named. Turn captions OFF with remove_captions. The keyword-slam overlay is a different thing — that is a block (add_block/edit_block).",
    inputSchema: obj(
      {
        preset: { type: 'string', enum: CAPTION_PRESETS.map((p) => p.id), description: 'Caption style id from <caption_catalog>. Omit to only reposition/resize the current captions.' },
        yPct: { type: 'number', description: "Caption baseline's % from the top (smaller = higher). Omit to keep." },
        scale: { type: 'number', description: 'Size multiplier, 1 = preset default. Omit to keep.' },
      },
      [],
    ),
  },
  {
    id: 'remove_captions',
    kind: 'badge',
    icon: '🚫',
    label: '移除字幕',
    description:
      'Remove the whole sentence-caption layer (turn subtitles off). Does not touch keyword overlay elements (delete those with delete_block).',
    inputSchema: obj({}, []),
  },
  {
    id: 'set_caption_translations',
    kind: 'badge',
    icon: '🌐',
    label: '双语字幕',
    description:
      'Add a translation line under the sentence captions (bilingual subtitles) — YOU do the translating, this tool only stores it. Workflow: read_script → translate each numbered sentence yourself → pass `items` as {index (the row number from read_script), text (your translation)}. Translations attach to the transcript, so they survive cuts, restyles and re-lays; a re-transcription (extract_asr on a new file) drops them. Main narration by default; pass `shotId` (an inserted-clip shot) to translate that clip\'s own transcript instead. `text: ""` removes one line; `clear: true` removes ALL translations. If captions are off, translations are stored and appear once set_captions turns them on. Use for bilingual / translated subtitles.',
    inputSchema: obj(
      {
        items: {
          type: 'array',
          description: 'Per-sentence translations; index = the transcript row number shown by read_script.',
          items: obj({ index: { type: 'number' }, text: { type: 'string', description: 'Your translation of that sentence (empty string removes it).' } }, ['index', 'text']),
        },
        shotId: { type: 'string', description: "An inserted-clip shot id — targets that clip's transcript. Omit for the main narration." },
        clear: { type: 'boolean', description: 'true = remove every translation (all sources); items is then ignored.' },
      },
      [],
    ),
  },

  /* ---------- 视频轨分镜(即时,badge) ---------- */
  {
    id: 'set_shot_treatment',
    kind: 'badge',
    icon: '🎯',
    label: '取景',
    description:
      'Set how a video shot is framed: full (full screen), punch-in (zoom in for emphasis), corner-br/corner-tl (shrink to a corner to make room for graphics), split-l/split-r (video takes the left/right half, the other half left for blocks). Framing applies to the WHOLE shot — to frame only part of it, split_shot first.',
    inputSchema: obj(
      {
        shotId: { type: 'string' },
        treatment: { type: 'string', enum: [...TREATMENTS] },
      },
      ['shotId', 'treatment'],
    ),
  },
  {
    id: 'set_video_filter',
    kind: 'badge',
    icon: '🎨',
    label: '调色',
    description:
      "Color-grade ONE shot's footage: brightness / contrast / saturate as coefficients (1 = untouched; e.g. 1.15 = +15%). The values you pass REPLACE that shot's whole grade — omit a field to reset it to neutral, pass no fields at all to remove the grade. Applies to the WHOLE shot and snaps at the cut (no cross-shot blend) — split_shot first to grade only part. Typical asks: brighter → brightness 1.1–1.2; more vivid → saturate 1.2–1.4 (+ contrast 1.05); black & white → saturate 0; muted/cinematic gray → saturate 0.7–0.85. Preview and export share the same filter pipeline.",
    inputSchema: obj(
      {
        shotId: { type: 'string' },
        brightness: { type: 'number', description: 'Brightness coefficient, 1 = untouched (clamped 0.2–3).' },
        contrast: { type: 'number', description: 'Contrast coefficient, 1 = untouched (clamped 0.2–3).' },
        saturate: { type: 'number', description: 'Saturation coefficient, 1 = untouched, 0 = grayscale (clamped 0–3).' },
      },
      ['shotId'],
    ),
  },
  {
    id: 'split_shot',
    kind: 'badge',
    icon: '✂️',
    label: '剪开',
    description:
      'Split the video at a point into two shots (content unchanged). `atSec` = where to cut (edited timeline seconds); omit to use the playhead.',
    inputSchema: obj({ atSec: { type: 'number' } }, []),
  },
  {
    id: 'trim_shot',
    kind: 'badge',
    icon: '🔪',
    label: '裁剪',
    description:
      'Trim away footage to one side of a point, within that point\'s shot. `side` = "left" or "right". Optional `atSec` = the anchor (edited timeline seconds); omit to use the playhead. Everything after shifts left to close the gap.',
    inputSchema: obj(
      {
        side: { type: 'string', enum: ['left', 'right'] },
        atSec: { type: 'number', description: 'Anchor in edited seconds. Omit to use the playhead.' },
      },
      ['side'],
    ),
  },
  {
    id: 'delete_shot',
    kind: 'badge',
    icon: '🚫',
    label: '删场景',
    description: 'Remove a whole video shot (its source footage is cut; later shots shift earlier). Works on inserted other-source segments too.',
    inputSchema: obj({ shotId: { type: 'string' } }, ['shotId']),
  },
  {
    id: 'cut_range',
    kind: 'badge',
    icon: '✂️',
    label: '删区间',
    description:
      'Remove a TIME RANGE of footage by EDITED-timeline seconds: everything between fromSec and toSec is cut (can span shots), later content shifts left, overlay blocks compress. To cut BY THE SCRIPT (remove the passage that says X) use cut_narration instead — it takes the transcript timestamps directly. Use cut_range for a raw edited-timeline range, or for footage inside an inserted [clip X] segment (its own clock — read that shot\'s edited a→b from <composition_state>). Preferred over split+split+delete.',
    inputSchema: obj(
      {
        fromSec: { type: 'number', description: 'Edited-timeline start of the cut (seconds).' },
        toSec: { type: 'number', description: 'Edited-timeline end of the cut (seconds).' },
      },
      ['fromSec', 'toSec'],
    ),
  },
  {
    id: 'cut_narration',
    kind: 'badge',
    icon: '✂️',
    label: '删口播',
    description:
      'Delete spoken passages BY THE TRANSCRIPT — the script-editing cut. Pass MAIN NARRATION timestamps straight from read_script / the transcript (the [x–y s], which are SOURCE seconds): this tool converts them to the edited timeline itself, cuts the footage, compresses overlays, and re-lays captions so the deleted words drop out. Use for any remove-what-was-said request (a passage, one sentence, several sentences). `ranges` = one or more {fromSec,toSec} removed in ONE call; already-partly-cut spans just remove whatever survives. MAIN narration only — inserted [clip X] segments have their own clock: cut those with cut_range (edited seconds) or delete_shot.',
    inputSchema: obj(
      {
        ranges: {
          type: 'array',
          description: 'Narration source-second ranges to remove (from read_script timestamps).',
          items: obj({ fromSec: { type: 'number' }, toSec: { type: 'number' } }, ['fromSec', 'toSec']),
        },
      },
      ['ranges'],
    ),
  },
  {
    id: 'insert_clip',
    kind: 'card',
    busyText: '拉取并插入片段…',
    icon: '🎞️',
    label: '插入片段',
    description:
      "Insert a B-roll video segment into the main track. The bytes must already be on Pireel storage — pass `sig` (the fingerprint the asset-import helper returns after uploading a local file) OR `url` (a video from the user's asset library / a generated video; external URLs are rejected — upload them first). `atSec` = where on the EDITED timeline (defaults to the playhead); it snaps to the nearest shot boundary and shifts later overlays right. The inserted segment is a full peer: framing, captions, matting and its own audio all apply, and its speech gets transcribed on demand. Needs the studio tab open (video bytes live in the browser). Then verify with get_state.",
    inputSchema: obj(
      {
        sig: { type: 'string', description: 'Media fingerprint from the asset-import helper upload (preferred for local files).' },
        url: { type: 'string', description: "URL of a video already on the user's Pireel storage/CDN." },
        atSec: { type: 'number', description: 'Edited-timeline insertion point (defaults to the playhead; snaps to the nearest cut).' },
      },
      [],
    ),
  },
  {
    id: 'add_transition',
    kind: 'badge',
    icon: '🎬',
    label: '转场',
    description:
      "Set/replace/remove the CONTENT transition at a cut between two shots (the footage of the two shots hands over — not an overlay). `atSec` must be a shot boundary from <composition_state> (±0.3s snap; anything else is rejected). One transition per cut, symmetric around it. `effect` (gl-transitions set): fade (cross-fade, the default), fadeblack (dip to black), directional (push), directionalwipe (wipe), circleopen (iris), windowslice (blinds), crosszoom (zoom blur punch), rotatescale (rotate+zoom), glitch (glitch memories), dreamy (wavy); 'none' removes. `direction` (directional/directionalwipe only) = the incoming footage's travel direction, default left. `durationSec` = TOTAL length (max 4, clamped by both shots' lengths; default 1). The region shows on the timeline and cannot be split inside; deleting either adjacent shot clears the transition. Use sparingly — hard jump-cuts are the default look.",
    inputSchema: obj(
      {
        atSec: { type: 'number', description: 'A shot-boundary time (edited seconds).' },
        effect: { type: 'string', enum: ['fade', 'fadeblack', 'directional', 'directionalwipe', 'circleopen', 'windowslice', 'crosszoom', 'rotatescale', 'glitch', 'dreamy', 'none'], description: "Transition style (default dissolve); 'none' removes." },
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'directional/directionalwipe only: travel direction of the incoming footage (default left).' },
        durationSec: { type: 'number', description: 'Total duration in seconds, max 4 (default 1; keeps the current value when re-styling).' },
      },
      ['atSec'],
    ),
  },
  {
    id: 'undo',
    kind: 'badge',
    icon: '↩️',
    label: '撤销',
    description:
      'Undo the last composition change made through tools (one step per call; a small history is kept). Use when the user rejects a change or asks to roll back. Does not cover manual timeline drags.',
    inputSchema: obj({}, []),
  },

  /* ---------- 导出(本地客户端合成,card · 慢) ---------- */
  {
    id: 'export_video',
    kind: 'card',
    busyText: '本地合成成片…',
    icon: '🎞️',
    label: '导出成片',
    description:
      "Start exporting the final video. Renders LOCALLY in the user's open studio tab (WebCodecs; roughly realtime, so a 3-min video takes ~3 min) and saves it via the browser's download — the file lands on the user's machine (Downloads folder by default), nothing is uploaded. Poll track_export for progress and the final filename. The tab must stay open until done. Options: resolution 2160/1440/1080/720/540 (default 1080), fps 24/30/60 (default 30), format mp4/webm/mov (default mp4).",
    inputSchema: obj(
      {
        resolution: { type: 'number', description: 'Output height: 2160/1440/1080/720/540 (default 1080).' },
        fps: { type: 'number', description: '24/30/60 (default 30).' },
        format: { type: 'string', enum: ['mp4', 'webm', 'mov'], description: 'Container (default mp4).' },
      },
      [],
    ),
  },
  {
    id: 'track_export',
    kind: 'badge',
    icon: '⏳',
    label: '查询导出',
    description:
      "Check the running export: returns {status: running|done|idle, progress %, filename when done}. Poll every ~15s after export_video. When done, the file was already saved by the browser's download (Downloads folder by default) — locate it there by the returned filename (watch for an in-progress .crdownload first) and confirm the path to the user.",
    inputSchema: obj({}, []),
  },
];

export const STUDIO_TOOL_MAP: Record<string, StudioToolDef> = Object.fromEntries(
  STUDIO_TOOLS.map((d) => [d.id, d]),
);

/** 工具结果(client runTool 返回 → addToolOutput → 模型 + 卡片渲染共用)。 */
export interface StudioToolResult {
  ok: boolean;
  /** 一句中文小结(成功时给卡片/徽章显示,也给模型续写参考)。 */
  summary?: string;
  /** 失败原因。 */
  error?: string;
  /** 查询类工具的结构化数据(给模型看的,如 get_block 的块详情;卡片不渲染)。 */
  data?: unknown;
  /** 截帧类工具的图像(base64,无 data: 前缀)——MCP 面转成 image content 给外部 agent"看"。 */
  image?: { data: string; mimeType: string };
  /** 多图(visual_brief 的采样帧)——MCP 面逐张转 image content。 */
  images?: { data: string; mimeType: string }[];
}
