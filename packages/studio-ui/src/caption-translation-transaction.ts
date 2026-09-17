import {
  type AsrSegment,
  applyCaptionTranslations,
  clearCaptionTranslations,
  type CaptionTranslationItem,
} from '@pireel/studio-engine/build-blocks';
import { applyCaptionDocumentEdit, type Composition, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { distributeSub, type MappedSeg } from '@pireel/studio-engine/captions-relay';
import { joinWords } from '@pireel/studio-engine/caption-fx';
import { captionTranscriptsByAsset } from './caption-transcript-bridge';
import { editorErrorMessage } from './editor-error';

export interface CaptionTranslationRow {
  index: number;
  text: string;
}

export type CaptionTranslationStageResult =
  | { ok: true; mainTranscript: AsrSegment[] | null; clipTranscripts: Record<string, AsrSegment[]> }
  | { ok: false; error: string };

export type CaptionTranslationTransactionResult =
  | { ok: true; document: EditorDocumentV2; mainTranscript: AsrSegment[] | null; clipTranscripts: Record<string, AsrSegment[]> }
  | { ok: false; error: string };

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
const UTTERANCE_GAP_SEC = 1.0;
/** A source with no punctuation at all must still produce bounded rows. */
const UNIT_MAX_CHARS = 200;

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
  // 2. Consecutive segments of one source → a sentence, closed at sentence-final punctuation, a
  //    pause, or a length bound.
  const bySource = new Map<string | null, typeof segments extends Map<string, infer V> ? V[] : never>();
  for (const segment of segments.values()) bySource.set(segment.src, [...(bySource.get(segment.src) ?? []), segment]);
  const units: TranslationUnit[] = [];
  for (const rows of bySource.values()) {
    rows.sort((left, right) => left.seg - right.seg);
    let open: { rows: typeof rows; text: string } | null = null;
    const close = () => {
      if (!open) return;
      units.push({
        src: open.rows[0]!.src,
        start: Math.min(...open.rows.map((row) => row.start)),
        end: Math.max(...open.rows.map((row) => row.end)),
        text: open.text,
        members: open.rows.map((row) => ({ seg: row.seg, wordCount: row.words.length })),
      });
      open = null;
    };
    for (const row of rows) {
      const text = joinWords(row.words.map((word) => word.text));
      if (!text) continue;
      if (open) {
        const previous = open.rows[open.rows.length - 1]!;
        const joined = joinWords([open.text, text]);
        if (sentenceBreaksBetween(open.text, text, row.lang) || row.start - previous.end >= UTTERANCE_GAP_SEC || joined.length > UNIT_MAX_CHARS) close();
        else {
          open.rows.push(row);
          open.text = joined;
          continue;
        }
      }
      open = { rows: [row], text };
    }
    close();
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

/**
 * Build the complete replacement in memory. No ref/state is mutated until every translated row and
 * every transcript target has been validated, so callers can safely abandon an invalid result.
 */
export function stageCaptionTranslationReplacement(input: {
  units: readonly TranslationUnit[];
  rows: readonly CaptionTranslationRow[];
  target: string;
  mainTranscript: readonly AsrSegment[] | null;
  clipTranscripts: Readonly<Record<string, readonly AsrSegment[]>>;
}): CaptionTranslationStageResult {
  const translated = completeByPosition(input.units.length, input.rows);
  if (!translated) return { ok: false, error: 'Translation response was incomplete or contained invalid row ids.' };

  const bySource = new Map<string | null, CaptionTranslationItem[]>();
  input.units.forEach((unit, position) => {
    const items = bySource.get(unit.src) ?? [];
    const text = translated.get(position)!;
    if (unit.members.length === 1) items.push({ index: unit.members[0]!.seg, text });
    else {
      // A sentence that spans several transcript segments: each segment keeps the share of the
      // translation its words account for, so the bilingual line follows the speech.
      const pieces = distributeSub(text, unit.members.map((member) => member.wordCount));
      unit.members.forEach((member, at) => {
        if (pieces[at]) items.push({ index: member.seg, text: pieces[at]! });
      });
    }
    bySource.set(unit.src, items);
  });

  let mainTranscript = input.mainTranscript ? clearCaptionTranslations([...input.mainTranscript]) : null;
  const clipTranscripts = Object.fromEntries(Object.entries(input.clipTranscripts).map(([source, segments]) => [
    source,
    clearCaptionTranslations([...segments]),
  ]));

  for (const [source, items] of bySource) {
    const segments = source ? clipTranscripts[source] : mainTranscript;
    if (!segments?.length) return { ok: false, error: source ? `Translation source is no longer available: ${source}` : 'The main transcript is no longer available.' };
    if (items.some((item) => item.index < 0 || item.index >= segments.length)) {
      return { ok: false, error: 'The transcript changed while it was being translated.' };
    }
    const next = applyCaptionTranslations(segments, items, input.target);
    if (source) clipTranscripts[source] = next;
    else mainTranscript = next;
  }

  return { ok: true, mainTranscript, clipTranscripts };
}

/** Apply transcript replacement, caption relay, and target-language style in one document edit. */
export function replaceCaptionTranslationsTransaction(input: {
  document: EditorDocumentV2;
  composition: Composition;
  units: readonly TranslationUnit[];
  rows: readonly CaptionTranslationRow[];
  target: string;
  mainTranscript: readonly AsrSegment[] | null;
  clipTranscripts: Readonly<Record<string, readonly AsrSegment[]>>;
}): CaptionTranslationTransactionResult {
  const staged = stageCaptionTranslationReplacement(input);
  if (!staged.ok) return staged;

  const edit = applyCaptionDocumentEdit({
    document: input.document,
    patch: {
      sub: { ...(input.document.appearance.captionStyle?.sub ?? {}), lang: input.target },
    },
    mainTranscript: staged.mainTranscript,
    clipTranscripts: captionTranscriptsByAsset(input.document, input.composition, staged.clipTranscripts),
  });
  if (!edit.ok) return { ok: false, error: editorErrorMessage(edit.error) };
  return { ...staged, document: edit.document };
}

