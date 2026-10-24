import { videoTrackShots, type Composition } from '@pireel/studio-engine/composition';
import type { DocumentOp } from '@pireel/studio-engine/document-transaction';
import { captionTranslationWrites, type CaptionTranslationRow, type CaptionTranslationWrites, type TranslationUnit } from '@pireel/studio-ui/caption-translation-transaction';
import { t } from './i18n';

export type CaptionTranslator = (rows: CaptionTranslationRow[], language: string) => Promise<CaptionTranslationRow[]>;

/** Sentence text and word stretches are part of identity. Color, position and temporary URLs are not. */
export function captionTranslationKey(units: readonly TranslationUnit[]): string {
  return JSON.stringify({ version: 3, units: units.map(unit => ({ owner: unit.assetId ?? unit.src ?? 'main', seg: unit.seg, text: unit.text, range: unit.range ?? null })) });
}

/** One batched sentence translation contract for Studio and standalone scenes. Sentences that come
 * back empty stay untranslated and are returned in `missing` for the caller to report; a run where
 * nothing came back fails. */
export async function translateCaptionUnits(units: readonly TranslationUnit[], target: string, translate: CaptionTranslator, check: () => void = () => {}, onProgress?: (done: number, total: number) => void): Promise<CaptionTranslationWrites> {
  check();
  if (!units.length) throw new Error(t('ui.captionTranslation.nothing'));
  if (units.some(unit => unit.text.length > 400)) throw new Error(t('ui.captionTranslation.tooLong'));
  onProgress?.(0, units.length);
  const rows: CaptionTranslationRow[] = [];
  for (let offset = 0; offset < units.length; offset += 250) {
    check();
    const batch = units.slice(offset, offset + 250).map((unit, index) => ({ index: offset + index, text: unit.text }));
    const translated = await translate(batch, target); check();
    if (!Array.isArray(translated)) throw new Error(t('ui.captionTranslation.incomplete'));
    rows.push(...translated); onProgress?.(Math.min(units.length, offset + batch.length), units.length);
  }
  const result = captionTranslationWrites(units, rows);
  if (!result.writes.length) throw new Error(t('ui.captionTranslation.empty'));
  return result;
}

/** Shared provider batching/completeness validation; continuous dubbing text carries no line marks. */
export async function translateTextRows(texts: readonly string[], target: string, translate: CaptionTranslator, check: () => void = () => {}, onProgress?: (done: number, total: number) => void): Promise<CaptionTranslationRow[]> {
  if (!texts.length || texts.some(text => !text.trim() || text.length > 400)) throw new Error(t('ui.captionTranslation.badText'));
  onProgress?.(0, texts.length);
  const rows: CaptionTranslationRow[] = [];
  for (let offset = 0; offset < texts.length; offset += 250) {
    check();
    const batch = texts.slice(offset, offset + 250).map((text, index) => ({ index: offset + index, text }));
    const translated = await translate(batch, target); check();
    if (!Array.isArray(translated)) throw new Error(t('ui.captionTranslation.incomplete'));
    const expected = new Set(batch.map(row => row.index));
    for (const row of translated) {
      if (!row || !expected.delete(row.index) || typeof row.text !== 'string' || !row.text.trim()) throw new Error(t('ui.captionTranslation.incomplete'));
    }
    if (expected.size) throw new Error(t('ui.captionTranslation.incomplete'));
    rows.push(...translated); onProgress?.(rows.length, texts.length);
  }
  return rows;
}

/** All sources are resolved before committing; both callers use the same editor operations. */
export function captionTranslationOps(composition: Composition, writes: CaptionTranslationWrites['writes'], target: string): DocumentOp[] {
  const shots = videoTrackShots(composition);
  const ops: DocumentOp[] = [{ op: 'agent.timeline', input: { tool: 'set_captions', input: { translations: { clear: true } } } }];
  for (const write of writes) {
    const clipId = !write.assetId && write.src ? shots.find(shot => shot.src === write.src)?.id : undefined;
    if (!write.assetId && write.src && !clipId) throw new Error(`Translation source is no longer available: ${write.src}`);
    ops.push({ op: 'agent.timeline', input: { tool: 'set_captions', input: {
      ...(clipId ? { clipId } : {}), translations: { lang: target, items: write.items, ...(write.assetId ? { assetId: write.assetId } : {}) },
    } } });
  }
  return ops;
}
