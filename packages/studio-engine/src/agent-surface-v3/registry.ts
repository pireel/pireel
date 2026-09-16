/**
 * Agent surface v3 — the tool registry.
 *
 * One object model (tracks / clips / assets, frames on the timeline, seconds in the source),
 * batch-first tools, delta receipts. This file is the single source for WHICH tools exist and how
 * each surface treats them (chat-only cards, server-answered account services, charge markers,
 * skill-safe contracts). Descriptions and schemas live in `schemas.ts`; execution is native on every
 * surface (engine document tools, the studio tab runner, the MCP account services).
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
  /** Public contract for reusable Studio Skills. A missing contract means the tool is an
   *  implementation detail: Skill authors describe the intent instead of depending on its current
   *  name or payload. Stable contracts are append-only within one version; a breaking change needs a
   *  new capability id or a higher version with an explicit compatibility path. */
  skillContract?: { version: number; stability: 'stable' | 'experimental' };
  /** Runs only inside Studio Chat (needs an in-app card the other surfaces cannot show). */
  chatOnly?: boolean;
  /** Answered directly by the server on the MCP surface (no open tab needed). */
  serverDirect?: boolean;
  /** Carries the literal charge marker in its description. */
  charges?: boolean;
}

export const V3_TOOLS: readonly V3ToolSpec[] = [
  // ---- state (7)
  { id: 'get_state', group: 'state', skillContract: { version: 1, stability: 'stable' } },
  { id: 'get_transcript', group: 'state', charges: true, skillContract: { version: 1, stability: 'stable' } },
  { id: 'search_media', group: 'state' },
  { id: 'inspect_media', group: 'state', charges: true, skillContract: { version: 1, stability: 'stable' } },
  { id: 'inspect_timeline', group: 'state', skillContract: { version: 1, stability: 'stable' } },
  { id: 'get_beat_grid', group: 'state' },
  { id: 'manage_project', group: 'state', serverDirect: true },
  // ---- assets (7)
  { id: 'search_assets', group: 'assets', serverDirect: true },
  { id: 'register_media', group: 'assets', serverDirect: true },
  { id: 'import_media', group: 'assets', serverDirect: true },
  { id: 'organize_media', group: 'assets' },
  { id: 'prepare_local_asset', group: 'assets' },
  { id: 'get_icons', group: 'assets', serverDirect: true },
  { id: 'create_browser_handoff', group: 'assets', serverDirect: true },
  // ---- clips and tracks (15)
  { id: 'add_clips', group: 'clips', skillContract: { version: 1, stability: 'stable' } },
  // The deterministic montage assembler as a visible capability (it used to be a hidden client-side rewrite of add_clips).
  { id: 'assemble_from_review', group: 'clips' },
  { id: 'insert_clips', group: 'clips', skillContract: { version: 1, stability: 'stable' } },
  { id: 'move_clips', group: 'clips', skillContract: { version: 1, stability: 'stable' } },
  { id: 'remove_clips', group: 'clips', skillContract: { version: 1, stability: 'stable' } },
  { id: 'split_clips', group: 'clips', skillContract: { version: 1, stability: 'stable' } },
  { id: 'ripple_delete_ranges', group: 'clips', skillContract: { version: 1, stability: 'stable' } },
  { id: 'set_clip_properties', group: 'clips', skillContract: { version: 1, stability: 'stable' } },
  { id: 'swap_clip_media', group: 'clips', skillContract: { version: 1, stability: 'stable' } },
  { id: 'set_clip_framing', group: 'clips', skillContract: { version: 1, stability: 'stable' } },
  { id: 'apply_layout', group: 'clips', skillContract: { version: 1, stability: 'stable' } },
  { id: 'set_keyframes', group: 'clips' },
  { id: 'manage_tracks', group: 'clips' },
  { id: 'manage_clip_links', group: 'clips' },
  { id: 'add_transition', group: 'clips', skillContract: { version: 1, stability: 'stable' } },
  { id: 'set_canvas', group: 'clips', skillContract: { version: 1, stability: 'stable' } },
  // ---- speech (4)
  { id: 'remove_silence', group: 'speech', skillContract: { version: 1, stability: 'stable' } },
  { id: 'remove_words', group: 'speech', skillContract: { version: 1, stability: 'stable' } },
  { id: 'mask_words', group: 'speech', skillContract: { version: 1, stability: 'stable' } },
  { id: 'denoise_audio', group: 'speech' },
  // ---- components and text (5)
  { id: 'compose_component', group: 'components' },
  { id: 'apply_component', group: 'components', charges: true },
  { id: 'set_texts', group: 'components', skillContract: { version: 1, stability: 'stable' } },
  { id: 'set_captions', group: 'components', skillContract: { version: 1, stability: 'stable' } },
  { id: 'manage_frame', group: 'components' },
  { id: 'bake_component', group: 'components' },
  // ---- generation (8)
  { id: 'list_models', group: 'generation', serverDirect: true },
  { id: 'generate_image', group: 'generation', serverDirect: true, charges: true },
  { id: 'generate_video', group: 'generation', serverDirect: true, charges: true },
  { id: 'generate_audio', group: 'generation', serverDirect: true, charges: true, skillContract: { version: 1, stability: 'stable' } },
  { id: 'generate_speech', group: 'generation', serverDirect: true, charges: true },
  { id: 'generate_foley', group: 'generation', charges: true },
  { id: 'lip_sync', group: 'generation', serverDirect: true, charges: true },
  { id: 'manage_voices', group: 'generation', serverDirect: true, charges: true },
  // ---- skills, interaction, session (6)
  { id: 'list_skills', group: 'session', serverDirect: true },
  { id: 'read_skill', group: 'session', serverDirect: true },
  { id: 'preview', group: 'session' },
  { id: 'undo', group: 'session' },
  { id: 'ask_user', group: 'session', chatOnly: true },
  { id: 'export', group: 'session' },
];


export const V3_TOOL_LIMIT = 60;

export const V3_TOOL_IDS: ReadonlySet<string> = new Set(V3_TOOLS.map((tool) => tool.id));


/** v3 tools that never change the output (reads, searches, inspection, skills, preview, session queries). */
const V3_READ_ONLY = new Set(['get_state', 'get_transcript', 'search_media', 'inspect_media', 'inspect_timeline', 'get_beat_grid', 'search_assets', 'get_icons', 'create_browser_handoff', 'prepare_local_asset', 'list_models', 'list_skills', 'read_skill', 'preview', 'ask_user', 'compose_component']);

export function v3ToolCanMutate(id: string): boolean {
  return V3_TOOL_IDS.has(id) && !V3_READ_ONLY.has(id);
}

