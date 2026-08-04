import type { EditorDocumentV2, EditorTrack, SemanticScene } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { clipEndFrame, splitClipAtFrame } from './clip-geometry';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';

export interface SplitEditorClipOptions {
  trackId: string;
  clipId: string;
  atFrame: number;
  includeLinked?: boolean;
}

function expandScenes(scenes: SemanticScene[], originalId: string, createdIds: string[]): SemanticScene[] {
  if (!createdIds.length) return scenes;
  return scenes.map((scene) => scene.clipIds.includes(originalId)
    ? { ...scene, clipIds: scene.clipIds.flatMap((id) => id === originalId ? [id, ...createdIds] : [id]) }
    : scene);
}

export function splitEditorClip(
  document: EditorDocumentV2,
  options: SplitEditorClipOptions,
): EditorCommandResult {
  const { trackId, clipId, atFrame } = options;
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  const trackIndex = document.timeline.tracks.findIndex((track) => track.id === trackId);
  if (trackIndex < 0) return commandFailure(document, 'track-not-found', `Track does not exist: ${trackId}`, { trackIds: [trackId] });
  const track = document.timeline.tracks[trackIndex]!;
  const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
  if (clipIndex < 0) return commandFailure(document, 'clip-not-found', `Clip does not exist on track ${trackId}: ${clipId}`, { path: 'clipId', trackIds: [trackId] });
  if (!Number.isInteger(atFrame)) return commandFailure(document, 'invalid-range', 'Split frame must be an integer.', { path: 'atFrame' });
  const targetClip = track.clips[clipIndex]!;
  if (atFrame <= targetClip.startFrame || atFrame >= clipEndFrame(targetClip)) {
    return commandFailure(document, 'invalid-range', 'Split frame must be strictly inside the clip.', { path: 'atFrame' });
  }

  const linkedGroupId = options.includeLinked === false ? undefined : targetClip.linkGroupId;
  const clipsToSplit = new Map<string, Set<string>>([[trackId, new Set([clipId])]]);
  if (linkedGroupId) {
    for (const candidateTrack of document.timeline.tracks) {
      for (const candidateClip of candidateTrack.clips) {
        if (candidateClip.linkGroupId !== linkedGroupId) continue;
        if (atFrame <= candidateClip.startFrame || atFrame >= clipEndFrame(candidateClip)) continue;
        const ids = clipsToSplit.get(candidateTrack.id) ?? new Set<string>();
        ids.add(candidateClip.id);
        clipsToSplit.set(candidateTrack.id, ids);
      }
    }
  }
  const lockedTrackIds = document.timeline.tracks
    .filter((candidateTrack) => clipsToSplit.has(candidateTrack.id) && candidateTrack.locked)
    .map((candidateTrack) => candidateTrack.id);
  if (lockedTrackIds.length) {
    return commandFailure(document, 'track-locked', `Split touches locked track(s): ${lockedTrackIds.join(', ')}`, { trackIds: lockedTrackIds });
  }

  const usedIds = new Set(document.timeline.tracks.flatMap((candidate) => candidate.clips.map((clip) => clip.id)));
  const createdClipIds: string[] = [];
  const splitPairs = new Map<string, string[]>();
  const tracks = document.timeline.tracks.map((candidateTrack): EditorTrack => {
    const clipIds = clipsToSplit.get(candidateTrack.id);
    if (!clipIds) return candidateTrack;
    const clips = candidateTrack.clips.flatMap((candidateClip) => {
      if (!clipIds.has(candidateClip.id)) return [candidateClip];
      const split = splitClipAtFrame(candidateClip, atFrame, document.canvas.fps, usedIds);
      createdClipIds.push(...split.createdClipIds);
      for (const [originalId, rightId] of split.splitPairs) {
        splitPairs.set(originalId, [...(splitPairs.get(originalId) ?? []), rightId]);
      }
      return split.clips;
    });
    return { ...candidateTrack, clips };
  });
  const next: EditorDocumentV2 = {
    ...document,
    timeline: { tracks },
    semantics: {
      ...document.semantics,
      scenes: [...splitPairs].reduce(
        (scenes, [originalId, createdIds]) => expandScenes(scenes, originalId, createdIds),
        document.semantics.scenes,
      ),
    },
  };
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  const receipt = emptyCommandReceipt('clip.split');
  receipt.affectedTrackIds = [...clipsToSplit.keys()];
  receipt.createdClipIds = createdClipIds;
  return { ok: true, document: next, receipt };
}
