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
import { projectDocumentToLegacyComposition } from './project-document';
import type { StudioProjectContext } from './project-dto';
import type { Composition } from './composition-core';

export interface NarrationDocumentEditInput {
  projectId: string;
  document: EditorDocumentV2;
  ranges: readonly NarrationSecondRange[];
  /** @deprecated Kept until all callers source transcript state exclusively from the V2 document. */
  context?: StudioProjectContext;
  mainTranscript: AsrSegment[] | null;
  clipTranscripts: Record<string, AsrSegment[]>;
  /** @deprecated Native caption derivation reads document.canvas.width. */
  canvasWidth?: number;
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
  const command = applyNarrationRangeCommands(input.document, input.ranges);
  if (!command.ok) return command;
  const transcriptDocument = syncCaptionTranscripts(command.document, input.mainTranscript, input.clipTranscripts);
  const captions = applyEditorCommand(transcriptDocument, { type: 'captions.relay' });
  if (!captions.ok) {
    return {
      ok: false,
      document: input.document,
      error: captions.error,
    };
  }
  const composition = projectDocumentToLegacyComposition({ projectId: input.projectId, value: captions.document });
  return {
    ok: true,
    document: captions.document,
    composition,
    receipts: [...command.receipts, captions.receipt],
    removedFrames: command.removedFrames,
  };
}
