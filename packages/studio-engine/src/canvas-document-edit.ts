/** Atomic canvas edits shared by the live browser, manual UI and offline MCP executor. */

import type { AsrSegment } from './build-blocks';
import {
  applyEditorCommand,
  syncCaptionTranscripts,
  type EditorCommandError,
  type EditorCommandReceipt,
  type EditorDocumentV2,
} from './editor-document';
import { projectDocumentToComposition } from './project-document';
import type { Composition } from './composition-core';

export interface CanvasDocumentEditInput {
  projectId: string;
  document: EditorDocumentV2;
  width: number;
  height: number;
  mainTranscript: readonly AsrSegment[] | null;
  clipTranscripts: Readonly<Record<string, readonly AsrSegment[]>>;
}

export type CanvasDocumentEditResult =
  | {
      ok: true;
      document: EditorDocumentV2;
      composition: Composition;
      receipts: EditorCommandReceipt[];
    }
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError };

/**
 * Changes the canonical canvas and re-derives managed captions against its new line budget. The
 * transaction is published only after both commands succeed, so a locked caption lane cannot leave
 * the document with new dimensions and stale caption geometry.
 */
export function applyCanvasDocumentEdit(input: CanvasDocumentEditInput): CanvasDocumentEditResult {
  const sourceDocument = syncCaptionTranscripts(input.document, input.mainTranscript, input.clipTranscripts);
  const canvas = applyEditorCommand(sourceDocument, {
    type: 'canvas.patch',
    patch: { width: input.width, height: input.height },
  });
  if (!canvas.ok) return { ok: false, document: input.document, error: canvas.error };
  const captions = applyEditorCommand(canvas.document, { type: 'captions.relay' });
  if (!captions.ok) return { ok: false, document: input.document, error: captions.error };
  return {
    ok: true,
    document: captions.document,
    composition: projectDocumentToComposition(captions.document),
    receipts: [canvas.receipt, captions.receipt],
  };
}
