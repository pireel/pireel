import {
  type AsrSegment,
  applyCaptionTranslations,
  clearCaptionTranslations,
  type CaptionTranslationItem,
} from '@pireel/studio-engine/build-blocks';
import { applyCaptionDocumentEdit, type Composition, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import type { MappedSeg } from '@pireel/studio-engine/captions-relay';
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

function completeByPosition(groups: readonly Pick<MappedSeg, 'ref'>[], rows: readonly CaptionTranslationRow[]): Map<number, string> | null {
  if (groups.length !== rows.length) return null;
  const byPosition = new Map<number, string>();
  for (const row of rows) {
    const text = row.text.trim();
    if (!Number.isInteger(row.index) || row.index < 0 || row.index >= groups.length || !text || byPosition.has(row.index)) return null;
    byPosition.set(row.index, text);
  }
  return byPosition.size === groups.length ? byPosition : null;
}

/**
 * Build the complete replacement in memory. No ref/state is mutated until every translated row and
 * every transcript target has been validated, so callers can safely abandon an invalid result.
 */
export function stageCaptionTranslationReplacement(input: {
  groups: readonly Pick<MappedSeg, 'ref'>[];
  rows: readonly CaptionTranslationRow[];
  target: string;
  mainTranscript: readonly AsrSegment[] | null;
  clipTranscripts: Readonly<Record<string, readonly AsrSegment[]>>;
}): CaptionTranslationStageResult {
  const translated = completeByPosition(input.groups, input.rows);
  if (!translated) return { ok: false, error: 'Translation response was incomplete or contained invalid row ids.' };

  const perSegment = new Map<string, number>();
  for (const group of input.groups) {
    const key = `${group.ref.src ?? ''}|${group.ref.seg}`;
    perSegment.set(key, (perSegment.get(key) ?? 0) + 1);
  }

  const bySource = new Map<string | null, CaptionTranslationItem[]>();
  input.groups.forEach((group, position) => {
    const ref = group.ref;
    const items = bySource.get(ref.src) ?? [];
    const text = translated.get(position)!;
    items.push((perSegment.get(`${ref.src ?? ''}|${ref.seg}`) ?? 1) > 1
      ? { index: ref.seg, w0: ref.w0, w1: ref.w1, text }
      : { index: ref.seg, text });
    bySource.set(ref.src, items);
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
  groups: readonly Pick<MappedSeg, 'ref'>[];
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

/**
 * The translation unit is the sentence, never the cut fragment. A removed word in the middle of a
 * sentence leaves two surviving runs of words, and the relay maps them as two fragments; sent as
 * two rows ("大家好，客时间寄来的" / "张纸。") the translator merges them back into one sentence and
 * renumbers everything after it. Fold the fragments of one source sentence into a single row (words
 * in source order) so each row is a complete sentence; the stored sentence translation is then
 * distributed over the fragments' cues at render time.
 */
export function sentenceTranslationGroups(fragments: readonly MappedSeg[]): MappedSeg[] {
  const bySentence = new Map<string, MappedSeg[]>();
  for (const fragment of fragments) {
    const key = `${fragment.ref.src ?? ''}|${fragment.ref.seg}`;
    bySentence.set(key, [...(bySentence.get(key) ?? []), fragment]);
  }
  const out: MappedSeg[] = [];
  for (const parts of bySentence.values()) {
    const words = parts
      .flatMap((part) => part.words)
      .sort((left, right) => (left.si ?? 0) - (right.si ?? 0));
    const first = parts.reduce((earliest, part) => (part.start < earliest.start ? part : earliest));
    out.push({
      ...first,
      words,
      text: joinWords(words.map((word) => word.text)),
      ref: { ...first.ref, w0: words[0]!.si ?? 0, w1: words[words.length - 1]!.si ?? 0 },
      start: Math.min(...parts.map((part) => part.start)),
      end: Math.max(...parts.map((part) => part.end)),
    });
  }
  return out.sort((left, right) => left.start - right.start);
}
