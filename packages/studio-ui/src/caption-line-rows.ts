import { resolveCaptionStyle, videoTrackShots, type Composition, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
// Straight from its own module: through the composition barrel it can still be undefined while a cycle is loading.
import { managedCaptionLineRows } from '@pireel/studio-engine/editor-document/commands/managed-captions';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { displayCues } from '@pireel/studio-engine/captions-relay';
import type { CaptionLineRow } from './captions-panel';
import { captionTranscriptsFromDocument } from './caption-transcript-bridge';

/** The same rendered cue boundaries feed Studio's panel and every standalone translation task. */
export function deriveCaptionLineRows(document: EditorDocumentV2, composition: Composition, mainSentences: AsrSegment[] | null, clipTranscripts: Record<string, AsrSegment[]>): CaptionLineRow[] {
  const documentRows = managedCaptionLineRows(document);
  if (documentRows) return documentRows.map(row => ({
    key: `${row.src ?? 'main'}:${row.seg}:${row.w0}`, src: row.src ?? null,
    ...(row.assetId ? { assetId: row.assetId } : {}), index: row.seg, w0: row.w0, w1: row.w1,
    text: row.text, words: row.words, ...(row.sub ? { sub: row.sub } : {}), editedStart: row.editedStartSec, dur: row.durationSec,
  }));
  const transcripts = captionTranscriptsFromDocument(document, composition, clipTranscripts);
  return displayCues(videoTrackShots(composition), transcripts.main?.length ? transcripts.main : mainSentences, transcripts.clips, {
    subLang: resolveCaptionStyle(composition).sub?.lang, canvasW: composition.width, style: composition.captionStyle,
  }).filter(cue => cue.ref).map(cue => ({
    key: `${cue.ref!.src ?? 'main'}:${cue.ref!.seg}:${cue.ref!.w0}`, src: cue.ref!.src, index: cue.ref!.seg,
    w0: cue.ref!.w0, w1: cue.ref!.w1, text: cue.text, sub: cue.sub, editedStart: cue.start, dur: Math.max(.1, cue.end - cue.start),
  }));
}
