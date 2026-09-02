import type { EditorDocumentV2 } from './editor-document/types';

/**
 * Resolve the `trackId` a music/audio tool receives.
 *
 * The composition's "audio tracks" are individual CLIPS (ids like clip_…), while the timeline
 * snapshot also exposes the LANES they sit on (ids like track_music). Models hand back either —
 * a real lane id was answered with "audio track not found" — so both are accepted: a clip id
 * targets that clip, a lane id targets the audio clips on that lane.
 */
export interface AudioTargetResolution {
  /** Audio clip ids the id designates, in lane order. Empty = nothing matched. */
  clipIds: string[];
  /** Set when the id named a lane rather than a clip. */
  laneId?: string;
}

export function resolveAudioTarget(
  document: EditorDocumentV2 | null | undefined,
  audioClipIds: ReadonlyArray<string>,
  id: string,
): AudioTargetResolution {
  if (audioClipIds.includes(id)) return { clipIds: [id] };
  const lane = document?.timeline.tracks.find((track) => track.id === id);
  if (!lane) return { clipIds: [] };
  const known = new Set(audioClipIds);
  return {
    laneId: lane.id,
    clipIds: [...lane.clips]
      .sort((left, right) => left.startFrame - right.startFrame)
      .filter((clip) => clip.kind === 'audio' && known.has(clip.id))
      .map((clip) => clip.id),
  };
}

/** What a model can pass instead — listed in the error so the retry is exact, not guessed. */
export function describeAudioTargets(document: EditorDocumentV2 | null | undefined, audioClipIds: ReadonlyArray<string>): string {
  const lanes = (document?.timeline.tracks ?? [])
    .filter((track) => track.type === 'audio' && track.clips.some((clip) => clip.kind === 'audio' && audioClipIds.includes(clip.id)))
    .map((track) => track.id);
  return `audio clips: ${audioClipIds.join(', ') || '(none)'}${lanes.length ? ` · lanes: ${lanes.join(', ')}` : ''}`;
}
