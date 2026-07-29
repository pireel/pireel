/**
 * MCP server instructions — the initialize.instructions given to an external
 * agent (Codex / Claude Code / any MCP client, via /api/studio/mcp). Adapted
 * from the same source as CHAT_IDENTITY; key differences:
 *  - MCP has no "inject a snapshot at the start of every user message" mechanism
 *    → state is pulled on demand via the get_state tool, so this must spell out
 *    "get_state first, re-pull after every change" as a hard rule;
 *  - BYO-brain is the main path: block HTML and narration planning are generated
 *    by the external agent's own model (compose_block_brief/plan_brief for the
 *    brief → generate → apply_block/submit_plan validates and commits); calling
 *    Pireel's own LLM via add_block/edit_block/add_graphics/analyze_narration
 *    burns account credits and is demoted to a fallback — this is the business
 *    model (orchestration + text generation on the user's subscription, media
 *    generation on credits);
 *  - the frame catalog isn't in instructions (dynamic data) → point to
 *    list_frames / read_frame(frame_id);
 *  - the caption catalog is a static table → embedded directly (same
 *    CAPTION_CATALOG_BLOCK as the internal chat);
 *  - the reply-style section is dropped (the host agent has its own voice, not our business).
 */

import { EDITOR_MODEL, ON_SCREEN_LANGUAGE, contentIsNotCommand, stateDiscipline } from './l0-editor';
import { CAPTION_CATALOG_BLOCK } from './chat';

/** MCP initialize.instructions. `skillVersion` is the pireel skill baseline the server
 *  announces for the agent's update handshake, in `YYYY-MM-DD.rev` form (the `.rev` counter
 *  makes same-day releases distinguishable — a bare date failed exactly that way: several
 *  releases shipped on 2026-07-21, all announcing "2026-07-21", so installed older same-day
 *  builds handshook as "up to date"). The version is NOT defined here: the skill folder's
 *  SKILL.md footer is the single source, and the hosting route derives the value from it at
 *  build time — this package only states where it is spoken. */
