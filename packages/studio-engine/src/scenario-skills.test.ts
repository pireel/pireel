import { describe, expect, it } from 'vitest';
import { buildChatSystem } from './prompts';
import {
  STUDIO_AUTO_SKILL_ID,
  createStudioScenarioSkillRegistry,
  isStudioScenarioSkillId,
  mergeStudioScenarioSkillRegistries,
  parseStudioScenarioSkill,
} from './scenario-skills';
import {
  OSS_STUDIO_DEFAULT_SKILL_ID,
  ossStudioScenarioSkillCatalog,
  ossStudioScenarioSkillRegistry,
} from './scenario-skills/vite';

describe('Studio scenario skill registry', () => {
  const raw = (name: string, title: string) => `---\nname: ${name}\ndescription: Host-owned expert guidance for a concrete editing situation.\n---\n# ${title}\n\n${'Rich prose that shapes judgment without becoming structured configuration. '.repeat(10)}`;

  it('ships one complete OSS talking-head baseline with localized picker metadata', () => {
    expect(OSS_STUDIO_DEFAULT_SKILL_ID).toBe('talking-head-edit');
    expect(ossStudioScenarioSkillRegistry.list().map((skill) => skill.id)).toEqual(['talking-head-edit']);
    expect(ossStudioScenarioSkillRegistry.get('talking-head-edit')?.markdown).toContain('Protect the source of truth');
    expect(ossStudioScenarioSkillRegistry.get('talking-head-edit')?.markdown).toContain('For conservative speech cleanup across the full recording');
    expect(ossStudioScenarioSkillRegistry.get('talking-head-edit')?.markdown).toContain('without a whole-film proposal, approval, Director');
    expect(ossStudioScenarioSkillRegistry.get('talking-head-edit')?.markdown).toContain('With several plausible spoken sources');
    expect(ossStudioScenarioSkillRegistry.get('talking-head-edit')?.description).toContain('remove dead air, filler words, false starts, repeated lines, and discarded retakes');
    expect(ossStudioScenarioSkillCatalog('zh')[0]?.title).toBe('口播剪辑');
    expect(ossStudioScenarioSkillCatalog('zh')[0]?.summary).toBe('剪掉无效停顿、口头禅、重复、口误和废弃重录，保留自然语气并整理字幕；需要时再做构图、B-roll、动态图形和声音增强。');
    expect(ossStudioScenarioSkillCatalog('en')[0]?.title).toBe('Talking-head edit');
    expect(ossStudioScenarioSkillCatalog('en')[0]?.summary).toContain('add reframing, B-roll, Motion Graphics, and sound only when needed');
  });

  it('loads arbitrary host-defined Markdown playbooks and rejects duplicates', () => {
    const skills = createStudioScenarioSkillRegistry([raw('interview-edit', 'Interview edit'), raw('course-edit', 'Course edit')]);
    expect(skills.list().map((skill) => skill.id)).toEqual(['interview-edit', 'course-edit']);
    expect(skills.get('course-edit')?.title).toBe('Course edit');
    expect(skills.get('missing')).toBeNull();
    expect(() => createStudioScenarioSkillRegistry([raw('interview-edit', 'One'), raw('interview-edit', 'Two')])).toThrow('Duplicate Studio Skill name');
  });

  it('validates file paths and merges extension layers without silent id hijacking', () => {
    expect(() => createStudioScenarioSkillRegistry({
      'wrong-directory/SKILL.md': raw('interview-edit', 'Interview edit'),
    })).toThrow('does not match directory name');

    const oss = createStudioScenarioSkillRegistry([raw('talking-head-edit', 'OSS talking head')]);
    const thirdParty = createStudioScenarioSkillRegistry([raw('course-edit', 'Course edit')]);
    const merged = mergeStudioScenarioSkillRegistries([
      { source: 'oss', registry: oss },
      { source: 'community.example', registry: thirdParty },
    ]);
    expect(merged.list().map((skill) => skill.id)).toEqual(['talking-head-edit', 'course-edit']);

    const hosted = createStudioScenarioSkillRegistry([raw('talking-head-edit', 'Hosted talking head')]);
    expect(() => mergeStudioScenarioSkillRegistries([
      { source: 'oss', registry: oss },
      { source: 'hosted', registry: hosted },
    ])).toThrow('from oss and hosted');

    const replaced = mergeStudioScenarioSkillRegistries([
      { source: 'oss', registry: oss },
      { source: 'hosted', registry: hosted, onConflict: 'replace' },
      { source: 'community.example', registry: thirdParty },
    ]);
    expect(replaced.list().map((skill) => skill.title)).toEqual(['Hosted talking head', 'Course edit']);
    expect(() => mergeStudioScenarioSkillRegistries([
      { source: 'oss', registry: oss },
      { source: 'hosted', registry: hosted, onConflict: 'replace' },
      { source: 'community.example', registry: oss },
    ])).toThrow('from hosted and community.example');
  });

  it('uses frontmatter only for loading and rejects configuration fields', () => {
    expect(() => parseStudioScenarioSkill(`---\nname: talking-head-edit\ndescription: valid description\nsteps: fixed\n---\n# Title\n${'rich prose '.repeat(80)}`)).toThrow('Unsupported Studio Skill frontmatter field: steps');
  });

  it('validates only portable id syntax because the host owns membership', () => {
    expect(isStudioScenarioSkillId(STUDIO_AUTO_SKILL_ID)).toBe(true);
    expect(isStudioScenarioSkillId('long-to-shorts')).toBe(true);
    expect(isStudioScenarioSkillId('host-specialist')).toBe(true);
    expect(isStudioScenarioSkillId('usk_0123456789abcdef01234567')).toBe(true);
    expect(isStudioScenarioSkillId('usk_../../other-user')).toBe(false);
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
    expect(system).toContain('not structured configuration, a fixed workflow, or a Motion Graphic bundle');
    expect(system).not.toContain('SPEECH-LED DRAFT PIPELINE');
  });
});
