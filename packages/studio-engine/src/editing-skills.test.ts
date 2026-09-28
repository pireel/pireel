import { describe, expect, it } from 'vitest';
import { renderV3State } from './agent-surface-v3/state';
import { editingSkillsHint } from './editing-skills';
import { emptyEditorDocumentV2 } from './editor-document';
import { applyEditorCommand } from './editor-document/commands/dispatcher';
import { projectV2ToLegacyComposition } from './editor-document/legacy-projection';

describe('editing skills', () => {
  it('are stored in the document in catalog order, read back by agents and projected for the UI', () => {
    const document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
    const set = applyEditorCommand(document, { type: 'editingSkills.set', ids: ['voice-cleanup', 'graphics'] });
    expect(set.ok).toBe(true);
    expect(set.document.semantics.editingSkills).toEqual(['graphics', 'voice-cleanup']);
    expect(renderV3State(set.document).editingSkills?.map((skill) => skill.id)).toEqual(['graphics', 'voice-cleanup']);
    expect(projectV2ToLegacyComposition(set.document).editingSkills).toEqual(['graphics', 'voice-cleanup']);
    expect(applyEditorCommand(set.document, { type: 'editingSkills.set', ids: ['graphics', 'teleport'] }).ok).toBe(false);
    const cleared = applyEditorCommand(set.document, { type: 'editingSkills.set', ids: [] });
    expect(cleared.document.semantics.editingSkills).toBeUndefined();
    expect(renderV3State(cleared.document).editingSkills).toBeUndefined();
  });

  it('become one note per message that names where each craft lives, and nothing when none is on', () => {
    expect(editingSkillsHint([])).toBe('');
    const hint = editingSkillsHint(['graphics', 'rough-cut']);
    expect(hint).toContain('for a narrow request, do only what was asked');
    expect(hint).toContain('- graphics: ');
    expect(hint).toContain('read_skill video-graphics');
    expect(hint).toContain('read_skill speech-cleanup');
    expect(hint).not.toContain('captions');
  });
});