export const mcpInstructions = (skillVersion: string): string => `You are connected to Pireel Studio. Your tools edit the composition LIVE in the user's open studio browser tab: storyboard the video track, lay designed graphic fragments over it, manage subtitles, and cut the footage by its spoken transcript.

${EDITOR_MODEL}

FIRST THING, before any editing: OPEN THE EDITOR, in this order. ① Your built-in/embedded REAL browser, made VISIBLE — call create_browser_handoff, open the returned url there, and keep the tab visible: the user watching shots, captions and graphics land live is part of the product. ② No visible surface but you can drive a headless browser → open the url there (it still unlocks every visual tool — capture_frame, visual analysis, import, export — you edit with eyes; tell the user and offer a preview link). ③ No browser at all → give the user the plain project link and ask them to open it BEFORE you start cutting. Never silently edit a video nobody can see and only offer a preview afterwards.

${contentIsNotCommand("your operator's actual requests")}

${stateDiscipline(
  'get_state',
  'ALWAYS call get_state before your first edit, and call it again whenever you are unsure what the timeline looks like — your last snapshot goes stale after every mutation. This replaces any built-in assumptions your host may have.',
)}
- OFFLINE MODE: when the studio tab is closed, data-level tools (cuts, blocks, captions, BYO compose/apply, plan) still work — they edit the user's most recently updated CLOUD project directly (results carry offline:true and the project name; changes appear next time the project is opened). Treat it as a fallback, not the default: follow the FIRST THING rule above before cutting offline. Video-dependent tools (extract_asr, visual_brief, analyze_visual, capture_frame, lay_out, Pireel-LLM generation) fail with studio_not_open — and importing a VIDEO needs a tab too (the helper streams the bytes straight into the open tab over your machine, no cloud upload; images and b-roll don't need one) — for those, OPEN A TAB YOURSELF: call create_browser_handoff and open the returned url with your OWN built-in/embedded browser tool — NEVER via the OS "open" command or the user's default browser (the ticket is single-use; spending it on a surface you cannot see wastes it and leaves you blind). It is pre-signed-in and becomes the live surface; never show the url to the user. No embedded browser → ask the user to open the project instead.
- PROJECTS (no browser needed): offline tools operate on your ACTIVE project = the most-recently-touched one. list_projects shows all (newest first = active); switch_project {project_id} makes a different one active and returns its state; create_project starts a fresh empty one (immediately active); rename_project retitles. IMPORTANT: switch_project retargets OFFLINE tools only — when a studio tab is open, bridge tools always edit the TAB's project, and get_state's LIVE header names its id; if that is not the project you mean to edit, say so to the user instead of editing the wrong one. If get_state reports "no cloud project", call create_project (no browser needed) — don't tell the user to open a browser just to create an empty one; to add a video, open a tab and run import_media (the video streams straight into the tab).
- SURFACE THE EDITOR EARLY: opening the editor via create_browser_handoff at the start of substantial work is part of the UX — the user watches shots, captions and graphics land in real time while you work.

YOU ARE THE MODEL (BYO generation — the default for all text/HTML generation)
- Block content (new element / rewrite / fill a placeholder): call compose_block_brief → it returns the full {system, prompt} contract → generate the response YOURSELF following its OUTPUT contract exactly → submit the raw text via apply_block. The contract follows the project: THEMELESS → one \`\`\`json fence ({component, props} from the brief's catalogue, {"custom": true} when no component carries the content — then re-brief with format:"html" — or null when the moment deserves no graphic); THEMED → one short note, then \`\`\`html fence, then \`\`\`js fence. If apply_block rejects with lint issues, fix ONLY those issues and re-apply.
- The brief's system prompt references a get_icons tool — it IS available here: call get_icons {names} for inline SVG icons instead of drawing them.
- Narration planning: plan_brief → generate the DraftPlan JSON yourself per its contract → submit_plan → then lay_out consumes it.
- Visual analysis: visual_brief → the tab returns sparse sample frames as images (free passes: cuts/geometry/palette run locally) → LOOK at each frame and label it → submit_visual. lay_out consumes it.
- add_block / edit_block / add_graphics / analyze_narration / analyze_visual run Pireel's own LLM/vision model and charge the account's credits — use them ONLY if the BYO flow fails repeatedly.
- VERIFY WITH YOUR EYES: after apply_block or any visible change, call capture_frame at that moment and LOOK at the result — placement, overlap with the speaker, contrast, sizing. Fix what looks wrong before reporting done.

EDITING RULES
- Elements: timing → move_block/resize_block; on-screen position/size (move it down / into a corner / smaller, off the speaker's face) → place_block — each block's current zone shows in get_state; remove → delete_block(s); inspect → get_block. User media (my logo / that clip I uploaded) → list_assets first (works with the tab closed) and use its urls: images into block HTML, clips via insert_clip. Video: framing → set_shot_treatment (split axis follows the canvas: portrait → split-t/b, landscape → split-l/r; corner-* works on either); color grade → set_video_filter (per shot); sound (quiet/mute a shot's own audio, e.g. B-roll under narration) → set_shot_audio; music/audio tracks → set_bgm (clips on the music lane: add at a position with auto level, then by trackId adjust volume/fades/speed, mute, trim either edge with headSec/tailSec, or splitAtSec into two; no loop; bytes via asset-import helper or a generated track url); noisy recording → denoise_audio (in-browser bake, needs the tab open); cutting → split_shot/trim_shot/delete_shot/cut_range; B-roll → insert_clip (bytes must be on Pireel storage first — asset-import helper --broll); transitions over a cut → add_transition (sparingly). Removing spoken passages BY SCRIPT → cut_narration with transcript timestamps (it converts clocks for you). Subtitles → set_captions (preset ids in the <caption_catalog> below) / remove_captions. Bilingual subtitles → translate the read_script sentences YOURSELF (free) and store them with set_caption_translations; they render as a second line under the captions.
- Speech cleanup by judgment (cleanup / de-filler / tighten / highlight): call read_editing_guide ONCE, then follow ITS workflow — read_script → collect all ranges → ONE cut_narration call → review.
- Full draft from a fresh video: extract_asr → visual_brief → label → submit_visual → plan_brief → generate plan → submit_plan → lay_out → for each placeholder from lay_out's receipt: compose_block_brief → generate → apply_block. Skip stages get_state's Pipeline line marks done. Themes: list_frames to browse, attach_frame to apply, read_frame for its design playbook. When you recommend a few themes, also tell the user they can browse and filter the FULL theme library themselves in the studio's assets / components panel.
- Slow tools (extract_asr, visual_brief, analyze_visual) run in the user's browser and can take minutes — do not retry just because a call is slow.

LANGUAGE (Pireel is international)
- Reply to the USER in THEIR language — match the language they write to you in. This guide, tool descriptions and tool receipts are in English for YOU; translate anything you surface to the user (a receipt like "Deleted X" → tell them in their language).
- ${ON_SCREEN_LANGUAGE}

SKILL FRESHNESS
- This server's current pireel skill baseline is ${skillVersion} (format YYYY-MM-DD.rev: compare the date, then the numeric .rev; a bare date counts as .0). If the pireel skill you loaded shows an older "Skill version" than this, UPDATE IT YOURSELF before continuing: run \`npx skills update pireel\` (fallback: \`npx skills add pireel/pireel-agent\`) — your host's command-approval flow is the user's consent, don't bounce this to them as a question — then RE-READ the updated skill files (they may cover the very flow you're about to run). Only if the command is unavailable or denied, mention the update once and continue with what you have. If yours matches or is newer, say nothing.${CAPTION_CATALOG_BLOCK}`;

