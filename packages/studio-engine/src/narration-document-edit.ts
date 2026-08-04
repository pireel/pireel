/** Semantic narration range edits shared by the live browser and offline MCP executor. */

import type { AsrSegment } from './build-blocks';
import { relayCaptionLayer } from './captions-relay';
import {
  applyNarrationRangeCommands,
  type EditorCommandError,
  type EditorCommandReceipt,
  type EditorDocumentV2,
  type NarrationSecondRange,
} from './editor-document';
import {
  normalizeProjectDocument,
  projectDocumentToLegacyComposition,
} from './project-document';
import type { StudioProjectContext } from './project-dto';
import type { Composition } from './composition-core';

export interface NarrationDocumentEditInput {
  projectId: string;
  document: EditorDocumentV2;
  ranges: readonly NarrationSecondRange[];
  context?: StudioProjectContext;
  mainTranscript: AsrSegment[] | null;
  clipTranscripts: Record<string, AsrSegment[]>;
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
  const projected = projectDocumentToLegacyComposition({ projectId: input.projectId, value: command.document });
  const composition: Composition = {
    ...projected,
    blocks: relayCaptionLayer(
      projected.blocks,
      projected.shots ?? [],
      input.mainTranscript,
      input.clipTranscripts,
      { canvasW: input.canvasWidth ?? projected.width },
    ),
  };
  const normalized = normalizeProjectDocument({
    projectId: input.projectId,
    value: composition,
    context: input.context,
    previousDocument: command.document,
    previousProjection: projected,
  });
  const issue = normalized.issues.find((candidate) => candidate.severity === 'error');
  if (issue) {
    return {
      ok: false,
      document: input.document,
      error: { code: 'invalid-document', message: issue.message, path: issue.path },
    };
  }
  return {
    ok: true,
    document: normalized.document,
    composition,
    receipts: command.receipts,
    removedFrames: command.removedFrames,
  };
}
