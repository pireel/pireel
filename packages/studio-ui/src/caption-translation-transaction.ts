import type { CaptionTranslationItem } from '@pireel/studio-engine/build-blocks';
import { distributeSub, type MappedSeg } from '@pireel/studio-engine/captions-relay';
import { joinWords } from '@pireel/studio-engine/caption-fx';

export interface CaptionTranslationRow {
  index: number;
  text: string;
}

/**
 * One row sent to the translator: a complete sentence of one source, with the transcript segments
 * it spans. ASR segments break at pauses, not at grammar, and a cut can split a segment into
 * fragments; neither is a translatable unit on its own ("大家好，客时间寄来的" / "张纸。" comes back as one
 * line with every later row renumbered). The stored translation is spread back over the members
 * by word share, the same way a sentence translation is spread over its display cues.
 */
export interface TranslationUnit {
  src: string | null;
  start: number;
  end: number;
  text: string;
  members: { seg: number; wordCount: number }[];
}

/**
 * Sentence boundaries come from ICU (UAX #29), the same engine that segments our words: every
 * language's terminators, abbreviations and closing quotes are its business, not a hand-written
 * punctuation table. The question asked is "would a sentence break fall between these two runs of
 * words", so the two are joined the way captions join words and probed at the seam.
 */
const sentenceSegmenters = new Map<string, Intl.Segmenter | null>();
function sentenceSegmenter(lang: string | undefined): Intl.Segmenter | null {
  const key = lang ?? '';
  if (!sentenceSegmenters.has(key)) {
    let segmenter: Intl.Segmenter | null = null;
    try {
      segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(lang, { granularity: 'sentence' }) : null;
    } catch {
      segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
    }
    sentenceSegmenters.set(key, segmenter);
  }
  return sentenceSegmenters.get(key) ?? null;
}
export function sentenceBreaksBetween(left: string, right: string, lang?: string): boolean {
  const segmenter = sentenceSegmenter(lang);
  if (!segmenter) return true;
  const probe = joinWords([left, right]);
  const seam = new Set([left.length, probe.length - right.length]);
  for (const sentence of segmenter.segment(probe)) {
    if (sentence.index === 0) continue;
    if (seam.has(sentence.index)) return true;
    if (sentence.index > left.length) break;
  }
  return false;
}
/** Segments closer than this are one utterance; mirrors the transcript de-segmentation rule. */
export function sentenceTranslationUnits(fragments: readonly MappedSeg[]): TranslationUnit[] {
  // 1. Cut fragments of one segment → the segment's surviving words in source order.
  const segments = new Map<string, { src: string | null; seg: number; words: MappedSeg['words']; start: number; end: number; lang?: string }>();
  for (const fragment of fragments) {
    const key = `${fragment.ref.src ?? ''}|${fragment.ref.seg}`;
    const current = segments.get(key);
    if (current) {
      current.words = [...current.words, ...fragment.words].sort((left, right) => (left.si ?? 0) - (right.si ?? 0));
      current.start = Math.min(current.start, fragment.start);
      current.end = Math.max(current.end, fragment.end);
    } else {
      segments.set(key, { src: fragment.ref.src, seg: fragment.ref.seg, words: [...fragment.words].sort((left, right) => (left.si ?? 0) - (right.si ?? 0)), start: fragment.start, end: fragment.end, ...(fragment.lang ? { lang: fragment.lang } : {}) });
    }
  }
  // 2. One unit per surviving segment, in edited-timeline order. A segment is the recognizer's own
  //    sentence and the unit the translation is written back to by id, so the mapping is exact by
  //    construction: nothing is ever split across segments by word share, and a cut that reorders
  //    two fragments cannot swap their halves. The translator still sees the neighbouring rows as
  //    read-only context (the batch planner adds them), which covers a sentence the recognizer
  //    broke at a pause.
  const units: TranslationUnit[] = [];
  for (const segment of segments.values()) {
    const text = joinWords(segment.words.map((word) => word.text));
    if (!text) continue;
    units.push({ src: segment.src, start: segment.start, end: segment.end, text, members: [{ seg: segment.seg, wordCount: segment.words.length }] });
  }
  return units.sort((left, right) => left.start - right.start);
}

function completeByPosition(count: number, rows: readonly CaptionTranslationRow[]): Map<number, string> | null {
  if (count !== rows.length) return null;
  const byPosition = new Map<number, string>();
  for (const row of rows) {
    const text = row.text.trim();
    if (!Number.isInteger(row.index) || row.index < 0 || row.index >= count || !text || byPosition.has(row.index)) return null;
    byPosition.set(row.index, text);
  }
  return byPosition.size === count ? byPosition : null;
}

/** Translations to write, grouped by source (null = the main narration), one item per transcript
 * segment. A sentence that spans several segments hands each segment the share of the translation
 * its words account for. Nothing is written until every row validated. */
export type CaptionTranslationWrites =
  | { ok: true; writes: { src: string | null; items: CaptionTranslationItem[] }[] }
  | { ok: false; error: string };

export function captionTranslationWrites(units: readonly TranslationUnit[], rows: readonly CaptionTranslationRow[]): CaptionTranslationWrites {
  const translated = completeByPosition(units.length, rows);
  if (!translated) return { ok: false, error: 'Translation response was incomplete or contained invalid row ids.' };
  const bySource = new Map<string | null, CaptionTranslationItem[]>();
  units.forEach((unit, position) => {
    const items = bySource.get(unit.src) ?? [];
    const text = translated.get(position)!;
    if (unit.members.length === 1) items.push({ index: unit.members[0]!.seg, text });
    else {
      const pieces = distributeSub(text, unit.members.map((member) => member.wordCount));
      unit.members.forEach((member, at) => {
        if (pieces[at]) items.push({ index: member.seg, text: pieces[at]! });
      });
    }
    bySource.set(unit.src, items);
  });
  return { ok: true, writes: [...bySource].map(([src, items]) => ({ src, items })) };
}
