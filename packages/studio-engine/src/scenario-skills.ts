import { BATCH_REMIX_SKILL } from './scenario-skills/batch-remix';
import { COMMERCE_VIDEO_SKILL } from './scenario-skills/commerce-video';
import { LONG_TO_SHORTS_SKILL } from './scenario-skills/long-to-shorts';
import { MONTAGE_EDIT_SKILL } from './scenario-skills/montage-edit';
import { PRODUCT_DEMO_SKILL } from './scenario-skills/product-demo';
import { TALKING_HEAD_EDIT_SKILL } from './scenario-skills/talking-head-edit';
import {
  STUDIO_AUTO_SKILL_ID,
  type StudioScenarioSkill,
  type StudioScenarioSkillId,
} from './scenario-skills/types';

export { STUDIO_AUTO_SKILL_ID } from './scenario-skills/types';
export type { StudioScenarioSkill, StudioScenarioSkillId } from './scenario-skills/types';

/** Registry only: each editorial lens stays in its own file as the catalog grows. */
export const STUDIO_SCENARIO_SKILLS: readonly StudioScenarioSkill[] = [
  TALKING_HEAD_EDIT_SKILL,
  LONG_TO_SHORTS_SKILL,
  MONTAGE_EDIT_SKILL,
  BATCH_REMIX_SKILL,
  COMMERCE_VIDEO_SKILL,
  PRODUCT_DEMO_SKILL,
];

const SKILL_BY_ID = new Map(STUDIO_SCENARIO_SKILLS.map((skill) => [skill.id, skill]));

export function isStudioScenarioSkillId(value: unknown): value is StudioScenarioSkillId {
  return value === STUDIO_AUTO_SKILL_ID || (typeof value === 'string' && SKILL_BY_ID.has(value as StudioScenarioSkill['id']));
}

/** `auto` deliberately resolves to null: the core director infers the editorial approach from the request. */
export function resolveStudioScenarioSkill(value: unknown): StudioScenarioSkill | null {
  if (typeof value !== 'string' || value === STUDIO_AUTO_SKILL_ID) return null;
  return SKILL_BY_ID.get(value as StudioScenarioSkill['id']) ?? null;
}
