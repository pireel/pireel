import { videoTrackShots, type Composition } from '@pireel/studio-engine/composition';
import type { DocumentOp } from '@pireel/studio-engine/document-transaction';
import { captionTranslationWrites, type CaptionTranslationRow, type CaptionTranslationWrites, type TranslationUnit } from './caption-translation-transaction';

export type CaptionTranslator = (rows: CaptionTranslationRow[], language: string) => Promise<CaptionTranslationRow[]>;

/** Geometry/word ranges are part of identity. Color, position and temporary URLs are not. */
export function captionTranslationKey(units: readonly TranslationUnit[]): string {
  return JSON.stringify({ version: 2, units: units.map(unit => ({ owner: unit.assetId ?? unit.src ?? 'main', seg: unit.seg, text: unit.text, lines: unit.lines })) });
}

/** One batched, all-or-nothing translation contract for Studio and standalone scenes. */
export async function translateCaptionUnits(units: readonly TranslationUnit[], target: string, translate: CaptionTranslator, check: () => void = () => {}, onProgress?: (done: number, total: number) => void): Promise<Extract<CaptionTranslationWrites, { ok: true }>['writes']> {
  check();
  if (!units.length) throw new Error('没有可翻译的字幕。');
  if (units.some(unit => unit.text.length > 400)) throw new Error('字幕句子过长，请先重新断句再翻译。');
  const rows = await translateTextRows(units.map(unit => unit.text), target, translate, check, onProgress);
  const result = captionTranslationWrites(units, rows);
  if (!result.ok) throw new Error('翻译分行不匹配，请重试。 ' + result.error);
  return result.writes;
}

/** Shared provider batching/completeness validation; continuous dubbing text carries no line marks. */
export async function translateTextRows(texts: readonly string[], target: string, translate: CaptionTranslator, check: () => void = () => {}, onProgress?: (done: number, total: number) => void): Promise<CaptionTranslationRow[]> {
  if (!texts.length || texts.some(text => !text.trim() || text.length > 400)) throw new Error('翻译文本为空或过长。');
  onProgress?.(0, texts.length);
  const rows: CaptionTranslationRow[] = [];
  for (let offset = 0; offset < texts.length; offset += 250) {
    check();
    const batch = texts.slice(offset, offset + 250).map((text, index) => ({ index: offset + index, text }));
    const translated = await translate(batch, target); check();
    if (!Array.isArray(translated)) throw new Error('翻译结果不完整，请重试。');
    const expected = new Set(batch.map(row => row.index));
    for (const row of translated) {
      if (!row || !expected.delete(row.index) || typeof row.text !== 'string' || !row.text.trim()) throw new Error('翻译结果不完整，请重试。');
    }
    if (expected.size) throw new Error('翻译结果不完整，请重试。');
    rows.push(...translated); onProgress?.(rows.length, texts.length);
  }
  return rows;
}

/** All sources are resolved before committing; both callers use the same editor operations. */
export function captionTranslationOps(composition: Composition, writes: Extract<CaptionTranslationWrites, { ok: true }>['writes'], target: string): DocumentOp[] {
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
