import type { DirectorPlan, DirectorScenePlan } from './director-plan';
import type { EditorDocumentV2, TimelineClip } from './editor-document/types';
import { directorPlanFromDocument } from './director-plan-artifact';

export type SceneVisualReviewPhase = 'entrance' | 'develop' | 'payoff' | 'exit' | 'scene';

export type SceneVisualQaIssueKind =
  | 'repeated-geometry'
  | 'missing-evidence'
  | 'missing-planned-visual'
  | 'missing-audible-audio'
  | 'caption-subject-collision'
  | 'frame-drift'
  | 'unsafe-delivery-crop';

export interface SceneVisualReviewMoment {
  atSec: number;
  sceneId: string;
  sceneLabel: string;
  phase: SceneVisualReviewPhase;
  expected: string;
}

export interface SceneVisualQaIssue {
  sceneId: string;
  blockId: string;
  kind: SceneVisualQaIssueKind;
  note: string;
}

export interface SceneVisualRepairScope {
  sceneIds: string[];
  instruction: string;
}

const frameToSec = (frame: number, fps: number) => frame / fps;

function evidenceOf(scene: DirectorScenePlan): string[] {
  return scene.evidence?.map((item) => item.trim()).filter(Boolean) ?? [];
}

function sampleSecond(scene: DirectorScenePlan, phase: SceneVisualReviewPhase, fps: number): number {
  const start = frameToSec(scene.startFrame, fps);
  const duration = frameToSec(scene.durationFrames, fps);
  const edgeInset = Math.min(0.2, duration * 0.1);
  if (phase === 'entrance') return start + edgeInset;
  if (phase === 'develop') return start + duration * 0.4;
  if (phase === 'payoff') return start + duration * 0.68;
  if (phase === 'exit') return start + Math.max(edgeInset, duration - edgeInset);
  return start + duration * 0.5;
}

function sceneContext(
  scene: DirectorScenePlan,
  phase: SceneVisualReviewPhase,
  plan: DirectorPlan,
  frameId?: string,
): string {
  const evidence = evidenceOf(scene);
  return [
    `creativeThesis: ${plan.creativeThesis}`,
    `rhythmArc: ${plan.rhythmArc}`,
    `visualConcept: ${plan.designSystem.visualConcept}`,
    `compositionGrammar: ${plan.designSystem.composition}`,
    `typographySystem: ${plan.designSystem.typography}`,
    `colorAndMaterial: ${plan.designSystem.colorAndMaterial}`,
    `imageryTreatment: ${plan.designSystem.imagery}`,
    `motionGrammar: ${plan.designSystem.motion}`,
    `soundGrammar: ${plan.designSystem.sound}`,
    `semanticScene: ${scene.id} (${scene.label})`,
    `reviewPhase: ${phase}`,
    `viewerTask: ${scene.viewerTask}`,
    `narrativeRole: ${scene.narrativeRole}`,
    `sceneFamily: ${scene.sceneFamily}${scene.customFamily ? ` (${scene.customFamily})` : ''}`,
    `purpose: ${scene.purpose}`,
    `evidence: ${evidence.length ? evidence.join(' | ') : '(none supplied)'}`,
    `treatmentId: ${scene.treatmentId ?? '(not specified)'}`,
    `visualAnchor: ${scene.visualAnchor ?? '(not specified)'}`,
    `visualTreatment: ${scene.visualTreatment ?? '(not specified)'}`,
    `motionPlan: ${scene.motionPlan ?? '(not specified)'}`,
    `soundPlan: ${scene.soundPlan ?? '(not specified)'}`,
    `assetStrategy: ${scene.assetStrategy ?? '(not specified)'}`,
    `brollDecision: ${scene.brollDecision ?? '(not specified)'}`,
    `brollRationale: ${scene.brollRationale ?? '(not specified)'}`,
    `visualMetaphor: ${scene.visualMetaphor ?? '(not specified)'}`,
    `frameId: ${frameId ?? '(themeless)'}`,
  ].join('; ');
}

