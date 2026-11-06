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

/** Characters a caption shows: CJK one by one, a Latin word or number whole, each with the
 *  punctuation after it (so a mark at a cut stays with the words before it). */
function units(text: string): string[] {
  return text.match(/(?:[\p{Script=Latin}\p{N}'’.\-]+|[^\s\p{P}])\p{P}*|\p{P}+/gu) ?? [];
}
const visibleLength = (text: string) => text.replace(/\s+/g, '').length;

/**
 * A row that was partly cut keeps only some of its cues. The corrected sentence still speaks for the
 * whole row, so it is laid along the row's words (cut ones included) by their share of characters,
 * and each kept cue takes the part over its own words; the part over cut words is dropped.
 */
function apportionAlongRow(text: string, rowWords: readonly { text: string }[], ranges: ReadonlyArray<readonly [number, number]>): string[] | null {
  const lengths = rowWords.map((word) => Math.max(1, visibleLength(word.text)));
  const before = [0];
  for (const length of lengths) before.push(before[before.length - 1]! + length);
  const total = before[before.length - 1]!;
  const pieces = units(text);
  if (!pieces.length || !total) return null;
  const at = [0];
  for (const piece of pieces) at.push(at[at.length - 1]! + piece.length);
  const unitTotal = at[at.length - 1]!;
  // The unit boundary nearest to a share of the row.
  const boundary = (share: number) => {
    let best = 0;
    for (let k = 1; k < at.length; k++) if (Math.abs(at[k]! / unitTotal - share) < Math.abs(at[best]! / unitTotal - share)) best = k;
    return best;
  };
  const out: string[] = [];
  for (const [w0, w1] of ranges) {
    if (w0 < 0 || w1 >= lengths.length || w1 < w0) return null;
    const from = boundary(before[w0]! / total);
    const to = boundary(before[w1 + 1]! / total);
    if (to <= from) return null;
    out.push(joinWords(pieces.slice(from, to)));
  }
  return out;
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
    const rowWords = (document.semantics.transcripts[assetId]?.[edit.index] as { words?: { text: string }[] } | undefined)?.words ?? [];
    const ranges = clips.map((clip) => [clip.sourceRef!.wordStart, clip.sourceRef!.wordEnd] as const);
    const covered = ranges.reduce((sum, [w0, w1]) => sum + (w1 - w0 + 1), 0);
    // A partly cut row: lay the sentence along all its words and keep only the cues' share.
    const pieces = (rowWords.length && covered < rowWords.length ? apportionAlongRow(edit.text, rowWords, ranges) : null)
      ?? distribute(edit.text, clips.map((clip) => clip.sourceRef!.wordEnd - clip.sourceRef!.wordStart + 1));
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
