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
 * One row sent to the translator: a stretch of one sentence as it plays uninterrupted — its
 * consecutive on-screen lines joined. A sentence the edit split apart (other speech plays in
 * between) becomes one row per stretch, so the translator reads exactly what the viewer hears.
 * `range` (the stretch's source word span) is set only for such split sentences; an unsplit
 * sentence is written as the whole-sentence translation. How a translation spreads over its lines
 * is the caption layout's job at render time, so a re-layout never invalidates it.
 */
export interface TranslationUnit {
  src: string | null;
  assetId?: string;
  seg: number;
  start: number;
  text: string;
  range?: { w0: number; w1: number };
}

export function sentenceTranslationUnits(rows: readonly TranslationLineRow[]): TranslationUnit[] {
  const runs: (TranslationUnit & { key: string; parts: string[]; w0: number; w1: number })[] = [];
  for (const row of [...rows].sort((left, right) => left.editedStart - right.editedStart)) {
    const text = row.text.trim();
    if (!text) continue;
    const key = `${row.assetId ?? row.src ?? ''}|${row.index}`;
    const last = runs[runs.length - 1];
    if (last && last.key === key) {
      last.parts.push(text);
      last.w0 = Math.min(last.w0, row.w0);
      last.w1 = Math.max(last.w1, row.w1);
    } else {
      runs.push({ key, src: row.src, ...(row.assetId ? { assetId: row.assetId } : {}), seg: row.index, start: row.editedStart, text: '', parts: [text], w0: row.w0, w1: row.w1 });
    }
  }
  const stretches = new Map<string, number>();
  for (const run of runs) stretches.set(run.key, (stretches.get(run.key) ?? 0) + 1);
  return runs.map(({ key, parts, w0, w1, ...unit }) => ({
    ...unit,
    text: joinWords(parts),
    ...((stretches.get(key) ?? 0) > 1 ? { range: { w0, w1 } } : {}),
  }));
}

/** Sentence translations to write, grouped by source, plus the sentences that came back without one
 * (shown as untranslated and reported, never blocking the rest). Rows with an unknown or repeated
 * id are ignored. */
export interface CaptionTranslationWrites {
  writes: { src: string | null; assetId?: string; items: CaptionTranslationItem[] }[];
  missing: TranslationUnit[];
}

export function captionTranslationWrites(units: readonly TranslationUnit[], rows: readonly CaptionTranslationRow[]): CaptionTranslationWrites {
  const translated = new Map<number, string>();
  for (const row of rows) {
    const text = row.text.trim();
    if (Number.isInteger(row.index) && row.index >= 0 && row.index < units.length && text && !translated.has(row.index)) translated.set(row.index, text);
  }
  const bySource = new Map<string, { src: string | null; assetId?: string; items: CaptionTranslationItem[] }>();
  const missing: TranslationUnit[] = [];
  for (const [position, unit] of units.entries()) {
    const text = translated.get(position);
    if (!text) { missing.push(unit); continue; }
    const key = unit.assetId ?? unit.src ?? '';
    const write = bySource.get(key) ?? { src: unit.src, ...(unit.assetId ? { assetId: unit.assetId } : {}), items: [] };
    write.items.push({ index: unit.seg, ...(unit.range ?? {}), text });
    bySource.set(key, write);
  }
  return { writes: [...bySource.values()], missing };
}
