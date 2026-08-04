/** Semantic narration range edits shared by the live browser and offline MCP executor. */

import type { AsrSegment } from './build-blocks';
import {
  applyEditorCommand,
  applyNarrationRangeCommands,
  syncCaptionTranscripts,
  type EditorCommandError,
  type EditorCommandReceipt,
  type EditorDocumentV2,
  type NarrationSecondRange,
} from './editor-document';
import { projectDocumentToComposition } from './project-document';
import type { Composition } from './composition-core';

export interface NarrationDocumentEditInput {
  projectId: string;
  document: EditorDocumentV2;
  ranges: readonly NarrationSecondRange[];
  mainTranscript: AsrSegment[] | null;
  clipTranscripts: Record<string, AsrSegment[]>;
}

export interface NarrationClipRemovalInput extends Omit<NarrationDocumentEditInput, 'ranges'> {
  clipIds: readonly string[];
}

export type NarrationDocumentEditResult =
  | {
      ok: true;
      document: EditorDocumentV2;
      composition: Composition;
      receipts: EditorCommandReceipt[];
      removedFrames: number;
    }
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError };

/**
 * Runs the neutral multi-track ripple first, then re-derives Pireel's managed captions from the
 * surviving narration. The final reconciliation changes only caption clips; native media lanes and
 * command geometry remain owned by the V2 result.
 */
export function applyNarrationDocumentEdit(input: NarrationDocumentEditInput): NarrationDocumentEditResult {
  const sourceDocument = syncCaptionTranscripts(input.document, input.mainTranscript, input.clipTranscripts);
  const command = applyNarrationRangeCommands(sourceDocument, input.ranges);
  if (!command.ok) return { ...command, document: input.document };
  const captions = applyEditorCommand(command.document, { type: 'captions.relay' });
  if (!captions.ok) {
    return {
      ok: false,
      document: input.document,
      error: captions.error,
    };
  }
  const composition = projectDocumentToComposition(captions.document);
  return {
    ok: true,
    document: captions.document,
    composition,
    receipts: [...command.receipts, captions.receipt],
    removedFrames: command.removedFrames,
  };
}

/** Empty selected narration clips without moving independent sibling lanes. */
export function removeNarrationClipsWithoutRipple(input: NarrationClipRemovalInput): NarrationDocumentEditResult {
  const sourceDocument = syncCaptionTranscripts(input.document, input.mainTranscript, input.clipTranscripts);
  const removed = applyEditorCommand(sourceDocument, {
    type: 'clips.remove',
    trackId: input.document.semantics.primaryNarrativeTrackId,
    clipIds: [...input.clipIds],
    includeLinked: false,
  });
  if (!removed.ok) return { ok: false, document: input.document, error: removed.error };
  const captions = applyEditorCommand(removed.document, { type: 'captions.relay' });
  if (!captions.ok) return { ok: false, document: input.document, error: captions.error };
  return {
    ok: true,
    document: captions.document,
    composition: projectDocumentToComposition(captions.document),
    receipts: [removed.receipt, captions.receipt],
    removedFrames: 0,
  };
}
