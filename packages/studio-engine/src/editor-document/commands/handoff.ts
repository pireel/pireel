import type { EditorDocumentV2, HandoffItem } from '../types';
import { EDITING_SKILL_IDS, isEditingSkillId } from '../../editing-skills';
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

/** The editing skills switched on for this project; an empty list switches them all off. */
export function setEditingSkills(document: EditorDocumentV2, ids: readonly string[]): EditorCommandResult {
  const unknown = ids.filter((id) => !isEditingSkillId(id));
  if (unknown.length) return commandFailure(document, 'invalid-command', `Unknown editing skills: ${unknown.join(', ')}.`, { path: 'ids' });
  const on = EDITING_SKILL_IDS.filter((id) => ids.includes(id));
  if (JSON.stringify(on) === JSON.stringify(document.semantics.editingSkills ?? [])) return { ok: true, document, receipt: emptyCommandReceipt('editingSkills.set') };
  const semantics = { ...document.semantics };
  if (on.length) semantics.editingSkills = [...on];
  else delete semantics.editingSkills;
  return { ok: true, document: { ...document, semantics }, receipt: emptyCommandReceipt('editingSkills.set') };
}
