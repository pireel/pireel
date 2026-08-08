export const DIRECTOR_PLAN_VERSION = 1 as const;

export const VIEWER_TASKS = ['orient', 'understand', 'believe', 'remember', 'feel', 'act'] as const;
export type ViewerTask = typeof VIEWER_TASKS[number];

export const NARRATIVE_ROLES = ['hook', 'setup', 'explain', 'prove', 'turn', 'payoff', 'cta', 'breathe'] as const;
export type NarrativeRole = typeof NARRATIVE_ROLES[number];

export const SCENE_FAMILIES = [
  'speaker-clean',
  'speaker-emphasis',
  'identity',
  'media-evidence',
  'split-explain',
  'data-explain',
  'structure-explain',
  'designed-fullscreen',
  'demo-focus',
  'montage',
  'transition',
  'cta-payoff',
  'custom',
] as const;
export type SceneFamily = typeof SCENE_FAMILIES[number];

export interface DirectorScenePlan {
  id: string;
  label: string;
  startFrame: number;
  durationFrames: number;
  viewerTask: ViewerTask;
  narrativeRole: NarrativeRole;
  sceneFamily: SceneFamily;
  /** Required only when the expert needs a family outside the shared vocabulary. */
  customFamily?: string;
  /** Editorial reason this scene exists. */
  purpose: string;
  /** Supplied transcript, footage, product, or asset evidence supporting the treatment. */
  evidence?: string[];
  /** Free-form direction inside the chosen theme; intentionally not a component enum. */
  visualTreatment?: string;
  /** What source/project/official/generated material should carry the scene, and why. */
  assetStrategy?: string;
}

/**
 * A saved decision artifact for a complete edit. It is the bridge from flexible Markdown Skill
 * judgment to executable timeline work, not a workflow definition and not a template graph.
 */
export interface DirectorPlanV1 {
  version: typeof DIRECTOR_PLAN_VERSION;
  goal: string;
  creativeThesis: string;
  skillId?: string;
  frameId?: string;
  audience?: string;
  scenes: DirectorScenePlan[];
}

export interface DirectorPlanIssue {
  code: string;
  path: string;
  message: string;
}

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const inList = <T extends string>(value: unknown, list: readonly T[]): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

export function validateDirectorPlanV1(value: unknown): DirectorPlanIssue[] {
  const issues: DirectorPlanIssue[] = [];
  const push = (code: string, path: string, message: string) => issues.push({ code, path, message });
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    push('invalid-plan', '', 'Director plan must be an object.');
    return issues;
  }

  const plan = value as Partial<DirectorPlanV1>;
  if (plan.version !== DIRECTOR_PLAN_VERSION) push('unsupported-version', 'version', `Expected director plan version ${DIRECTOR_PLAN_VERSION}.`);
  if (!nonEmpty(plan.goal)) push('missing-goal', 'goal', 'Director plan needs a concrete viewer or business goal.');
  if (!nonEmpty(plan.creativeThesis)) push('missing-thesis', 'creativeThesis', 'Director plan needs a creative thesis.');
  if (plan.skillId !== undefined && !nonEmpty(plan.skillId)) push('invalid-skill-id', 'skillId', 'Skill id must be non-empty when supplied.');
  if (plan.frameId !== undefined && !nonEmpty(plan.frameId)) push('invalid-frame-id', 'frameId', 'Frame id must be non-empty when supplied.');
  if (plan.audience !== undefined && !nonEmpty(plan.audience)) push('invalid-audience', 'audience', 'Audience must be non-empty when supplied.');
  if (!Array.isArray(plan.scenes) || plan.scenes.length === 0) {
    push('missing-scenes', 'scenes', 'Director plan needs at least one scene.');
    return issues;
  }

  const ids = new Set<string>();
  let previousStart = -1;
  let previousEnd = -1;
  for (const [index, rawScene] of plan.scenes.entries()) {
    const path = `scenes[${index}]`;
    if (!rawScene || typeof rawScene !== 'object' || Array.isArray(rawScene)) {
      push('invalid-scene', path, 'Scene must be an object.');
      continue;
    }
    const scene = rawScene as Partial<DirectorScenePlan>;
    if (!nonEmpty(scene.id)) push('missing-scene-id', `${path}.id`, 'Scene id is required.');
    else if (ids.has(scene.id)) push('duplicate-scene-id', `${path}.id`, `Duplicate scene id: ${scene.id}`);
    else ids.add(scene.id);
    if (!nonEmpty(scene.label)) push('missing-scene-label', `${path}.label`, 'Scene label is required.');
    if (!Number.isInteger(scene.startFrame) || Number(scene.startFrame) < 0) push('invalid-scene-start', `${path}.startFrame`, 'Scene start must be a non-negative integral frame.');
    if (!Number.isInteger(scene.durationFrames) || Number(scene.durationFrames) <= 0) push('invalid-scene-duration', `${path}.durationFrames`, 'Scene duration must be a positive integral frame count.');
    if (!inList(scene.viewerTask, VIEWER_TASKS)) push('invalid-viewer-task', `${path}.viewerTask`, 'Scene viewer task is not recognized.');
    if (!inList(scene.narrativeRole, NARRATIVE_ROLES)) push('invalid-narrative-role', `${path}.narrativeRole`, 'Scene narrative role is not recognized.');
    if (!inList(scene.sceneFamily, SCENE_FAMILIES)) push('invalid-scene-family', `${path}.sceneFamily`, 'Scene family is not recognized.');
    if (scene.sceneFamily === 'custom' && !nonEmpty(scene.customFamily)) push('missing-custom-family', `${path}.customFamily`, 'Custom scenes must name their family.');
    if (!nonEmpty(scene.purpose)) push('missing-scene-purpose', `${path}.purpose`, 'Scene needs an editorial purpose.');
    if (scene.evidence !== undefined && (!Array.isArray(scene.evidence) || scene.evidence.some((item) => !nonEmpty(item)))) {
      push('invalid-scene-evidence', `${path}.evidence`, 'Evidence must be an array of non-empty strings.');
    }
    if (scene.visualTreatment !== undefined && !nonEmpty(scene.visualTreatment)) push('invalid-visual-treatment', `${path}.visualTreatment`, 'Visual treatment must be non-empty when supplied.');
    if (scene.assetStrategy !== undefined && !nonEmpty(scene.assetStrategy)) push('invalid-asset-strategy', `${path}.assetStrategy`, 'Asset strategy must be non-empty when supplied.');

    if (Number.isInteger(scene.startFrame) && Number.isInteger(scene.durationFrames) && Number(scene.durationFrames) > 0) {
      const start = Number(scene.startFrame);
      const end = start + Number(scene.durationFrames);
      if (start < previousStart) push('unordered-scenes', `${path}.startFrame`, 'Scenes must be ordered by start frame.');
      if (start < previousEnd) push('overlapping-scenes', `${path}.startFrame`, 'Director scenes are narrative intervals and must not overlap.');
      previousStart = start;
      previousEnd = Math.max(previousEnd, end);
    }
  }
  return issues;
}

