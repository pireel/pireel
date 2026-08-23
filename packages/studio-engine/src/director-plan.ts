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

export const BROLL_DECISIONS = ['none', 'source', 'search', 'generate'] as const;
export type BrollDecision = typeof BROLL_DECISIONS[number];

/**
 * Whole-piece design language chosen before individual scenes are authored.
 *
 * This is deliberately prose rather than a token/config schema: a Frame, the user's manual
 * controls, and the source material all contribute to the result. The contract exists so every
 * downstream scene and generated graphic sees the same visual thesis instead of independently
 * inventing a style from a few nearby words.
 */
export interface VideoDesignSystem {
  /** The memorable visual idea and intended level of restraint/intensity. */
  visualConcept: string;
  /** Spatial hierarchy, negative-space policy, source/graphic relationship, and layout rhythm. */
  composition: string;
  /** Display/body/number roles, hierarchy, casing, and emphasis behavior. */
  typography: string;
  /** Dominant/ground/accent/material behavior. Explicit user palette choices remain authoritative. */
  colorAndMaterial: string;
  /** How real footage, screenshots, photography, generated imagery, crops, and evidence are treated. */
  imagery: string;
  /** Camera and graphic movement, easing, energy, transition, hold, and clear behavior. */
  motion: string;
  /** Dialogue hierarchy, source sound, music, silence, and sparse graphic punctuation. */
  sound: string;
}

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
  /** Stable, human-readable name for this content-specific Scene treatment. */
  treatmentId: string;
  /** The concrete subject, action, evidence, or relation that must remain visually dominant. */
  visualAnchor: string;
  /** Free-form direction inside the chosen theme; intentionally not a component enum. */
  visualTreatment: string;
  /** How the scene enters, develops with speech/action, holds, and exits. */
  motionPlan: string;
  /** How voice, source sound, music, silence, and graphic cues relate in this scene. */
  soundPlan: string;
  /** What source/project/official/generated material should carry the scene, and why. */
  assetStrategy: string;
  /** Explicit editorial decision about whether this scene should interrupt A-roll with B-roll. */
  brollDecision: BrollDecision;
  /** Why B-roll helps here, or why the source picture should remain uninterrupted. */
  brollRationale: string;
  /** One sharp, content-specific visual proposition when metaphorical B-roll is justified. */
  visualMetaphor?: string;
}

/**
 * A saved decision artifact for a complete edit. It is the bridge from flexible Markdown Skill
 * judgment to executable timeline work, not a workflow definition and not a template graph.
 */
export interface DirectorPlan {
  goal: string;
  creativeThesis: string;
  /** Whole-film pressure, release, density, and pace progression. */
  rhythmArc: string;
  /** Delivery platform/placement, ratio and reserved platform-chrome/crop zones. */
  deliverySafety?: string;
  /** Shared design language that every Scene must inherit and vary intentionally. */
  designSystem: VideoDesignSystem;
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

export function validateDirectorPlan(value: unknown): DirectorPlanIssue[] {
  const issues: DirectorPlanIssue[] = [];
  const push = (code: string, path: string, message: string) => issues.push({ code, path, message });
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    push('invalid-plan', '', 'Director plan must be an object.');
    return issues;
  }

