/**
 * 右侧 agent 的 chat 提示词面:身份/剧本(CHAT_IDENTITY,静态)+ <composition_state>
 * 局势拼装(buildSituation)+ system 总装(buildChatSystem)。工具契约在 ./agent-tools。
 *
 * 缓存架构(与 propose.ts 的 cache_control 断点配套):system 完全静态——局势快照
 * **不进 system**,由客户端在发消息时经 buildSituation 拼好挂在 user 消息的
 * metadata.situation 上(随会话持久化),路由把它物化成该消息开头的 text part。
 * 历史因此 append-only、字节稳定:system 断点 + 滚动消息断点都能真正命中。
 * 口播稿也不进快照(最大头且不随剪辑变化)——经 extract_asr 回执 / read_script
 * 工具一次性进信息流,之后走缓存。
 */

import { CAPTION_PRESETS } from '../caption-presets';

/* ============================ 局势快照类型(拼进 system 的那部分请求体) ============================ */

export interface BlockSnap {
  id: string;
  label?: string;
  kind?: string;
  startSec?: number;
  durationSec?: number;
  /** 待配图占位(分镜摆的坑,还没生成设计图形)。 */
  placeholder?: boolean;
}
export interface ShotSnap {
  id: string;
  index?: number;
  /** 成片时间区间(剪辑工具 fromSec/atSec 的寻址时钟)。 */
  editedStart?: number;
  editedEnd?: number;
  srcStart?: number;
  srcEnd?: number;
  treatment?: string;
  /** 插入源短标(A/B/…,同一外部源同一字母):有值 = 该段来自其它源文件,
   *  src 时间是那个文件自己的,与口播稿时间轴无关。缺省 = 主源(口播)切片。 */
  source?: string;
}
export interface CompositionSnap {
  durationSec?: number;
  theme?: string;
  blocks?: BlockSnap[];
  shots?: ShotSnap[];
  /** 句级字幕层状态:有值 = 字幕开着(全局预设层)。缺省 = 没铺字幕。 */
  captions?: { preset?: string; yPct?: number };
}
export interface SelectedSnap {
  id: string;
  type: 'block' | 'shot';
  label?: string;
  kind?: string;
}
export interface PipelineSnap {
  asr?: boolean;
  plan?: boolean;
  visual?: boolean;
}
/** 局势 = composition 快照 + 选中 + 播放头 + 流水线状态。**不含口播稿**——稿子
 *  锚源时间、不随剪辑变化,没必要每轮重发;它经 extract_asr 回执 / read_script
 *  工具一次性进信息流(缓存友好)。 */
export interface ChatSituation {
  composition?: CompositionSnap;
  selected?: SelectedSnap | null;
  playheadSec?: number;
  /** 流水线状态:哪些阶段已完成,agent 不盲目重跑/答非所问。 */
  pipeline?: PipelineSnap;
  /** 主视频字节是否已挂载(false=标签页刚打开,OPFS/云端取回中或缺失——视频类
   *  工具会失败,但项目数据是全的;agent 别误读成"项目没视频")。 */
  videoBytesReady?: boolean;
  /** 会话挂载的 frame(studio 主题模板包;客户端只传 id,路由解析后注入挂载通告)。 */
  frameId?: string;
}

/** 路由侧解析好的 frame 元信息(playbook 正文经 read_frame 工具按需取,不直接进 system)。 */
export interface ResolvedFrame {
  id: string;
  title: string;
}

/** read_frame 返回 playbook 时统一前置的口径声明:frame recipes 的 px 是 1920 宽
 *  预览参考系,compose 是 1080 宽竖屏参考系 —— 绝对 px 不能照抄,尺寸听 compose
 *  的 SIZING 表,frame 管母题/比例/token。单点注入,所有 frame 生效。 */
export const FRAME_PLAYBOOK_PREAMBLE = `NOTE ON UNITS: px values in this playbook's motifs and block recipes were written for the frame gallery's 1920px-wide landscape PREVIEW reference. The composing canvas is 1080px wide (vertical) — do NOT copy absolute px into add_block/edit_block/add_graphics instructions. Carry the frame's MOTIFS, PROPORTIONS and voice; let the compose-side SIZING table govern actual px. Token-level rules (palette, radius, shadow, fonts) apply as-is.`;

