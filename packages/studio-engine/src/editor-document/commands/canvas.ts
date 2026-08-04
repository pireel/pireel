import type { EditorDocumentV2 } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import {
  commandFailure,
  emptyCommandReceipt,
  type CanvasPatch,
  type EditorCommandResult,
} from './types';

function validCanvasDimension(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/** Patch deliberate output dimensions without coupling canvas state to any media lane. */
export function patchEditorCanvas(document: EditorDocumentV2, patch: CanvasPatch): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  if (!validCanvasDimension(patch.width) || !validCanvasDimension(patch.height)) {
    return commandFailure(document, 'invalid-range', 'Canvas width and height must be positive integers.', { path: 'canvas' });
  }
  if (
    document.canvas.width === patch.width
    && document.canvas.height === patch.height
    && document.canvas.configured
  ) {
    return { ok: true, document, receipt: emptyCommandReceipt('canvas.patch') };
  }

  const next: EditorDocumentV2 = {
    ...document,
    canvas: {
      ...document.canvas,
      width: patch.width,
      height: patch.height,
      configured: true,
    },
  };
  const outputIssue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  if (outputIssue) return commandFailure(document, 'invalid-command', outputIssue.message, { path: outputIssue.path });
  return { ok: true, document: next, receipt: emptyCommandReceipt('canvas.patch') };
}
