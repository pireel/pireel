import type { EditorDocumentV2 } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult, type ProcessingPatch } from './types';

/** Patch optional document processing settings; explicit undefined removes a setting. */
export function patchEditorProcessing(document: EditorDocumentV2, patch: ProcessingPatch): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  if (!Object.keys(patch).length) return commandFailure(document, 'invalid-command', 'Processing patch is empty.', { path: 'patch' });
  if (patch.audioDenoise != null) {
    const strength = patch.audioDenoise.strength;
    if (!Number.isFinite(strength) || strength <= 0 || strength > 1) {
      return commandFailure(document, 'invalid-command', 'Denoise strength must be within (0, 1].', { path: 'patch.audioDenoise.strength' });
    }
    const mode = patch.audioDenoise.mode;
    if (mode != null && mode !== 'light' && mode !== 'strong') {
      return commandFailure(document, 'invalid-command', 'Denoise mode must be light or strong.', { path: 'patch.audioDenoise.mode' });
    }
  }
  const processing = { ...(document.processing ?? {}), ...patch };
  for (const key of Object.keys(patch) as (keyof ProcessingPatch)[]) if (patch[key] === undefined) delete processing[key];
  const nextProcessing = Object.keys(processing).length ? processing : undefined;
  if (JSON.stringify(nextProcessing) === JSON.stringify(document.processing)) {
    return { ok: true, document, receipt: emptyCommandReceipt('processing.patch') };
  }
  const next = { ...document };
  if (nextProcessing) next.processing = nextProcessing;
  else delete next.processing;
  return { ok: true, document: next, receipt: emptyCommandReceipt('processing.patch') };
}
