/**
 * L0, the tool surface — the editor's VERBS, next to l0-editor.ts's nouns.
 *
 * One layer, two files, and the split is mechanical, not conceptual: l0-editor.ts is prose every
 * surface splices into its system text, while this file is DATA (JSON schemas + descriptions) that
 * hosts attach as tools. Both describe the same editor, and both are single-source across surfaces:
 * the in-app chat attaches these via streamText, the MCP server exposes the same table (with
 * per-surface description overrides where a mechanism doesn't exist there — see mcp.ts), and the
 * client executes via onToolCall. A tool that existed in one surface's copy but not the other's
 * would be the drift L0 exists to prevent.
 *
 * (Previous header follows — the operational contract for adding tools is unchanged.)
 */
/**
 * Studio editing agent toolset — defined once, shared by server and client.
 *
 * Key design: these tools are NOT executed on the server. The server only uses their
 * JSON schema to attach tools to streamText (the model emits tool-calls from that);
 * actual execution happens on the CLIENT — studio-chat's useChat.onToolCall receives
 * a tool-call and calls the workbench-provided runTool to mutate the React Composition
 * state directly (move block / trim / reframe…), then addToolOutput feeds the result
 * back and the model continues/finishes. Block content generation (add_block /
 * edit_block) still reuses /api/studio/compose.
 *
 * So this file must be client-safe: zero server deps, schema is plain JSON (no zod).
 */

import { CAPTION_PRESETS } from '../caption-presets';
import { PLACE_ANCHORS } from '../composition-core';

export type StudioToolKind = 'badge' | 'card';

export interface StudioToolDef {
  id: string;
  /** badge = instant state change (small badge); card = needs generation, slower (card shows note). */
  kind: StudioToolKind;
  /** Small icon in the feed (emoji). */
  icon: string;
  /** UI label (used for progress / card title). */
  label: string;
  /** Default busy text while running (shown on the card before any streamed note/stage progress — don't leave the user staring at static text). */
  busyText?: string;
  /** English agent instruction (goes into system prompt + tool description). */
  description: string;
  /** JSON schema — server wraps it via jsonSchema() into tool(); client only reads input, no validation. */
  inputSchema: Record<string, unknown>;
  /** Chat-surface only: not exposed on MCP (external agents bring their own capability, e.g. review_visuals vs their own eyes). */
  chatOnly?: boolean;
}

const TREATMENTS = ['full', 'punch-in', 'corner-br', 'corner-tl', 'split-l', 'split-r', 'split-t', 'split-b'] as const;

/** Helper: build an object schema. */
function obj(
  properties: Record<string, unknown>,
  required: string[],
): Record<string, unknown> {
  return { type: 'object', additionalProperties: false, properties, required };
}

