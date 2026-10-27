/** Persisted caption-boundary state and controlled re-layout helpers. */

import type { AsrSegment, TranscriptWord } from './build-blocks';
import { joinWords, segmentTokens, wordsFromText } from './caption-fx';
import type { EditorDocumentV2 } from './editor-document';
import type { TranscriptSegment } from '@pireel/studio-engine/project-types';
import { captionTextFromCueOverrides } from './caption-text-edit';

interface SourceRange {
  key: string;
  start: number;
  end: number;
}

function wordsFor(segment: TranscriptSegment): TranscriptWord[] {
  return segment.words?.length ? segment.words : wordsFromText(segment.text, segment.start, segment.end);
}

function parseRange(key: string, wordCount: number): SourceRange | null {
  const [startRaw, endRaw] = key.split(':');
  const start = Number(startRaw);
  const end = Number(endRaw);
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && end < wordCount
    ? { key, start, end }
    : null;
}

function managedRanges(document: EditorDocumentV2): Map<string, SourceRange[]> {
  const track = document.semantics.managedCaptionTrackId
    ? document.timeline.tracks.find((candidate) => candidate.id === document.semantics.managedCaptionTrackId)
    : undefined;
  const grouped = new Map<string, SourceRange[]>();
  for (const clip of track?.clips ?? []) {
    if (clip.kind !== 'caption' || !clip.managed || !clip.sourceRef) continue;
    const ref = clip.sourceRef;
    const key = `${ref.assetId}\u0000${ref.segmentIndex}`;
    const ranges = grouped.get(key) ?? [];
    ranges.push({ key: `${ref.wordStart}:${ref.wordEnd}`, start: ref.wordStart, end: ref.wordEnd });
    grouped.set(key, ranges);
  }
  for (const [key, ranges] of grouped) {
    const unique = new Map(ranges.map((range) => [range.key, range] as const));
    grouped.set(key, [...unique.values()].sort((left, right) => left.start - right.start || left.end - right.end));
  }
  return grouped;
}

function distributeLoose(text: string, count: number): string[] {
  if (count <= 0) return [];
  let tokens = segmentTokens(text);
  if (tokens.length < count) tokens = [...text.replace(/\s+/g, '')];
  if (!tokens.length) return Array.from({ length: count }, () => '');
  if (tokens.length < count) return [text.trim(), ...Array.from({ length: count - 1 }, () => '')];
  const out: string[] = [];
  let used = 0;
  for (let index = 0; index < count; index += 1) {
    const upto = index === count - 1 ? tokens.length : Math.round(((index + 1) / count) * tokens.length);
    out.push(joinWords(tokens.slice(used, Math.max(used + 1, upto))));
    used = Math.max(used + 1, upto);
  }
  return out;
}

function joinedPieces(pieces: readonly string[]): string {
  return joinWords(pieces.filter((piece) => piece.length > 0));
}

/** Re-key range-owned copy to a newly materialized cue layout. */
function remapRangeText(
  values: Readonly<Record<string, string>> | undefined,
  words: readonly TranscriptWord[],
  nextRanges: readonly SourceRange[],
  wholeText?: string,
  useSourceDefaults = true,
): Record<string, string> {
  if (!values && !wholeText) return {};
  const perWord = words.map((word) => useSourceDefaults ? word.text : '');
  // Words of a removed cue (empty override) stay hidden whatever the new layout is.
  const hidden = words.map(() => false);
  const sourceText = joinWords(words.map((word) => word.text));
  if (wholeText && !values && wholeText.trim() !== sourceText) {
    distributeLoose(wholeText, perWord.length).forEach((piece, index) => { perWord[index] = piece; });
  }
  for (const [key, text] of Object.entries(values ?? {})) {
    const range = parseRange(key, words.length);
    if (!range) continue;
    if (useSourceDefaults && text === '') {
      for (let index = range.start; index <= range.end; index += 1) hidden[index] = true;
    }
    distributeLoose(text, range.end - range.start + 1).forEach((piece, offset) => {
      perWord[range.start + offset] = piece;
    });
  }
  const out: Record<string, string> = {};
  for (const range of nextRanges) {
    if (hidden.slice(range.start, range.end + 1).every(Boolean)) {
      out[range.key] = '';
      continue;
    }
    const text = joinedPieces(perWord.slice(range.start, range.end + 1)).trim();
    const original = useSourceDefaults
      ? joinWords(words.slice(range.start, range.end + 1).map((word) => word.text))
      : '';
    if (text && text !== original) out[range.key] = text;
  }
  return out;
}

function mapTranscripts(
  document: EditorDocumentV2,
  update: (segment: TranscriptSegment, assetId: string, segmentIndex: number) => TranscriptSegment,
): EditorDocumentV2 {
  let changed = false;
  const transcripts = Object.fromEntries(Object.entries(document.semantics.transcripts).map(([assetId, segments]) => {
    const next = segments.map((segment, segmentIndex) => {
      const edited = update(segment, assetId, segmentIndex);
      if (edited !== segment) changed = true;
      return edited;
    });
    return [assetId, next];
  }));
  return changed
    ? { ...document, semantics: { ...document.semantics, transcripts } }
    : document;
}

