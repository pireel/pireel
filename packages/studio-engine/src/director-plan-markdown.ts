import {
  isDirectorPlan,
  type DirectorPlan,
  type DirectorScenePlan,
  type VideoDesignSystem,
} from './director-plan';

const FRONTMATTER = `---\nkind: pireel-director-plan\n---`;

const DESIGN_HEADINGS: Array<[keyof VideoDesignSystem, string]> = [
  ['visualConcept', 'Visual concept'],
  ['composition', 'Composition'],
  ['typography', 'Typography'],
  ['colorAndMaterial', 'Color and material'],
  ['imagery', 'Imagery'],
  ['motion', 'Motion'],
  ['sound', 'Sound'],
];

const SCENE_HEADINGS: Array<[keyof DirectorScenePlan, string]> = [
  ['id', 'ID'],
  ['label', 'Label'],
  ['startFrame', 'Start frame'],
  ['durationFrames', 'Duration frames'],
  ['viewerTask', 'Viewer task'],
  ['narrativeRole', 'Narrative role'],
  ['sceneFamily', 'Scene family'],
  ['customFamily', 'Custom family'],
  ['purpose', 'Purpose'],
  ['treatmentId', 'Treatment'],
  ['visualAnchor', 'Visual anchor'],
  ['visualTreatment', 'Visual treatment'],
  ['motionPlan', 'Motion plan'],
  ['soundPlan', 'Sound plan'],
  ['assetStrategy', 'Asset strategy'],
  ['brollDecision', 'B-roll decision'],
  ['brollRationale', 'B-roll rationale'],
  ['visualMetaphor', 'Visual metaphor'],
];

interface MarkdownSection {
  title: string;
  body: string;
}

function escapeBody(value: string): string {
  return value.trim().replace(/^(\s*)(#{1,6})(?=\s)/gm, '$1\\$2');
}

function unescapeBody(value: string): string {
  return value.trim().replace(/^(\s*)\\(#{1,6})(?=\s)/gm, '$1$2');
}

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

function field(heading: string, value: unknown): string {
  return `#### ${heading}\n\n${escapeBody(String(value))}`;
}

/** Human-readable, agent-editable source of truth. JSON is only the tool-call input. */
export function directorPlanToMarkdown(plan: DirectorPlan): string {
  const top = [
    FRONTMATTER,
    '# Director Plan',
    `## Goal\n\n${escapeBody(plan.goal)}`,
    `## Creative thesis\n\n${escapeBody(plan.creativeThesis)}`,
    `## Rhythm arc\n\n${escapeBody(plan.rhythmArc)}`,
    plan.deliverySafety ? `## Delivery safety\n\n${escapeBody(plan.deliverySafety)}` : '',
    plan.skillId ? `## Skill ID\n\n${escapeBody(plan.skillId)}` : '',
    plan.frameId ? `## Frame ID\n\n${escapeBody(plan.frameId)}` : '',
    plan.audience ? `## Audience\n\n${escapeBody(plan.audience)}` : '',
    `## Video design system\n\n${DESIGN_HEADINGS
      .map(([key, heading]) => `### ${heading}\n\n${escapeBody(plan.designSystem[key])}`)
      .join('\n\n')}`,
    `## Scenes\n\n${plan.scenes.map((scene, index) => {
      const fields = SCENE_HEADINGS.flatMap(([key, heading]) => {
        const value = scene[key];
        return value === undefined ? [] : [field(heading, value)];
      });
      if (scene.evidence?.length) {
        fields.splice(9, 0, `#### Evidence\n\n${scene.evidence
          .map((item, evidenceIndex) => `##### Evidence ${evidenceIndex + 1}\n\n${escapeBody(item)}`)
          .join('\n\n')}`);
      }
      return `### Scene ${index + 1}\n\n${fields.join('\n\n')}`;
    }).join('\n\n')}`,
  ].filter(Boolean);
  return `${top.join('\n\n')}\n`;
}

/** Parse only the documented Markdown contract; malformed planning text never affects timeline readability. */
export function directorPlanFromMarkdown(markdown: string): DirectorPlan | null {
  if (typeof markdown !== 'string' || !markdown.startsWith(`${FRONTMATTER}\n`) || !/^# Director Plan$/m.test(markdown)) {
    return null;
  }
  const top = sectionsAtLevel(markdown, 2);
  const designBody = section(top, 'Video design system');
  const scenesBody = section(top, 'Scenes');
  if (!designBody || !scenesBody) return null;

  const designSections = sectionsAtLevel(designBody, 3);
  const designSystem = Object.fromEntries(DESIGN_HEADINGS.map(([key, heading]) => [
    key,
    unescapeBody(section(designSections, heading) ?? ''),
  ])) as unknown as VideoDesignSystem;

  const scenes = sectionsAtLevel(scenesBody, 3).map((sceneSection) => {
    const fields = sectionsAtLevel(sceneSection.body, 4);
    const raw = Object.fromEntries(SCENE_HEADINGS.map(([key, heading]) => [
      key,
      unescapeBody(section(fields, heading) ?? ''),
    ])) as Record<keyof DirectorScenePlan, string>;
    const evidenceBody = section(fields, 'Evidence');
    const evidence = evidenceBody
      ? sectionsAtLevel(evidenceBody, 5).map((item) => unescapeBody(item.body)).filter(Boolean)
      : [];
    return {
      id: raw.id,
      label: raw.label,
      startFrame: Number(raw.startFrame),
      durationFrames: Number(raw.durationFrames),
      viewerTask: raw.viewerTask,
      narrativeRole: raw.narrativeRole,
      sceneFamily: raw.sceneFamily,
      ...(raw.customFamily ? { customFamily: raw.customFamily } : {}),
      purpose: raw.purpose,
      ...(evidence.length ? { evidence } : {}),
      treatmentId: raw.treatmentId,
      visualAnchor: raw.visualAnchor,
      visualTreatment: raw.visualTreatment,
      motionPlan: raw.motionPlan,
      soundPlan: raw.soundPlan,
      assetStrategy: raw.assetStrategy,
      brollDecision: raw.brollDecision,
      brollRationale: raw.brollRationale,
      ...(raw.visualMetaphor ? { visualMetaphor: raw.visualMetaphor } : {}),
    };
  });

  const plan = {
    goal: unescapeBody(section(top, 'Goal') ?? ''),
    creativeThesis: unescapeBody(section(top, 'Creative thesis') ?? ''),
    rhythmArc: unescapeBody(section(top, 'Rhythm arc') ?? ''),
    ...(section(top, 'Delivery safety') ? { deliverySafety: unescapeBody(section(top, 'Delivery safety')!) } : {}),
    designSystem,
    ...(section(top, 'Skill ID') ? { skillId: unescapeBody(section(top, 'Skill ID')!) } : {}),
    ...(section(top, 'Frame ID') ? { frameId: unescapeBody(section(top, 'Frame ID')!) } : {}),
    ...(section(top, 'Audience') ? { audience: unescapeBody(section(top, 'Audience')!) } : {}),
    scenes,
  };
  return isDirectorPlan(plan) ? plan : null;
}
