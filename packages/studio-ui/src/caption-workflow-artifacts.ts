import { wordsFromText } from '@pireel/studio-engine/caption-fx';
import { validateEmphasisSelection } from '@pireel/studio-engine/caption-emphasis';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { applyCaptionDocumentEdit, projectDocumentToComposition, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { applyDocumentTransaction } from '@pireel/studio-engine/document-transaction';
import { captionTaskStyle, fitCaptionTaskDocumentLayout, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { deriveCaptionLineRows } from './caption-line-rows';
import { captionTranslationSources } from './caption-transcript-bridge';
import { sentenceTranslationUnits, type TranslationUnit } from './caption-translation-transaction';
import { captionTranslationKey, captionTranslationOps, translateCaptionUnits, type CaptionTranslator } from './caption-translation-operation';

export interface CaptionPlan {
  sourceKey: string;
  transcripts: EditorDocumentV2['semantics']['transcripts'];
  units: (TranslationUnit & { id: string })[];
  lines: { id: string; assetId?: string; seg: number; w0: number; w1: number; text: string; words: string[]; start: number; duration: number }[];
}
export interface CaptionEmphasis { sourceKey: string; items: { id: string; words: number[] }[] }
export function captionPlanEmphasisRows(plan: CaptionPlan) {
  return plan.lines.map((line, index) => ({ index, words: line.words }));
}
export interface CaptionTranslation {
  sourceKey: string; language: string;
  /** Sentences that came back translated; the rest are listed in `missing` and stay untranslated. */
  items: { id: string; text: string }[];
  missing?: string[];
}
/** Runs after font readiness. The shared relay owns segmentation, word timing and frozen cue layout. */
export function planCaptionDocument(document: EditorDocumentV2, transcript: AsrSegment[], options: CaptionTaskOptions): CaptionPlan {
  const narration = document.timeline.tracks.find(track => track.role === 'narration');
  const audio = narration?.clips.find(clip => clip.kind === 'audio');
  if (audio && 'assetId' in audio) document = { ...document, semantics: { ...document.semantics, transcripts: { ...document.semantics.transcripts, [audio.assetId]: transcript } } };
  const planned = applyCaptionDocumentEdit({ document, ...(narration ? { source: { mode: 'track' as const, trackId: narration.id } } : {}), patch: { ...captionTaskStyle(options, document.canvas), on: true }, mainTranscript: narration ? null : transcript, clipTranscripts: {}, relayout: true });
  if (!planned.ok) throw new Error(planned.error.message);
  const comp = projectDocumentToComposition(planned.document);
  const sources = captionTranslationSources(planned.document, comp, transcript, {});
  const lines = deriveCaptionLineRows(planned.document, comp, sources.main, sources.clips);
  const units = sentenceTranslationUnits(lines).map(unit => ({ ...unit, src: null, id: `${unit.assetId ?? 'main'}:${unit.seg}${unit.range ? `:${unit.range.w0}-${unit.range.w1}` : ''}` }));
  return {
    sourceKey: captionTranslationKey(units), transcripts: planned.document.semantics.transcripts, units,
    lines: lines.map(line => ({ id: `${line.assetId ?? 'main'}:${line.index}:${line.w0}-${line.w1}`, ...(line.assetId ? { assetId: line.assetId } : {}), seg: line.index, w0: line.w0, w1: line.w1, text: line.text, words: (line.words ?? wordsFromText(line.text, line.editedStart, line.editedStart + (line.dur ?? 0))).map(word => word.text), start: line.editedStart, duration: line.dur ?? 0 })),
  };
}
/** Translation consumes text units, not a video document or mutable scene task. */
export async function translateCaptionPlan(units: CaptionPlan['units'], language: string, translate: CaptionTranslator, check: () => void, progress?: (done: number, total: number) => void): Promise<CaptionTranslation> {
  if (new Set(units.map(unit => unit.id)).size !== units.length) throw new Error('Duplicate caption unit id');
  const result = await translateCaptionUnits(units, language, translate, check, progress);
  const missing = new Set(result.missing);
  const items = units.flatMap(unit => {
    if (missing.has(unit)) return [];
    const item = result.writes.find(write => write.assetId === unit.assetId && write.src === unit.src)?.items
      .find(item => item.index === unit.seg && item.w0 === unit.range?.w0 && item.w1 === unit.range?.w1);
    if (!item) throw new Error('译文与字幕单元不匹配。');
    return [{ id: unit.id, text: item.text }];
  });
  return { sourceKey: captionTranslationKey(units), language, items, missing: units.filter(unit => missing.has(unit)).map(unit => unit.id) };
}
export function assembleCaptionDocument(document: EditorDocumentV2, plan: CaptionPlan, translation: CaptionTranslation | null, options: CaptionTaskOptions, emphasis: CaptionEmphasis | null = null): EditorDocumentV2 {
  if (!Object.keys(plan.transcripts).some(id => !!document.assets[id]) || plan.sourceKey !== captionTranslationKey(plan.units)) throw new Error('字幕规划与文档不匹配。');
  // The planning artifact carries cueLayout; style changes must not trigger a second line split.
  const base = { ...document, semantics: { ...document.semantics, transcripts: structuredClone(plan.transcripts) } };
  if (emphasis) {
    if (emphasis.sourceKey !== plan.sourceKey || emphasis.items.length !== plan.lines.length || new Set(emphasis.items.map(item => item.id)).size !== plan.lines.length) throw new Error('重点词与字幕规划版本不匹配。');
    const selected = plan.lines.map((line, index) => ({ index, words: emphasis.items.find(item => item.id === line.id)?.words }));
    if (!validateEmphasisSelection(captionPlanEmphasisRows(plan), selected)) throw new Error('重点词选择无效。');
    plan.lines.forEach((line, index) => {
      const segment = base.semantics.transcripts[line.assetId!]![line.seg]!;
      segment.cueEmphasis = { ...segment.cueEmphasis, [`${line.w0}:${line.w1}`]: { text: line.text, words: selected[index].words! } };
    });
  }
  const applied = applyCaptionDocumentEdit({ document: base, patch: { ...captionTaskStyle(options, document.canvas), on: true }, mainTranscript: null, clipTranscripts: {} });
  if (!applied.ok) throw new Error(applied.error.message);
  let result = applied.document;
  if (translation) {
    const ids = new Set(plan.units.map(unit => unit.id));
    if (translation.sourceKey !== plan.sourceKey || translation.language !== options.translationLanguage || !translation.items.length || new Set(translation.items.map(item => item.id)).size !== translation.items.length || translation.items.some(item => !ids.has(item.id) || typeof item.text !== 'string' || !item.text.trim())) throw new Error('译文与字幕规划版本不匹配。');
    const bySource = new Map<string, { src: string | null; assetId?: string; items: { index: number; w0?: number; w1?: number; text: string }[] }>();
    for (const unit of plan.units) {
      const item = translation.items.find(item => item.id === unit.id);
      if (!item) continue;
      const key = unit.assetId ?? unit.src ?? '';
      const write = bySource.get(key) ?? { src: unit.src, ...(unit.assetId ? { assetId: unit.assetId } : {}), items: [] };
      write.items.push({ index: unit.seg, ...(unit.range ?? {}), text: item.text });
      bySource.set(key, write);
    }
    const writes = [...bySource.values()];
    const translated = applyDocumentTransaction(result, { ops: captionTranslationOps(projectDocumentToComposition(result), writes, translation.language) }, { projectId: "caption-workflow" });
    if (!translated.ok) throw new Error(translated.error.message);
    result = translated.document;
  }
  return fitCaptionTaskDocumentLayout(result, options);
}