/** Snapshot the managed lane's current source ranges as durable layout boundaries. */
export function lockManagedCaptionLayout(document: EditorDocumentV2): EditorDocumentV2 {
  const ranges = managedRanges(document);
  if (!ranges.size) return document;
  return mapTranscripts(document, (segment, assetId, segmentIndex) => {
    const next = ranges.get(`${assetId}\u0000${segmentIndex}`);
    if (!next) return segment;
    const cueLayout = next.map((range) => range.key);
    return JSON.stringify(segment.cueLayout) === JSON.stringify(cueLayout) ? segment : { ...segment, cueLayout };
  });
}

/** Mark every transcript sentence as explicitly unlocked while retaining its audience-facing copy. */
export function clearManagedCaptionLayout(document: EditorDocumentV2): EditorDocumentV2 {
  return mapTranscripts(document, (segment) => {
    const captionText = segment.captionText
      ?? (segment.cueTexts ? captionTextFromCueOverrides(segment as AsrSegment) : undefined);
    if (segment.cueLayout?.length === 0 && captionText === segment.captionText) return segment;
    return { ...segment, ...(captionText ? { captionText } : {}), cueLayout: [] };
  });
}

/** Move corrected copy/translation keys onto the newly generated ranges, then lock those ranges. */
export function remapCaptionCopyToManagedLayout(document: EditorDocumentV2): EditorDocumentV2 {
  const ranges = managedRanges(document);
  return mapTranscripts(document, (segment, assetId, segmentIndex) => {
    const nextRanges = ranges.get(`${assetId}\u0000${segmentIndex}`);
    if (!nextRanges) return segment;
    const words = wordsFor(segment);
    const cueTexts = remapRangeText(segment.cueTexts, words, nextRanges, segment.captionText);
    const cueSubs = remapRangeText(segment.cueSubs, words, nextRanges, undefined, false);
    const edited: TranscriptSegment = { ...segment, cueLayout: nextRanges.map((range) => range.key) };
    if (Object.keys(cueTexts).length) {
      edited.cueTexts = cueTexts;
      edited.captionText = captionTextFromCueOverrides(edited as AsrSegment, cueTexts);
    } else {
      delete edited.cueTexts;
      delete edited.captionText;
    }
    if (Object.keys(cueSubs).length) edited.cueSubs = cueSubs;
    else delete edited.cueSubs;
    return JSON.stringify(edited) === JSON.stringify(segment) ? segment : edited;
  });
}

type LaneWord = { text: string; si?: number; emphasis?: boolean };
function laneCues(document: EditorDocumentV2) {
  const track = document.semantics.managedCaptionTrackId
    ? document.timeline.tracks.find((candidate) => candidate.id === document.semantics.managedCaptionTrackId)
    : undefined;
  return (track?.clips ?? []).flatMap((clip) => {
    if (clip.kind !== 'caption' || !clip.managed || !clip.sourceRef) return [];
    const words = Array.isArray(clip.block.slots?.words) ? clip.block.slots.words as LaneWord[] : [];
    return [{ ref: clip.sourceRef, words }];
  });
}

/**
 * The transcript words the managed lane shows emphasized (picked by hand or by auto highlight), per
 * sentence. Emphasis is stored per cue by word offset, so it is read off before a re-layout moves the
 * cue boundaries and written back onto the new cues with remapCaptionEmphasis.
 */
export function managedCaptionEmphasis(document: EditorDocumentV2): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const { ref, words } of laneCues(document)) {
    for (const word of words) {
      if (!word.emphasis || !Number.isInteger(word.si)) continue;
      const key = `${ref.assetId}\u0000${ref.segmentIndex}`;
      out.set(key, (out.get(key) ?? new Set()).add(word.si!));
    }
  }
  return out;
}

/** Key the emphasized words (managedCaptionEmphasis) to the lane's current cues. A cue whose copy was
 *  rewritten shows other words than the transcript's, so it takes none. */
export function remapCaptionEmphasis(document: EditorDocumentV2, emphasis: ReadonlyMap<string, ReadonlySet<number>>): EditorDocumentV2 {
  if (!emphasis.size) return document;
  const cues = new Map<string, { key: string; text: string; words: number[] }[]>();
  for (const { ref, words } of laneCues(document)) {
    const picked = emphasis.get(`${ref.assetId}\u0000${ref.segmentIndex}`);
    if (!picked || !words.length || words.some((word) => !Number.isInteger(word.si))) continue;
    const offsets = words.flatMap((word, index) => (picked.has(word.si!) ? [index] : []));
    if (!offsets.length) continue;
    const key = `${ref.assetId}\u0000${ref.segmentIndex}`;
    cues.set(key, [...(cues.get(key) ?? []), { key: `${ref.wordStart}:${ref.wordEnd}`, text: joinWords(words.map((word) => word.text)), words: offsets }]);
  }
  return mapTranscripts(document, (segment, assetId, segmentIndex) => {
    const key = `${assetId}\u0000${segmentIndex}`;
    if (!emphasis.has(key)) return segment;
    const entries = (cues.get(key) ?? []).filter((cue) => segment.cueTexts?.[cue.key] === undefined);
    const edited: TranscriptSegment = { ...segment };
    if (entries.length) edited.cueEmphasis = Object.fromEntries(entries.map((cue) => [cue.key, { text: cue.text, words: cue.words }]));
    else delete edited.cueEmphasis;
    return JSON.stringify(edited) === JSON.stringify(segment) ? segment : edited;
  });
}
