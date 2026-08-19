import type { DirectorPlan, DirectorScenePlan } from './director-plan';
import { directorPlanFromDocument } from './director-plan-artifact';
import type { EditorDocumentV2, SemanticScene, TimelineClip } from './editor-document/types';
import { sceneDesignForDocument, type SceneDesign } from './scene-design';

const clipEnd = (clip: TimelineClip) => clip.startFrame + clip.durationFrames;
const sceneEnd = (scene: DirectorScenePlan) => scene.startFrame + scene.durationFrames;
const overlapFrames = (startA: number, endA: number, startB: number, endB: number) =>
  Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));

function sceneEligibleClips(document: EditorDocumentV2): TimelineClip[] {
  return document.timeline.tracks
    .flatMap((track) => track.clips)
    .filter((clip) => clip.kind !== 'audio' && clip.kind !== 'caption')
    .sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id));
}

/** Build the executed scene layer from a flexible Director Plan and real timeline geometry. */
export function semanticScenesFromDirectorPlan(
  document: EditorDocumentV2,
  plan: DirectorPlan,
): SemanticScene[] {
  const clips = sceneEligibleClips(document);
  return plan.scenes.map((scene) => ({
    id: scene.id,
    label: scene.label,
    intent: scene.purpose,
    purpose: scene.purpose,
    viewerTask: scene.viewerTask,
    narrativeRole: scene.narrativeRole,
    sceneFamily: scene.sceneFamily,
    ...(scene.customFamily ? { customFamily: scene.customFamily } : {}),
    clipIds: clips
      .filter((clip) => overlapFrames(clip.startFrame, clipEnd(clip), scene.startFrame, sceneEnd(scene)) > 0)
      .map((clip) => clip.id),
  }));
}

export interface DirectorSceneContext {
  plan: DirectorPlan;
  scene: DirectorScenePlan;
  previous?: DirectorScenePlan;
  next?: DirectorScenePlan;
  design?: SceneDesign;
  /** Real layers already intersecting the Scene, supplied to nested visual generation. */
  existingLayers: string[];
}

function layerSummary(document: EditorDocumentV2, clip: TimelineClip, scene: DirectorScenePlan): string {
  const fps = document.canvas.fps;
  const relativeStart = Math.max(0, clip.startFrame - scene.startFrame) / fps;
  const relativeEnd = Math.min(sceneEnd(scene), clipEnd(clip)) - scene.startFrame;
  const box = clip.kind === 'graphic' || clip.kind === 'caption' ? clip.block.box
    : clip.kind === 'media' || clip.kind === 'narrative' ? clip.box
      : undefined;
  const assetId = 'assetId' in clip && typeof clip.assetId === 'string' ? clip.assetId : undefined;
  const asset = assetId ? document.assets[assetId] : undefined;
  const label = clip.kind === 'graphic' || clip.kind === 'caption'
    ? clip.block.label
    : asset?.label;
  return `${clip.id} [${clip.kind}${label ? `: ${label}` : ''}] ${relativeStart.toFixed(2)}–${(relativeEnd / fps).toFixed(2)}s${box ? ` box(${box.x.toFixed(2)},${box.y.toFixed(2)},${box.w.toFixed(2)},${box.h.toFixed(2)})` : ''}`;
}

/** Resolve an explicit scene id, or infer the scene with the largest overlap with a placement. */
export function resolveDirectorSceneContext(
  document: EditorDocumentV2,
  placement: { sceneId?: string; startFrame: number; durationFrames: number },
): DirectorSceneContext | null {
  const plan = directorPlanFromDocument(document);
  if (!plan) return null;
  let index = placement.sceneId
    ? plan.scenes.findIndex((scene) => scene.id === placement.sceneId)
    : -1;
  if (index < 0 && !placement.sceneId) {
    let best = 0;
    for (const [candidateIndex, scene] of plan.scenes.entries()) {
      const overlap = overlapFrames(
        placement.startFrame,
        placement.startFrame + placement.durationFrames,
        scene.startFrame,
        sceneEnd(scene),
      );
      if (overlap > best) {
        best = overlap;
        index = candidateIndex;
      }
    }
  }
  if (index < 0) return null;
  const scene = plan.scenes[index]!;
  const existingLayers = document.timeline.tracks
    .flatMap((track) => track.clips)
    .filter((clip) => clip.enabled && overlapFrames(clip.startFrame, clipEnd(clip), scene.startFrame, sceneEnd(scene)) > 0)
    .sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id))
    .map((clip) => layerSummary(document, clip, scene));
  return {
    plan,
    scene,
    ...(index > 0 ? { previous: plan.scenes[index - 1] } : {}),
    ...(index + 1 < plan.scenes.length ? { next: plan.scenes[index + 1] } : {}),
    ...(sceneDesignForDocument(document, scene.id) ? { design: sceneDesignForDocument(document, scene.id) } : {}),
    existingLayers,
  };
}

