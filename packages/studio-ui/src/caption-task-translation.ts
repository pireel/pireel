import { firstNarrativeAssetId, projectDocumentToComposition, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { applyDocumentTransaction } from '@pireel/studio-engine/document-transaction';
import { deriveCaptionLineRows } from './caption-line-rows';
import { captionTranslationSources } from './caption-transcript-bridge';
import { lineTranslationUnits } from './caption-translation-transaction';
import { captionTranslationKey, captionTranslationOps, translateCaptionUnits, type CaptionTranslator } from './caption-translation-operation';
import type { CaptionTaskRecord } from './caption-task-store';

/** Standalone adapter for the shared line-marked sentence translation and editor transaction. */
export async function translateCaptionTask(task: CaptionTaskRecord, document: EditorDocumentV2, translate: CaptionTranslator, check: () => void, onProgress?: (done: number, total: number) => void) {
  check();
  const target = task.options.translationLanguage!;
  const composition = projectDocumentToComposition(document);
  const sources = captionTranslationSources(document, composition, task.transcript ?? null, {});
  const lines = deriveCaptionLineRows(document, composition, sources.main, sources.clips);
  const units = lineTranslationUnits(lines);
  const sourceKey = captionTranslationKey(units);
  const owner = firstNarrativeAssetId(document);
  if (task.translation?.language === target && task.translation.sourceKey === sourceKey && lines.length && lines.every(line => !!line.sub)) return { document, transcript: owner ? [...(document.semantics.transcripts[owner] ?? [])] : task.transcript!, translation: task.translation };
  const writes = await translateCaptionUnits(units, target, translate, check, onProgress);
  check();
  const result = applyDocumentTransaction(document, { ops: captionTranslationOps(composition, writes, target) }, { projectId: task.id });
  if (!result.ok) throw new Error(result.error.message);
  const transcript = owner ? [...(result.document.semantics.transcripts[owner] ?? [])] : task.transcript!;
  return { document: result.document, transcript, translation: { language: target, sourceKey } };
}