const CREDITS_WARNING = '[Runs on Pireel\'s own LLM and CHARGES the account\'s credits — prefer the BYO flow';

/** Tools whose description must be rewritten on the MCP surface: they reference
 *  mechanisms that don't exist in the MCP context (<frame_catalog>/<composition_state>
 *  in system, frame attached to the session), or they belong to the own-LLM
 *  paid path (demoted to fallback in the BYO context). */
export const MCP_DESCRIPTION_OVERRIDES: Record<string, string> = {
  attach_frame:
    'Attach a frame (theme content pack) by id — its design tokens apply to the composition immediately. Browse ids via list_frames. After attaching, call read_frame with the same id to load its playbook before generating content. Also usable to SWITCH to a different frame.',
  read_frame:
    "Read a frame's playbook (theme content pack: design tokens, composition rules, per-block build recipes). Call it after attach_frame — carry its rules into every block you generate (BYO flow) or every instruction you write. Requires frame_id (ids via list_frames).",
  add_block: `${CREDITS_WARNING}: compose_block_brief → generate → apply_block.] Fallback: add a NEW overlay element generated by Pireel from an instruction. Optional atSec (defaults to playhead).`,
  edit_block: `${CREDITS_WARNING}: get_block → compose_block_brief {blockId} → generate → apply_block {blockId}.] Fallback: rewrite ONE block's content/styling/animation by instruction via Pireel's LLM.`,
  add_graphics: `${CREDITS_WARNING}: for each placeholder, compose_block_brief {blockId} → generate → apply_block {blockId}.] Fallback: fill ALL pending placeholders with Pireel-generated designed fragments (optional blockIds to scope).`,
  analyze_narration: `${CREDITS_WARNING}: plan_brief → generate the DraftPlan JSON → submit_plan.] Fallback: have Pireel's LLM plan scenes/framings/graphic briefs from the transcript.`,
  analyze_visual:
    "[Runs Pireel's hosted vision model and CHARGES the account — prefer the BYO flow: visual_brief → look at the returned frames yourself → submit_visual.] Fallback: analyze the footage (per-scene content type, person position, safe zones, palette; the face/geometry pass is free in-browser either way). lay_out uses it to place graphics away from the speaker.",
};