/** Prompt context is prose on purpose: the treatment contract directs one scene without selecting a registered Component. */
export function formatDirectorSceneContext(context: DirectorSceneContext): string {
  const { plan, scene, previous, next, design, existingLayers } = context;
  return `DIRECTOR SCENE CONTEXT — editorial direction, never a rigid Component or Motion Graphic recipe:
- Whole-video goal: ${plan.goal}${plan.audience ? `; audience: ${plan.audience}` : ''}
- Creative thesis: ${plan.creativeThesis}
- Rhythm arc: ${plan.rhythmArc}
- Delivery safety: ${plan.deliverySafety ?? 'Destination platform is unknown; keep essential faces, products, evidence, captions and CTA inside the conservative central safe region. Decorative backgrounds alone may bleed.'}
- Shared visual concept: ${plan.designSystem.visualConcept}
- Shared composition grammar: ${plan.designSystem.composition}
- Shared typography: ${plan.designSystem.typography}
- Shared color and material: ${plan.designSystem.colorAndMaterial}
- Shared imagery treatment: ${plan.designSystem.imagery}
- Shared motion grammar: ${plan.designSystem.motion}
- Shared sound grammar: ${plan.designSystem.sound}
- Scene: ${scene.id} · ${scene.label}
- Viewer task: ${scene.viewerTask}; narrative role: ${scene.narrativeRole}
- Scene family: ${scene.sceneFamily}${scene.customFamily ? ` (${scene.customFamily})` : ''}
- Purpose: ${scene.purpose}
${scene.evidence?.length ? `- Evidence: ${scene.evidence.join(' | ')}\n` : ''}${scene.treatmentId ? `- Content-specific Scene treatment: ${scene.treatmentId}\n` : ''}${scene.visualAnchor ? `- Visual anchor: ${scene.visualAnchor}\n` : ''}${scene.visualTreatment ? `- Composition and visual treatment: ${scene.visualTreatment}\n` : ''}${scene.motionPlan ? `- Motion plan: ${scene.motionPlan}\n` : ''}${scene.soundPlan ? `- Sound plan: ${scene.soundPlan}\n` : ''}${scene.assetStrategy ? `- Asset strategy: ${scene.assetStrategy}\n` : ''}${scene.brollDecision ? `- B-roll decision: ${scene.brollDecision}${scene.brollRationale ? ` — ${scene.brollRationale}` : ''}\n` : ''}${scene.visualMetaphor ? `- Visual proposition: ${scene.visualMetaphor}\n` : ''}- Neighbor contrast: ${previous ? `previous ${previous.id} is ${previous.sceneFamily}` : 'opening scene'}; ${next ? `next ${next.id} is ${next.sceneFamily}` : 'closing scene'}.
${design ? `- Authored Scene design intent: ${design.designIntent}\n- Authored whole-canvas composition: ${design.composition}\n- Authored temporal choreography: ${design.choreography}\n- Authored continuity/handoff: ${design.continuity}\n- Rendered success criteria: ${design.successCriteria}\n` : '- Authored Scene design: missing — do not invent an isolated layer for a planned complete edit; author the Scene design first.\n'}- Existing intersecting layers: ${existingLayers.length ? existingLayers.join(' | ') : '(none)'}
Execute this treatment as one composed scene inside the shared design system. The authored Scene design is the current source of truth: preserve its visual anchor and relationships, and treat this Component as one participant in that complete picture—not a self-contained full-screen answer. Make graphics subordinate to the source unless a full-field authored moment is explicitly justified. Synchronize entrance/change/exit to the complete choreography and sound plan. Variation must come from meaning while typography, material, motion character and source treatment remain recognizably one film. Do not default to a stock card or reinterpret a functional noun as a literal UI box. Do not repeat a neighboring scene's composition without an editorial reason.`;
}

export type SemanticSceneAssignmentResult =
  | { ok: true; document: EditorDocumentV2; sceneId?: string }
  | { ok: false; document: EditorDocumentV2; error: string };

/** Bind one concrete clip to one scene, removing stale membership in sibling scenes. */
export function assignClipToSemanticScene(
  document: EditorDocumentV2,
  clipId: string,
  sceneId: string,
): SemanticSceneAssignmentResult {
  const clip = document.timeline.tracks.flatMap((track) => track.clips).find((candidate) => candidate.id === clipId);
  if (!clip) return { ok: false, document, error: `Clip does not exist: ${clipId}` };
  if (clip.kind === 'caption' || clip.kind === 'audio') return { ok: true, document };
  if (!document.semantics.scenes.some((scene) => scene.id === sceneId)) {
    return { ok: false, document, error: `Director scene does not exist: ${sceneId}` };
  }
  const scenes = document.semantics.scenes.map((scene) => {
    const without = scene.clipIds.filter((id) => id !== clipId);
    return scene.id === sceneId ? { ...scene, clipIds: [...without, clipId] } : { ...scene, clipIds: without };
  });
  return {
    ok: true,
    sceneId,
    document: { ...document, semantics: { ...document.semantics, scenes } },
  };
}

/** Assign a newly placed visual/graphic clip by maximum overlap when no explicit scene was supplied. */
export function assignClipToBestDirectorScene(
  document: EditorDocumentV2,
  clipId: string,
): SemanticSceneAssignmentResult {
  const clip = document.timeline.tracks.flatMap((track) => track.clips).find((candidate) => candidate.id === clipId);
  if (!clip) return { ok: false, document, error: `Clip does not exist: ${clipId}` };
  if (clip.kind === 'caption' || clip.kind === 'audio') return { ok: true, document };
  const context = resolveDirectorSceneContext(document, {
    startFrame: clip.startFrame,
    durationFrames: clip.durationFrames,
  });
  return context ? assignClipToSemanticScene(document, clipId, context.scene.id) : { ok: true, document };
}
