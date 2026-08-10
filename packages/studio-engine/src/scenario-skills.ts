import {
  STUDIO_AUTO_SKILL_ID,
  type StudioScenarioSkillId,
} from './scenario-skills/types';

export { STUDIO_AUTO_SKILL_ID } from './scenario-skills/types';
export type {
  StudioScenarioSkill,
  StudioScenarioSkillDefinitionId,
  StudioScenarioSkillId,
} from './scenario-skills/types';
export { createStudioScenarioSkillRegistry, parseStudioScenarioSkill } from './scenario-skills/registry';

/** Syntax guard only. Whether an id exists is decided by the host-owned catalog/registry. */
export function isStudioScenarioSkillId(value: unknown): value is StudioScenarioSkillId {
  return value === STUDIO_AUTO_SKILL_ID
    || (typeof value === 'string' && value.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value));
}
