export const STUDIO_AUTO_SKILL_ID = 'auto' as const;

export type StudioScenarioSkillId =
  | typeof STUDIO_AUTO_SKILL_ID
  | 'talking-head-edit'
  | 'long-to-shorts'
  | 'montage-edit'
  | 'batch-remix'
  | 'commerce-video'
  | 'product-demo';

/** A thin editorial lens over the shared editor. Tool contracts stay in the core prompt. */
export interface StudioScenarioSkill {
  id: Exclude<StudioScenarioSkillId, typeof STUDIO_AUTO_SKILL_ID>;
  /** Stable English label used in prompt traces and server logs. UI labels are localized separately. */
  title: string;
  /** Only scenario-specific decisions and boundaries belong here; never duplicate tool schemas. */
  systemBrief: string;
}
