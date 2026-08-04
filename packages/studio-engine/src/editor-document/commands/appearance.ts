import type { EditorDocumentV2 } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { commandFailure, emptyCommandReceipt, type AppearancePatch, type EditorCommandResult } from './types';

function sparseMerge<T extends object>(current: T, patch: Partial<T>): T {
  const next = { ...current, ...patch };
  for (const key of Object.keys(patch) as (keyof T)[]) if (patch[key] === undefined) delete next[key];
  return next;
}

/** Patch document-level visual language without touching timeline identities. */
export function patchEditorAppearance(document: EditorDocumentV2, patch: AppearancePatch): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  if (!Object.keys(patch).length) return commandFailure(document, 'invalid-command', 'Appearance patch is empty.', { path: 'patch' });
  if (patch.theme != null && typeof patch.theme !== 'string') return commandFailure(document, 'invalid-command', 'Appearance theme must be a string.', { path: 'patch.theme' });
  if (patch.palette != null && (typeof patch.palette !== 'object' || Array.isArray(patch.palette))) {
    return commandFailure(document, 'invalid-command', 'Appearance palette must be an object.', { path: 'patch.palette' });
  }
  const appearance = sparseMerge(document.appearance, patch);
  if (JSON.stringify(appearance) === JSON.stringify(document.appearance)) {
    return { ok: true, document, receipt: emptyCommandReceipt('appearance.patch') };
  }
  return { ok: true, document: { ...document, appearance }, receipt: emptyCommandReceipt('appearance.patch') };
}