  const plan = value as Partial<DirectorPlan>;
  if (!nonEmpty(plan.goal)) push('missing-goal', 'goal', 'Director plan needs a concrete viewer or business goal.');
  if (!nonEmpty(plan.creativeThesis)) push('missing-thesis', 'creativeThesis', 'Director plan needs a creative thesis.');
  if (!nonEmpty(plan.rhythmArc)) push('missing-rhythm-arc', 'rhythmArc', 'Director plan needs a whole-film rhythm arc.');
  if (plan.deliverySafety !== undefined && !nonEmpty(plan.deliverySafety)) {
    push('invalid-delivery-safety', 'deliverySafety', 'Delivery safety must describe the destination and protected content region when supplied.');
  }
  if (!plan.designSystem || typeof plan.designSystem !== 'object' || Array.isArray(plan.designSystem)) {
    push('missing-design-system', 'designSystem', 'Director plan needs one whole-film video design system.');
  } else {
    const designSystem = plan.designSystem as Partial<VideoDesignSystem>;
    for (const key of ['visualConcept', 'composition', 'typography', 'colorAndMaterial', 'imagery', 'motion', 'sound'] as const) {
      if (!nonEmpty(designSystem[key])) {
        push('missing-design-system-field', `designSystem.${key}`, `Video design system needs ${key}.`);
      }
    }
  }
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
    if (!nonEmpty(scene.treatmentId)) push('missing-treatment-id', `${path}.treatmentId`, 'Scene needs a stable name for its authored treatment.');
    if (!nonEmpty(scene.visualAnchor)) push('missing-visual-anchor', `${path}.visualAnchor`, 'Scene needs one concrete visual anchor.');
    if (!nonEmpty(scene.visualTreatment)) push('missing-visual-treatment', `${path}.visualTreatment`, 'Scene needs a full-canvas composition and visual treatment.');
    if (!nonEmpty(scene.motionPlan)) push('missing-motion-plan', `${path}.motionPlan`, 'Scene needs entrance, development, payoff/hold, and exit direction.');
    if (!nonEmpty(scene.soundPlan)) push('missing-sound-plan', `${path}.soundPlan`, 'Scene needs an intentional sound plan, including deliberate silence when appropriate.');
    if (!nonEmpty(scene.assetStrategy)) push('missing-asset-strategy', `${path}.assetStrategy`, 'Scene needs a source/evidence/graphic asset strategy.');
    if (!inList(scene.brollDecision, BROLL_DECISIONS)) push('invalid-broll-decision', `${path}.brollDecision`, 'Scene needs an explicit B-roll decision.');
    if (!nonEmpty(scene.brollRationale)) push('missing-broll-rationale', `${path}.brollRationale`, 'Scene needs the editorial reason for its B-roll decision.');
    if (scene.visualMetaphor !== undefined && !nonEmpty(scene.visualMetaphor)) push('invalid-visual-metaphor', `${path}.visualMetaphor`, 'Visual metaphor must be non-empty when supplied.');

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

export function isDirectorPlan(value: unknown): value is DirectorPlan {
  return validateDirectorPlan(value).length === 0;
}

function canonicalDirectorPlan(plan: DirectorPlan): DirectorPlan {
  return {
    goal: plan.goal,
    creativeThesis: plan.creativeThesis,
    rhythmArc: plan.rhythmArc,
    ...(plan.deliverySafety ? { deliverySafety: plan.deliverySafety } : {}),
    designSystem: plan.designSystem,
    ...(plan.skillId ? { skillId: plan.skillId } : {}),
    ...(plan.frameId ? { frameId: plan.frameId } : {}),
    ...(plan.audience ? { audience: plan.audience } : {}),
    scenes: plan.scenes,
  };
}

/**
 * Upgrade the persisted Director Plan V1 shape introduced before the whole-film design system.
 *
 * Director plans are optional planning metadata inside an EditorDocumentV2. Bumping their nested
 * schema must not make an otherwise valid editor document unreadable. The generated fields are
 * deliberately preservation-oriented: they keep the existing scene decisions and timeline intact
 * until the user deliberately asks for a new direction pass.
 */
export function migrateDirectorPlan(value: unknown): DirectorPlan | null {
  if (isDirectorPlan(value)) {
    return value && typeof value === 'object' && !Array.isArray(value) && !('version' in value)
      ? value
      : canonicalDirectorPlan(value);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const legacy = value as Record<string, unknown>;
  if (legacy.version !== 1 || !nonEmpty(legacy.goal) || !nonEmpty(legacy.creativeThesis) || !Array.isArray(legacy.scenes)) {
    return null;
  }

  const scenes = legacy.scenes.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const scene = value as Record<string, unknown>;
    const label = nonEmpty(scene.label) ? scene.label : `Legacy scene ${index + 1}`;
    const purpose = nonEmpty(scene.purpose) ? scene.purpose : label;
    return {
      ...scene,
      treatmentId: nonEmpty(scene.treatmentId)
        ? scene.treatmentId
        : `legacy-${nonEmpty(scene.sceneFamily) ? scene.sceneFamily : 'scene'}-${index + 1}`,
      visualAnchor: nonEmpty(scene.visualAnchor) ? scene.visualAnchor : label,
      visualTreatment: nonEmpty(scene.visualTreatment) ? scene.visualTreatment : purpose,
      motionPlan: nonEmpty(scene.motionPlan)
        ? scene.motionPlan
        : 'Preserve the legacy scene timing and existing timeline motion.',
      soundPlan: nonEmpty(scene.soundPlan)
        ? scene.soundPlan
        : 'Preserve existing dialogue, source audio, and silence unless the user changes them.',
      assetStrategy: nonEmpty(scene.assetStrategy)
        ? scene.assetStrategy
        : 'Use the existing project assets and scene evidence.',
      brollDecision: inList(scene.brollDecision, BROLL_DECISIONS) ? scene.brollDecision : 'none',
      brollRationale: nonEmpty(scene.brollRationale)
        ? scene.brollRationale
        : 'The legacy plan did not specify B-roll; preserve the existing edit.',
    };
  });
  const thesis = legacy.creativeThesis;
  const migrated: DirectorPlan = {
    goal: legacy.goal,
    creativeThesis: thesis,
    rhythmArc: nonEmpty(legacy.rhythmArc)
      ? legacy.rhythmArc
      : 'Preserve the legacy scene order, timing, pacing, and intended escalation.',
    deliverySafety: nonEmpty(legacy.deliverySafety)
      ? legacy.deliverySafety
      : 'Destination platform is unknown. Preserve essential faces, products, evidence, captions and calls to action inside a conservative central safe region; decorative backgrounds alone may bleed.',
    designSystem: {
      visualConcept: thesis,
      composition: 'Preserve the existing per-scene composition, hierarchy, and negative space.',
      typography: 'Preserve the project typography and caption hierarchy.',
      colorAndMaterial: 'Preserve the project palette, contrast, and material cues.',
      imagery: 'Use the existing source footage and scene asset strategies.',
      motion: 'Preserve the existing per-scene motion plans and timing.',
      sound: 'Preserve the existing dialogue, source sound, and per-scene sound plans.',
    },
    ...(nonEmpty(legacy.skillId) ? { skillId: legacy.skillId } : {}),
    ...(nonEmpty(legacy.frameId) ? { frameId: legacy.frameId } : {}),
    ...(nonEmpty(legacy.audience) ? { audience: legacy.audience } : {}),
    scenes: scenes as DirectorScenePlan[],
  };
  return isDirectorPlan(migrated) ? migrated : null;
}

