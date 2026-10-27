import { applyCaptionDocumentEdit, managedCaptionLineRows, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { joinWords } from '@pireel/studio-engine/caption-fx';
import { phraseWordIndexes, type HighlightPhrase } from '@pireel/studio-engine/caption-highlights';
import { t } from './i18n';

const HIGHLIGHT_BATCH = 200;

/**
 * Key phrases for the keyword caption preset, picked by the same auto highlight as the transcript
 * and the scenes, and stored per caption line (cueEmphasis). Lines already picked for their current
 * text are kept; a phrase the model names that is not in its line is skipped.
 */
export async function emphasizeCaptionDocument(document: EditorDocumentV2, highlight: (rows: HighlightPhrase[]) => Promise<HighlightPhrase[]>, onProgress?: (done: number, total: number) => void): Promise<EditorDocumentV2> {
  const lane = document.timeline.tracks.find((track) => track.id === document.semantics.managedCaptionTrackId);
  if (lane?.locked) throw new Error(t('ui.captionEmphasis.locked'));
  const targets = (managedCaptionLineRows(document) ?? []).flatMap((row) => {
    const segment = row.assetId ? document.semantics.transcripts[row.assetId]?.[row.seg] : undefined;
    if (!segment || !row.words?.length || !row.assetId) return [];
    return [{ ...row, assetId: row.assetId, words: row.words, cached: segment.cueEmphasis?.[`${row.w0}:${row.w1}`]?.text === row.text }];
  });
  const pending = targets.flatMap((target, index) => (target.cached ? [] : [index]));
  if (!pending.length) return document;
  const picked = new Map(pending.map((index) => [index, new Set<number>()]));
  onProgress?.(0, pending.length);
  for (let offset = 0; offset < pending.length; offset += HIGHLIGHT_BATCH) {
    const batch = pending.slice(offset, offset + HIGHLIGHT_BATCH);
    const keys = await highlight(batch.map((index) => ({ index, text: joinWords(targets[index]!.words.map((word) => word.text)) })));
    for (const key of keys) {
      const words = picked.has(key.index) ? phraseWordIndexes(targets[key.index]!.words, key.text) : null;
      for (const word of words ?? []) picked.get(key.index)!.add(word);
    }
    onProgress?.(Math.min(pending.length, offset + batch.length), pending.length);
  }
  const transcripts = structuredClone(document.semantics.transcripts);
  for (const [index, words] of picked) {
    const target = targets[index]!;
    const segment = transcripts[target.assetId]![target.seg]!;
    segment.cueEmphasis = { ...segment.cueEmphasis, [`${target.w0}:${target.w1}`]: { text: target.text, words: [...words].sort((a, b) => a - b) } };
  }
  const result = applyCaptionDocumentEdit({ document: { ...document, semantics: { ...document.semantics, transcripts } }, mainTranscript: null, clipTranscripts: {} });
  if (!result.ok) throw new Error(result.error.message);
  return result.document;
}
