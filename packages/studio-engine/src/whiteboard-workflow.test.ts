import { describe, expect, it } from 'vitest';
import { whiteboardTaskPhase, whiteboardToolBlock } from '@pireel/studio-engine/whiteboard-workflow';
import { v3ToolCanMutate } from '@pireel/studio-engine/agent-surface-v3/registry';
import { validateV3Input } from '@pireel/studio-engine/agent-surface-v3/validate';
import { runAgentTimelineTool } from '@pireel/studio-engine/agent-timeline';
import { emptyEditorDocumentV2 } from '@pireel/studio-engine/editor-document';

const task = { skillId: 'whiteboard-explainer', directorPlanRequired: true };
const saved = { ...task, directorPlan: { revision: 1, beats: [{ id: 'intro' }] } };
const block = (tool: string, state = task, input?: Record<string, unknown>) => whiteboardToolBlock(state, tool, v3ToolCanMutate(tool), input);

describe('whiteboard lifecycle contract', () => {
  it('allows preparation before planning, unlocks authoring on a saved plan, and preserves the source in both phases', () => {
    expect(whiteboardTaskPhase(task)).toBe('planning');
    for (const tool of ['get_transcript', 'inspect_media', 'search_assets', 'register_media', 'prepare_local_asset', 'save_edit_plan']) expect(block(tool)).toBeUndefined();
    for (const tool of ['set_whiteboard', 'add_clips', 'place_graphics', 'compose_component']) {
      expect(block(tool)).toBeTruthy();
      expect(block(tool, saved)).toBeUndefined();
    }
    expect(whiteboardTaskPhase(saved)).toBe('execution');
    expect(block('rough_cut')).toBeTruthy();
    expect(block('rough_cut', saved)).toBeTruthy();
    expect(whiteboardTaskPhase({ ...task, directorPlan: { revision: 1, beats: [] } })).toBe('planning');
  });
  it('does not impose whole-video planning on local theme/content edits or other scenarios', () => {
    for (const local of [undefined, { skillId: 'whiteboard-explainer' }, { ...task, directorPlanRequired: false }, { ...task, skillId: 'talking-head-edit' }]) {
      expect(whiteboardTaskPhase(local)).toBeUndefined();
      expect(whiteboardToolBlock(local, 'set_whiteboard', true)).toBeUndefined();
    }
  });
  it('serves discoverable authoring references without mutating the timeline or requiring a plan', () => {
    const document = emptyEditorDocumentV2({ width: 1920, height: 1080, fps: 30 });
    const before = structuredClone(document);
    const base = runAgentTimelineTool(document, 'set_whiteboard', { describe: true });
    expect(base.ok).toBe(true);
    const data = base.data as { authoring?: string; references: string[]; format: unknown };
    expect(data.authoring).toBeUndefined();
    for (const reference of data.references) {
      const input = { describe: true, reference };
      expect(validateV3Input('set_whiteboard', input)).toBeNull();
      expect(block('set_whiteboard', task, input)).toBeUndefined();
      const result = runAgentTimelineTool(document, 'set_whiteboard', input);
      expect(result.ok).toBe(true);
      const detail = result.data as { format: unknown; authoring: string };
      expect(detail.format).toEqual(data.format);
      expect(detail.authoring).toBeTypeOf('string');
      expect(result.document).toBeUndefined();
    }
    expect(document).toEqual(before);
    expect(validateV3Input('set_whiteboard', { describe: true, reference: 'unavailable' })).not.toBeNull();
    expect(runAgentTimelineTool(document, 'set_whiteboard', { reference: 'program' }).ok).toBe(false);
  });
});