export function isDirectorPlanV1(value: unknown): value is DirectorPlanV1 {
  return validateDirectorPlanV1(value).length === 0;
}

/** Convert the editing expert's seconds-based tool input into the document's integral-frame timebase. */
export function directorPlanFromSeconds(input: Record<string, unknown>, fps: number): { plan?: DirectorPlanV1; issues: DirectorPlanIssue[] } {
  if (!Number.isFinite(fps) || fps <= 0) {
    return { issues: [{ code: 'invalid-fps', path: 'fps', message: 'FPS must be positive.' }] };
  }
  const rawScenes = Array.isArray(input.scenes) ? input.scenes : [];
  const scenes = rawScenes.map((value) => {
    const scene = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const durationSec = Number(scene.durationSec);
    return {
      id: scene.id as string,
      label: scene.label as string,
      startFrame: Math.round(Number(scene.startSec) * fps),
      durationFrames: durationSec > 0 ? Math.max(1, Math.round(durationSec * fps)) : Math.round(durationSec * fps),
      viewerTask: scene.viewerTask as ViewerTask,
      narrativeRole: scene.narrativeRole as NarrativeRole,
      sceneFamily: scene.sceneFamily as SceneFamily,
      ...(scene.customFamily !== undefined ? { customFamily: scene.customFamily as string } : {}),
      purpose: scene.purpose as string,
      ...(scene.evidence !== undefined ? { evidence: scene.evidence as string[] } : {}),
      ...(scene.visualTreatment !== undefined ? { visualTreatment: scene.visualTreatment as string } : {}),
      ...(scene.assetStrategy !== undefined ? { assetStrategy: scene.assetStrategy as string } : {}),
    } satisfies DirectorScenePlan;
  });
  const plan: DirectorPlanV1 = {
    version: DIRECTOR_PLAN_VERSION,
    goal: input.goal as string,
    creativeThesis: input.creativeThesis as string,
    ...(input.skillId !== undefined ? { skillId: input.skillId as string } : {}),
    ...(input.frameId !== undefined ? { frameId: input.frameId as string } : {}),
    ...(input.audience !== undefined ? { audience: input.audience as string } : {}),
    scenes,
  };
  const issues = validateDirectorPlanV1(plan);
  return issues.length ? { issues } : { plan, issues: [] };
}
