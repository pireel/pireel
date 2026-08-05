import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';

export interface PrimaryNarrativeSourceRuntime {
  file: File;
  url: string;
  sig: string;
  durationSec: number;
}

export function isFirstNarrativeSource(document: EditorDocumentV2): boolean {
  const primaryTrack = document.timeline.tracks.find(
    (track) => track.id === document.semantics.primaryNarrativeTrackId,
  );
  return !primaryTrack?.clips.length && !document.semantics.primaryNarrativeAssetId;
}

/** Keep runtime bytes in the same lane that the document insertion will use.
 *  V2 promotes the first narrative asset to the primary source; later assets remain clip sources. */
export function registerNarrativeSourceRuntime(input: {
  documentBeforeInsert: EditorDocumentV2;
  source: PrimaryNarrativeSourceRuntime;
  clipFiles: Map<string, File>;
  onPrimarySource: (source: PrimaryNarrativeSourceRuntime) => void;
}): 'primary' | 'clip' {
  if (isFirstNarrativeSource(input.documentBeforeInsert)) {
    input.onPrimarySource(input.source);
    return 'primary';
  }
  input.clipFiles.set(input.source.url, input.source.file);
  return 'clip';
}
