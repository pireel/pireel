/** Pure caption-copy writer shared by the panel and live/offline agent tools. */

import type { AsrSegment, TranscriptWord } from './build-blocks';
import { joinWords, wordsFromText } from './caption-fx';

export interface CaptionTextEditItem {
  /** Sentence row from read_script / the source transcript. */
  index: number;
  text: string;
  /** Stable source-word range of the existing display cue. Agent sentence edits are expanded to
   *  these ranges before they reach this writer. */
  w0?: number;
  w1?: number;
  /** Snapshot this range as an explicit layout lock even when its copy still equals the ASR text. */
  lock?: boolean;
}

interface WordRange {
  key: string;
  start: number;
  end: number;
  text: string;
}

function wordsFor(segment: AsrSegment): TranscriptWord[] {
  return segment.words?.length ? segment.words : wordsFromText(segment.text, segment.start, segment.end);
}

function parsedRanges(values: Readonly<Record<string, string>> | undefined, wordCount: number): WordRange[] {
  if (!values) return [];
  const ranges: WordRange[] = [];
  for (const [key, text] of Object.entries(values)) {
    const [startRaw, endRaw] = key.split(':');
    const start = Number(startRaw);
    const end = Number(endRaw);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= wordCount) continue;
    ranges.push({ key, start, end, text });
  }
  return ranges.sort((left, right) => left.start - right.start || left.end - right.end);
}

function overlaps(range: WordRange, start: number, end: number): boolean {
  return range.start <= end && range.end >= start;
}

/** Rebuild the audience-facing sentence while leaving the ASR transcript and word timing untouched. */
export function captionTextFromCueOverrides(segment: AsrSegment, cueTexts = segment.cueTexts): string {
  const words = wordsFor(segment);
  const byStart = new Map(parsedRanges(cueTexts, words.length).map((range) => [range.start, range] as const));
  const pieces: string[] = [];
  for (let index = 0; index < words.length;) {
    const range = byStart.get(index);
    if (range) {
      if (range.text.trim()) pieces.push(range.text.trim());
      index = range.end + 1;
    } else {
      pieces.push(words[index]!.text);
      index += 1;
    }
  }
  return joinWords(pieces);
}

function withoutOverlaps<T>(values: Readonly<Record<string, T>> | undefined, start: number, end: number, wordCount: number): Record<string, T> {
  if (!values) return {};
  const next: Record<string, T> = {};
  for (const range of parsedRanges(values as Readonly<Record<string, string>>, wordCount)) {
    if (!overlaps(range, start, end)) next[range.key] = values[range.key]!;
  }
  return next;
}

function layoutWithoutOverlaps(values: readonly string[] | undefined, start: number, end: number, wordCount: number): string[] {
  const next: string[] = [];
  for (const key of values ?? []) {
    const [startRaw, endRaw] = key.split(':');
    const rangeStart = Number(startRaw);
    const rangeEnd = Number(endRaw);
    if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd) || rangeStart < 0 || rangeEnd < rangeStart || rangeEnd >= wordCount) continue;
    if (rangeStart > end || rangeEnd < start) next.push(key);
  }
  return next;
}

/**
 * Apply manual caption-copy corrections without changing transcript words, word indexes or timing.
 * Copy overrides and cue boundaries are persisted independently. Each edited source-word range
 * becomes a locked display cue. Empty text is intentionally rejected:
 * removing a caption is a separate timeline operation, not an accidental text-field side effect.
 */
export function applyCaptionTextEdits(segments: readonly AsrSegment[], items: readonly CaptionTextEditItem[]): AsrSegment[] {
  if (!items.length) return segments as AsrSegment[];
  let next = segments as AsrSegment[];
  for (const item of items) {
    const text = item.text.replace(/\s+/g, ' ').trim();
    const current = next[item.index];
    if (!current || !text) continue;
    const words = wordsFor(current);
    if (!words.length) continue;
    const w0 = Math.max(0, Math.min(item.w0 ?? 0, words.length - 1));
    const w1 = Math.max(w0, Math.min(item.w1 ?? words.length - 1, words.length - 1));
    const key = `${w0}:${w1}`;
    const sourceText = joinWords(words.slice(w0, w1 + 1).map((word) => word.text));
    const currentText = current.cueTexts?.[key] ?? sourceText;
    const contentChanged = text !== currentText;
    const currentLayout = current.cueLayout ?? (current.cueTexts ? Object.keys(current.cueTexts) : []);
    if (!contentChanged && (!item.lock || current.cueLayout?.includes(key))) continue;

    const cueTexts = withoutOverlaps(current.cueTexts, w0, w1, words.length);
    if (text !== sourceText) cueTexts[key] = text;
    const cueLayout = layoutWithoutOverlaps(currentLayout, w0, w1, words.length);
    if (item.lock || text !== sourceText || currentLayout.includes(key)) cueLayout.push(key);
    cueLayout.sort((left, right) => Number(left.split(':')[0]) - Number(right.split(':')[0]));
    const cueSubs = contentChanged
      ? withoutOverlaps(current.cueSubs, w0, w1, words.length)
      : { ...(current.cueSubs ?? {}) };
    const edited: AsrSegment = { ...current };
    if (cueLayout.length) edited.cueLayout = cueLayout;
    else delete edited.cueLayout;
    if (Object.keys(cueTexts).length) {
      edited.cueTexts = cueTexts;
      edited.captionText = captionTextFromCueOverrides(edited, cueTexts);
    } else {
      delete edited.cueTexts;
      delete edited.captionText;
    }
    if (Object.keys(cueSubs).length) edited.cueSubs = cueSubs;
    else delete edited.cueSubs;
    if (contentChanged && w0 === 0 && w1 === words.length - 1) delete edited.sub;

    if (next === segments) next = [...segments];
    else next = [...next];
    next[item.index] = edited;
  }
  return next;
}
