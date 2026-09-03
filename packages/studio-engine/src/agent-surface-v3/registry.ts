/**
 * Agent surface v3 — the consolidated tool registry.
 *
 * One object model (tracks / clips / assets, frames on the timeline, seconds in the source),
 * fifty batch-first tools, delta receipts. This file is the single source for WHICH tools exist
 * and which legacy tool ids each one replaces; `adapter.ts` translates v3 calls onto the legacy
 * operations while both surfaces coexist. Schemas and descriptions live next to each tool once the
 * adapter for its group lands (see `docs/studio-agent-surface-v3.md` in the host repository).
 */

export type V3ToolGroup =
  | 'state'
  | 'assets'
  | 'clips'
  | 'speech'
  | 'components'
  | 'generation'
  | 'session';

export interface V3ToolSpec {
  id: string;
  group: V3ToolGroup;
  /** Legacy tool ids this tool absorbs. Empty means the tool is new on v3. */
  replaces: readonly string[];
  /** Runs only inside Studio Chat (needs an in-app card). */
  chatOnly?: boolean;
  /** Answered directly by the server on the MCP surface (no open tab needed). */
  serverDirect?: boolean;
  /** Carries the literal charge marker in its description. */
  charges?: boolean;
}

export const V3_TOOLS: readonly V3ToolSpec[] = [
  // ---- state (7)
  { id: 'get_state', group: 'state', replaces: ['get_state', 'get_timeline', 'list_outputs'] },
  { id: 'get_transcript', group: 'state', replaces: ['read_script', 'get_transcript', 'list_words'], charges: true },
  { id: 'search_media', group: 'state', replaces: ['search_media'] },
  { id: 'inspect_media', group: 'state', replaces: ['inspect_media', 'inspect_images', 'analyze_visual', 'visual_brief', 'submit_visual', 'get_block', 'get_generation_jobs'], charges: true },
  { id: 'inspect_timeline', group: 'state', replaces: ['capture_frame', 'review_sequence', 'review_visuals'] },
  { id: 'get_beat_grid', group: 'state', replaces: ['get_beat_grid'] },
  {
    id: 'manage_project', group: 'state', serverDirect: true,
    replaces: ['list_projects', 'switch_project', 'create_project', 'rename_project', 'create_output', 'duplicate_output', 'switch_output', 'rename_output', 'delete_output'],
  },
  // ---- assets (7)
  { id: 'search_assets', group: 'assets', serverDirect: true, replaces: ['list_assets', 'search_assets', 'search_stock'] },
  { id: 'register_media', group: 'assets', serverDirect: true, replaces: ['register_media', 'import_stock'] },
  { id: 'import_media', group: 'assets', serverDirect: true, replaces: ['import_media', 'insert_clip'] },
  { id: 'organize_media', group: 'assets', replaces: ['organize_media'] },
  { id: 'prepare_local_asset', group: 'assets', chatOnly: true, replaces: ['prepare_local_image'] },
  { id: 'get_icons', group: 'assets', serverDirect: true, replaces: ['get_icons'] },
  { id: 'create_browser_handoff', group: 'assets', serverDirect: true, replaces: ['create_browser_handoff'] },
  // ---- clips and tracks (15)
  { id: 'add_clips', group: 'clips', replaces: ['add_clips', 'set_bgm', 'duplicate_block'] },
  // The deterministic montage assembler as a visible capability (it used to be a hidden client-side rewrite of add_clips).
  { id: 'assemble_from_review', group: 'clips', replaces: [] },
  { id: 'insert_clips', group: 'clips', replaces: ['insert_clips'] },
  { id: 'move_clips', group: 'clips', replaces: ['move_clips', 'move_block'] },
  { id: 'remove_clips', group: 'clips', replaces: ['remove_clips', 'delete_block', 'delete_blocks', 'delete_shot', 'remove_captions'] },
  { id: 'split_clips', group: 'clips', replaces: ['split_clips', 'split_shot'] },
  { id: 'ripple_delete_ranges', group: 'clips', replaces: ['cut_range', 'trim_shot'] },
  { id: 'set_clip_properties', group: 'clips', replaces: ['set_clip_properties', 'resize_block', 'set_shot_audio', 'set_video_speed', 'set_video_filter', 'swap_clip_media'] },
  { id: 'set_clip_framing', group: 'clips', replaces: ['set_shot_framing', 'set_shot_treatment', 'set_media_transform', 'set_media_crop', 'place_block'] },
  { id: 'apply_layout', group: 'clips', replaces: ['apply_layout'] },
  { id: 'set_keyframes', group: 'clips', replaces: ['set_keyframes'] },
  { id: 'manage_tracks', group: 'clips', replaces: ['manage_tracks'] },
  { id: 'manage_clip_links', group: 'clips', replaces: ['manage_clip_links', 'sync_clips'] },
  { id: 'add_transition', group: 'clips', replaces: ['add_transition'] },
  { id: 'set_canvas', group: 'clips', replaces: ['set_canvas'] },
  // ---- speech (3)
  { id: 'remove_silence', group: 'speech', replaces: ['remove_silence'] },
  { id: 'remove_words', group: 'speech', replaces: ['cut_narration', 'delete_words'] },
  { id: 'denoise_audio', group: 'speech', replaces: ['denoise_audio'] },
  // ---- components and text (5)
  { id: 'compose_component', group: 'components', replaces: ['compose_block_brief'] },
  { id: 'apply_component', group: 'components', replaces: ['apply_block', 'add_block', 'edit_block'], charges: true },
  { id: 'set_texts', group: 'components', replaces: ['add_texts', 'update_text'] },
  { id: 'set_captions', group: 'components', replaces: ['set_captions', 'relayout_captions', 'edit_caption_text', 'set_caption_translations'] },
  { id: 'manage_frame', group: 'components', replaces: ['list_frames', 'attach_frame', 'read_frame'] },
  // ---- generation (8)
  { id: 'list_models', group: 'generation', serverDirect: true, replaces: ['list_models'] },
  { id: 'generate_image', group: 'generation', serverDirect: true, charges: true, replaces: ['generate_image'] },
  { id: 'generate_video', group: 'generation', serverDirect: true, charges: true, replaces: ['generate_video'] },
  { id: 'generate_audio', group: 'generation', serverDirect: true, charges: true, replaces: ['generate_music', 'generate_sfx'] },
  { id: 'generate_speech', group: 'generation', serverDirect: true, charges: true, replaces: ['generate_speech'] },
  { id: 'generate_foley', group: 'generation', chatOnly: true, charges: true, replaces: ['generate_foley'] },
  { id: 'lip_sync', group: 'generation', serverDirect: true, charges: true, replaces: ['lip_sync'] },
  { id: 'manage_voices', group: 'generation', serverDirect: true, charges: true, replaces: ['list_voices', 'clone_voice', 'design_voice', 'delete_voice'] },
  // ---- skills, interaction, session (6)
  { id: 'list_skills', group: 'session', serverDirect: true, replaces: ['list_skills'] },
  { id: 'read_skill', group: 'session', serverDirect: true, replaces: ['read_skill', 'read_editing_guide'] },
  { id: 'preview', group: 'session', replaces: ['focus_element', 'seek', 'play', 'pause'] },
  { id: 'undo', group: 'session', replaces: ['undo'] },
  { id: 'ask_user', group: 'session', chatOnly: true, replaces: ['ask_user', 'request_approval'] },
  { id: 'export', group: 'session', replaces: ['export_video', 'track_export'] },
];

