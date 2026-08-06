import { describe, expect, it } from 'vitest';
import { buildChatSystem } from './prompts';
import {
  STUDIO_AUTO_SKILL_ID,
  STUDIO_SCENARIO_SKILLS,
  isStudioScenarioSkillId,
  resolveStudioScenarioSkill,
} from './scenario-skills';

describe('Studio scenario skill registry', () => {
  it('keeps ids unique and definitions thin but actionable', () => {
    const ids = STUDIO_SCENARIO_SKILLS.map((skill) => skill.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'talking-head-edit',
      'long-to-shorts',
      'montage-edit',
      'batch-remix',
      'commerce-video',
      'product-demo',
    ]);
    for (const skill of STUDIO_SCENARIO_SKILLS) {
      expect(skill.systemBrief.length).toBeGreaterThan(180);
      expect(skill.systemBrief).not.toContain('inputSchema');
    }
  });

  it('uses auto and unknown ids as core-director routing', () => {
    expect(isStudioScenarioSkillId(STUDIO_AUTO_SKILL_ID)).toBe(true);
    expect(isStudioScenarioSkillId('long-to-shorts')).toBe(true);
    expect(isStudioScenarioSkillId('unknown')).toBe(false);
    expect(resolveStudioScenarioSkill(STUDIO_AUTO_SKILL_ID)).toBeNull();
    expect(resolveStudioScenarioSkill('unknown')).toBeNull();
  });

  it('injects only the selected editorial lens into Chat system', () => {
    const selected = resolveStudioScenarioSkill('long-to-shorts');
    const system = buildChatSystem(null, undefined, selected);
    expect(system).toContain('<scenario_skill id="long-to-shorts"');
    expect(system).toContain('several independently editable short outputs');
    expect(system).not.toContain('<scenario_skill id="batch-remix"');
    expect(buildChatSystem(null, undefined, null)).not.toContain('<scenario_skill');
  });

  it('keeps a selected Skill as an editorial lens instead of a workflow trigger', () => {
    const selected = resolveStudioScenarioSkill('talking-head-edit');
    const system = buildChatSystem(null, undefined, selected);
    expect(system).toContain('A selected Scenario Skill is an editorial lens, never a command to run tools');
    expect(system).toContain('supplies editorial priorities, not a fixed workflow');
    expect(system).not.toContain('SPEECH-LED DRAFT PIPELINE');
  });
});
