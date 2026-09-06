/**
 * Managed captions are pinned above every visual lane.
 *
 * Captions are a real track with a stackOrder (the legacy "always on top" renderer special case was
 * migrated into data), but the product rule matches Premiere / DaVinci: the caption lane never sits
 * under picture. The timeline does not let the user drag the caption lane, and every command that
 * can change a stackOrder (insert, patch, reorder, load) re-pins the captions to max + 1 through
 * `pinCaptionsOnTop`. A lane can therefore be dropped "at the top" of the visual stack and still
 * end up right under the captions.
 */

import type { EditorDocumentV2, EditorTrack } from './types';

export function managedCaptionTrack(document: EditorDocumentV2): EditorTrack | undefined {
  const byId = document.semantics.managedCaptionTrackId
    ? document.timeline.tracks.find((track) => track.id === document.semantics.managedCaptionTrackId)
    : undefined;
  return byId ?? document.timeline.tracks.find((track) => track.type === 'caption' && track.role === 'managedCaptions');
}

/** True when the managed caption lane renders above every other non-audio lane. */
export function captionsAreTopmost(document: EditorDocumentV2, captions = managedCaptionTrack(document)): boolean {
  if (!captions) return false;
  return document.timeline.tracks.every(
    (track) => track.id === captions.id || track.type === 'audio' || track.stackOrder < captions.stackOrder,
  );
}

/**
 * Re-pin the managed caption lane to max(other non-audio lanes) + 1. Returns the same document
 * instance when the captions are already strictly on top (or there is no caption lane).
 */
export function pinCaptionsOnTop(document: EditorDocumentV2): EditorDocumentV2 {
  const captions = managedCaptionTrack(document);
  if (!captions || captionsAreTopmost(document, captions)) return document;
  const top = document.timeline.tracks.reduce(
    (max, track) => (track.id === captions.id || track.type === 'audio' ? max : Math.max(max, track.stackOrder)),
    0,
  );
  return {
    ...document,
    timeline: {
      ...document.timeline,
      tracks: document.timeline.tracks.map((track) => (track.id === captions.id ? { ...track, stackOrder: top + 1 } : track)),
    },
  };
}
