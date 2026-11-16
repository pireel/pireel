import { describe, expect, it } from 'vitest';
import { renderV3State } from '@pireel/studio-engine/agent-surface-v3/state';
import { V3_CHAT_TOOL_IDS, V3_MCP_TOOL_IDS } from '@pireel/studio-engine/agent-surface-v3/registry';
import { editingSkillsHint, visualsOn, withVisuals } from '@pireel/studio-engine/editing-skills';
import { emptyEditorDocumentV2 } from '@pireel/studio-engine/editor-document';
import { applyEditorCommand } from '@pireel/studio-engine/editor-document/commands/dispatcher';
import { projectV2ToLegacyComposition } from '@pireel/studio-engine/editor-document/legacy-projection';

describe('editing skills', () => {
  it('are stored in the document in catalog order, read back by agents and projected for the UI', () => {
    const document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
    const set = applyEditorCommand(document, { type: 'editingSkills.set', ids: ['voice-cleanup', 'graphics'] });
    expect(set.ok).toBe(true);
    expect(set.document.semantics.editingSkills).toEqual(['graphics', 'voice-cleanup']);
    expect(renderV3State(set.document).editingSkills?.map((skill) => skill.id)).toEqual(['graphics', 'voice-cleanup']);
    expect(projectV2ToLegacyComposition(set.document).editingSkills).toEqual(['graphics', 'voice-cleanup']);
    expect(applyEditorCommand(set.document, { type: 'editingSkills.set', ids: ['graphics', 'teleport'] }).ok).toBe(false);
    // All off is kept as an empty list (set, unlike never set), and the agent sees no skills.
    const cleared = applyEditorCommand(set.document, { type: 'editingSkills.set', ids: [] });
    expect(cleared.document.semantics.editingSkills).toEqual([]);
    expect(renderV3State(cleared.document).editingSkills).toBeUndefined();
    expect(projectV2ToLegacyComposition(cleared.document).editingSkills).toEqual([]);
  });

  it('become one note per message that names where each craft lives, and nothing when none is on', () => {
    expect(editingSkillsHint([])).toBe('');
    const hint = editingSkillsHint(['graphics', 'rough-cut']);
    expect(hint).toContain('For a narrow request, do only what was asked');
    expect(hint).toContain('- graphics: ');
    expect(hint).toContain('read_skill video-graphics');
    expect(hint).toContain('read_skill speech-cleanup');
    expect(hint).not.toContain('captions');
  });

  it('read as one line when graphics and B-roll are both on, and as their own line when only one is', () => {
    const both = editingSkillsHint(['graphics', 'b-roll', 'captions']);
    expect(both).toContain('- graphics + b-roll: ');
    expect(both).toContain('One list for graphics and pictures');
    expect(both).toContain('Neither kind is owed');
    expect(both).not.toContain('\n- b-roll: ');
    expect(both.split('\n')).toHaveLength(3);
    expect(editingSkillsHint(['b-roll'])).toContain('- b-roll: ');
    // The creator's one switch sets both, in catalog order; a project with only one still reads as on.
    expect(withVisuals(['captions', 'b-roll'], true)).toEqual(['graphics', 'captions', 'b-roll']);
    expect(withVisuals(['graphics', 'captions', 'b-roll'], false)).toEqual(['captions']);
    expect(visualsOn(['b-roll'])).toBe(true);
    expect(visualsOn(['captions'])).toBe(false);
  });

  it('never name a tool the surface does not attach', () => {
    expect(editingSkillsHint(['cover'], V3_CHAT_TOOL_IDS)).toContain('generate_cover');
    const mcp = editingSkillsHint(['cover'], V3_MCP_TOOL_IDS);
    expect(mcp).not.toContain('generate_cover');
    expect(mcp).toContain('offer it as a next step');
    const document = applyEditorCommand(emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 }), { type: 'editingSkills.set', ids: ['cover'] }).document;
    expect(JSON.stringify(renderV3State(document, { tools: V3_MCP_TOOL_IDS }).editingSkills)).not.toContain('generate_cover');
  });
});