/** Legacy tools that leave the agent surface entirely (data stays readable through get_state). */
export const V3_RETIRED_TOOL_IDS: readonly string[] = [
  'set_director_plan',
  'set_scene_designs',
  'read_director_plan',
  'read_scene_designs',
];

export const V3_TOOL_LIMIT = 51;

export const V3_TOOL_IDS: ReadonlySet<string> = new Set(V3_TOOLS.map((tool) => tool.id));

/** Every legacy id a v3 tool absorbs, mapped to the absorbing tool. */
export function v3ReplacementIndex(): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const tool of V3_TOOLS) {
    for (const legacy of tool.replaces) {
      const existing = index.get(legacy);
      if (existing && existing !== tool.id) {
        throw new Error(`legacy tool ${legacy} is claimed by both ${existing} and ${tool.id}`);
      }
      index.set(legacy, tool.id);
    }
  }
  return index;
}

/** v3 tools that never change the output (reads, searches, inspection, skills, preview, session queries). */
const V3_READ_ONLY = new Set(['get_state', 'get_transcript', 'search_media', 'inspect_media', 'inspect_timeline', 'get_beat_grid', 'search_assets', 'get_icons', 'create_browser_handoff', 'prepare_local_asset', 'list_models', 'list_skills', 'read_skill', 'preview', 'ask_user', 'compose_component']);

export function v3ToolCanMutate(id: string): boolean {
  return V3_TOOL_IDS.has(id) && !V3_READ_ONLY.has(id);
}

