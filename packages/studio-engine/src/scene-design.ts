import type { DirectorPlan } from './director-plan';
import type { EditorDocumentV2, EditorSemanticState } from './editor-document/types';

export const SCENE_DESIGNS_ARTIFACT_KEY = 'sceneDesigns';
export const SCENE_DESIGNS_ARTIFACT_KIND = 'pireel.scene-designs';
export const SCENE_DESIGNS_MEDIA_TYPE = 'text/markdown';

/**
 * A Scene's authored spatial-temporal idea.
 *
 * Every field remains prose on purpose. This is a persistent design artifact, not a menu of
 * layouts, Components or transitions. It gives later atomic timeline operations one shared
 * picture of the complete Scene rather than asking each operation to invent a local treatment.
 */
export interface SceneDesign {
  sceneId: string;
  /** The single visual argument and memorable payoff of the Scene. */
  designIntent: string;
  /** Whole-canvas hierarchy and simultaneous relationships between source, media, type and graphics. */
  composition: string;
  /** How the complete composition establishes, develops, emphasizes, holds and clears over time. */
  choreography: string;
  /** How visual/audio state arrives from the previous Scene and hands material into the next. */
  continuity: string;
  /** Observable conditions that must be true in the rendered result. */
  successCriteria: string;
}

export interface SceneDesignCollection {
  scenes: SceneDesign[];
}

export interface SceneDesignIssue {
  path: string;
  message: string;
}

export interface SceneDesignMarkdownArtifact {
  kind: typeof SCENE_DESIGNS_ARTIFACT_KIND;
  mediaType: typeof SCENE_DESIGNS_MEDIA_TYPE;
  content: string;
}

