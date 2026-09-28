import type { EditorDocumentV2, HandoffItem } from '../types';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';

/** The creator's answer to one confirm-list item: confirmed as is, or changed with their words. */
export function patchHandoffItem(document: EditorDocumentV2, id: string, status: HandoffItem['status'], answer?: string): EditorCommandResult {
  const items = document.semantics.handoff ?? [];
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return commandFailure(document, 'invalid-command', `No confirm item ${id}.`, { path: 'id' });
  if (status !== 'open' && status !== 'confirmed' && status !== 'changed') {
    return commandFailure(document, 'invalid-command', 'Status is open, confirmed or changed.', { path: 'status' });
  }
  const text = typeof answer === 'string' ? answer.trim().slice(0, 400) : '';
  const { answer: _previous, ...rest } = items[index]!;
  const item: HandoffItem = { ...rest, status, ...(text ? { answer: text } : {}) };
  if (JSON.stringify(item) === JSON.stringify(items[index])) return { ok: true, document, receipt: emptyCommandReceipt('handoff.patch') };
  const handoff = items.map((candidate, i) => (i === index ? item : candidate));
  return { ok: true, document: { ...document, semantics: { ...document.semantics, handoff } }, receipt: emptyCommandReceipt('handoff.patch') };
}
