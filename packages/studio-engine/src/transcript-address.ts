/** Stable word addressing for transcript-driven edits.
 *
 * Word ids are derived from the persisted transcript/source identity, never from edited-timeline
 * positions, so cuts do not renumber them. The transcript remains the source of truth; ids do not
 * need a migration or another persisted table.
 */

import { joinWords, wordsFromText } from './caption-fx';
import type { AsrSegment, TranscriptWord } from './build-blocks';
import type { VideoShot } from './composition-core';
import { spans } from './trim';

export interface AddressedWord extends TranscriptWord {
  id: string;
  source: string | null;
  sourceToken: string;
  sentenceIndex: number;
  wordIndex: number;
}

export interface WordQuery {
  shotId?: string;
  sentenceIndexes?: number[];
  fromSec?: number;
  toSec?: number;
  offset?: number;
  limit?: number;
}

const hashToken = (value: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
};

function tokenFor(shots: VideoShot[], source: string | null): string {
  if (source == null) return 'main';
  const shot = shots.find((s) => s.src === source);
  return `clip_${hashToken(shot?.srcSig || source)}`;
}

function wordsOf(segment: AsrSegment): TranscriptWord[] {
  return segment.words?.length ? segment.words : wordsFromText(segment.text, segment.start, segment.end);
}

function sourceWords(shots: VideoShot[], source: string | null, segments: AsrSegment[]): AddressedWord[] {
  const sourceToken = tokenFor(shots, source);
  return segments.flatMap((segment, sentenceIndex) =>
    wordsOf(segment).map((word, wordIndex) => {
      const start = Math.max(0, word.start);
      const end = Math.max(start, word.end);
      const time = `${Math.round(start * 1000).toString(36)}_${Math.round(end * 1000).toString(36)}`;
      return { ...word, id: `word_${sourceToken}_${sentenceIndex.toString(36)}_${time}_${wordIndex.toString(36)}`, source, sourceToken, sentenceIndex, wordIndex };
    }),
  );
}

function sources(shots: VideoShot[], main: AsrSegment[], clips: Record<string, AsrSegment[]>): { source: string | null; segments: AsrSegment[] }[] {
  const out: { source: string | null; segments: AsrSegment[] }[] = [{ source: null, segments: main }];
  const seen = new Set<string>();
  for (const shot of shots) {
    if (!shot.src || seen.has(shot.src)) continue;
    seen.add(shot.src);
    out.push({ source: shot.src, segments: clips[shot.src] ?? [] });
  }
  return out;
}

/** List words for the narration source, or for the source that owns shotId. */
export function listAddressedWords(
  shots: VideoShot[],
  main: AsrSegment[],
  clips: Record<string, AsrSegment[]>,
  query: WordQuery = {},
): { words: AddressedWord[]; sourceToken: string; total: number; offset: number; hasMore: boolean } | { error: string } {
  let source: string | null = null;
  let segments = main;
  if (query.shotId) {
    const shot = shots.find((s) => s.id === query.shotId);
    if (!shot) return { error: 'shot not found' };
    source = shot.src ?? null;
    segments = source == null ? main : (clips[source] ?? []);
  }
  const sentenceSet = query.sentenceIndexes?.length ? new Set(query.sentenceIndexes) : null;
  const from = Number.isFinite(query.fromSec) ? query.fromSec! : -Infinity;
  const to = Number.isFinite(query.toSec) ? query.toSec! : Infinity;
  const sourceShots = shots.filter((shot) => (shot.src ?? null) === source);
  const matching = sourceWords(shots, source, segments).filter(
    (word) =>
      (!sentenceSet || sentenceSet.has(word.sentenceIndex)) &&
      word.end > from &&
      word.start < to &&
      (!sourceShots.length || sourceShots.some((shot) => word.end > shot.srcStart + 0.03 && word.start < shot.srcEnd - 0.03)),
  );
  const offset = Number.isInteger(query.offset) ? Math.max(0, query.offset!) : 0;
  const limit = Number.isInteger(query.limit) ? Math.max(1, Math.min(1000, query.limit!)) : 300;
  const words = matching.slice(offset, offset + limit);
  return { words, sourceToken: tokenFor(shots, source), total: matching.length, offset, hasMore: offset + words.length < matching.length };
}

/** Resolve ids across every transcript source in the current composition. */
export function resolveWordIds(
  shots: VideoShot[],
  main: AsrSegment[],
  clips: Record<string, AsrSegment[]>,
  ids: string[],
): { words: AddressedWord[]; missing: string[] } {
  const wanted = new Set(ids);
  const hit = new Map<string, AddressedWord>();
  for (const src of sources(shots, main, clips)) {
    for (const word of sourceWords(shots, src.source, src.segments)) if (wanted.has(word.id)) hit.set(word.id, word);
  }
  return { words: ids.flatMap((id) => (hit.has(id) ? [hit.get(id)!] : [])), missing: ids.filter((id) => !hit.has(id)) };
}

export interface SourceWordRange {
  source: string | null;
  from: number;
  to: number;
  text: string;
  wordIds: string[];
}

/** Merge adjacent selected words on the same source into minimal source-clock ranges. */
export function wordRanges(words: AddressedWord[]): SourceWordRange[] {
  const bySource = new Map<string | null, AddressedWord[]>();
  for (const word of words) bySource.set(word.source, [...(bySource.get(word.source) ?? []), word]);
  const out: SourceWordRange[] = [];
  for (const [source, group] of bySource) {
    const sorted = [...group].sort((a, b) => a.start - b.start || a.end - b.end);
    let last: AddressedWord | undefined;
    for (const word of sorted) {
      const prev = out.at(-1);
      const consecutive = !!last && last.sentenceIndex === word.sentenceIndex && last.wordIndex + 1 === word.wordIndex;
      if (prev && prev.source === source && (consecutive || word.start <= prev.to + 0.08)) {
        prev.to = Math.max(prev.to, word.end);
        prev.text = joinWords([prev.text, word.text]);
        prev.wordIds.push(word.id);
      } else {
        out.push({ source, from: word.start, to: word.end, text: word.text, wordIds: [word.id] });
      }
      last = word;
    }
  }
  return out;
}

export interface EditedWordRange extends SourceWordRange {
  editedFrom: number;
  editedTo: number;
}

/** Map source-clock ranges onto every surviving occurrence in the edited timeline. Unlike the older
 *  loose one-point mapper, this preserves repeated sources and cuts a word only where it still exists. */
export function wordRangesToEdited(shots: VideoShot[], ranges: SourceWordRange[]): EditedWordRange[] {
  const out: EditedWordRange[] = [];
  const shotSpans = spans(shots);
  for (const range of ranges) {
    for (const span of shotSpans) {
      const shot = span.clip;
      if ((shot.src ?? null) !== range.source) continue;
      const from = Math.max(range.from, shot.srcStart);
      const to = Math.min(range.to, shot.srcEnd);
      if (to - from <= 0.03) continue;
      out.push({
        ...range,
        from,
        to,
        editedFrom: span.editedStart + (from - shot.srcStart),
        editedTo: span.editedStart + (to - shot.srcStart),
      });
    }
  }
  return out.sort((a, b) => b.editedFrom - a.editedFrom);
}
