import type {
  CaptionTimelineClip,
  EditorDocumentV2,
  NarrativeTimelineClip,
} from '@pireel/studio-engine/composition';

export interface CaptionDocumentState {
  hasVideoTrack: boolean;
  hasNarrativeTranscript: boolean;
  captionCount: number;
  firstCaptionStartSec: number | null;
}

/**
 * Read caption prerequisites and output from canonical V2 track/asset identity.
 * The legacy Composition video field is only a runtime projection and may be null while a
 * multi-source primary lane is fully populated, so it must never gate caption activation.
 */
export function inspectCaptionDocument(document: EditorDocumentV2): CaptionDocumentState {
  const primary = document.timeline.tracks.find(
    (track) => track.id === document.semantics.primaryNarrativeTrackId,
  );
  const narrative = (primary?.clips ?? []).filter(
    (clip): clip is NarrativeTimelineClip => clip.kind === 'narrative' && clip.enabled,
  );
  const narrativeAssetIds = new Set(narrative.map((clip) => clip.assetId));
  const hasNarrativeTranscript = [...narrativeAssetIds].some(
    (assetId) => (document.semantics.transcripts[assetId]?.length ?? 0) > 0,
  );

  const managed = document.semantics.managedCaptionTrackId
    ? document.timeline.tracks.find((track) => track.id === document.semantics.managedCaptionTrackId)
    : undefined;
  const captions = (managed?.clips ?? []).filter(
    (clip): clip is CaptionTimelineClip => clip.kind === 'caption' && clip.managed && clip.enabled,
  );
  const firstCaption = captions.reduce<CaptionTimelineClip | null>(
    (first, clip) => (!first || clip.startFrame < first.startFrame ? clip : first),
    null,
  );

  return {
    hasVideoTrack: narrative.length > 0,
    hasNarrativeTranscript,
    captionCount: captions.length,
    firstCaptionStartSec: firstCaption ? firstCaption.startFrame / document.canvas.fps : null,
  };
}
