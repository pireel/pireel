import { joinWords, wordsFromText } from '../caption-fx';
import type { AsrSegment, TranscriptWord } from '../build-blocks';
import type { EditorDocumentV2 } from './types';
import { narrativeTimelineRangesForAssetSourceRange, primaryNarrativeClips } from './read-model';

export interface DocumentAddressedWord extends TranscriptWord {
  id: string;
  assetId: string;
  sentenceIndex: number;
  wordIndex: number;
}

export interface DocumentWordQuery {
  shotId?: string;
  sentenceIndexes?: number[];
  fromSec?: number;
  toSec?: number;
  offset?: number;
  limit?: number;
}

const hashToken = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  return (hash >>> 0).toString(36);
};

const wordsOf = (segment: AsrSegment): TranscriptWord[] => (
  segment.words?.length ? segment.words : wordsFromText(segment.text, segment.start, segment.end)
);

function assetWords(assetId: string, segments: readonly AsrSegment[]): DocumentAddressedWord[] {
  const assetToken = hashToken(assetId);
  return segments.flatMap((segment, sentenceIndex) => wordsOf(segment).map((word, wordIndex) => {
    const start = Math.max(0, word.start);
    const end = Math.max(start, word.end);
    const time = `${Math.round(start * 1000).toString(36)}_${Math.round(end * 1000).toString(36)}`;
    return {
      ...word,
      id: `word_asset_${assetToken}_${sentenceIndex.toString(36)}_${time}_${wordIndex.toString(36)}`,
      assetId,
      sentenceIndex,
      wordIndex,
    };
  }));
}

export function listDocumentAddressedWords(
  document: EditorDocumentV2,
  query: DocumentWordQuery = {},
): { words: DocumentAddressedWord[]; assetId: string; total: number; offset: number; hasMore: boolean } | { error: string } {
  const clips = primaryNarrativeClips(document);
  const assetId = query.shotId
    ? clips.find((clip) => clip.id === query.shotId)?.assetId
    : document.semantics.primaryNarrativeAssetId;
  if (!assetId) return { error: query.shotId ? 'shot not found' : 'primary narrative asset not found' };
  const segments = (document.semantics.transcripts[assetId] ?? []) as AsrSegment[];
  const sentenceSet = query.sentenceIndexes?.length ? new Set(query.sentenceIndexes) : null;
  const from = Number.isFinite(query.fromSec) ? query.fromSec! : -Infinity;
  const to = Number.isFinite(query.toSec) ? query.toSec! : Infinity;
  const matching = assetWords(assetId, segments).filter((word) => (
    (!sentenceSet || sentenceSet.has(word.sentenceIndex))
    && word.end > from
    && word.start < to
    && clips.some((clip) => clip.assetId === assetId && word.end > clip.sourceInSec + 0.03 && word.start < clip.sourceOutSec - 0.03)
  ));
  const offset = Number.isInteger(query.offset) ? Math.max(0, query.offset!) : 0;
  const limit = Number.isInteger(query.limit) ? Math.max(1, Math.min(1000, query.limit!)) : 300;
  const words = matching.slice(offset, offset + limit);
  return { words, assetId, total: matching.length, offset, hasMore: offset + words.length < matching.length };
}

export function resolveDocumentWordIds(
  document: EditorDocumentV2,
  ids: readonly string[],
): { words: DocumentAddressedWord[]; missing: string[] } {
  const wanted = new Set(ids);
  const hits = new Map<string, DocumentAddressedWord>();
  for (const [assetId, segments] of Object.entries(document.semantics.transcripts)) {
    for (const word of assetWords(assetId, segments as AsrSegment[])) if (wanted.has(word.id)) hits.set(word.id, word);
  }
  return { words: ids.flatMap((id) => hits.has(id) ? [hits.get(id)!] : []), missing: ids.filter((id) => !hits.has(id)) };
}

export interface DocumentWordRange {
  assetId: string;
  sourceFromSec: number;
  sourceToSec: number;
  text: string;
  wordIds: string[];
}

export function documentWordRanges(words: readonly DocumentAddressedWord[]): DocumentWordRange[] {
  const byAsset = new Map<string, DocumentAddressedWord[]>();
  for (const word of words) byAsset.set(word.assetId, [...(byAsset.get(word.assetId) ?? []), word]);
  const result: DocumentWordRange[] = [];
  for (const [assetId, group] of byAsset) {
    let previousWord: DocumentAddressedWord | undefined;
    for (const word of [...group].sort((left, right) => left.start - right.start || left.end - right.end)) {
      const previousRange = result.at(-1);
      const consecutive = !!previousWord && previousWord.sentenceIndex === word.sentenceIndex && previousWord.wordIndex + 1 === word.wordIndex;
      if (previousRange?.assetId === assetId && (consecutive || word.start <= previousRange.sourceToSec + 0.08)) {
        previousRange.sourceToSec = Math.max(previousRange.sourceToSec, word.end);
        previousRange.text = joinWords([previousRange.text, word.text]);
        previousRange.wordIds.push(word.id);
      } else {
        result.push({ assetId, sourceFromSec: word.start, sourceToSec: word.end, text: word.text, wordIds: [word.id] });
      }
      previousWord = word;
    }
  }
  return result;
}

export function documentWordRangesToTimeline(document: EditorDocumentV2, ranges: readonly DocumentWordRange[]) {
  return ranges.flatMap((range) => narrativeTimelineRangesForAssetSourceRange(
    document,
    range.assetId,
    range.sourceFromSec,
    range.sourceToSec,
  ).map((mapped) => ({ ...range, ...mapped }))).sort((left, right) => right.fromSec - left.fromSec);
}
