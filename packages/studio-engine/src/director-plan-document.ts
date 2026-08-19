import type { DirectorPlan } from './director-plan';
import { validateDirectorPlan } from './director-plan';
import type { EditorDocumentV2 } from './editor-document/types';
import { splitEditorClip } from './editor-document/commands/split';
import { validateEditorDocumentV2 } from './editor-document/validation';
import { semanticScenesFromDirectorPlan } from './semantic-scenes';
import { withDirectorPlanInSemantics } from './director-plan-artifact';

export type ApplyDirectorPlanResult =
  | { ok: true; document: EditorDocumentV2; createdClipIds: string[] }
  | { ok: false; document: EditorDocumentV2; error: string };

/**
 * Save a plan as executable document semantics. Scene boundaries split the primary visual lane into
 * real editable identities without removing frames; the resulting clips are then linked to scenes.
 */
export function applyDirectorPlanToDocument(
  document: EditorDocumentV2,
  plan: DirectorPlan,
): ApplyDirectorPlanResult {
  const planIssues = validateDirectorPlan(plan);
  if (planIssues.length) return { ok: false, document, error: planIssues.map((issue) => `${issue.path || 'plan'}: ${issue.message}`).join(' · ') };

  const boundaries = [...new Set(plan.scenes.flatMap((scene) => [
    scene.startFrame,
    scene.startFrame + scene.durationFrames,
  ]))].filter((frame) => frame > 0).sort((left, right) => left - right);
  let next = document;
  const createdClipIds: string[] = [];
  for (const boundary of boundaries) {
    while (true) {
      const track = next.timeline.tracks.find((candidate) => candidate.id === next.semantics.primaryNarrativeTrackId);
      const crossing = track?.clips.find((clip) => clip.startFrame < boundary && clip.startFrame + clip.durationFrames > boundary);
      if (!track || !crossing) break;
      const split = splitEditorClip(next, {
        trackId: track.id,
        clipId: crossing.id,
        atFrame: boundary,
        includeLinked: false,
      });
      if (!split.ok) return { ok: false, document, error: split.error.message };
      next = split.document;
      createdClipIds.push(...split.receipt.createdClipIds);
    }
  }

  next = {
    ...next,
    semantics: withDirectorPlanInSemantics({
      ...next.semantics,
      scenes: semanticScenesFromDirectorPlan(next, plan),
    }, plan),
  };
  const issue = validateEditorDocumentV2(next).find((candidate) => candidate.severity === 'error');
  return issue
    ? { ok: false, document, error: `${issue.path}: ${issue.message}` }
    : { ok: true, document: next, createdClipIds };
}
