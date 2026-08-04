import type { Block } from '../composition-core';
import type { EditorDocumentV2, TimelineClip } from './types';

/**
 * Narrow bridge for the insertion-look freeze still performed on the compatibility Composition.
 * Only Block.vars may cross this boundary; geometry, tracks, anchors and assets stay V2-owned.
 */
export function syncFrozenBlockVars(
  document: EditorDocumentV2,
  blocks: readonly Block[],
): EditorDocumentV2 {
  const varsById = new Map(blocks.flatMap((block) => block.vars ? [[block.id, block.vars] as const] : []));
  let changed = false;
  const tracks = document.timeline.tracks.map((track) => {
    let trackChanged = false;
    const clips = track.clips.map((clip): TimelineClip => {
      if (clip.kind !== 'graphic' && clip.kind !== 'caption') return clip;
      const vars = varsById.get(clip.id);
      if (!vars || JSON.stringify(clip.block.vars) === JSON.stringify(vars)) return clip;
      changed = true;
      trackChanged = true;
      return { ...clip, block: { ...clip.block, vars } };
    });
    return trackChanged ? { ...track, clips } : track;
  });
  return changed ? { ...document, timeline: { ...document.timeline, tracks } } : document;
}