function capMoments(moments: SceneVisualReviewMoment[], maxMoments: number): SceneVisualReviewMoment[] {
  if (moments.length <= maxMoments) return moments;
  const picked = new Set<SceneVisualReviewMoment>();
  const firstEntrance = moments.find((moment) => moment.phase === 'entrance');
  const lastExit = [...moments].reverse().find((moment) => moment.phase === 'exit');
  if (firstEntrance) picked.add(firstEntrance);
  if (lastExit) picked.add(lastExit);

  // A settled/payoff frame is the minimum useful checkpoint for every scene. When the film has
  // more scenes than the cloud-review cap, sample these evenly rather than biasing the opening.
  const payoffs = moments.filter((moment) => moment.phase === 'payoff' || moment.phase === 'scene');
  const payoffRoom = Math.max(0, maxMoments - picked.size);
  const payoffCount = Math.min(payoffs.length, payoffRoom);
  for (let index = 0; index < payoffCount; index++) {
    const candidateIndex = Math.min(
      payoffs.length - 1,
      Math.floor(((index + 0.5) * payoffs.length) / Math.max(1, payoffCount)),
    );
    const candidate = payoffs[candidateIndex];
    if (candidate) picked.add(candidate);
  }

  // Use remaining capacity on temporal states. This catches late-loading media, entrance flashes,
  // animation that never settles, and overlays that fail to clear—problems a midpoint cannot see.
  const temporal = moments.filter((moment) => !picked.has(moment));
  const room = Math.max(0, maxMoments - picked.size);
  for (let index = 0; index < room; index++) {
    const candidateIndex = Math.min(
      temporal.length - 1,
      Math.floor(((index + 0.5) * temporal.length) / Math.max(1, room)),
    );
    const candidate = temporal[candidateIndex];
    if (candidate) picked.add(candidate);
  }
  return moments.filter((moment) => picked.has(moment)).slice(0, maxMoments);
}

/**
 * Select temporal checkpoints for each Director Scene. Short scenes get one settled sample; longer
 * scenes get entrance, develop, payoff, and exit samples so QA evaluates motion and media loading as
 * a sequence rather than mistaking one good thumbnail for a finished scene.
 */
export function planSceneVisualReview(
  document: EditorDocumentV2,
  options: { sceneIds?: string[]; maxMoments?: number } = {},
): SceneVisualReviewMoment[] {
  const plan = directorPlanFromDocument(document);
  if (!plan) return [];
  const selectedIds = options.sceneIds?.length ? new Set(options.sceneIds) : null;
  const scenes = plan.scenes;
  if (!scenes.length) return [];

  const moments = scenes.flatMap((scene) => {
    const durationSec = frameToSec(scene.durationFrames, document.canvas.fps);
    const phases: SceneVisualReviewPhase[] = durationSec < 1.2
      ? ['scene']
      : durationSec < 2.5
        ? ['entrance', 'payoff', 'exit']
        : ['entrance', 'develop', 'payoff', 'exit'];
    return phases.map((phase) => ({
      atSec: Math.round(sampleSecond(scene, phase, document.canvas.fps) * 100) / 100,
      sceneId: scene.id,
      sceneLabel: scene.label,
      phase,
      expected: sceneContext(scene, phase, plan, plan.frameId ?? document.appearance.frameId),
    }));
  }).filter((moment) => !selectedIds || selectedIds.has(moment.sceneId));
  return capMoments(moments, Math.min(18, Math.max(1, options.maxMoments ?? 18)));
}

function clipById(document: EditorDocumentV2): Map<string, TimelineClip> {
  return new Map(document.timeline.tracks.flatMap((track) => track.clips).map((clip) => [clip.id, clip]));
}

function geometryOf(clip: TimelineClip): { x: number; y: number; w: number; h: number } | undefined {
  if (clip.kind === 'graphic' || clip.kind === 'caption') return clip.block.box;
  if (clip.kind === 'media' || clip.kind === 'narrative') return clip.box;
  return undefined;
}

function geometrySignature(clip: TimelineClip): string | null {
  if (clip.kind !== 'graphic') return null;
  const box = geometryOf(clip);
  if (!box) return null;
  const quantize = (value: number) => Math.round(value * 20) / 20;
  return [quantize(box.x), quantize(box.y), quantize(box.w), quantize(box.h)].join(':');
}

const clipEndFrame = (clip: TimelineClip) => clip.startFrame + clip.durationFrames;
const overlapsScene = (clip: TimelineClip, scene: DirectorScenePlan) =>
  clip.enabled
  && clip.startFrame < scene.startFrame + scene.durationFrames
  && clipEndFrame(clip) > scene.startFrame;

function sceneNeedsAudibleAudio(scene: DirectorScenePlan): boolean {
  const plan = scene.soundPlan.toLowerCase();
  if (/(deliberate silence|full silence|silent scene|no audio|无声|静音)/i.test(plan)) return false;
  return /(voice|speech|dialogue|dialog|narration|speaker|room tone|source sound|口播|人声|旁白|对白|原声)/i.test(plan);
}

function hasAudibleAudio(document: EditorDocumentV2, scene: DirectorScenePlan): boolean {
  return document.timeline.tracks.some((track) => {
    if (track.muted) return false;
    return track.clips.some((clip) => {
      if (!overlapsScene(clip, scene)) return false;
      if (clip.kind === 'narrative') {
        const asset = document.assets[clip.assetId];
        return asset?.metadata.hasAudio !== false
          && !clip.properties.audioMuted
          && (clip.properties.volumeDb ?? 0) > -60;
      }
      if (clip.kind === 'media') {
        const asset = document.assets[clip.assetId];
        return asset?.kind === 'video'
          && asset.metadata.hasAudio !== false
          && !clip.video?.audioMuted
          && (clip.video?.volumeDb ?? 0) > -60;
      }
      if (clip.kind === 'audio') {
        return !clip.properties.muted && (clip.properties.volumeDb ?? -18) > -60;
      }
      return false;
    });
  });
}

