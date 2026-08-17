import type { EditorTrack, EditorTrackType, TimelineClip } from './types';

/** NLE-style compatibility: every non-audio lane is visual; the stored type is presentation metadata. */
export function isVisualEditorTrackType(type: EditorTrackType): boolean {
  return type !== 'audio';
}

export function isVisualEditorTrack(track: Pick<EditorTrack, 'type'>): boolean {
  return isVisualEditorTrackType(track.type);
}

export function editorTrackAcceptsClip(track: EditorTrack, clip: TimelineClip): boolean {
  if (track.type === 'audio') return clip.kind === 'audio';
  if (clip.kind === 'audio') return false;
  if (clip.kind === 'narrative') return track.role === 'primaryNarrative';
  if (clip.kind === 'caption' && clip.managed) return track.role === 'managedCaptions';
  if (track.role === 'primaryNarrative') return clip.kind === 'media';
  return true;
}
