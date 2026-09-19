import { wordsFromText } from '@pireel/studio-engine/caption-fx';
import { validateEmphasisSelection } from '@pireel/studio-engine/caption-emphasis';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { applyCaptionDocumentEdit, projectDocumentToComposition, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { applyDocumentTransaction } from '@pireel/studio-engine/document-transaction';
import { captionTaskStyle, fitCaptionTaskDocumentLayout, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { deriveCaptionLineRows } from './caption-line-rows';
import { captionTranslationSources } from './caption-transcript-bridge';
import { lineTranslationUnits, type TranslationUnit } from './caption-translation-transaction';
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
  items: { id: string; lines: string[] }[];
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
  const units = lineTranslationUnits(lines).map(unit => ({ ...unit, src: null, id: `${unit.assetId ?? 'main'}:${unit.seg}` }));
  return {
    sourceKey: captionTranslationKey(units), transcripts: planned.document.semantics.transcripts, units,
    lines: lines.map(line => ({ id: `${line.assetId ?? 'main'}:${line.index}:${line.w0}-${line.w1}`, ...(line.assetId ? { assetId: line.assetId } : {}), seg: line.index, w0: line.w0, w1: line.w1, text: line.text, words: (line.words ?? wordsFromText(line.text, line.editedStart, line.editedStart + (line.dur ?? 0))).map(word => word.text), start: line.editedStart, duration: line.dur ?? 0 })),
  };
}
/** Translation consumes text units, not a video document or mutable scene task. */
export async function translateCaptionPlan(units: CaptionPlan['units'], language: string, translate: CaptionTranslator, check: () => void, progress?: (done: number, total: number) => void): Promise<CaptionTranslation> {
  if (new Set(units.map(unit => unit.id)).size !== units.length) throw new Error('Duplicate caption unit id');
  const writes = await translateCaptionUnits(units, language, translate, check, progress);
  return { sourceKey: captionTranslationKey(units), language, items: units.map(unit => {
    const write = writes.find(write => write.assetId === unit.assetId && write.src === unit.src);
    return { id: unit.id, lines: unit.lines.map(line => write!.items.find(item => item.index === unit.seg && item.w0 === line.w0 && item.w1 === line.w1)!.text) };
  }) };
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
    if (translation.sourceKey !== plan.sourceKey || translation.language !== options.translationLanguage || translation.items.length !== plan.units.length || new Set(translation.items.map(item => item.id)).size !== plan.units.length) throw new Error('译文与字幕规划版本不匹配。');
    const writes = plan.units.map(unit => {
      const item = translation.items.find(item => item.id === unit.id);
      if (!item || item.lines.length !== unit.lines.length || item.lines.some(line => typeof line !== 'string' || !line.trim())) throw new Error('译文不完整或分行不匹配。');
      return { src: unit.src, ...(unit.assetId ? { assetId: unit.assetId } : {}), items: unit.lines.map((line, index) => ({ index: unit.seg, ...line, text: item.lines[index] })) };
    });
    const translated = applyDocumentTransaction(result, { ops: captionTranslationOps(projectDocumentToComposition(result), writes, translation.language) }, { projectId: "caption-workflow" });
    if (!translated.ok) throw new Error(translated.error.message);
    result = translated.document;
  }
  return fitCaptionTaskDocumentLayout(result, options);
}
