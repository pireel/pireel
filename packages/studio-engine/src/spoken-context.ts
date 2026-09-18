import type { EditorDocumentV2 } from './editor-document/types';
import { spokenSourceAtTimelineSecond } from './editor-document/commands/managed-captions';
import { transcriptWindowAround } from './transcript-context';

/**
 * Spoken context at a timeline second, read from the canonical document only: the managed caption
 * source selection names the speech lane, native clip placement maps the moment to source time and
 * the stored transcript supplies the words. Every surface that composes a component (chat, bridge,
 * offline executor) reads the same words from the same place.
 */
export function documentTranscriptContextAt(document: EditorDocumentV2, atSec: number, maxChars?: number): string {
  const hit = spokenSourceAtTimelineSecond(document, atSec);
  if (!hit) return '';
  return transcriptWindowAround(document.semantics.transcripts[hit.clip.assetId] ?? [], hit.sourceSec, maxChars);
}