/** Local structural pass. Visual problems that require pixels remain delegated to cloud vision. */
export function auditSceneVisualStructure(document: EditorDocumentV2): SceneVisualQaIssue[] {
  const plan = directorPlanFromDocument(document);
  if (!plan) return [];
  const clips = clipById(document);
  const semanticById = new Map(document.semantics.scenes.map((scene) => [scene.id, scene]));
  const issues: SceneVisualQaIssue[] = [];

  for (const scene of plan.scenes) {
    if (sceneNeedsAudibleAudio(scene) && !hasAudibleAudio(document, scene)) {
      issues.push({
        sceneId: scene.id,
        blockId: '',
        kind: 'missing-audible-audio',
        note: 'The approved sound plan calls for audible voice or source sound, but every overlapping audio-capable clip is absent, disabled, muted, or silent.',
      });
    }
    const semantic = semanticById.get(scene.id);
    const owned = semantic?.clipIds.map((id) => clips.get(id)).filter((clip): clip is TimelineClip => Boolean(clip)) ?? [];
    const hasSourceClip = owned.some((clip) =>
      clip.kind === 'media' || clip.kind === 'narrative' || (clip.kind === 'graphic' && Boolean(clip.assetId)),
    );
    const plannedVisual = scene.brollDecision !== 'none';
    if (plannedVisual && !hasSourceClip) {
      issues.push({
        sceneId: scene.id,
        blockId: '',
        kind: 'missing-planned-visual',
        note: `The approved Director Plan requires a ${scene.brollDecision} visual, but this Semantic Scene owns no source media clip. Execute its asset strategy before treating the scene as complete.`,
      });
    }

    const needsEvidence = scene.narrativeRole === 'prove' || scene.viewerTask === 'believe';
    if (needsEvidence && (!evidenceOf(scene).length || (!hasSourceClip && !plannedVisual))) {
      issues.push({
        sceneId: scene.id,
        blockId: '',
        kind: 'missing-evidence',
        note: !evidenceOf(scene).length
          ? 'Proof or belief scene has no supplied evidence in the Director Plan.'
          : 'Proof or belief scene names evidence but owns no source media clip.',
      });
    }
  }

  const signatureScenes = new Map<string, { sceneId: string; blockId: string }[]>();
  for (const scene of document.semantics.scenes) {
    const seen = new Set<string>();
    for (const clipId of scene.clipIds) {
      const clip = clips.get(clipId);
      if (!clip) continue;
      const signature = geometrySignature(clip);
      if (!signature || seen.has(signature)) continue;
      seen.add(signature);
      const entries = signatureScenes.get(signature) ?? [];
      entries.push({ sceneId: scene.id, blockId: clip.id });
      signatureScenes.set(signature, entries);
    }
  }
  for (const entries of signatureScenes.values()) {
    const distinctScenes = new Set(entries.map((entry) => entry.sceneId));
    if (distinctScenes.size < 3) continue;
    for (const entry of entries) {
      issues.push({
        sceneId: entry.sceneId,
        blockId: entry.blockId,
        kind: 'repeated-geometry',
        note: `The same graphic geometry recurs across ${distinctScenes.size} Semantic Scenes; confirm that repetition is editorially intentional.`,
      });
    }
  }

  return issues;
}

export function sceneAtSecond(document: EditorDocumentV2, atSec: number): DirectorScenePlan | null {
  const plan = directorPlanFromDocument(document);
  if (!plan) return null;
  const frame = Math.round(atSec * document.canvas.fps);
  return plan.scenes.find((scene) => frame >= scene.startFrame && frame < scene.startFrame + scene.durationFrames) ?? null;
}

/** Exact repair boundary returned to the editing expert after visual review. */
export function sceneVisualRepairScope(
  issues: Array<{ sceneId?: string; kind?: string }>,
): SceneVisualRepairScope {
  const sceneIds = [...new Set(issues.map((issue) => issue.sceneId?.trim()).filter((id): id is string => Boolean(id)))].sort();
  return {
    sceneIds,
    instruction: sceneIds.length
      ? `Repair only the affected Semantic Scene${sceneIds.length === 1 ? '' : 's'}: ${sceneIds.join(', ')}. Preserve unaffected scenes, then recheck each repaired moment and its immediate boundaries.`
      : 'No Semantic Scene requires repair. Preserve the current edit.',
  };
}