export const STUDIO_TOOLS: StudioToolDef[] = [
  /* ---------- frame (theme content pack; server-executed, client only renders the card, no runTool impl) ---------- */
  {
    id: 'read_frame',
    kind: 'card',
    busyText: 'tools.read_frame.busy',
    icon: '🎨',
    label: 'tools.read_frame.label',
    description:
      "Load the attached frame's playbook (theme content pack: design tokens, composition rules, per-block build recipes). When <frame_attached> appears in the system prompt, call this ONCE — BEFORE planning or generating anything — then follow the playbook. Its result persists in the conversation: if a read_frame result for this frame is already in the history, do NOT call it again. No input needed.",
    inputSchema: obj({}, []),
  },
  {
    id: 'attach_frame',
    kind: 'badge',
    busyText: 'tools.attach_frame.busy',
    icon: '🖼️',
    label: 'tools.attach_frame.label',
    description:
      "Attach a frame (theme content pack) to this conversation by id — its design tokens apply to the composition immediately and <frame_attached> will then tell you to read_frame. Call this when the user picks a frame from your recommendation, or names one explicitly. The catalog of ids appears in <frame_catalog> when none is attached. Also usable to SWITCH to a different frame.",
    inputSchema: obj({ frame_id: { type: 'string', description: 'Frame id from the catalog, e.g. "biennale-poster"' } }, ['frame_id']),
  },
  /* ---------- speech-editing playbook (separate skill content pack; server-executed, client only renders the card, no runTool impl) ---------- */
  {
    id: 'read_editing_guide',
    kind: 'card',
    busyText: 'tools.read_editing_guide.busy',
    icon: '✂️',
    label: 'tools.read_editing_guide.label',
    description:
      'Load the A-roll speech-cleanup playbook. Call ONCE — BEFORE any transcript-based speech cut (cleanup / de-filler / tighten / highlight) — then follow it. If its result is already in the conversation history, do NOT call it again.',
    inputSchema: obj({}, []),
  },
  /* ---------- production pipeline (from talking-head video to first draft, card · slow) ---------- */
  {
    id: 'extract_asr',
    kind: 'card',
    busyText: 'tools.extract_asr.busy',
    icon: '📝',
    label: 'tools.extract_asr.label',
    description:
      'Transcribe the spoken audio (extract audio → ASR) into timed sentences — the raw material for planning and storyboarding. Covers the main video AND every inserted other-source segment (each transcript section on its own source clock). It does NOT add captions and does NOT cut shots (captions are a theme option; storyboarding is lay_out). Run to (re)fetch the transcript. No input. Cheap to re-run (cached per file).',
    inputSchema: obj({}, []),
  },
  {
    id: 'read_script',
    kind: 'badge',
    busyText: 'tools.read_script.busy',
    icon: '📖',
    label: 'tools.read_script.label',
    description:
      "Read the full spoken transcript: main narration in SOURCE-video seconds (never shifted by cutting) PLUS each inserted clip's own transcript (its own clock). Rows carry the CURRENT edit state — [REMOVED]/[partly cut] marks plus dead-air notes for ALL of it — inter-sentence gaps (\"+Xs gap after\"), mid-sentence stalls (\"Xs pause inside at a–bs\", with the exact source range) and the recording's pre/post-roll (\"dead air at the head/tail\") — each flipping to CUT once tightened — so re-reading after cuts shows what actually remains; trust the marks, never re-cut marked content, and read dead air from the notes instead of computing row arithmetic. Call for content-level requests when no transcript is in the conversation yet — an extract_asr result also carries it, don't call both. Main narration requires extract_asr first.",
    inputSchema: obj({}, []),
  },
  {
    id: 'analyze_narration',
    kind: 'card',
    busyText: 'tools.analyze_narration.busy',
    icon: '🧠',
    label: 'tools.analyze_narration.label',
    description:
      'Plan the whole piece from the narration: SEGMENT the script into scenes (group consecutive sentences by meaning), and for each scene pick a framing (full / punch-in / corner / split) + a DESIGNED graphic brief (metric / comparison / chart / pipeline / structure / KPI / timeline / callout, with real data pulled from the script). Designed graphics are the main event. Auto-runs extract_asr first if needed. No input.',
    inputSchema: obj({}, []),
  },
  {
    id: 'analyze_visual',
    kind: 'card',
    busyText: 'tools.analyze_visual.busy',
    icon: '🎬',
    label: 'tools.analyze_visual.label',
    description:
      'Analyze the footage LOCALLY (scene cuts + MediaPipe safe-zones/face + sparse VLM content) so graphics avoid the speaker. A one-time whole-footage pass producing LAYOUT DATA — it does NOT let you see any frame; to actually look at a specific moment (or answer what a moment looks like), call review_visuals with that atSec instead. Slow (runs frame-by-frame in the browser) — shows a live progress + ETA. No input. Cached per file.',
    inputSchema: obj({}, []),
  },
  {
    id: 'lay_out',
    kind: 'card',
    busyText: 'tools.lay_out.busy',
    icon: '✦',
    label: 'tools.lay_out.label',
    description:
      'STORYBOARD the video: slice shots (by sentence ∪ scene cuts), apply framing (punch-in / corner / split) per the plan, and drop PLACEHOLDER slots where graphics should go (drawn in the next step). Auto-runs any missing prerequisite (ASR → narration plan ‖ visual analysis). Overwrites the composition structure EXCEPT inserted other-source segments (preserved in place). Follow by filling the placeholders.',
    inputSchema: obj({}, []),
  },
  {
    id: 'add_graphics',
    kind: 'card',
    busyText: 'tools.add_graphics.busy',
    icon: '🎨',
    label: 'tools.add_graphics.label',
    description:
      'ILLUSTRATE: fill placeholder slots from lay_out with DESIGNED fragments (card / chart / flow-or-structure diagram / KPI / callout), generated concurrently with live progress. Auto-runs lay_out first if there are no placeholders yet. Use after lay_out, when the user asks for the graphics to be drawn, or for a fresh full-draft run lay_out then add_graphics. Optional `blockIds` = only (re)illustrate these placeholder blocks (marked [placeholder] in <composition_state>); omit to fill ALL pending placeholders.',
    inputSchema: obj(
      {
        blockIds: { type: 'array', items: { type: 'string' }, description: 'Optional: block ids to generate — pending placeholders AND/OR already-filled components (filled ones are REGENERATED in place; use this when the user wants existing components redone). Use ids from the LATEST lay_out receipt or <composition_state> (a fresh lay_out renumbers slots). Omit (or send an empty array) to fill all pending placeholders only.' },
      },
      [],
    ),
  },

  /* ---------- block content (generated via compose, card) ---------- */
  {
    id: 'add_block',
    kind: 'card',
    busyText: 'tools.add_block.busy',
    icon: '✨',
    label: 'tools.add_block.label',
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
    busyText: 'tools.edit_block.busy',
    icon: '🎨',
    label: 'tools.edit_block.label',
    description:
      "Edit ONE existing overlay block's content, styling or animation (e.g. make the keyword red and bigger, change the caption effect, add an outline, slow it down). Pass the target `blockId` (from <composition_state>; if the user wrote @id use that) and a concrete `instruction`. Do NOT use this for moving/resizing — timeline timing is move_block/resize_block, on-screen position/size is place_block.",
    inputSchema: obj(
      {
        blockId: { type: 'string', description: 'Target block id from <composition_state>.' },
        instruction: { type: 'string', description: 'Instruction describing the change.' },
      },
      ['blockId', 'instruction'],
    ),
  },

  /* ---------- block timing/position (instant, badge) ---------- */
  {
    id: 'move_block',
    kind: 'badge',
    icon: '↔️',
    label: 'tools.move_block.label',
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
    label: 'tools.resize_block.label',
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
    id: 'place_block',
    kind: 'badge',
    icon: '📐',
    label: 'tools.place_block.label',
    description:
      "Reposition/resize an overlay block ON SCREEN (canvas space) — where it sits in the picture, not when it plays (timing is move_block/resize_block). Position: give ONE of `anchor` (snap into a canvas region, keeps size), `xPct`+`yPct` (absolute top-left, % of canvas), or `dxPct`/`dyPct` (relative nudge, % of canvas — e.g. move it down a bit = dyPct 8). Size: `scale` multiplies the current box around its center (0.4–2, e.g. 0.8 = shrink to 80%), combinable with any position input. The box is clamped fully on-canvas. Each block's current zone shows in the state snapshot. NOT for the sentence-caption layer (that's set_captions yPct/scale).",
    inputSchema: obj(
      {
        blockId: { type: 'string' },
        anchor: { type: 'string', enum: [...PLACE_ANCHORS], description: 'Canvas region to snap into (3×3 grid, small safe margin).' },
        xPct: { type: 'number', description: 'Absolute: box top-left X, % of canvas width (0–100).' },
        yPct: { type: 'number', description: 'Absolute: box top-left Y, % of canvas height (0–100).' },
        dxPct: { type: 'number', description: 'Relative nudge right (+) / left (−), % of canvas width.' },
        dyPct: { type: 'number', description: 'Relative nudge down (+) / up (−), % of canvas height.' },
        scale: { type: 'number', description: 'Multiply current box size (0.4–2). 1 = keep size.' },
      },
      ['blockId'],
    ),
  },
  {
    id: 'delete_block',
    kind: 'badge',
    icon: '🗑️',
    label: 'tools.delete_block.label',
    description: 'Delete an overlay block entirely.',
    inputSchema: obj({ blockId: { type: 'string' } }, ['blockId']),
  },
  {
    id: 'delete_blocks',
    kind: 'badge',
    icon: '🗑️',
    label: 'tools.delete_blocks.label',
    description: 'Delete SEVERAL overlay blocks in one call (e.g. clearing every caption-like block at once). Pass all target ids.',
    inputSchema: obj({ blockIds: { type: 'array', items: { type: 'string' } } }, ['blockIds']),
  },
  {
    id: 'duplicate_block',
    kind: 'badge',
    icon: '⧉',
    label: 'tools.duplicate_block.label',
    description:
      'Duplicate an overlay block (same content/box/track, new id). `atSec` = where the copy starts; omit to place it right after the original. Use then edit_block to vary the copy.',
    inputSchema: obj({ blockId: { type: 'string' }, atSec: { type: 'number' } }, ['blockId']),
  },
  {
    id: 'get_block',
    kind: 'badge',
    icon: '🔍',
    label: 'tools.get_block.label',
    description:
      "INSPECT one overlay block: returns its timing/track/box plus its actual content (HTML + animation, truncated). Use BEFORE edit_block when you need to know what's inside (e.g. to answer questions about it, or to make a precise change), or to debug why something looks wrong.",
    inputSchema: obj({ blockId: { type: 'string' } }, ['blockId']),
  },
  {
    id: 'review_visuals',
    kind: 'card',
    busyText: 'tools.review_visuals.busy',
    icon: '🔎',
    label: 'tools.review_visuals.label',
    chatOnly: true,
    description:
      "LOOK at the rendered result with a vision model (your delegated eyes — you cannot see frames yourself): captures the composed frame at each atSec and returns, per frame, a one-line scene description plus REAL visual problems as data — overlays covering the speaker, blocks colliding, elements cut off at the edge, unreadable contrast, clutter. Two jobs: ① QA after a batch of graphics lands (add_graphics / lay_out / theme change) with each new block's mid moment (max 6) — your atSecs MUST cover every moment where several overlay blocks are on screen together (concurrent blocks are where collisions happen, and an unsampled window ships unseen), then FIX what it reports (position → place_block, styling/contrast → edit_block) before wrapping up; ② whenever you need to know what a moment actually looks like (e.g. the user asks about the frame at some second) — answer from the returned scene, never from imagination. Skip it for single small edits. Uses hosted vision (small fee per frame).",
    inputSchema: obj(
      {
        atSecs: { type: 'array', items: { type: 'number' }, description: "Edited-timeline moments to review — each new block's midpoint, and always any moment where multiple blocks share the screen (max 6)." },
      },
      ['atSecs'],
    ),
  },
  {
    id: 'list_assets',
    kind: 'badge',
    icon: '🗂️',
    label: 'tools.list_assets.label',
    description:
      "List the user's reusable media assets (most recent first): uploaded and agent-imported images, video clips and audio, each with a direct url — images go into block HTML (img src), videos insert via insert_clip {url}, audio goes on the music lane via set_bgm {url}. Also returns this project's video sources (main + inserted clips, with transcribed state). Call it BEFORE referencing media you haven't seen in this conversation (use my product shot / add that clip I uploaded / put music under this) instead of guessing urls or asking the user to describe what they have.",
    inputSchema: obj(
      {
        kind: { type: 'string', enum: ['all', 'image', 'video', 'audio'], description: 'Filter by asset kind (default all).' },
        limit: { type: 'number', description: 'Max rows per kind (default 30, max 100).' },
      },
      [],
    ),
  },
  {
    id: 'focus_element',
    kind: 'badge',
    icon: '🎯',
    label: 'tools.focus_element.label',
    description:
      'SHOW the user an element: select it and move the playhead/preview to it. Use when you reference something the user should look at, or after creating/changing an element so the user sees the result.',
    inputSchema: obj({ id: { type: 'string', description: 'block or shot id' } }, ['id']),
  },

  {
    id: 'seek',
    kind: 'badge',
    icon: '⏱️',
    label: 'tools.seek.label',
    description:
      'Move the playhead (and the preview) to `toSec` on the EDITED timeline. Use for jump-to-a-moment asks, or to park the playhead where playhead-defaulting tools (add_block / split_shot / trim_shot) should act. To show a specific element or shot, prefer focus_element.',
    inputSchema: obj({ toSec: { type: 'number', description: 'Target time in edited seconds (0 = start; clamped to the video length).' } }, ['toSec']),
  },
  {
    id: 'play',
    kind: 'badge',
    icon: '▶️',
    label: 'tools.play.label',
    description:
      "Start playback in the preview. Optional `fromSec` = jump there first; optional `toSec` = auto-pause there. ONLY when the user asks to play or preview something — never auto-play after an edit; playback is the user's to start (receipts already park the playhead at the change).",
    inputSchema: obj(
      {
        fromSec: { type: 'number', description: 'Start playing from here (edited seconds). Omit = current playhead.' },
        toSec: { type: 'number', description: 'Auto-pause when playback reaches this time (edited seconds). Omit = play to the end.' },
      },
      [],
    ),
  },
  {
    id: 'pause',
    kind: 'badge',
    icon: '⏸️',
    label: 'tools.pause.label',
    description: 'Pause playback (the playhead stays where it is). No input.',
    inputSchema: obj({}, []),
  },

  /* ---------- captions (global preset layer: full-line captions / per-word emphasis, laid from the transcript, one setting applies to the whole video) ---------- */
  {
    id: 'set_captions',
    kind: 'card',
    busyText: 'tools.set_captions.busy',
    icon: '💬',
    label: 'tools.set_captions.label',
    description:
      "Turn sentence captions ON and/or restyle/reposition them — the GLOBAL subtitle layer laid from the transcript (ONE setting styles the WHOLE video; NOT a per-block edit). `preset` = a style id from <caption_catalog> (enables captions if off; runs ASR first if needed). Default to a clean full-line `line` preset when no style is named. Turn captions OFF with remove_captions. The keyword-slam overlay is a block (add_block/edit_block), not captions.",
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
    label: 'tools.remove_captions.label',
    description:
      'Remove the whole sentence-caption layer (turn subtitles off). Does not touch keyword overlay elements (delete those with delete_block).',
    inputSchema: obj({}, []),
  },
  {
    id: 'set_caption_translations',
    kind: 'badge',
    icon: '🌐',
    label: 'tools.set_caption_translations.label',
    description:
      'Add a translation line under the sentence captions (bilingual subtitles) — YOU do the translating, this tool only stores it. Workflow: read_script → translate each numbered sentence yourself → pass `items` as {index (the row number from read_script), text}. Translations attach to the transcript and survive cuts/restyles. Main narration by default; pass `shotId` to translate an inserted clip\'s own transcript instead. `text: ""` removes one line; `clear: true` removes all. Pass `lang` (the target language you translated into) so a later language switch can tell your translations apart from stale ones.',
    inputSchema: obj(
      {
        items: {
          type: 'array',
          description: 'Per-sentence translations; index = the transcript row number shown by read_script.',
          items: obj({ index: { type: 'number' }, text: { type: 'string', description: 'Your translation of that sentence (empty string removes it).' } }, ['index', 'text']),
        },
        lang: { type: 'string', description: "Target language of these translations (e.g. 'English'). Recommended — untagged translations can't be told apart from stale ones after a language switch." },
        shotId: { type: 'string', description: "An inserted-clip shot id — targets that clip's transcript. Omit for the main narration." },
        clear: { type: 'boolean', description: 'true = remove every translation (all sources); items is then ignored.' },
      },
      [],
    ),
  },

  /* ---------- video track shots (instant, badge) ---------- */
  {
    id: 'set_shot_treatment',
    kind: 'badge',
    icon: '🎯',
    label: 'tools.set_shot_treatment.label',
    description:
      'Set how a video shot is framed: full (full screen), punch-in (zoom in for emphasis), corner-br/corner-tl (shrink to a corner to make room for graphics), split-l/split-r/split-t/split-b (video takes that half, the other half left for blocks). SPLIT AXIS follows the canvas (size is in <composition_state>): a PORTRAIT canvas splits top/bottom (split-t/split-b), a LANDSCAPE canvas left/right (split-l/split-r). On a top/bottom split USE split-b — video in the bottom half, graphic in the top (the split band re-frames around the speaker, so their position in the frame does not matter); split-t only on explicit user request. Preference when making room: portrait → split first, corner second; landscape → corner first, split second. Framing applies to the WHOLE shot — to frame only part of it, split_shot first.',
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
    label: 'tools.set_video_filter.label',
    description:
      "Color-grade ONE shot's footage: brightness / contrast / saturate coefficients (1 = untouched). The values you pass REPLACE that shot's whole grade — omit a field to reset it, pass no fields to remove the grade. Whole shot, snaps at the cut — split_shot first to grade only part. Recipes: brighter → brightness 1.1–1.2; vivid → saturate 1.2–1.4; black & white → saturate 0; muted gray → saturate 0.7–0.85.",
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
    id: 'set_shot_audio',
    kind: 'badge',
    icon: '🔊',
    label: 'tools.set_shot_audio.label',
    description:
      "Set shots' own audio: volumeDb sets the footage's level (0 = source level, -60 = silent, up to +20 to lift a quiet recording), mute true/false hard-silences while remembering the previous volume, fadeInSec/fadeOutSec fade that shot's audio at its own edges (0 = hard cut, ≤10s — use it for the piece's opening/ending, not on every shot). Whole shot, switches at the cut — split_shot first for a partial change. Batch with shotIds or all:true (e.g. quiet every B-roll insert to -18 while narration continues). Omit a field to leave it unchanged.",
    inputSchema: obj(
      {
        shotIds: { type: 'array', items: { type: 'string' }, description: 'Target shot ids (omit when using all).' },
        all: { type: 'boolean', description: 'true = apply to every shot.' },
        volumeDb: { type: 'number', description: 'dB, clamped -60..+20; 0 resets to source level, -60 = silent.' },
        mute: { type: 'boolean', description: 'Hard-silence toggle (independent of volumeDb).' },
        fadeInSec: { type: 'number', description: "Fade this shot's audio in over N seconds (0 = none)." },
        fadeOutSec: { type: 'number', description: "Fade this shot's audio out over N seconds (0 = none)." },
      },
      [],
    ),
  },
  {
    id: 'denoise_audio',
    kind: 'badge',
    icon: '🎙️',
    label: 'tools.denoise_audio.label',
    description:
      'Remove background noise from the MAIN narration (on-device speech-denoise model, bakes in the background — takes a moment on long videos). strength 0..1 = dry/wet blend (default 0.6; lower it if the voice sounds thin). off:true restores the original audio. Preview and export both play the denoised result once baking finishes.',
    inputSchema: obj(
      {
        strength: { type: 'number', description: 'Blend 0..1 (default 0.6). Re-tuning is fast — inference is cached per source.' },
        off: { type: 'boolean', description: 'true = turn denoise off.' },
      },
      [],
    ),
  },
  {
    id: 'set_bgm',
    kind: 'badge',
    icon: '🎵',
    label: 'tools.set_bgm.label',
    description:
      "Audio tracks on the music lane (plain clips: no looping, no auto-ducking; overlapping clips sum). Add: pass url (audio on Pireel storage / a generated track) + optional startSec — the initial level auto-balances against the measured narration loudness; the receipt returns trackId. Adjust: pass trackId (or omit when exactly one track exists) + any of volumeDb (-60..+20; 0 = source level, -60 = silent), fadeInSec, fadeOutSec (≤10s each), speed (0.5..2, pitch shifts), startSec, mute. Shorten a track: headSec/tailSec move that EDGE to a timeline second, dropping the audio outside it (a bed that outruns the video: pass tailSec = the video's duration). splitAtSec cuts one track into two independent ones at that second — the way to give the halves different levels or drop the middle. Remove: off:true with trackId (or without = remove all). Current tracks show in the snapshot; users' own uploads appear in list_assets.",
    inputSchema: obj(
      {
        url: { type: 'string', description: 'Audio url to ADD as a new track. Omit to adjust an existing one.' },
        trackId: { type: 'string', description: 'Target track id (from the snapshot / add receipt).' },
        startSec: { type: 'number', description: 'Position on the edited timeline (seconds).' },
        volumeDb: { type: 'number', description: 'Level dB, clamped -60..+20 (0 = source level, -60 = silent). Omit on add = auto level from loudness measurement.' },
        fadeInSec: { type: 'number' },
        fadeOutSec: { type: 'number' },
        speed: { type: 'number', description: 'Playback-rate multiplier 0.5..2 (changes pitch on purpose — matches export).' },
        mute: { type: 'boolean', description: 'Silence the track while keeping it (and its level) in place.' },
        headSec: { type: 'number', description: 'Move the track\'s START to this edited-timeline second, trimming the audio before it.' },
        tailSec: { type: 'number', description: 'Move the track\'s END to this edited-timeline second, trimming the audio after it.' },
        splitAtSec: { type: 'number', description: 'Split the track in two at this edited-timeline second (returns the new track id).' },
        off: { type: 'boolean', description: 'true = remove the track (all tracks when trackId omitted).' },
      },
      [],
    ),
  },
  {
    id: 'split_shot',
    kind: 'badge',
    icon: '✂️',
    label: 'tools.split_shot.label',
    description:
      'Split the video at a point into two shots (content unchanged). `atSec` = where to cut (edited timeline seconds); omit to use the playhead.',
    inputSchema: obj({ atSec: { type: 'number' } }, []),
  },
  {
    id: 'trim_shot',
    kind: 'badge',
    icon: '🔪',
    label: 'tools.trim_shot.label',
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
    label: 'tools.delete_shot.label',
    description: 'Remove a whole video shot (its source footage is cut; later shots shift earlier). Works on inserted other-source segments too.',
    inputSchema: obj({ shotId: { type: 'string' } }, ['shotId']),
  },
  {
    id: 'cut_range',
    kind: 'badge',
    icon: '✂️',
    label: 'tools.cut_range.label',
    description:
      'Remove a TIME RANGE of footage by EDITED-timeline seconds (can span shots; later content shifts left, overlay blocks compress). To cut BY THE SCRIPT (remove the passage that says X) use cut_narration instead. cut_range is also the way to cut inside an inserted [clip X] segment (it runs on its own clock). Preferred over split+split+delete.',
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
    label: 'tools.cut_narration.label',
    description:
      'Delete spoken passages BY THE TRANSCRIPT — the remove-what-was-said cut. Pass MAIN-narration SOURCE-second timestamps straight from read_script: the tool converts clocks itself, cuts the footage, compresses overlays and re-lays captions. `ranges` = one or more {fromSec,toSec} removed in ONE call. For a PAUSE-TIGHTENING pass (dead air between sentences AND mid-sentence stalls — read_script notes both, inner pauses with their exact source range), pass the FULL noted ranges plus `keepGapSec` — the tool leaves that much breathing room at each seam; never do the margin arithmetic yourself. The receipt returns data.cuts (final-timeline seam positions + seconds ACTUALLY removed after margins) — quote THOSE numbers to the user, never your own gap arithmetic. MAIN narration only — inserted [clip X] segments run on their own clock: cut those with cut_range or delete_shot.',
    inputSchema: obj(
      {
        ranges: {
          type: 'array',
          description: 'Narration source-second ranges to remove (from read_script timestamps).',
          items: obj({ fromSec: { type: 'number' }, toSec: { type: 'number' } }, ['fromSec', 'toSec']),
        },
        keepGapSec: {
          type: 'number',
          description: 'Pause tightening only: total breathing room (seconds) preserved per range — each range shrinks by half of this at each end before cutting. 0.35 = balanced default, 0.15 = hard-cut rhythm, 0.6 = calm pacing. Omit for content cuts (junk/retakes/fillers).',
        },
      },
      ['ranges'],
    ),
  },
  {
    id: 'insert_clip',
    kind: 'card',
    busyText: 'tools.insert_clip.busy',
    icon: '🎞️',
    label: 'tools.insert_clip.label',
    description:
      "Insert a B-roll video segment into the main track. Bytes must already be on Pireel storage — pass `sig` (from the asset-import helper) OR `url` (asset library / generated video; external URLs are rejected — upload first). Inserts at `atSec` (snaps to the nearest shot boundary, shifts later overlays right). The segment is a full peer: framing, captions, its own audio and on-demand transcript. Needs the studio tab open.",
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
    label: 'tools.add_transition.label',
    description:
      "Set/replace/remove the CONTENT transition at a cut between two shots (the footage hands over — not an overlay). `atSec` must be a shot boundary (±0.3s snap; anything else is rejected). One transition per cut, symmetric around it. `effect`: fade (cross-fade, the default), fadeblack (dip to black), directional (push), directionalwipe (wipe), circleopen (iris), windowslice (blinds), crosszoom (zoom punch), rotatescale, glitch, dreamy; 'none' removes. Use sparingly — hard jump-cuts are the default look.",
    inputSchema: obj(
      {
        atSec: { type: 'number', description: 'A shot-boundary time (edited seconds).' },
        effect: { type: 'string', enum: ['fade', 'fadeblack', 'directional', 'directionalwipe', 'circleopen', 'windowslice', 'crosszoom', 'rotatescale', 'glitch', 'dreamy', 'none'], description: "Transition style (default dissolve); 'none' removes." },
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'directional/directionalwipe only: travel direction of the incoming footage (default left).' },
        durationSec: { type: 'number', description: 'TOTAL length in seconds, max 4, clamped by both shots (default 1; keeps the current value when re-styling).' },
      },
      ['atSec'],
    ),
  },
  {
    id: 'undo',
    kind: 'badge',
    icon: '↩️',
    label: 'tools.undo.label',
    description:
      'Undo the last composition change (one step per call). Use when the user rejects a change or asks to roll back / re-do something differently — undo first, then redo it the new way; NEVER declare a state unreachable without trying undo. When the session stack is exhausted (page refreshed, device switched), it falls back to the project\'s cloud history and rolls back one saved version (coarser: one autosave step, not one tool step). After ANY undo, re-read state (get_state / read_script) before editing again.',
    inputSchema: obj({}, []),
  },

  /* ---------- export (local client-side compositing, card · slow) ---------- */
  {
    id: 'export_video',
    kind: 'card',
    busyText: 'tools.export_video.busy',
    icon: '🎞️',
    label: 'tools.export_video.label',
    description:
      "Start exporting the final video. Renders LOCALLY in the user's open studio tab (roughly realtime: a 3-min video takes ~3 min) and saves via the browser's download — nothing is uploaded. Poll track_export for progress and the final filename; the tab must stay open until done. Defaults: 1080p / 30fps / mp4. Driving a headless/embedded browser yourself? Those often DISCARD downloads — run the export-sink helper first and pass its `sink_url` so the file is delivered to disk reliably.",
    inputSchema: obj(
      {
        resolution: { type: 'number', description: 'Output height: 2160/1440/1080/720/540 (default 1080).' },
        fps: { type: 'number', description: '24/30/60 (default 30).' },
        format: { type: 'string', enum: ['mp4', 'webm', 'mov'], description: 'Container (default mp4).' },
        sink_url: { type: 'string', description: 'Loopback receiver URL from the export-sink helper (scripts/export-sink.mjs) — the finished file is PUT there instead of a browser download. Use when driving a headless/embedded browser.' },
      },
      [],
    ),
  },
  {
    id: 'track_export',
    kind: 'badge',
    icon: '⏳',
    label: 'tools.track_export.label',
    description:
      "Check the running export: returns {status: running|done|idle, progress %, filename when done}. Poll every ~15s after export_video. When done, the file was already saved by the browser's download (Downloads folder by default) — locate it there by the returned filename (watch for an in-progress .crdownload first) and confirm the path to the user.",
    inputSchema: obj({}, []),
  },
];

export const STUDIO_TOOL_MAP: Record<string, StudioToolDef> = Object.fromEntries(
  STUDIO_TOOLS.map((d) => [d.id, d]),
);

/** Tool result (client runTool returns → addToolOutput → shared by model + card render). */
export interface StudioToolResult {
  ok: boolean;
  /** One-line summary (shown on card/badge on success, also fed to the model for continuation). */
  summary?: string;
  /** Failure reason. */
  error?: string;
  /** Structured data for query tools (for the model, e.g. get_block's block detail; not rendered on the card). */
  data?: unknown;
  /** Captured-frame image (base64, no data: prefix) — MCP side turns it into image content for the external agent to "see". */
  image?: { data: string; mimeType: string };
  /** Multiple images (visual_brief sampled frames) — MCP side converts each into image content. */
  images?: { data: string; mimeType: string }[];
}
