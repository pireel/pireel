import { describe, expect, it } from 'vitest';
import {
  STUDIO_CREATE_SKILL_ACTION,
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
});
