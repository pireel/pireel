import { describe, expect, it } from 'vitest';
import {
  STUDIO_CREATE_SKILL_ACTION,
  latestCreateSkillApproval,
  latestStudioMetaAction,
  studioMetaActionFromMetadata,
} from './skill-actions';

describe('Studio meta actions', () => {
  it('accepts only the explicit Create Skill action', () => {
    expect(studioMetaActionFromMetadata({ studioAction: STUDIO_CREATE_SKILL_ACTION }))
      .toBe(STUDIO_CREATE_SKILL_ACTION);
    expect(studioMetaActionFromMetadata({ studioAction: 'delete-project' })).toBeNull();
    expect(studioMetaActionFromMetadata('create-skill')).toBeNull();
  });

  it('uses only the latest user turn so a completed Meta Skill does not stay active', () => {
    expect(latestStudioMetaAction([
      { role: 'user', metadata: { studioAction: STUDIO_CREATE_SKILL_ACTION } },
      { role: 'assistant' },
    ])).toBe(STUDIO_CREATE_SKILL_ACTION);
    expect(latestStudioMetaAction([
      { role: 'user', metadata: { studioAction: STUDIO_CREATE_SKILL_ACTION } },
      { role: 'assistant' },
      { role: 'user', metadata: {} },
    ])).toBeNull();
  });

  it('exposes the latest approval only inside the active Create Skill turn', () => {
    const approvedPart = {
      type: 'tool-request_approval',
      state: 'output-available',
      output: { ok: true, data: { decision: 'approved' } },
    };
    expect(latestCreateSkillApproval([
      { role: 'user', metadata: { studioAction: STUDIO_CREATE_SKILL_ACTION } },
      { role: 'assistant', parts: [approvedPart] },
    ])).toBe('approved');
    expect(latestCreateSkillApproval([
      { role: 'user', metadata: { studioAction: STUDIO_CREATE_SKILL_ACTION } },
      { role: 'assistant', parts: [approvedPart, {
        ...approvedPart,
        output: { ok: true, data: { decision: 'rejected' } },
      }] },
    ])).toBe('rejected');
    expect(latestCreateSkillApproval([
      { role: 'user', metadata: {} },
      { role: 'assistant', parts: [approvedPart] },
    ])).toBeNull();
  });
});
