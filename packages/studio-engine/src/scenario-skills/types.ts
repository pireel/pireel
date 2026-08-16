export const STUDIO_AUTO_SKILL_ID = 'auto' as const;

/** Open-vocabulary Markdown Skill id; membership is decided by the active merged registry. */
export type StudioScenarioSkillDefinitionId = string;
export type StudioScenarioSkillId = typeof STUDIO_AUTO_SKILL_ID | StudioScenarioSkillDefinitionId;

/**
 * A Markdown-first expert playbook. The body intentionally stays prose: it should shape judgment,
 * not turn a flexible editing Skill into a rigid workflow graph or Component/Motion Graphic recipe.
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

/** Read-only runtime view assembled by the OSS baseline, a host, or extension packages. */
export interface StudioScenarioSkillRegistry {
  list(): readonly StudioScenarioSkill[];
  get(id: string): StudioScenarioSkill | null;
}

export type StudioScenarioSkillConflictPolicy = 'error' | 'replace';

/** A named registry layer. Replacement authority is granted per layer, never globally. */
export interface StudioScenarioSkillRegistryLayer {
  source: string;
  registry: StudioScenarioSkillRegistry;
  onConflict?: StudioScenarioSkillConflictPolicy;
}
