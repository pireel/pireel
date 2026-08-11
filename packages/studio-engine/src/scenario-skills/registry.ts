import {
  type StudioScenarioSkill,
  type StudioScenarioSkillRegistry,
  type StudioScenarioSkillRegistryLayer,
} from './types';

const ALLOWED_FRONTMATTER_KEYS = new Set(['name', 'description']);

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2
    && ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseFrontmatter(raw: string): { attributes: Record<string, string>; body: string } {
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('Studio Skill must begin with YAML frontmatter');

  const attributes: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) throw new Error(`Invalid Studio Skill frontmatter line: ${line}`);
    const key = line.slice(0, separator).trim();
    if (!ALLOWED_FRONTMATTER_KEYS.has(key)) {
      throw new Error(`Unsupported Studio Skill frontmatter field: ${key}`);
    }
    attributes[key] = unquote(line.slice(separator + 1));
  }
  return { attributes, body: match[2].trim() };
}

const SKILL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Parse one self-contained SKILL.md without interpreting its prose as configuration. */
export function parseStudioScenarioSkill(raw: string): StudioScenarioSkill {
  const { attributes, body } = parseFrontmatter(raw);
  const id = attributes.name;
  if (!id || id === 'auto' || id.length > 64 || !SKILL_ID.test(id)) {
    throw new Error(`Invalid Studio Skill name: ${id || '(missing)'}`);
  }
  if (!attributes.description) throw new Error(`Studio Skill ${id} is missing description`);

  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!title) throw new Error(`Studio Skill ${id} needs an H1 title`);
  if (body.length < 400) throw new Error(`Studio Skill ${id} is too thin to guide expert judgment`);

  return {
    id,
    title,
    description: attributes.description,
    markdown: body,
  };
}

type StudioScenarioSkillFiles = Readonly<Record<string, string>> | readonly string[];

function parseSkillFiles(files: StudioScenarioSkillFiles): StudioScenarioSkill[] {
  if (Array.isArray(files)) return files.map(parseStudioScenarioSkill);

  return Object.entries(files).map(([path, raw]) => {
    const skill = parseStudioScenarioSkill(raw);
    const directory = /([^/]+)\/SKILL\.md$/.exec(path)?.[1];
    if (directory && directory !== skill.id) {
      throw new Error(`Studio Skill ${path}: frontmatter name "${skill.id}" does not match directory name "${directory}"`);
    }
    return skill;
  });
}

/** Build one registry from raw SKILL.md files. Content may come from Vite, disk, npm, or a database. */
export function createStudioScenarioSkillRegistry(files: StudioScenarioSkillFiles): StudioScenarioSkillRegistry {
  const skills = parseSkillFiles(files);
  const seen = new Set<string>();
  for (const skill of skills) {
    if (seen.has(skill.id)) throw new Error(`Duplicate Studio Skill name: ${skill.id}`);
    seen.add(skill.id);
  }
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  return {
    list: () => [...skills],
    get: (id) => byId.get(id) ?? null,
  };
}

/**
 * Merge ordered Skill layers. Duplicates fail by default so installing an extension cannot silently
 * replace another package. A host can grant `replace` to one layer; that layer wins while retaining
 * the original catalog position (useful for a richer hosted implementation of an OSS baseline id).
 */
export function mergeStudioScenarioSkillRegistries(
  layers: readonly StudioScenarioSkillRegistryLayer[],
): StudioScenarioSkillRegistry {
  const skills: StudioScenarioSkill[] = [];
  const indexById = new Map<string, number>();
  const sourceById = new Map<string, string>();

  for (const layer of layers) {
    if (!layer.source.trim()) throw new Error('Studio Skill registry layer needs a source name');
    for (const skill of layer.registry.list()) {
      const existingIndex = indexById.get(skill.id);
      if (existingIndex !== undefined) {
        if ((layer.onConflict ?? 'error') === 'error') {
          throw new Error(
            `Duplicate Studio Skill name: ${skill.id} (from ${sourceById.get(skill.id)} and ${layer.source})`,
          );
        }
        skills[existingIndex] = skill;
        sourceById.set(skill.id, layer.source);
        continue;
      }
      indexById.set(skill.id, skills.length);
      sourceById.set(skill.id, layer.source);
      skills.push(skill);
    }
  }

  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  return {
    list: () => [...skills],
    get: (id) => byId.get(id) ?? null,
  };
}