/** Convert the editing expert's seconds-based tool input into the document's integral-frame timebase. */
export function directorPlanFromSeconds(input: Record<string, unknown>, fps: number): { plan?: DirectorPlan; issues: DirectorPlanIssue[] } {
  if (!Number.isFinite(fps) || fps <= 0) {
    return { issues: [{ code: 'invalid-fps', path: 'fps', message: 'FPS must be positive.' }] };
  }
  const rawScenes = Array.isArray(input.scenes) ? input.scenes : [];
  const scenes = rawScenes.map((value) => {
    const scene = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const durationSec = Number(scene.durationSec);
    const rawSceneFamily = nonEmpty(scene.sceneFamily) ? scene.sceneFamily : '';
    const sceneFamily = inList(rawSceneFamily, SCENE_FAMILIES) ? rawSceneFamily : 'custom';
    const customFamily = sceneFamily === 'custom'
      ? (nonEmpty(scene.customFamily) ? scene.customFamily : rawSceneFamily && rawSceneFamily !== 'custom' ? rawSceneFamily : '')
      : '';
    return {
      id: scene.id as string,
      label: scene.label as string,
      startFrame: Math.round(Number(scene.startSec) * fps),
      durationFrames: durationSec > 0 ? Math.max(1, Math.round(durationSec * fps)) : Math.round(durationSec * fps),
      viewerTask: scene.viewerTask as ViewerTask,
      narrativeRole: scene.narrativeRole as NarrativeRole,
      sceneFamily: sceneFamily as SceneFamily,
      ...(customFamily ? { customFamily } : {}),
      purpose: scene.purpose as string,
      ...(nonEmpty(scene.evidence)
        ? { evidence: [scene.evidence] }
        : Array.isArray(scene.evidence)
          ? { evidence: scene.evidence }
          : {}),
      treatmentId: scene.treatmentId as string,
      visualAnchor: scene.visualAnchor as string,
      visualTreatment: scene.visualTreatment as string,
      motionPlan: scene.motionPlan as string,
      soundPlan: scene.soundPlan as string,
      assetStrategy: scene.assetStrategy as string,
      brollDecision: scene.brollDecision as BrollDecision,
      brollRationale: scene.brollRationale as string,
      ...(nonEmpty(scene.visualMetaphor) ? { visualMetaphor: scene.visualMetaphor } : {}),
    } satisfies DirectorScenePlan;
  });
  const plan: DirectorPlan = {
    goal: input.goal as string,
    creativeThesis: input.creativeThesis as string,
    rhythmArc: input.rhythmArc as string,
    ...(input.deliverySafety !== undefined ? { deliverySafety: input.deliverySafety as string } : {}),
    designSystem: input.designSystem as VideoDesignSystem,
    ...(nonEmpty(input.skillId) ? { skillId: input.skillId } : {}),
    ...(nonEmpty(input.frameId) ? { frameId: input.frameId } : {}),
    ...(nonEmpty(input.audience) ? { audience: input.audience } : {}),
    scenes,
  };
  const issues = validateDirectorPlan(plan).map((issue) => {
    const match = /^scenes\[(\d+)\]\.(startFrame|durationFrames)$/.exec(issue.path);
    if (!match) return issue;
    const index = Number(match[1]);
    if (issue.code === 'overlapping-scenes' && index > 0) {
      const previousEndFrame = scenes
        .slice(0, index)
        .reduce((end, scene) => (
          Number.isInteger(scene.startFrame) && Number.isInteger(scene.durationFrames) && scene.durationFrames > 0
            ? Math.max(end, scene.startFrame + scene.durationFrames)
            : end
        ), 0);
      const startSec = Number((rawScenes[index] as Record<string, unknown> | undefined)?.startSec);
      const previousEndSec = previousEndFrame / fps;
      const showSeconds = (seconds: number) => Number(seconds.toFixed(3)).toString();
      return {
        ...issue,
        path: `scenes[${index}].startSec`,
        message: `Scene starts at ${showSeconds(startSec)}s before the previous planned interval ends at ${showSeconds(previousEndSec)}s. Set startSec to ${showSeconds(previousEndSec)} or later, or shorten an earlier scene.`,
      };
    }
    return {
      ...issue,
      path: `scenes[${index}].${match[2] === 'startFrame' ? 'startSec' : 'durationSec'}`,
    };
  });
  return issues.length ? { issues } : { plan, issues: [] };
}
