import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { type Composition, videoTrackShots } from '@pireel/studio-engine/composition';
import type { EditorDocumentV2 } from '@pireel/studio-engine/editor-document/types';
import { type AudioEnergy, type MaskedAudioRange, maskedAudioRanges } from '@pireel/studio-engine/word-masks';

/** Word-mask spans (source seconds) for every timeline clip whose asset has a transcript, keyed by
 *  clip id — narrative shots, visual-lane videos and audio-lane clips alike. */
/** Source envelopes keyed by clip id (see useMaskEnergy): with one at hand, spans snap to the real onset/decay. */
export type ClipEnergy = ReadonlyMap<string, AudioEnergy>;

export function clipAudioMasks(document: EditorDocumentV2, energy?: ClipEnergy | null): Map<string, MaskedAudioRange[]> {
  const byAsset = new Map<string, MaskedAudioRange[]>();
  const out = new Map<string, MaskedAudioRange[]>();
  for (const track of document.timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.kind !== 'narrative' && clip.kind !== 'media' && clip.kind !== 'audio') continue;
      const segments = document.semantics.transcripts[clip.assetId] as AsrSegment[] | undefined;
      if (!segments?.length) continue;
      const clipEnergy = energy?.get(clip.id);
      let ranges: MaskedAudioRange[] | undefined;
      if (clipEnergy) ranges = maskedAudioRanges(segments, clipEnergy);
      else {
        ranges = byAsset.get(clip.assetId);
        if (!ranges) {
          ranges = maskedAudioRanges(segments);
          byAsset.set(clip.assetId, ranges);
        }
      }
      if (ranges.length) out.set(clip.id, ranges);
    }
  }
  return out;
}

/** Which clips carry masks (the set useMaskEnergy needs envelopes for). */
export function maskedClipIds(document: EditorDocumentV2): string[] {
  return [...clipAudioMasks(document).keys()];
}

/** Narrative spans keyed the way the exporter keys its sources ('main' for the src-less main shot, clip_<shotId> otherwise). */
export function exportAudioMasks(document: EditorDocumentV2, comp: Composition, energy?: ClipEnergy | null): Map<string, MaskedAudioRange[]> {
  const byClip = clipAudioMasks(document, energy);
  const out = new Map<string, MaskedAudioRange[]>();
  for (const shot of videoTrackShots(comp)) {
    const ranges = byClip.get(shot.id);
    if (ranges) out.set(shot.src ? `clip_${shot.id}` : 'main', ranges);
  }
  return out;
}

/** Narrative spans keyed the way the preview engine keys its sources (the shot's src URL). */
export function previewAudioMasks(document: EditorDocumentV2, comp: Composition, energy?: ClipEnergy | null): Map<string, MaskedAudioRange[]> {
  const byClip = clipAudioMasks(document, energy);
  const out = new Map<string, MaskedAudioRange[]>();
  for (const shot of videoTrackShots(comp)) {
    const ranges = shot.src ? byClip.get(shot.id) : undefined;
    if (ranges && !out.has(shot.src!)) out.set(shot.src!, ranges);
  }
  return out;
}
