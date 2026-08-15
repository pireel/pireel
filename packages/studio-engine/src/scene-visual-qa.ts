import type { DirectorScenePlan } from './director-plan';
import type { EditorDocumentV2, TimelineClip } from './editor-document/types';

export type SceneVisualReviewPhase = 'entrance' | 'pressure' | 'proof' | 'exit' | 'scene';

export type SceneVisualQaIssueKind =
  | 'repeated-geometry'
  | 'missing-evidence'
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

function proofScore(scene: DirectorScenePlan): number {
  let score = 0;
  if (scene.narrativeRole === 'prove') score += 6;
  if (scene.viewerTask === 'believe') score += 4;
  if (scene.sceneFamily === 'media-evidence' || scene.sceneFamily === 'demo-focus') score += 3;
  if (evidenceOf(scene).length) score += 2;
  return score;
}

function pressureScore(scene: DirectorScenePlan): number {
  let score = 0;
  if (scene.narrativeRole === 'hook' || scene.narrativeRole === 'turn') score += 5;
  if (scene.narrativeRole === 'payoff' || scene.narrativeRole === 'cta') score += 4;
  if (scene.viewerTask === 'act' || scene.viewerTask === 'feel') score += 3;
  if (scene.sceneFamily === 'designed-fullscreen' || scene.sceneFamily === 'montage') score += 2;
  return score;
}

function choosePhase(
  scene: DirectorScenePlan,
  index: number,
  total: number,
  proofSceneId?: string,
  pressureSceneId?: string,
): SceneVisualReviewPhase {
  if (index === 0) return 'entrance';
  if (index === total - 1) return 'exit';
  if (scene.id === proofSceneId) return 'proof';
  if (scene.id === pressureSceneId) return 'pressure';
  return 'scene';
}

function sampleSecond(scene: DirectorScenePlan, phase: SceneVisualReviewPhase, fps: number): number {
  const start = frameToSec(scene.startFrame, fps);
  const duration = frameToSec(scene.durationFrames, fps);
  const edgeInset = Math.min(0.25, duration * 0.18);
  if (phase === 'entrance') return start + edgeInset;
  if (phase === 'exit') return start + Math.max(edgeInset, duration - edgeInset);
  return start + duration * 0.5;
}

function sceneContext(scene: DirectorScenePlan, phase: SceneVisualReviewPhase, frameId?: string): string {
  const evidence = evidenceOf(scene);
  return [
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

function rankedSceneId(
  scenes: DirectorScenePlan[],
  score: (scene: DirectorScenePlan) => number,
  excluded: Set<string>,
): string | undefined {
  return scenes
    .filter((scene) => !excluded.has(scene.id))
    .map((scene, index) => ({ id: scene.id, score: score(scene), index }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .find((candidate) => candidate.score > 0)?.id;
}

function capMoments(moments: SceneVisualReviewMoment[], maxMoments: number): SceneVisualReviewMoment[] {
  if (moments.length <= maxMoments) return moments;
  const critical = moments.filter((moment) => moment.phase !== 'scene');
  const picked = new Map(critical.map((moment) => [moment.sceneId, moment]));
  const ordinary = moments.filter((moment) => moment.phase === 'scene');
  const room = Math.max(0, maxMoments - picked.size);
  for (let index = 0; index < room; index++) {
    const candidateIndex = Math.min(
      ordinary.length - 1,
      Math.floor(((index + 0.5) * ordinary.length) / Math.max(1, room)),
    );
    const candidate = ordinary[candidateIndex];
    if (candidate) picked.set(candidate.sceneId, candidate);
  }
  return moments.filter((moment) => picked.has(moment.sceneId)).slice(0, maxMoments);
}

/**
 * Select one composed-frame checkpoint per Director Scene, while explicitly naming the representative
 * entrance, pressure, proof, and exit states. The result stays open-vocabulary: it samples judgment
 * moments and never selects a component or repair recipe.
 */
export function planSceneVisualReview(
  document: EditorDocumentV2,
  options: { sceneIds?: string[]; maxMoments?: number } = {},
): SceneVisualReviewMoment[] {
  const plan = document.semantics.directorPlan;
  if (!plan) return [];
  const selectedIds = options.sceneIds?.length ? new Set(options.sceneIds) : null;
  const scenes = plan.scenes;
  if (!scenes.length) return [];

  const excluded = new Set<string>([scenes[0]!.id, scenes[scenes.length - 1]!.id]);
  const proofSceneId = rankedSceneId(scenes, proofScore, excluded);
  if (proofSceneId) excluded.add(proofSceneId);
  const pressureSceneId = rankedSceneId(scenes, pressureScore, excluded);
  const moments = scenes.map((scene, index) => {
    const phase = choosePhase(scene, index, scenes.length, proofSceneId, pressureSceneId);
    return {
      atSec: Math.round(sampleSecond(scene, phase, document.canvas.fps) * 100) / 100,
      sceneId: scene.id,
      sceneLabel: scene.label,
      phase,
      expected: sceneContext(scene, phase, plan.frameId ?? document.appearance.frameId),
    };
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

/** Local structural pass. Visual problems that require pixels remain delegated to cloud vision. */
export function auditSceneVisualStructure(document: EditorDocumentV2): SceneVisualQaIssue[] {
  const plan = document.semantics.directorPlan;
  if (!plan) return [];
  const clips = clipById(document);
  const semanticById = new Map(document.semantics.scenes.map((scene) => [scene.id, scene]));
  const issues: SceneVisualQaIssue[] = [];

  for (const scene of plan.scenes) {
    const needsEvidence = scene.narrativeRole === 'prove' || scene.viewerTask === 'believe';
    if (!needsEvidence) continue;
    const semantic = semanticById.get(scene.id);
    const owned = semantic?.clipIds.map((id) => clips.get(id)).filter((clip): clip is TimelineClip => Boolean(clip)) ?? [];
    const hasSourceClip = owned.some((clip) =>
      clip.kind === 'media' || clip.kind === 'narrative' || (clip.kind === 'graphic' && Boolean(clip.assetId)),
    );
    if (!evidenceOf(scene).length || !hasSourceClip) {
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
  const plan = document.semantics.directorPlan;
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
