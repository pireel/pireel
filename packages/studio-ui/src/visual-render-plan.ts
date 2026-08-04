import type {
  EditorRenderPlan,
  MediaTimelineClip,
  SupplementalVisualMediaClip,
} from '@pireel/studio-engine/composition';

/** Renderable non-primary visual media. Missing/offline assets remain in the document, not the runtime list. */
export function supplementalVisualMedia(plan: EditorRenderPlan): SupplementalVisualMediaClip[] {
  const result: SupplementalVisualMediaClip[] = [];
  for (const track of plan.tracks) {
    if (track.type !== 'visual' || track.id === plan.primaryNarrativeTrackId || track.hidden) continue;
    for (const entry of track.clips) {
      if (entry.clip.kind !== 'media' || !entry.clip.enabled || !entry.asset || !entry.resolvedSource) continue;
      if (entry.asset.kind !== 'image' && entry.asset.kind !== 'video') continue;
      const clip = entry.clip as MediaTimelineClip;
      result.push({
        clipId: entry.clipId,
        trackId: track.id,
        stackOrder: track.stackOrder,
        kind: entry.asset.kind,
        source: entry.resolvedSource,
        startSec: entry.startSec,
        endSec: entry.endSec,
        sourceInSec: clip.sourceInSec,
        sourceOutSec: clip.sourceOutSec,
        fit: clip.fit ?? 'contain',
        muted: track.muted,
      });
    }
  }
  return result.sort((left, right) => (
    left.stackOrder - right.stackOrder || left.startSec - right.startSec || left.clipId.localeCompare(right.clipId)
  ));
}
