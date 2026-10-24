import { applyCaptionDocumentEdit, managedCaptionLineRows, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { validateEmphasisSelection, type EmphasisRow, type EmphasisSelection } from '@pireel/studio-engine/caption-emphasis';
import { t } from './i18n';

export async function emphasizeCaptionDocument(document: EditorDocumentV2, select: (rows: EmphasisRow[]) => Promise<EmphasisSelection[]>, onProgress?: (done: number, total: number) => void): Promise<EditorDocumentV2> {
  const lane = document.timeline.tracks.find((track) => track.id === document.semantics.managedCaptionTrackId);
  if (lane?.locked) throw new Error(t('ui.captionEmphasis.locked'));
  const targets = (managedCaptionLineRows(document) ?? []).flatMap((row) => {
    const segment = row.assetId ? document.semantics.transcripts[row.assetId]?.[row.seg] : undefined;
    if (!segment || !row.words?.length || !row.assetId) return [];
    return [{ ...row, assetId: row.assetId, words: row.words, cached: segment.cueEmphasis?.[`${row.w0}:${row.w1}`]?.text === row.text }];
  });
  const pending = targets.map((target, index) => ({ index, words: target.words.map((word) => word.text) }))
    .filter((row) => !targets[row.index]!.cached);
  if (!pending.length) return document;
  const selections = await selectCaptionEmphasisRows(pending, select, onProgress);
  const transcripts = structuredClone(document.semantics.transcripts);
  for (const selection of selections) {
    const target = targets[selection.index]!;
    const segment = transcripts[target.assetId]![target.seg]!;
    segment.cueEmphasis = { ...segment.cueEmphasis, [`${target.w0}:${target.w1}`]: { text: target.text, words: selection.words } };
  }
  const result = applyCaptionDocumentEdit({ document: { ...document, semantics: { ...document.semantics, transcripts } }, mainTranscript: null, clipTranscripts: {} });
  if (!result.ok) throw new Error(result.error.message);
  return result.document;
}

/** Provider batching shared by document editing and detached workflow planning. */
export async function selectCaptionEmphasisRows(pending: EmphasisRow[], select: (rows: EmphasisRow[]) => Promise<EmphasisSelection[]>, onProgress?: (done: number, total: number) => void): Promise<EmphasisSelection[]> {
  onProgress?.(0, pending.length);
  const selections: EmphasisSelection[] = [];
  let batch: EmphasisRow[] = [];
  const flush = async () => {
    if (!batch.length) return;
    const selected = validateEmphasisSelection(batch, await select(batch));
    if (!selected) throw new Error(t('ui.captionEmphasis.incomplete'));
    selections.push(...selected); batch = [];
    onProgress?.(selections.length, pending.length);
  };
  for (const row of pending) {
    if (row.words.length > 120 || JSON.stringify(row).length > 15000) throw new Error(t('ui.captionEmphasis.tooLong'));
    if (batch.length >= 32 || JSON.stringify([...batch, row]).length > 15000) await flush();
    batch.push(row);
  }
  await flush();
  return selections;
}
