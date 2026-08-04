import { effectiveThemeVars, getTheme } from '../theme';
import type { EditorDocumentV2, TimelineClip } from './types';

const UNFROZEN_TEMPLATES = new Set(['caption', 'transition', 'media']);
const freezesVars = (templateId: string): boolean => !UNFROZEN_TEMPLATES.has(templateId);
const isPresetComponent = (block: { templateId: string; slots: Record<string, unknown> }): boolean => (
  block.templateId.startsWith('kit:') || typeof block.slots.presetId === 'string'
);

/** Stamp insertion-time visual tokens directly on native graphic payloads. */
export function freezeEditorDocumentBlockVars(document: EditorDocumentV2): EditorDocumentV2 {
  const themed = effectiveThemeVars(getTheme(document.appearance.theme), document.appearance.palette);
  const neutral = effectiveThemeVars(getTheme('general'));
  let changed = false;
  const tracks = document.timeline.tracks.map((track) => {
    let trackChanged = false;
    const clips = track.clips.map((clip): TimelineClip => {
      if ((clip.kind !== 'graphic' && clip.kind !== 'caption') || clip.block.vars || !freezesVars(clip.block.templateId)) return clip;
      changed = true;
      trackChanged = true;
      return {
        ...clip,
        block: { ...clip.block, vars: isPresetComponent(clip.block) ? neutral : themed },
      };
    });
    return trackChanged ? { ...track, clips } : track;
  });
  return changed ? { ...document, timeline: { ...document.timeline, tracks } } : document;
}
