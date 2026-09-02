/**
 * Presentation definitions for the v3 agent surface. The chat feed renders every tool call through a
 * StudioToolDef (icon, label, badge-or-card); legacy ids keep their rich definitions, and v3-only ids
 * get one derived from the registry so a call never renders as nothing — an invisible tool call
 * reads as "no reply at all".
 */

import { V3_TOOLS } from '@pireel/studio-engine/agent-surface-v3/registry';
import { STUDIO_TOOL_MAP, type StudioToolDef } from '@pireel/studio-engine/prompts';

/** Slow or generative tools show as cards (progress, busy text); everything else is an instant badge. */
const CARD_TOOLS = new Set([
  'get_transcript', 'inspect_media', 'inspect_timeline', 'import_media', 'remove_silence', 'denoise_audio',
  'compose_component', 'apply_component', 'generate_image', 'generate_video', 'generate_audio', 'generate_speech',
  'generate_foley', 'lip_sync', 'export', 'preview',
]);

const ICONS: Record<string, string> = {
  get_state: '🗂️', manage_project: '📁', inspect_timeline: '🎞️', import_media: '📥', prepare_local_asset: '📎', get_icons: '🔣',
  create_browser_handoff: '🌐', ripple_delete_ranges: '✂️', set_clip_framing: '🖼️', remove_words: '✂️',
  compose_component: '📐', apply_component: '🧩', set_texts: '🔤', manage_frame: '🎨', generate_audio: '🎵',
  manage_voices: '🎙️', list_skills: '📚', read_skill: '📖', preview: '▶️', export: '📤',
};

const derived = new Map<string, StudioToolDef>();

/** The definition the feed should render a tool call with: legacy first, then a v3-derived one. */
export function studioToolDefFor(id: string): StudioToolDef | null {
  const legacy = STUDIO_TOOL_MAP[id];
  if (legacy) return legacy;
  const cached = derived.get(id);
  if (cached) return cached;
  const spec = V3_TOOLS.find((tool) => tool.id === id);
  if (!spec) return null;
  const def: StudioToolDef = {
    id,
    kind: CARD_TOOLS.has(id) ? 'card' : 'badge',
    icon: ICONS[id] ?? '🛠️',
    label: `tools.${id}.label`,
    description: '',
    inputSchema: {},
  };
  derived.set(id, def);
  return def;
}
