/**
 * Presentation definitions for the agent surface. The chat feed renders every tool call through a
 * StudioToolDef (icon, label, badge-or-card) derived from the registry, so a call never renders as
 * nothing — an invisible tool call reads as "no reply at all". An id outside the registry (a thread
 * saved under an earlier surface) still renders, labelled by its id.
 */

import { V3_TOOLS } from '@pireel/studio-engine/agent-surface-v3/registry';
import type { StudioToolDef } from '@pireel/studio-engine/prompts';

/** Slow or generative tools show as cards (progress, busy text); everything else is an instant badge. */
const CARD_TOOLS = new Set([
  'get_transcript', 'inspect_media', 'inspect_timeline', 'import_media', 'remove_silence', 'denoise_audio',
  'compose_component', 'apply_component', 'bake_component', 'generate_image', 'generate_video', 'generate_audio', 'generate_speech',
  'generate_foley', 'lip_sync', 'export', 'preview', 'assemble_from_review', 'manage_voices',
]);

const ICONS: Record<string, string> = {
  get_state: '🗂️', get_transcript: '📝', search_media: '🔎', inspect_media: '🔍', inspect_timeline: '🎞️', get_beat_grid: '🥁',
  manage_project: '📁', search_assets: '🗃️', register_media: '📎', import_media: '📥', organize_media: '🗂️', prepare_local_asset: '📎',
  get_icons: '🔣', create_browser_handoff: '🌐',
  add_clips: '➕', assemble_from_review: '🧮', insert_clips: '➕', move_clips: '↔️', remove_clips: '🗑️', split_clips: '✂️',
  ripple_delete_ranges: '✂️', set_clip_properties: '🎚️', set_clip_framing: '🖼️', apply_layout: '📐', set_keyframes: '⏱️',
  manage_tracks: '🛤️', manage_clip_links: '🔗', add_transition: '🌫️', set_canvas: '🖥️',
  remove_silence: '🤫', remove_words: '✂️', mask_words: '🔇', denoise_audio: '🎧',
  compose_component: '📐', apply_component: '🧩', set_texts: '🔤', set_captions: '💬', manage_frame: '🎨', bake_component: '🎬',
  list_models: '🧠', generate_image: '🖼️', generate_video: '🎥', generate_audio: '🎵', generate_speech: '🗣️', generate_foley: '🔊',
  lip_sync: '👄', manage_voices: '🎙️',
  list_skills: '📚', read_skill: '📖', preview: '▶️', undo: '↩️', ask_user: '❓', export: '📤',
};

const defs = new Map<string, StudioToolDef>();

/** The definition the feed should render a tool call with. */
export function studioToolDefFor(id: string): StudioToolDef {
  const cached = defs.get(id);
  if (cached) return cached;
  const known = V3_TOOLS.some((tool) => tool.id === id);
  const def: StudioToolDef = {
    id,
    kind: CARD_TOOLS.has(id) ? 'card' : 'badge',
    icon: ICONS[id] ?? '🛠️',
    label: known ? `tools.${id}.label` : id,
  };
  defs.set(id, def);
  return def;
}
