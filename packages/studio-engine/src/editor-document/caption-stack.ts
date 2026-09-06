/**
 * Managed captions vs. the visual stack.
 *
 * Captions are a real track with a stackOrder (the legacy "always on top" special case was
 * migrated into data so the user can reorder the lane). Two things keep that data honest:
 *
 * - `captionsAreTopmost`: captions sit above every other non-audio track. New lanes inserted while
 *   this holds must not slide above them (the default stackOrder is max+1, which would).
 * - `liftCaptionsAboveFullFrameMedia`: a full-frame media lane (B-roll video/image without a box)
 *   above the captions hides them completely — never a composition anyone wants — so at load time
 *   captions are lifted back above such lanes. Boxed (PiP) media and graphics above captions are
 *   left alone: a lower third over captions can be deliberate.
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

/** Non-primary visual lanes carrying at least one full-frame media clip (no canvas box). */
function fullFrameMediaStackOrders(document: EditorDocumentV2): number[] {
  return document.timeline.tracks.flatMap((track) => {
    if (track.type === 'audio' || track.type === 'caption' || track.id === document.semantics.primaryNarrativeTrackId) return [];
    const fullFrame = track.clips.some((clip) => clip.kind === 'media' && !clip.box);
    return fullFrame ? [track.stackOrder] : [];
  });
}

/**
 * Lift the managed caption lane above any full-frame media lane that currently covers it.
 * Returns the same document instance when nothing needs to change.
 */
export function liftCaptionsAboveFullFrameMedia(document: EditorDocumentV2): EditorDocumentV2 {
  const captions = managedCaptionTrack(document);
  if (!captions) return document;
  const covering = fullFrameMediaStackOrders(document);
  if (!covering.some((stackOrder) => stackOrder >= captions.stackOrder)) return document;
  const top = document.timeline.tracks.reduce((max, track) => Math.max(max, track.stackOrder), 0);
  return {
    ...document,
    timeline: {
      ...document.timeline,
      tracks: document.timeline.tracks.map((track) => (track.id === captions.id ? { ...track, stackOrder: top + 1 } : track)),
    },
  };
}
