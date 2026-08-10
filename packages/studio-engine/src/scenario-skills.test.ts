import { describe, expect, it } from 'vitest';
import { buildChatSystem } from './prompts';
import {
  STUDIO_AUTO_SKILL_ID,
  createStudioScenarioSkillRegistry,
  isStudioScenarioSkillId,
  parseStudioScenarioSkill,
} from './scenario-skills';

describe('Studio scenario skill registry', () => {
  const raw = (name: string, title: string) => `---\nname: ${name}\ndescription: Host-owned expert guidance for a concrete editing situation.\n---\n# ${title}\n\n${'Rich prose that shapes judgment without becoming structured configuration. '.repeat(10)}`;

  it('loads arbitrary host-defined Markdown playbooks and rejects duplicates', () => {
    const skills = createStudioScenarioSkillRegistry([raw('interview-edit', 'Interview edit'), raw('course-edit', 'Course edit')]);
    expect(skills.map((skill) => skill.id)).toEqual(['interview-edit', 'course-edit']);
    expect(() => createStudioScenarioSkillRegistry([raw('interview-edit', 'One'), raw('interview-edit', 'Two')])).toThrow('Duplicate Studio Skill name');
  });

  it('uses frontmatter only for loading and rejects configuration fields', () => {
    expect(() => parseStudioScenarioSkill(`---\nname: talking-head-edit\ndescription: valid description\nsteps: fixed\n---\n# Title\n${'rich prose '.repeat(80)}`)).toThrow('Unsupported Studio Skill frontmatter field: steps');
  });

  it('validates only portable id syntax because the host owns membership', () => {
    expect(isStudioScenarioSkillId(STUDIO_AUTO_SKILL_ID)).toBe(true);
    expect(isStudioScenarioSkillId('long-to-shorts')).toBe(true);
    expect(isStudioScenarioSkillId('host-specialist')).toBe(true);
    expect(isStudioScenarioSkillId('Bad Skill')).toBe(false);
  });

  it('injects only the complete Markdown Skill supplied by the host', () => {
    const selected = parseStudioScenarioSkill(raw('long-to-shorts', 'Long video to short-form cuts'));
    const system = buildChatSystem(null, undefined, selected);
    expect(system).toContain('<studio_skill id="long-to-shorts"');
    expect(system).toContain('# Long video to short-form cuts');
    expect(buildChatSystem(null, undefined, null)).not.toContain('<studio_skill');
  });

  it('keeps a selected Skill flexible instead of turning it into structured composition', () => {
    const selected = parseStudioScenarioSkill(raw('talking-head-edit', 'Talking-head edit'));
    const system = buildChatSystem(null, undefined, selected);
    expect(system).toContain('A selected Studio Skill is a rich Markdown expert playbook');
    expect(system).toContain('not structured configuration, a fixed workflow, or a component bundle');
    expect(system).not.toContain('SPEECH-LED DRAFT PIPELINE');
  });
});
