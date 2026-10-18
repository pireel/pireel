import type { EditorDocumentV2, HandoffItem } from '@pireel/studio-engine/editor-document/types';
import { EDITING_SKILL_IDS, isEditingSkillId } from '@pireel/studio-engine/editing-skills';
import { brandSkillOf, skillTakesBrand, validatePlaybookSnapshot, type PlaybookSnapshot } from '@pireel/studio-engine/brand-playbook';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from '@pireel/studio-engine/editor-document/commands/types';

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
  // An empty list is kept: it records that the skills were set (all off), which a brand's defaults
  // must not override; no list at all means they were never set.
  if (document.semantics.editingSkills && JSON.stringify(on) === JSON.stringify(document.semantics.editingSkills)) return { ok: true, document, receipt: emptyCommandReceipt('editingSkills.set') };
  return { ok: true, document: { ...document, semantics: { ...document.semantics, editingSkills: [...on] } }, receipt: emptyCommandReceipt('editingSkills.set') };
}

/** The brand the project is edited with (a copy of it), or null to edit without one. Editing skills are
 *  left as they are: switching brand changes how later edits look, never what was switched on. A brand
 *  brings its Skill when the project is not on a Skill that takes brands. */
export function setProjectBrand(document: EditorDocumentV2, brand: PlaybookSnapshot | null): EditorCommandResult {
  let next: PlaybookSnapshot | null = null;
  if (brand !== null) {
    try { next = validatePlaybookSnapshot(brand); } catch (error) {
      return commandFailure(document, 'invalid-command', error instanceof Error ? error.message : 'Brand is invalid.', { path: 'brand' });
    }
  }
  const skillId = next && !skillTakesBrand(document.semantics.skillId) ? brandSkillOf(next) : document.semantics.skillId;
  if (document.semantics.brand !== undefined && JSON.stringify(document.semantics.brand) === JSON.stringify(next) && skillId === document.semantics.skillId) return { ok: true, document, receipt: emptyCommandReceipt('brand.set') };
  return { ok: true, document: { ...document, semantics: { ...document.semantics, brand: next, ...(skillId !== undefined ? { skillId } : {}) } }, receipt: emptyCommandReceipt('brand.set') };
}

/** The Studio Skill the project is edited as ('auto' for none). A Skill that takes no brand — the
 *  creator's own, or one that is not about talking heads — leaves the project without one. */
export function setProjectSkill(document: EditorDocumentV2, skillId: string): EditorCommandResult {
  if (typeof skillId !== 'string' || !skillId.trim() || skillId.length > 120) return commandFailure(document, 'invalid-command', 'Skill id is required.', { path: 'skillId' });
  const brand = skillTakesBrand(skillId) ? document.semantics.brand : document.semantics.brand === undefined ? undefined : null;
  if (document.semantics.skillId === skillId && brand === document.semantics.brand) return { ok: true, document, receipt: emptyCommandReceipt('skill.set') };
  return { ok: true, document: { ...document, semantics: { ...document.semantics, skillId, ...(brand !== undefined ? { brand } : {}) } }, receipt: emptyCommandReceipt('skill.set') };
}
