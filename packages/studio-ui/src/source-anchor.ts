import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';

/** A moment of the recording rather than of the timeline: survives cuts, moves and retimes. */
export interface SourceAnchor {
  assetId: string;
  sourceSec: number;
}

const primaryClips = (document: EditorDocumentV2) => {
  const track = document.timeline.tracks.find((candidate) => candidate.id === document.semantics.primaryNarrativeTrackId);
  const fps = document.canvas.fps;
  return (track?.clips ?? []).flatMap((clip) => clip.kind === 'narrative' && clip.enabled !== false
    ? [{ assetId: clip.assetId, start: clip.startFrame / fps, duration: clip.durationFrames / fps, sourceIn: clip.sourceInSec, sourceOut: clip.sourceOutSec }]
    : []);
};

/** The recording moment playing at a timeline second on the primary track, if any. */
export function sourceAnchorAt(document: EditorDocumentV2, timelineSec: number): SourceAnchor | null {
  const clip = primaryClips(document).find((candidate) => timelineSec >= candidate.start - 1e-6 && timelineSec < candidate.start + candidate.duration);
  if (!clip || clip.duration <= 0) return null;
  const rate = (clip.sourceOut - clip.sourceIn) / clip.duration;
  return { assetId: clip.assetId, sourceSec: clip.sourceIn + (timelineSec - clip.start) * rate };
}

/** Where that recording moment plays now, or null when it was cut out. */
export function timelineSecForAnchor(document: EditorDocumentV2, anchor: SourceAnchor): number | null {
  for (const clip of primaryClips(document)) {
    if (clip.assetId !== anchor.assetId || anchor.sourceSec < clip.sourceIn - 1e-6 || anchor.sourceSec >= clip.sourceOut) continue;
    const rate = (clip.sourceOut - clip.sourceIn) / Math.max(1e-6, clip.duration);
    return clip.start + (anchor.sourceSec - clip.sourceIn) / Math.max(1e-6, rate);
  }
  return null;
}