const FRONTMATTER = `---\nkind: pireel-scene-designs\n---`;
const FIELD_HEADINGS: Array<[keyof Omit<SceneDesign, 'sceneId'>, string]> = [
  ['designIntent', 'Design intent'],
  ['composition', 'Composition'],
  ['choreography', 'Choreography'],
  ['continuity', 'Continuity'],
  ['successCriteria', 'Success criteria'],
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const escapeBody = (value: string): string => value.trim().replace(/^(\s*)(#{1,6})(?=\s)/gm, '$1\\$2');
const unescapeBody = (value: string): string => value.trim().replace(/^(\s*)\\(#{1,6})(?=\s)/gm, '$1$2');

interface MarkdownSection { title: string; body: string }

function sectionsAtLevel(markdown: string, level: number): MarkdownSection[] {
  const marker = '#'.repeat(level);
  const heading = new RegExp(`^${marker} (.+)$`, 'gm');
  const matches = [...markdown.matchAll(heading)];
  return matches.map((match, index) => {
    const bodyStart = (match.index ?? 0) + match[0].length;
    const nextStart = matches[index + 1]?.index ?? markdown.length;
    return { title: match[1]!.trim(), body: markdown.slice(bodyStart, nextStart).trim() };
  });
}

function section(sections: MarkdownSection[], title: string): string | undefined {
  return sections.find((candidate) => candidate.title === title)?.body;
}

function artifactRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (value === undefined) return {};
  return { legacyArtifacts: { kind: 'pireel.opaque', payload: value } };
}

export function validateSceneDesignCollection(
  value: unknown,
  plan?: DirectorPlan | null,
): SceneDesignIssue[] {
  const issues: SceneDesignIssue[] = [];
  if (!isRecord(value) || !Array.isArray(value.scenes) || value.scenes.length === 0) {
    return [{ path: 'scenes', message: 'At least one Scene design is required.' }];
  }
  const validSceneIds = plan ? new Set(plan.scenes.map((scene) => scene.id)) : null;
  const seen = new Set<string>();
  value.scenes.forEach((raw, index) => {
    const path = `scenes[${index}]`;
    if (!isRecord(raw)) {
      issues.push({ path, message: 'Scene design must be an object.' });
      return;
    }
    if (!nonEmpty(raw.sceneId)) issues.push({ path: `${path}.sceneId`, message: 'Scene id is required.' });
    else if (seen.has(raw.sceneId)) issues.push({ path: `${path}.sceneId`, message: `Duplicate Scene id: ${raw.sceneId}` });
    else if (validSceneIds && !validSceneIds.has(raw.sceneId)) issues.push({ path: `${path}.sceneId`, message: `Director Scene does not exist: ${raw.sceneId}` });
    else seen.add(raw.sceneId);
    for (const [key] of FIELD_HEADINGS) {
      if (!nonEmpty(raw[key])) issues.push({ path: `${path}.${key}`, message: `${key} is required.` });
    }
  });
  return issues;
}

export function sceneDesignCollectionFromInput(
  value: unknown,
  plan: DirectorPlan,
): { designs?: SceneDesignCollection; issues: SceneDesignIssue[] } {
  const issues = validateSceneDesignCollection(value, plan);
  if (issues.length) return { issues };
  const raw = value as { scenes: Array<Record<string, unknown>> };
  return {
    designs: {
      scenes: raw.scenes.map((scene) => ({
        sceneId: String(scene.sceneId).trim(),
        designIntent: String(scene.designIntent).trim(),
        composition: String(scene.composition).trim(),
        choreography: String(scene.choreography).trim(),
        continuity: String(scene.continuity).trim(),
        successCriteria: String(scene.successCriteria).trim(),
      })),
    },
    issues: [],
  };
}

export function sceneDesignsToMarkdown(collection: SceneDesignCollection): string {
  const scenes = collection.scenes.map((scene) => [
    `## Scene: ${escapeBody(scene.sceneId)}`,
    ...FIELD_HEADINGS.map(([key, heading]) => `### ${heading}\n\n${escapeBody(scene[key])}`),
  ].join('\n\n'));
  return `${FRONTMATTER}\n\n# Scene Designs\n\n${scenes.join('\n\n')}\n`;
}

export function sceneDesignsFromMarkdown(markdown: string): SceneDesignCollection | null {
  if (typeof markdown !== 'string' || !markdown.startsWith(`${FRONTMATTER}\n`) || !/^# Scene Designs$/m.test(markdown)) return null;
  const scenes = sectionsAtLevel(markdown, 2).map((sceneSection) => {
    const fields = sectionsAtLevel(sceneSection.body, 3);
    return {
      sceneId: unescapeBody(sceneSection.title.replace(/^Scene:\s*/, '')),
      ...Object.fromEntries(FIELD_HEADINGS.map(([key, heading]) => [
        key,
        unescapeBody(section(fields, heading) ?? ''),
      ])),
    } as SceneDesign;
  });
  const collection = { scenes };
  return validateSceneDesignCollection(collection).length ? null : collection;
}

export function isSceneDesignMarkdownArtifact(value: unknown): value is SceneDesignMarkdownArtifact {
  return isRecord(value)
    && value.kind === SCENE_DESIGNS_ARTIFACT_KIND
    && value.mediaType === SCENE_DESIGNS_MEDIA_TYPE
    && typeof value.content === 'string';
}

export function sceneDesignsFromDocument(document: EditorDocumentV2): SceneDesignCollection | null {
  const value = artifactRecord(document.semantics.artifacts)[SCENE_DESIGNS_ARTIFACT_KEY];
  return isSceneDesignMarkdownArtifact(value) ? sceneDesignsFromMarkdown(value.content) : null;
}

export function sceneDesignsMarkdownFromDocument(document: EditorDocumentV2): string | null {
  const value = artifactRecord(document.semantics.artifacts)[SCENE_DESIGNS_ARTIFACT_KEY];
  return isSceneDesignMarkdownArtifact(value) ? value.content : null;
}

export function sceneDesignForDocument(document: EditorDocumentV2, sceneId: string): SceneDesign | undefined {
  return sceneDesignsFromDocument(document)?.scenes.find((scene) => scene.sceneId === sceneId);
}

/** Merge progressive Scene passes while keeping untouched Scene designs stable. */
export function withSceneDesignsInSemantics(
  semantics: EditorSemanticState,
  incoming: SceneDesignCollection,
): EditorSemanticState {
  const artifacts = artifactRecord(semantics.artifacts);
  const currentValue = artifacts[SCENE_DESIGNS_ARTIFACT_KEY];
  const current = isSceneDesignMarkdownArtifact(currentValue) ? sceneDesignsFromMarkdown(currentValue.content) : null;
  const byId = new Map((current?.scenes ?? []).map((scene) => [scene.sceneId, scene]));
  for (const scene of incoming.scenes) byId.set(scene.sceneId, scene);
  const merged = { scenes: [...byId.values()] };
  return {
    ...semantics,
    artifacts: {
      ...artifacts,
      [SCENE_DESIGNS_ARTIFACT_KEY]: {
        kind: SCENE_DESIGNS_ARTIFACT_KIND,
        mediaType: SCENE_DESIGNS_MEDIA_TYPE,
        content: sceneDesignsToMarkdown(merged),
      } satisfies SceneDesignMarkdownArtifact,
    },
  };
}

export function withoutSceneDesignsInSemantics(semantics: EditorSemanticState): EditorSemanticState {
  const artifacts = artifactRecord(semantics.artifacts);
  if (!(SCENE_DESIGNS_ARTIFACT_KEY in artifacts)) return semantics;
  const { [SCENE_DESIGNS_ARTIFACT_KEY]: _removed, ...rest } = artifacts;
  return { ...semantics, ...(Object.keys(rest).length ? { artifacts: rest } : { artifacts: undefined }) };
}