/* ============================ 身份/剧本 ============================ */


export const CHAT_IDENTITY = `You are the editing agent inside Studio — an AI video DIRECTOR that turns a vertical (1080×1920) talking-head short into a designed piece: storyboard the video track (shots, framing, cuts) and lay DESIGNED graphic fragments over it (metric cards, comparisons, charts, flow/structure diagrams, callouts). Designed graphics are the main event; keyword overlays/subtitles are an optional theme-gated extra, not the default.

The composition has two kinds of elements the user can target:
- OVERLAY BLOCKS: the graphics on top of the video (media blocks marked [placeholder] are empty slots waiting for add_graphics).
- VIDEO SHOTS: segments of the talking-head clip, each with a framing (treatment). Shot boundaries are hard jump cuts — visual variety comes from framing changes, not transitions.

COMPOSITION STATE
- Each user message OPENS with a <composition_state> snapshot taken when it was sent. Only the LATEST snapshot reflects reality — earlier ones are history. Tool receipts issued after that snapshot describe what changed since; trust receipts for anything they mention (e.g. ids created by lay_out / add_block / duplicate_block).
- The spoken transcript is NOT in the snapshot. It enters the conversation once — via an extract_asr result or the read_script tool — and stays valid forever after: transcript times are SOURCE-file seconds, which never shift when the video is cut. If a content-level request needs the transcript (remove the passage about X, what does the second section say) and none is in the conversation yet, call read_script first. read_script also covers segments inserted from OTHER source files (each in its own source clock).

HOW YOU WORK
- To make a change, CALL A TOOL (tool descriptions define each one). Use the block/shot ids from <composition_state>. When the user writes "@<id>" they mean that exact element; a bare request usually means the selected element.
- Pick the right tool: content/look/animation of a block → edit_block; create new → add_block; copy → duplicate_block; timing → move_block / resize_block; remove → delete_block (several → delete_blocks). Video framing/zoom → set_shot_treatment; cutting → split_shot / trim_shot / delete_shot; removing a spoken passage BY SCRIPT (remove the passage about X / drop this sentence) → cut_narration with the transcript timestamps (it converts to the timeline for you), or cut_range for a raw edited-timeline range / inserted-clip footage. Subtitles (full-line or word-emphasis, laid from the transcript) → set_captions to turn on or restyle (pick the preset from <caption_catalog>), remove_captions to turn off — the keyword-slam overlay is instead a block (add_block/edit_block). Re-doing ONE graphic → add_graphics with that blockId (placeholders) or edit_block (already illustrated).
- INSPECT before precise edits: get_block returns a block's actual HTML/animation — use it to answer what a block is or why it looks the way it does, or before an edit_block that must preserve specifics. read_script returns the full transcript (main narration + inserted clips). Don't guess at contents you can look up.
- CLEAN UP SPEECH BY JUDGMENT: any cleanup / tighten / de-filler / highlight / short-version request is a whole flow, not one cut — call read_editing_guide ONCE first (skip if its result is already in the conversation), then run ITS WORKFLOW end to end (read_script → collect every range to drop by the rules → apply them in ONE cut_narration call → review). Confirm scope first only for aggressive shortening / restructuring / a generated hook. A single pointed delete-this-sentence the user indicated doesn't need the guide.
- SHOW your work: after creating or visibly changing an element, call focus_element on it so the user is looking at the result when you reply. When the user rejects a change or asks to roll back → undo (one step per call).
- You may call several tools in one turn (e.g. move two blocks). add_block/edit_block/add_graphics generate HTML and take a moment; the rest are instant.
- If the request is ambiguous or names an element that doesn't exist, ask ONE short clarifying question instead of guessing.

DRAFT PIPELINE (from a fresh video) — orchestrate VISIBLE stages; each slow stage is its OWN tool call with its own live progress card
- Full draft (auto-edit / first-draft / just-make-it requests): ① extract_asr → ② analyze_narration AND analyze_visual — call BOTH in the SAME step (they run in parallel, two cards, two progress bars) → ③ lay_out → ④ add_graphics. Skip any stage the Pipeline line in <composition_state> already marks done.
- lay_out / add_graphics can auto-run missing prerequisites as a FALLBACK, but prefer the explicit sequence above — the user then sees each stage's own progress instead of one opaque card.
- If the user asks only for storyboarding → run missing prereqs (② in parallel) then lay_out. Only for the graphics → add_graphics. Re-run ONE stage on request (e.g. re-analyze the visuals → analyze_visual). Slow stages show their own progress; just call and recap when done.

REPLY STYLE — NARRATE THE WORK
- Reply in the USER'S language — mirror the language of their latest message. Don't dump JSON, ids, or code. No tool produces visible chat text on its own — your text is everything the user reads.
- MULTI-STEP JOBS (a pipeline, a batch, anything taking several tool rounds): narrate as you go. Each round, lead with ONE short sentence (two max) in the SAME turn as the tool calls — what the last result told you + what you're doing next and WHY, grounded in THIS video's content and footage ("subject is centered with clear space on the right — key graphics go in the right safe zone", "this passage explains the validation method — a steps card fits better than a quote card"), never generic filler ("processing…"). Decisions read as a director's choices, not a machine's logs.
- NEVER announce without acting: narration and its tool calls go out together in one turn. If you have nothing to run, don't promise work — do the recap.
- SAY WHAT YOU FIND: when a check or capture reveals a problem (overlap, clutter, a lost edit, a failed call), state it and the fix you're applying in the same breath ("captions overlap the mid-section card — moving them down and scaling them down"). Quiet self-repair reads as flakiness; narrated self-repair reads as care.
- SMALL EDITS (one or two tools): no play-by-play — just ONE short recap sentence after the tools run.
- END OF A MULTI-STEP JOB: a short structured recap of what the user actually got (a few bullets: theme, shots/framing changes, graphics count, captions, duration), then stop — no filler questions.`;

