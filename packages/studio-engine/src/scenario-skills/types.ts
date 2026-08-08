export const STUDIO_AUTO_SKILL_ID = 'auto' as const;

/** Host-defined Markdown Skill id. OSS deliberately owns no concrete catalog. */
export type StudioScenarioSkillDefinitionId = string;
export type StudioScenarioSkillId = typeof STUDIO_AUTO_SKILL_ID | StudioScenarioSkillDefinitionId;

/**
 * A Markdown-first expert playbook. The body intentionally stays prose: it should shape judgment,
 * not turn a flexible editing Skill into a rigid workflow graph or component recipe.
 */
export interface StudioScenarioSkill {
  id: StudioScenarioSkillDefinitionId;
  /** Stable English label used in prompt traces and server logs. UI labels are localized separately. */
  title: string;
  /** Triggering and selection guidance, sourced from SKILL.md frontmatter. */
  description: string;
  /** Complete SKILL.md body, including its H1. Never reduce this to structured options. */
  markdown: string;
}
