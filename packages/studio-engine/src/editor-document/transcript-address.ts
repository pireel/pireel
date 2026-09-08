import { joinWords, wordsFromText } from '../caption-fx';
import type { AsrSegment, TranscriptWord } from '../build-blocks';
import type { EditorDocumentV2 } from './types';
import { planNarrationCuts } from './narration-cut-planner';
import { primaryNarrativeClips } from './read-model';
import { timelineFramesToSeconds } from './time';

export interface DocumentAddressedWord extends TranscriptWord {
  id: string;
  assetId: string;
  sentenceIndex: number;
  wordIndex: number;
}

export interface DocumentWordQuery {
  /** A placed clip id (any lane) whose source transcript to list. */
  shotId?: string;
  /** A transcript-bearing asset id (any lane: narrative footage, visual-lane video, audio-lane narration). */
  assetId?: string;
  /** A track id: its transcript-bearing clip with the most words picks the asset. */
  trackId?: string;
  sentenceIndexes?: number[];
  fromSec?: number;
  toSec?: number;
  offset?: number;
  limit?: number;
}

/** Whether a transcript carries measured word timing ('measured'), only sentence timing so its
 *  words are estimated by character share ('estimated'), or nothing at all ('none'). */
export function transcriptWordTiming(segments: readonly AsrSegment[] | undefined): 'measured' | 'estimated' | 'none' {
  if (!segments?.length) return 'none';
  return segments.some((segment) => segment.words?.length) ? 'measured' : 'estimated';
}

type SpeechClip = Extract<EditorDocumentV2['timeline']['tracks'][number]['clips'][number], { kind: 'narrative' | 'media' | 'audio' }>;

/** Every enabled clip (any track) that plays this asset, with its source-second range. */
function assetSourceRanges(document: EditorDocumentV2, assetId: string): { start: number; end: number }[] {
  const fps = document.canvas.fps;
  const out: { start: number; end: number }[] = [];
  for (const track of document.timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.kind !== 'narrative' && clip.kind !== 'media' && clip.kind !== 'audio') continue;
      if (clip.assetId !== assetId || !clip.enabled) continue;
      const speech = clip as SpeechClip;
      const speed = speech.kind === 'audio' && Number.isFinite(speech.properties.speed) && speech.properties.speed! > 0 ? speech.properties.speed! : 1;
      const start = speech.sourceInSec;
      const end = speech.sourceOutSec ?? start + timelineFramesToSeconds(speech.durationFrames, fps) * speed;
      out.push({ start, end });
    }
  }
  return out;
}

/** Resolve which asset a word query addresses: explicit asset, a track's dominant speech clip, a placed
 *  clip on any lane, or (default) the first primary narrative clip. */
export function resolveWordQueryAsset(document: EditorDocumentV2, query: Pick<DocumentWordQuery, 'assetId' | 'trackId' | 'shotId'>): { assetId: string } | { error: string } {
  const transcripts = document.semantics.transcripts;
  if (query.assetId) {
    if (!document.assets[query.assetId] && !transcripts[query.assetId]) return { error: `asset not found: ${query.assetId}` };
    return { assetId: query.assetId };
  }
  if (query.trackId) {
    const track = document.timeline.tracks.find((candidate) => candidate.id === query.trackId);
    if (!track) return { error: `track not found: ${query.trackId}` };
    const candidates = track.clips.flatMap((clip) => (
      (clip.kind === 'narrative' || clip.kind === 'media' || clip.kind === 'audio') && clip.enabled ? [clip.assetId] : []
    ));
    const best = [...new Set(candidates)]
      .map((assetId) => ({ assetId, words: (transcripts[assetId] ?? []).reduce((sum, segment) => sum + wordsOf(segment as AsrSegment).length, 0) }))
      .sort((left, right) => right.words - left.words)[0];
    if (!best) return { error: `track has no speech-bearing clip: ${query.trackId}` };
    return { assetId: best.assetId };
  }
  if (query.shotId) {
    for (const track of document.timeline.tracks) {
      const clip = track.clips.find((candidate) => candidate.id === query.shotId);
      if (clip && 'assetId' in clip && typeof clip.assetId === 'string') return { assetId: clip.assetId };
    }
    return { error: 'shot not found' };
  }
  const assetId = primaryNarrativeClips(document)[0]?.assetId;
  return assetId ? { assetId } : { error: 'narrative source not found' };
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
): { words: DocumentAddressedWord[]; assetId: string; wordTiming: 'measured' | 'estimated' | 'none'; total: number; offset: number; hasMore: boolean } | { error: string } {
  const resolved = resolveWordQueryAsset(document, query);
  if ('error' in resolved) return resolved;
  const { assetId } = resolved;
  const segments = (document.semantics.transcripts[assetId] ?? []) as AsrSegment[];
  const ranges = assetSourceRanges(document, assetId);
  const sentenceSet = query.sentenceIndexes?.length ? new Set(query.sentenceIndexes) : null;
  const from = Number.isFinite(query.fromSec) ? query.fromSec! : -Infinity;
  const to = Number.isFinite(query.toSec) ? query.toSec! : Infinity;
  // A word survives when any placed clip of its asset still plays it (any lane).
  const matching = assetWords(assetId, segments).filter((word) => (
    (!sentenceSet || sentenceSet.has(word.sentenceIndex))
    && word.end > from
    && word.start < to
    && ranges.some((range) => word.end > range.start + 0.03 && word.start < range.end - 0.03)
  ));
  const offset = Number.isInteger(query.offset) ? Math.max(0, query.offset!) : 0;
  const limit = Number.isInteger(query.limit) ? Math.max(1, Math.min(1000, query.limit!)) : 300;
  const words = matching.slice(offset, offset + limit);
  return { words, assetId, wordTiming: transcriptWordTiming(segments), total: matching.length, offset, hasMore: offset + words.length < matching.length };
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
  return ranges.flatMap((range) => planNarrationCuts(document, {
    assetId: range.assetId,
    sourceRanges: [{ fromSec: range.sourceFromSec, toSec: range.sourceToSec }],
    transcriptProtection: 'outside-candidates',
    clipEdgeSnapSec: 0.5,
  }).timelineRanges.map((mapped) => ({ ...range, ...mapped })))
    .sort((left, right) => right.fromSec - left.fromSec);
}
