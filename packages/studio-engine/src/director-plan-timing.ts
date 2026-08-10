import type { DirectorPlanV1, DirectorScenePlan } from './director-plan';
import type { EditorSemanticState, SemanticScene } from './editor-document/types';

const endFrame = (scene: DirectorScenePlan) => scene.startFrame + scene.durationFrames;

function sceneSemantics(scene: DirectorScenePlan, current?: SemanticScene): SemanticScene {
  return {
    id: scene.id,
    clipIds: current?.clipIds ?? [],
    label: scene.label,
    intent: scene.purpose,
    purpose: scene.purpose,
    viewerTask: scene.viewerTask,
    narrativeRole: scene.narrativeRole,
    sceneFamily: scene.sceneFamily,
    ...(scene.customFamily ? { customFamily: scene.customFamily } : {}),
  };
}

/** Keep the persisted plan and SemanticScene metadata as one canonical scene set. */
export function withAdjustedDirectorPlan(
  semantics: EditorSemanticState,
  plan: DirectorPlanV1 | undefined,
): EditorSemanticState {
  const current = new Map(semantics.scenes.map((scene) => [scene.id, scene] as const));
  const next: EditorSemanticState = {
    ...semantics,
    scenes: plan?.scenes.map((scene) => sceneSemantics(scene, current.get(scene.id))) ?? [],
  };
  if (plan) next.directorPlan = plan;
  else delete next.directorPlan;
  return next;
}

const pointAfterRemoval = (frame: number, startFrame: number, endFrameExclusive: number): number => {
  if (frame <= startFrame) return frame;
  if (frame >= endFrameExclusive) return frame - (endFrameExclusive - startFrame);
  return startFrame;
};

/** Apply one native ripple removal to scene intervals. Fully removed scenes disappear. */
export function directorPlanAfterRippleRemoval(
  plan: DirectorPlanV1,
  startFrame: number,
  endFrameExclusive: number,
): DirectorPlanV1 | undefined {
  if (endFrameExclusive <= startFrame) return plan;
  const scenes = plan.scenes.flatMap((scene): DirectorScenePlan[] => {
    const start = pointAfterRemoval(scene.startFrame, startFrame, endFrameExclusive);
    const end = pointAfterRemoval(endFrame(scene), startFrame, endFrameExclusive);
    return end > start ? [{ ...scene, startFrame: start, durationFrames: end - start }] : [];
  });
  return scenes.length ? { ...plan, scenes } : undefined;
}

export type DirectorPlanInsertionResult =
  | { ok: true; plan: DirectorPlanV1; sceneId?: string }
  | { ok: false; error: string };

/**
 * Apply a native ripple insertion. When it belongs to a scene, that scene expands to own the
 * inserted interval while later scenes move right. At a shared boundary, explicit sceneId decides
 * whether the insert closes the previous scene or opens the next one.
 */
export function directorPlanAfterRippleInsertion(
  plan: DirectorPlanV1,
  atFrame: number,
  durationFrames: number,
  explicitSceneId?: string,
): DirectorPlanInsertionResult {
  const explicit = explicitSceneId ? plan.scenes.find((scene) => scene.id === explicitSceneId) : undefined;
  if (explicitSceneId && !explicit) return { ok: false, error: `Director scene does not exist: ${explicitSceneId}` };
  if (explicit && (atFrame < explicit.startFrame || atFrame > endFrame(explicit))) {
    return { ok: false, error: `Insertion frame ${atFrame} is outside Director scene ${explicit.id}.` };
  }
  const inferred = explicit ?? plan.scenes.find((scene) => scene.startFrame === atFrame)
    ?? plan.scenes.find((scene) => scene.startFrame < atFrame && atFrame < endFrame(scene));
  const sceneId = inferred?.id;
  const scenes = plan.scenes.map((scene): DirectorScenePlan => {
    const end = endFrame(scene);
    if (scene.id === sceneId) {
      if (atFrame <= scene.startFrame) {
        return { ...scene, startFrame: atFrame, durationFrames: end + durationFrames - atFrame };
      }
      return { ...scene, durationFrames: scene.durationFrames + durationFrames };
    }
    if (scene.startFrame >= atFrame) return { ...scene, startFrame: scene.startFrame + durationFrames };
    return scene;
  });
  return { ok: true, plan: { ...plan, scenes }, ...(sceneId ? { sceneId } : {}) };
}
