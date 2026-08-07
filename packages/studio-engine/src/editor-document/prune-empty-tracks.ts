import type { EditorDocumentV2 } from './types';

export interface PruneEmptyNonPrimaryTracksOptions {
  /** Managed captions are derived from transcript state and may be empty in persistence snapshots. */
  preserveManagedCaptions?: boolean;
}

export interface PruneEmptyNonPrimaryTracksResult {
  document: EditorDocumentV2;
  removedTrackIds: string[];
}

/**
 * Remove published lanes that no longer own content. The primary narrative lane is the document's
 * structural anchor and always survives; managed captions can remain as a non-visible derivation
 * anchor while their generated clips are stripped from persistence.
 */
export function pruneEmptyNonPrimaryTracks(
  document: EditorDocumentV2,
  options: PruneEmptyNonPrimaryTracksOptions = {},
): PruneEmptyNonPrimaryTracksResult {
  const preserveManagedCaptions = options.preserveManagedCaptions ?? true;
  const removedTrackIds = document.timeline.tracks
    .filter((track) => (
      track.clips.length === 0
      && track.id !== document.semantics.primaryNarrativeTrackId
      && track.role !== 'primaryNarrative'
      && !(preserveManagedCaptions && track.role === 'managedCaptions')
    ))
    .map((track) => track.id);
  if (!removedTrackIds.length) return { document, removedTrackIds };

  const removed = new Set(removedTrackIds);
  let semantics = document.semantics;
  if (semantics.managedCaptionTrackId && removed.has(semantics.managedCaptionTrackId)) {
    const { managedCaptionTrackId: _removed, ...withoutManagedCaptionTrack } = semantics;
    semantics = withoutManagedCaptionTrack;
  }
  return {
    document: {
      ...document,
      timeline: {
        ...document.timeline,
        tracks: document.timeline.tracks.filter((track) => !removed.has(track.id)),
      },
      semantics,
    },
    removedTrackIds,
  };
}
