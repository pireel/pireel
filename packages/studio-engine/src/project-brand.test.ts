import { describe, expect, it } from 'vitest';
import { emptyPlaybook, playbookSnapshot } from './brand-playbook';
import { emptyEditorDocumentV2 } from './editor-document';
import { applyEditorCommand } from './editor-document/commands/dispatcher';
import { projectV2ToLegacyComposition } from './editor-document/legacy-projection';

const brand = (name: string) => playbookSnapshot({ ...emptyPlaybook(`brand_${name}`, name, 'bilibili'), skills: ['captions'] });

describe('project brand', () => {
  it('is never set, then a copy of a brand, then none — and the UI reads each state', () => {
    const document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
    expect(document.semantics.brand).toBeUndefined();
    expect('brand' in projectV2ToLegacyComposition(document)).toBe(false);
    const lin = brand('Lin');
    const set = applyEditorCommand(document, { type: 'brand.set', brand: lin });
    expect(set.ok && set.document.semantics.brand).toEqual(lin);
    expect(projectV2ToLegacyComposition(set.document).brand?.name).toBe('Lin');
    const none = applyEditorCommand(set.document, { type: 'brand.set', brand: null });
    expect(none.document.semantics.brand).toBeNull();
    expect(projectV2ToLegacyComposition(none.document).brand).toBeNull();
  });

  it('leaves the editing skills as set and refuses a malformed brand', () => {
    const document = applyEditorCommand(emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 }), { type: 'editingSkills.set', ids: ['b-roll'] }).document;
    const switched = applyEditorCommand(document, { type: 'brand.set', brand: brand('Lin') });
    expect(switched.document.semantics.editingSkills).toEqual(['b-roll']);
    const bad = applyEditorCommand(document, { type: 'brand.set', brand: { ...brand('Lin'), skills: ['voice-cleanup'] } });
    expect(bad.ok).toBe(false);
    expect(applyEditorCommand(switched.document, { type: 'brand.set', brand: brand('Lin') }).document).toBe(switched.document);
  });

  it('goes with a Skill that takes brands: a brand brings its Skill, another Skill drops it', () => {
    const empty = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
    const branded = applyEditorCommand(empty, { type: 'brand.set', brand: brand('Lin') }).document;
    expect(branded.semantics.skillId).toBe('talking-head-edit');
    expect(projectV2ToLegacyComposition(branded).skillId).toBe('talking-head-edit');
    const own = applyEditorCommand(branded, { type: 'skill.set', skillId: 'custom:my-skill' });
    expect(own.ok && own.document.semantics).toMatchObject({ skillId: 'custom:my-skill', brand: null });
    const back = applyEditorCommand(own.document, { type: 'skill.set', skillId: 'talking-head-edit' });
    expect(back.document.semantics.brand).toBeNull();
    const never = applyEditorCommand(empty, { type: 'skill.set', skillId: 'whiteboard-explainer' });
    expect(never.document.semantics.brand).toBeUndefined();
    const onSkill = applyEditorCommand(applyEditorCommand(empty, { type: 'skill.set', skillId: 'talking-head-edit' }).document, { type: 'brand.set', brand: brand('Lin') });
    expect(onSkill.document.semantics.skillId).toBe('talking-head-edit');
    expect(applyEditorCommand(empty, { type: 'skill.set', skillId: '' }).ok).toBe(false);
  });
});
