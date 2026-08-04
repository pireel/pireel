import type { EditorTrack, SemanticScene, TimelineClip } from '../types';

export function updateScenesForClipChanges(
  scenes: SemanticScene[],
  removedIds: Set<string>,
  splitPairs: Map<string, string[]> = new Map(),
): SemanticScene[] {
  let changed = false;
  const next = scenes.map((scene) => {
    let sceneChanged = false;
    const clipIds = scene.clipIds.flatMap((id) => {
      if (removedIds.has(id)) {
        changed = true;
        sceneChanged = true;
        return [];
      }
      const splitIds = splitPairs.get(id);
      if (!splitIds?.length) return [id];
      changed = true;
      sceneChanged = true;
      return [id, ...splitIds];
    });
    return sceneChanged ? { ...scene, clipIds } : scene;
  });
  return changed ? next : scenes;
}

export function detachDanglingClipAnchors(
  tracks: EditorTrack[],
  survivingClipIds: Set<string>,
): { tracks: EditorTrack[]; changedTrackIds: string[]; lockedTrackIds: string[] } {
  const changedTrackIds: string[] = [];
  const lockedTrackIds: string[] = [];
  const nextTracks = tracks.map((track) => {
    const hasDanglingAnchor = track.clips.some((clip) =>
      'anchor' in clip && clip.anchor.type === 'clip' && !survivingClipIds.has(clip.anchor.clipId),
    );
    if (!hasDanglingAnchor) return track;
    if (track.locked) {
      lockedTrackIds.push(track.id);
      return track;
    }
    changedTrackIds.push(track.id);
    return {
      ...track,
      clips: track.clips.map((clip): TimelineClip => {
        if (!('anchor' in clip) || clip.anchor.type !== 'clip' || survivingClipIds.has(clip.anchor.clipId)) return clip;
        return { ...clip, anchor: { type: 'timeline' } };
      }),
    };
  });
  return { tracks: nextTracks, changedTrackIds, lockedTrackIds };
}
