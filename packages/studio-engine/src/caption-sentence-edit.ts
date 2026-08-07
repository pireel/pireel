/** Resolve Chat's sentence-level caption corrections onto the already materialized cue boundaries. */

import { joinWords, segmentTokens } from './caption-fx';
import type { CaptionTextEditItem } from './caption-text-edit';
import type { CaptionTimelineClip, EditorDocumentV2 } from './editor-document';

export interface CaptionSentenceEditItem {
  index: number;
  text: string;
}

export type CaptionSentenceEditResolution =
  | { ok: true; items: CaptionTextEditItem[] }
  | { ok: false; error: string };

function captionClips(document: EditorDocumentV2, assetId: string, segmentIndex: number): CaptionTimelineClip[] {
  const track = document.semantics.managedCaptionTrackId
    ? document.timeline.tracks.find((candidate) => candidate.id === document.semantics.managedCaptionTrackId)
    : undefined;
  return (track?.clips ?? [])
    .filter((clip): clip is CaptionTimelineClip => (
      clip.kind === 'caption'
      && clip.enabled
      && clip.sourceRef?.assetId === assetId
      && clip.sourceRef.segmentIndex === segmentIndex
    ))
    .sort((left, right) => left.startFrame - right.startFrame || (left.sourceRef!.wordStart - right.sourceRef!.wordStart));
}

function distribute(text: string, weights: readonly number[]): string[] | null {
  let tokens = segmentTokens(text);
  if (tokens.length < weights.length) tokens = [...text.replace(/\s+/g, '')];
  if (tokens.length < weights.length) return null;
  const total = weights.reduce((sum, weight) => sum + Math.max(1, weight), 0);
  const pieces: string[] = [];
  let used = 0;
  let consumedWeight = 0;
  for (let index = 0; index < weights.length; index += 1) {
    consumedWeight += Math.max(1, weights[index]!);
    const remainingPieces = weights.length - index - 1;
    const desired = index === weights.length - 1
      ? tokens.length
      : Math.round((consumedWeight / total) * tokens.length);
    const upto = Math.max(used + 1, Math.min(desired, tokens.length - remainingPieces));
    pieces.push(joinWords(tokens.slice(used, upto)));
    used = upto;
  }
  return pieces;
}

/** Keep cue count/start/end fixed; only apportion the corrected sentence across those existing cues. */
export function resolveCaptionSentenceEdits(
  document: EditorDocumentV2,
  assetId: string,
  edits: readonly CaptionSentenceEditItem[],
): CaptionSentenceEditResolution {
  const out: CaptionTextEditItem[] = [];
  for (const edit of edits) {
    const clips = captionClips(document, assetId, edit.index);
    if (!clips.length) {
      return { ok: false, error: `No active caption cues found for transcript line ${edit.index}; enable or re-layout captions first.` };
    }
    const pieces = distribute(edit.text, clips.map((clip) => clip.sourceRef!.wordEnd - clip.sourceRef!.wordStart + 1));
    if (!pieces) {
      return { ok: false, error: `Caption text for line ${edit.index} is too short to preserve its ${clips.length} existing cue boundaries.` };
    }
    clips.forEach((clip, index) => out.push({
      index: edit.index,
      w0: clip.sourceRef!.wordStart,
      w1: clip.sourceRef!.wordEnd,
      text: pieces[index]!,
      lock: true,
    }));
  }
  return { ok: true, items: out };
}
