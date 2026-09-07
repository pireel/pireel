import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { type Composition, videoTrackShots } from '@pireel/studio-engine/composition';
import type { EditorDocumentV2 } from '@pireel/studio-engine/editor-document/types';
import { type MaskedAudioRange, maskedAudioRanges } from '@pireel/studio-engine/word-masks';

/** Word-mask spans per export source key ('main' for the src-less main shot, clip_<shotId> otherwise),
 *  read from the canonical document transcript of each shot's asset. */
export function exportAudioMasks(document: EditorDocumentV2, comp: Composition): Map<string, MaskedAudioRange[]> {
  const primary = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  const assetIdByClipId = new Map<string, string>();
  for (const clip of primary?.clips ?? []) if (clip.kind === 'narrative') assetIdByClipId.set(clip.id, clip.assetId);
  const byAsset = new Map<string, MaskedAudioRange[]>();
  const out = new Map<string, MaskedAudioRange[]>();
  for (const shot of videoTrackShots(comp)) {
    const assetId = assetIdByClipId.get(shot.id);
    if (!assetId) continue;
    let ranges = byAsset.get(assetId);
    if (!ranges) {
      ranges = maskedAudioRanges(document.semantics.transcripts[assetId] as AsrSegment[] | undefined);
      byAsset.set(assetId, ranges);
    }
    if (ranges.length) out.set(shot.src ? `clip_${shot.id}` : 'main', ranges);
  }
  return out;
}

/** Same spans keyed the way the preview engine keys its sources (the shot's src URL). */
export function previewAudioMasks(document: EditorDocumentV2, comp: Composition): Map<string, MaskedAudioRange[]> {
  const primary = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  const assetIdByClipId = new Map<string, string>();
  for (const clip of primary?.clips ?? []) if (clip.kind === 'narrative') assetIdByClipId.set(clip.id, clip.assetId);
  const out = new Map<string, MaskedAudioRange[]>();
  for (const shot of videoTrackShots(comp)) {
    const assetId = shot.src ? assetIdByClipId.get(shot.id) : undefined;
    if (!assetId || out.has(shot.src!)) continue;
    const ranges = maskedAudioRanges(document.semantics.transcripts[assetId] as AsrSegment[] | undefined);
    if (ranges.length) out.set(shot.src!, ranges);
  }
  return out;
}
