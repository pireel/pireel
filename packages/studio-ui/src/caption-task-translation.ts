import { projectDocumentToComposition, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { mapSegsToEdited } from '@pireel/studio-engine/captions-relay';
import { replaceCaptionTranslationsTransaction } from './caption-translation-transaction';
import type { CaptionTaskRecord } from './caption-task-store';

type Translate = (rows: { index: number; text: string }[], language: string) => Promise<{ index: number; text: string }[]>;

/** Translate surviving sentences, keeping original word timestamps and publishing all rows atomically. */
export async function translateCaptionTask(task: CaptionTaskRecord, document: EditorDocumentV2, translate: Translate, check: () => void, onProgress?: (done: number, total: number) => void) {
  const target = task.options.translationLanguage!;
  const composition = projectDocumentToComposition(document);
  // Standalone tasks have one source. Native projected shots carry explicit source IDs,
  // so the legacy "no src = narration" predicate would drop every word here.
  const groups = mapSegsToEdited(task.transcript ?? [], composition.shots ?? [], () => true);
  const sourceKey = JSON.stringify(groups.map(({ text, ref }) => ({ text, ref })));
  if (task.translation?.language === target && task.translation.sourceKey === sourceKey) return { document, transcript: task.transcript!, translation: task.translation };
  if (!groups.length) throw new Error('没有可翻译的字幕。');
  if (groups.some((group) => group.text.length > 400)) throw new Error('字幕句子过长，请先重新断句再翻译。');
  onProgress?.(0, groups.length);
  const rows: { index: number; text: string }[] = [];
  // 250 × 400 UTF-16 characters stays below the hosted endpoint's 512 KiB limit.
  for (let offset = 0; offset < groups.length; offset += 250) {
    check();
    const batch = groups.slice(offset, offset + 250).map((group, index) => ({ index: offset + index, text: group.text }));
    const translated = await translate(batch, target);
    check();
    // Validate each response against its request, including duplicates and extra IDs.
    const expected = new Set(batch.map((row) => row.index));
    for (const row of translated) {
      if (!expected.delete(row.index) || typeof row.text !== 'string' || !row.text.trim()) throw new Error('翻译结果不完整，请重试。');
    }
    if (expected.size) throw new Error('翻译结果不完整，请重试。');
    rows.push(...translated);
    onProgress?.(rows.length, groups.length);
  }
  const result = replaceCaptionTranslationsTransaction({ document, composition, groups, rows, target, mainTranscript: task.transcript!, clipTranscripts: {} });
  if (!result.ok) throw new Error(result.error);
  return { document: result.document, transcript: result.mainTranscript!, translation: { language: target, sourceKey } };
}