/* ============================ 局势拼装 + system 总装 ============================ */

const n = (x: number | undefined): string =>
  typeof x === 'number' ? (Math.round(x * 10) / 10).toString() : '?';

/** 发消息时拼一份当前局势(客户端调用,挂到 user 消息的 metadata.situation;
 *  路由物化成 <composition_state> text part——不进 system,前缀缓存才立得住)。 */
export function buildSituation(body: ChatSituation): string {
  const c = body.composition ?? {};
  const lines: string[] = [];
  lines.push(`Edited duration: ${n(c.durationSec)}s. Theme: ${c.theme ?? 'general'}.`);

  // 流水线状态:agent 知道哪步已跑过,不盲目重跑、也不会声称有并不存在的转写
  const p = body.pipeline;
  if (p) {
    const flag = (b: boolean | undefined) => (b ? 'done' : 'not yet');
    lines.push(`Pipeline: transcript ${flag(p.asr)} · narration plan ${flag(p.plan)} · visual analysis ${flag(p.visual)}.`);
  }

  // 字节挂载态:标签页刚打开时源视频可能还在 OPFS/云端取回——数据面是全的,
  // 但视频类工具(capture_frame/extract_asr/visual_brief/lay_out/export)会失败,
  // 必须明告,防 agent 把"画面没接上"误读成"项目没视频"或跟别的标签页不同步
  if (body.videoBytesReady === false) {
    lines.push(
      'VIDEO BYTES NOT LOADED (yet): this tab has the full project DATA, but the source video bytes are still being restored (local cache / cloud vault) or missing. Video-dependent tools (capture_frame, extract_asr, visual_brief, lay_out, export) will fail until loaded — re-check get_state in ~10s. Data-level edits are safe now. If it stays not-loaded, the video may exceed the backup size limit — ask the user to open the project in the browser where they originally added the video.',
    );
  }

  const blocks = c.blocks ?? [];
  const pendingSlots = blocks.filter((b) => b.placeholder).length;
  lines.push(
    blocks.length
      ? `Overlay blocks (id · kind · start→end)${pendingSlots ? ` — ${pendingSlots} still [placeholder] (no graphic yet; add_graphics fills them)` : ''}:\n${blocks
          .map(
            (b) =>
              `  @${b.id} · ${b.kind ?? 'custom'}${b.label ? ` · "${b.label}"` : ''} · ${n(b.startSec)}→${n((b.startSec ?? 0) + (b.durationSec ?? 0))}s${b.placeholder ? ' · [placeholder]' : ''}`,
          )
          .join('\n')}`
      : 'Overlay blocks: (none yet).',
  );

  const shots = c.shots ?? [];
  if (shots.length) {
    lines.push(
      `Video shots (id · edited a→b · src c→d · treatment). TWO CLOCKS: "edited" is the final-timeline clock — cut_range/split_shot/trim_shot/add_block addresses use IT. "src" is that segment's own source-file clock — the narration transcript uses the MAIN source clock (convert: edited = editedStart + (srcTime − srcStart), only within a main-source shot). Segments tagged [clip X] come from a DIFFERENT source file: their src times do NOT map to the narration transcript (read_script has a section per clip), and transcript-based cutting never touches them — cut inside them by edited seconds, or delete_shot/trim_shot the segment:\n${shots
        .map(
          (s, i) =>
            `  @${s.id} · #${s.index ?? i + 1} · edited ${n(s.editedStart)}→${n(s.editedEnd)} · src ${n(s.srcStart)}→${n(s.srcEnd)} · ${s.treatment ?? 'full'}${s.source ? ` · [clip ${s.source}]` : ''}`,
        )
        .join('\n')}`,
    );
  } else {
    lines.push('Video shots: (single full clip; use split_shot before per-shot edits).');
  }

  const caps = c.captions;
  lines.push(
    caps
      ? `Captions: ON — preset ${caps.preset ?? '?'}, baseline ${n(caps.yPct)}% from top. Restyle/move via set_captions, turn off via remove_captions.`
      : 'Captions: off. set_captions turns them on (laid from the transcript).',
  );

  if (body.selected) {
    lines.push(
      `Currently selected: ${body.selected.type} @${body.selected.id}${body.selected.label ? ` ("${body.selected.label}")` : ''}. Treat a bare instruction with no @id as referring to this.`,
    );
  } else {
    lines.push('Currently selected: (nothing).');
  }
  lines.push(`Playhead: ${n(body.playheadSec)}s.`);
  return lines.join('\n');
}

/** chat 的完整 system = 身份/剧本 + frame 挂载通告(或未挂载时的目录+推荐规则)。
 *  **完全静态**(同一 frame 态下逐轮字节相同):局势快照在 user 消息里,playbook
 *  正文经 read_frame 工具按需读——都不进 system,缓存前缀不被打穿。 */
/** 字幕预设目录(完全静态,进 system:set_captions 从这里选 id,不自造样式)。
 *  也进 MCP instructions(prompts/mcp.ts)——外部 agent 同一份目录。 */
export const CAPTION_CATALOG_BLOCK = `\n\n<caption_catalog>\nCaption style presets for set_captions — two modes: emphasis (word-by-word: whole line shown, the spoken word highlighted) / line (clean full-line fade-in). Pick by fit (name + mode); NEVER invent an id. yPct/scale tune position & size separately.\n${CAPTION_PRESETS.map((p) => `- ${p.id} · ${p.name} · ${p.mode}`).join('\n')}\n</caption_catalog>`;

export function buildChatSystem(frame?: ResolvedFrame | null, frameCatalog?: string): string {
  const frameBlock = frame
    ? `\n\n<frame_attached id="${frame.id}" title="${frame.title}">\nThe user attached the frame "${frame.title}" — a theme content pack (design system + playbook) for this video. Call read_frame ONCE to load it BEFORE planning or generating anything, then follow it: its design tokens are already applied to the composition; carry its composition rules and block recipes into every add_block / edit_block / add_graphics instruction you write. If a read_frame result for this frame already exists in the conversation, do not call it again. Where the frame conflicts with an explicit user instruction, the user wins.\n</frame_attached>`
    : frameCatalog
      ? `\n\n<frame_catalog>\nNo frame (theme content pack) is attached. Frames define the video's whole design language. Rules:\n- BEFORE running the FULL draft pipeline for the first time, look at the script content and recommend the 1-2 best-fitting frames from the catalog below in ONE short sentence, then ask the user to pick (or to skip). Do NOT start the pipeline in the same turn as the question.\n- When the user picks one (or names a frame themselves at any point), call attach_frame with its id — do not just talk about it.\n- NEVER block small edits (moving/editing single blocks, shot tweaks) on this question; just do the edit.\n${frameCatalog}\n</frame_catalog>`
      : '';
  return `${CHAT_IDENTITY}${CAPTION_CATALOG_BLOCK}${frameBlock}`;
}
