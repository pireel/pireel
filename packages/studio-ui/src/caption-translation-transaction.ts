import type { CaptionTranslationItem } from '@pireel/studio-engine/build-blocks';
import { joinWords } from '@pireel/studio-engine/caption-fx';

export interface CaptionTranslationRow {
  index: number;
  text: string;
}

/** One on-screen caption line as the panel and the canvas derive it: which sentence of which
 * source it belongs to, the word range it covers, and where it plays. */
export interface TranslationLineRow {
  /** null = the main narration domain; otherwise the inserted clip's runtime src. */
  src: string | null;
  /** Transcript owner when the row comes from the document (audio-lane narration has no src). */
  assetId?: string;
  /** Sentence index within its source's transcript. */
  index: number;
  w0: number;
  w1: number;
  text: string;
  editedStart: number;
}

/**
 * One row sent to the translator: a complete sentence of one source, written as its on-screen
 * lines in play order and joined by LINE_MARK. The translator sees the whole sentence, so the
 * translation reads as one sentence, and it answers with the same number of marks, so each line's
 * share of the translation is decided by the translator rather than by word count. The sentence
 * (a transcript segment) is the recognizer's own unit and the id the result is written back to.
 */
export interface TranslationUnit {
  src: string | null;
  assetId?: string;
  seg: number;
  start: number;
  text: string;
  /** Cue word ranges, one per LINE_MARK-separated piece of `text`, in play order. */
  lines: { w0: number; w1: number }[];
}

/** Line-break mark inside a sentence row. Plain text a translation model carries across unchanged
 * far more reliably than any instruction asks it to; a bar is not a word in any target language. */
export const LINE_MARK = ' | ';
const MARK_SPLIT = /\s*[|｜]\s*/;

/** Source text must not contain the mark itself, or the answer's pieces cannot be counted. */
const withoutMarks = (text: string): string => text.replace(/[|｜]/g, '/').trim();

export function lineTranslationUnits(rows: readonly TranslationLineRow[]): TranslationUnit[] {
  const units = new Map<string, TranslationUnit>();
  for (const row of [...rows].sort((left, right) => left.editedStart - right.editedStart)) {
    const text = withoutMarks(row.text);
    if (!text) continue;
    const key = `${row.assetId ?? row.src ?? ''}|${row.index}`;
    const unit = units.get(key);
    if (unit) {
      unit.text += LINE_MARK + text;
      unit.lines.push({ w0: row.w0, w1: row.w1 });
    } else {
      units.set(key, {
        src: row.src,
        ...(row.assetId ? { assetId: row.assetId } : {}),
        seg: row.index,
        start: row.editedStart,
        text,
        lines: [{ w0: row.w0, w1: row.w1 }],
      });
    }
  }
  return [...units.values()].sort((left, right) => left.start - right.start);
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

/** The translator's answer for one sentence: the pieces between its marks, and the sentence with
 * the marks removed. Pieces are only trusted when they count the same as the lines sent. */
export function splitTranslatedLines(text: string): { pieces: string[]; whole: string } {
  const pieces = text.split(MARK_SPLIT).map((piece) => piece.trim()).filter(Boolean);
  return { pieces, whole: joinWords(pieces) };
}

/** Translations to write, grouped by source, one sentence per transcript segment plus, when the
 * answer kept every line mark, one per on-screen line. The sentence translation always lands: it
 * is what a re-laid-out line falls back to (spread by word share). Nothing is written until every
 * row validated. */
export type CaptionTranslationWrites =
  | { ok: true; writes: { src: string | null; assetId?: string; items: CaptionTranslationItem[] }[] }
  | { ok: false; error: string };

export function captionTranslationWrites(units: readonly TranslationUnit[], rows: readonly CaptionTranslationRow[]): CaptionTranslationWrites {
  const translated = completeByPosition(units.length, rows);
  if (!translated) return { ok: false, error: 'Translation response was incomplete or contained invalid row ids.' };
  const bySource = new Map<string, { src: string | null; assetId?: string; items: CaptionTranslationItem[] }>();
  units.forEach((unit, position) => {
    const key = unit.assetId ?? unit.src ?? '';
    const write = bySource.get(key) ?? { src: unit.src, ...(unit.assetId ? { assetId: unit.assetId } : {}), items: [] };
    const { pieces, whole } = splitTranslatedLines(translated.get(position)!);
    if (!whole) return;
    write.items.push({ index: unit.seg, text: whole });
    if (pieces.length === unit.lines.length && unit.lines.length > 1) {
      unit.lines.forEach((line, at) => write.items.push({ index: unit.seg, w0: line.w0, w1: line.w1, text: pieces[at]! }));
    }
    bySource.set(key, write);
  });
  return { ok: true, writes: [...bySource.values()] };
}
